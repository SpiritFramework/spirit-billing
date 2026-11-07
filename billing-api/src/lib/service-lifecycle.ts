import type { Prisma } from '@prisma/client';
import {
  getInvoiceDueDays,
  nextInvoiceNumber,
  prorateRemainingCents,
  SERVICE_REFUND_MIN_AGE_MS,
  formatMoney,
} from './billing.js';
import { adjustCredits } from './credits.js';
import { cancelUnpaidInvoice } from './invoices.js';
import { isCustomProduct } from './custom-product.js';
import { prisma } from './prisma.js';
import {
  deletePanelServer,
  PanelApiError,
} from '../services/panel.js';

type Cycle = 'monthly' | 'quarterly' | 'yearly';

function servicePrice(service: {
  priceCents: number | null;
  product: { priceCents: number };
}) {
  return service.priceCents ?? service.product.priceCents;
}

function serviceCycle(service: {
  cycle: Cycle | null;
  product: { cycle: Cycle };
}): Cycle {
  return service.cycle ?? service.product.cycle;
}

function serviceCurrency(service: {
  currency: string | null;
  product: { currency: string };
}) {
  return service.currency ?? service.product.currency;
}

export function previewServiceDeletionRefund(service: {
  createdAt: Date;
  status: string;
  priceCents: number | null;
  cycle: Cycle | null;
  nextDueAt: Date | null;
  product: { priceCents: number; cycle: Cycle };
}) {
  const ageMs = Date.now() - service.createdAt.getTime();
  const ownedLongEnough = ageMs > SERVICE_REFUND_MIN_AGE_MS;
  const deletable = ['active', 'suspended', 'pending_payment', 'cancelled'].includes(service.status);
  const refundEligible =
    ownedLongEnough && (service.status === 'active' || service.status === 'suspended');

  const refundCents = refundEligible
    ? prorateRemainingCents(
        servicePrice(service),
        service.nextDueAt,
        serviceCycle(service),
      )
    : 0;

  return {
    deletable,
    ownedLongEnough,
    refundEligible,
    refundCents,
    minAgeDays: 3,
    ageDays: Math.floor(ageMs / (24 * 60 * 60 * 1000)),
  };
}

/** Cancel unpaid invoices for a service with proper credit refunds. */
async function cancelUnpaidForService(tx: Prisma.TransactionClient, serviceId: string) {
  const unpaid = await tx.invoice.findMany({
    where: { serviceId, status: 'unpaid' },
  });
  const orphans: string[] = [];
  for (const invoice of unpaid) {
    const result = await cancelUnpaidInvoice(tx, invoice);
    if (result.orphanPanelServerId) orphans.push(result.orphanPanelServerId);
  }
  return orphans;
}

/**
 * Client or admin hard-delete of a service + panel server.
 * Refunds prorated remaining cycle as credits when owned > 3 days.
 */
export async function deleteOwnedService(input: {
  serviceId: string;
  userId: string;
  /** When true, skip ownership check (admin). */
  asAdmin?: boolean;
  notify?: boolean;
}) {
  const service = await prisma.service.findFirst({
    where: input.asAdmin
      ? { id: input.serviceId }
      : { id: input.serviceId, userId: input.userId },
    include: { product: true },
  });
  if (!service) {
    throw Object.assign(new Error('Service not found'), { statusCode: 404 });
  }
  if (!input.asAdmin && service.userId !== input.userId) {
    throw Object.assign(new Error('Service not found'), { statusCode: 404 });
  }

  const preview = previewServiceDeletionRefund(service);
  if (!preview.deletable && !input.asAdmin) {
    throw Object.assign(new Error('This service cannot be deleted in its current state'), {
      statusCode: 422,
    });
  }

  if (service.panelServerId) {
    try {
      await deletePanelServer(service.panelServerId);
    } catch (err) {
      if (!(err instanceof PanelApiError && err.status === 404)) {
        if (err instanceof PanelApiError) {
          throw Object.assign(
            new Error(`Spirit-Panel did not delete the server: ${err.message}`),
            { statusCode: 502 },
          );
        }
        throw err;
      }
    }
  }

  const refundCents = input.asAdmin ? 0 : preview.refundCents;

  let orphanPanelIds: string[] = [];
  await prisma.$transaction(async (tx) => {
    orphanPanelIds = await cancelUnpaidForService(tx, service.id);

    if (refundCents > 0) {
      await adjustCredits(tx, {
        userId: service.userId,
        amountCents: refundCents,
        reason: 'refund',
        note: `Prorated credit refund for deleted service ${service.name}`,
      });
    }

    if (input.notify !== false) {
      const currency = serviceCurrency(service);
      await tx.notification.create({
        data: {
          userId: service.userId,
          type: 'warning',
          title: 'Service deleted',
          message: input.asAdmin
            ? `${service.name} was permanently deleted by an administrator.`
            : refundCents > 0
              ? `${service.name} was deleted. ${formatMoney(refundCents, currency)} in credits were returned for the unused period.`
              : `${service.name} was permanently deleted.`,
          href: '/services',
        },
      });
    }

    await tx.service.delete({ where: { id: service.id } });
  });

  for (const orphanId of orphanPanelIds) {
    if (orphanId === service.panelServerId) continue;
    await deletePanelServer(orphanId).catch(() => undefined);
  }

  return {
    deleted: true as const,
    refundCents,
    ownedLongEnough: preview.ownedLongEnough,
  };
}

export async function listUpgradeOptions(serviceId: string, userId: string) {
  const service = await prisma.service.findFirst({
    where: { id: serviceId, userId },
    include: { product: true },
  });
  if (!service) {
    throw Object.assign(new Error('Service not found'), { statusCode: 404 });
  }
  if (service.status !== 'active' && service.status !== 'suspended') {
    throw Object.assign(new Error('Only active or suspended services can be upgraded'), {
      statusCode: 422,
    });
  }
  if (isCustomProduct(service.product)) {
    throw Object.assign(
      new Error('Custom-plan services cannot be upgraded through the storefront. Edit the service instead.'),
      { statusCode: 422 },
    );
  }

  const currentPrice = servicePrice(service);
  const currency = serviceCurrency(service);
  const eggId = service.product.panelEggId;

  const products = await prisma.product.findMany({
    where: {
      active: true,
      id: { not: service.productId },
      panelEggId: eggId,
      currency,
      priceCents: { gt: currentPrice },
      AND: [{ panelNodeId: { not: null } }, { panelNodeId: { not: '' } }],
      ...(service.product.categoryId
        ? { categoryId: service.product.categoryId }
        : {}),
    },
    orderBy: [{ priceCents: 'asc' }, { sortOrder: 'asc' }],
    select: {
      id: true,
      name: true,
      description: true,
      priceCents: true,
      currency: true,
      cycle: true,
      memoryMb: true,
      diskMb: true,
      cpuPercent: true,
    },
  });

  return {
    service: {
      id: service.id,
      name: service.name,
      productId: service.productId,
      productName: service.product.name,
      priceCents: currentPrice,
      currency,
      cycle: serviceCycle(service),
      nextDueAt: service.nextDueAt,
    },
    options: products.map((product) => {
      const fullDelta = Math.max(0, product.priceCents - currentPrice);
      const chargeCents = prorateRemainingCents(
        fullDelta,
        service.nextDueAt,
        serviceCycle(service),
      );
      return {
        ...product,
        fullDeltaCents: fullDelta,
        chargeCents: chargeCents > 0 ? chargeCents : fullDelta,
        prorated: chargeCents > 0,
      };
    }),
  };
}

export async function createUpgradeInvoice(input: {
  serviceId: string;
  userId: string;
  productId: string;
}) {
  const options = await listUpgradeOptions(input.serviceId, input.userId);
  const target = options.options.find((p) => p.id === input.productId);
  if (!target) {
    throw Object.assign(
      new Error('That plan is not available as an upgrade for this service'),
      { statusCode: 422 },
    );
  }

  const existingUpgrade = await prisma.invoice.findFirst({
    where: {
      serviceId: input.serviceId,
      status: 'unpaid',
      upgradeToProductId: { not: null },
    },
  });
  if (existingUpgrade) {
    throw Object.assign(
      new Error(
        `You already have an unpaid upgrade invoice (${existingUpgrade.number}). Pay or cancel it first.`,
      ),
      { statusCode: 422 },
    );
  }

  const dueAt = new Date();
  dueAt.setDate(dueAt.getDate() + (await getInvoiceDueDays()));
  const chargeCents = target.chargeCents;

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const invoiceNumber = await nextInvoiceNumber();
    try {
      const invoice = await prisma.invoice.create({
        data: {
          number: invoiceNumber,
          userId: input.userId,
          serviceId: input.serviceId,
          status: 'unpaid',
          currency: target.currency,
          subtotalCents: chargeCents,
          discountCents: 0,
          creditAppliedCents: 0,
          totalCents: chargeCents,
          upgradeToProductId: target.id,
          description: `Plan upgrade to ${target.name}${
            target.prorated ? ' (prorated to next renewal)' : ''
          }`,
          dueAt,
        },
      });
      return { invoice, target, chargeCents };
    } catch (err) {
      lastError = err;
      if ((err as { code?: string }).code !== 'P2002') throw err;
    }
  }
  throw lastError;
}

/** Apply a paid upgrade invoice to the linked service (DB only — caller updates panel). */
export async function applyServiceUpgrade(
  tx: Prisma.TransactionClient,
  input: {
    serviceId: string;
    productId: string;
  },
) {
  const product = await tx.product.findUniqueOrThrow({ where: { id: input.productId } });

  return tx.service.update({
    where: { id: input.serviceId },
    data: {
      productId: product.id,
      memoryMb: product.memoryMb,
      diskMb: product.diskMb,
      cpuPercent: product.cpuPercent,
      backupLimit: product.backupLimit,
      databaseLimit: product.databaseLimit,
      allocationLimit: product.allocationLimit,
      subdomainAccess: product.subdomainAccess,
      fivemMarketplaceAccess: product.fivemMarketplaceAccess,
      minecraftPluginsAccess: product.minecraftPluginsAccess,
      priceCents: product.priceCents,
      currency: product.currency,
      cycle: product.cycle,
      status: 'active',
    },
    include: { product: true },
  });
}
