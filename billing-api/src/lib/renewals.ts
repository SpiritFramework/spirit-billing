import {
  addBillingCycle,
  getInvoiceDueDays,
  nextInvoiceNumber,
} from './billing.js';
import { cancelUnpaidInvoice } from './invoices.js';
import { prisma } from './prisma.js';
import {
  deletePanelServer,
  suspendPanelServer,
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

function clampDays(raw: number, fallback: number) {
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(365, Math.max(0, Math.round(raw)));
}

/** Days after invoice dueAt before an unpaid renewal suspends the server. */
export async function getOverdueSuspendDays(): Promise<number> {
  const raw = Number(
    (await prisma.setting.findUnique({ where: { key: 'overdue_suspend_days' } }))?.value ?? '3',
  );
  return clampDays(raw, 3);
}

/**
 * Days after invoice dueAt before an unpaid renewal terminates the server.
 * Always at least the suspend threshold.
 */
export async function getOverdueTerminateDays(): Promise<number> {
  const suspendDays = await getOverdueSuspendDays();
  const raw = Number(
    (await prisma.setting.findUnique({ where: { key: 'overdue_terminate_days' } }))?.value ?? '14',
  );
  return Math.max(suspendDays, clampDays(raw, 14));
}

export type CreateRenewalOptions = {
  /** Set dueAt to yesterday so overdue suspension can be tested immediately. */
  dueImmediately?: boolean;
};

/**
 * Create an unpaid renewal invoice for a service and push nextDueAt forward.
 * Skips if price is 0 or an unpaid (non-upgrade) invoice already exists.
 * The server keeps running until overdue suspend/terminate settings kick in.
 */
export async function createRenewalInvoiceForService(
  serviceId: string,
  options: CreateRenewalOptions = {},
) {
  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    include: { product: true, user: { select: { id: true } } },
  });
  if (!service) {
    throw Object.assign(new Error('Service not found'), { statusCode: 404 });
  }
  if (service.status === 'cancelled') {
    throw Object.assign(new Error('Cancelled services cannot be renewed'), { statusCode: 422 });
  }

  const priceCents = servicePrice(service);
  if (priceCents <= 0) {
    throw Object.assign(
      new Error('Set a recurring price greater than £0 before creating a renewal invoice'),
      { statusCode: 422 },
    );
  }

  const existingUnpaid = await prisma.invoice.findFirst({
    where: {
      serviceId: service.id,
      status: 'unpaid',
      upgradeToProductId: null,
    },
  });
  if (existingUnpaid) {
    throw Object.assign(
      new Error(`Unpaid invoice ${existingUnpaid.number} already exists for this service`),
      { statusCode: 422 },
    );
  }

  const cycle = serviceCycle(service);
  const currency = serviceCurrency(service);
  const dueAt = new Date();
  if (options.dueImmediately) {
    dueAt.setDate(dueAt.getDate() - 1);
  } else {
    const dueDays = await getInvoiceDueDays();
    dueAt.setDate(dueAt.getDate() + dueDays);
  }

  // Billing period that just ended / is due — advance schedule from current nextDueAt or now.
  const periodStart =
    service.nextDueAt && service.nextDueAt.getTime() <= Date.now() + 86_400_000
      ? service.nextDueAt
      : new Date();
  const nextDueAt = addBillingCycle(periodStart, cycle);

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const number = await nextInvoiceNumber();
    try {
      const invoice = await prisma.$transaction(async (tx) => {
        const created = await tx.invoice.create({
          data: {
            number,
            userId: service.userId,
            serviceId: service.id,
            status: 'unpaid',
            currency,
            subtotalCents: priceCents,
            discountCents: 0,
            creditAppliedCents: 0,
            totalCents: priceCents,
            description: `${service.name} renewal (${cycle})`,
            dueAt,
          },
        });
        await tx.service.update({
          where: { id: service.id },
          data: { nextDueAt },
        });
        await tx.notification.create({
          data: {
            userId: service.userId,
            type: 'info',
            title: 'Renewal invoice ready',
            message: `${created.number} is due for ${service.name}.`,
            href: `/invoices/${created.id}`,
          },
        });
        return created;
      });
      return { invoice, nextDueAt };
    } catch (err) {
      lastError = err;
      if ((err as { code?: string }).code !== 'P2002') throw err;
    }
  }
  throw lastError;
}

/** Create renewal invoices for every active/suspended service whose nextDueAt is due. */
export async function runDueRenewals(now = new Date()) {
  const due = await prisma.service.findMany({
    where: {
      status: { in: ['active', 'suspended'] },
      nextDueAt: { lte: now },
    },
    include: { product: { select: { priceCents: true } } },
  });
  const services = due.filter((s) => (s.priceCents ?? s.product.priceCents) > 0);

  const created: Array<{ serviceId: string; invoiceId: string; number: string }> = [];
  const skipped: Array<{ serviceId: string; name: string; reason: string }> = [];

  for (const service of services) {
    try {
      const result = await createRenewalInvoiceForService(service.id);
      created.push({
        serviceId: service.id,
        invoiceId: result.invoice.id,
        number: result.invoice.number,
      });
    } catch (err) {
      skipped.push({
        serviceId: service.id,
        name: service.name,
        reason: err instanceof Error ? err.message : 'Failed',
      });
    }
  }

  return { created, skipped, scanned: services.length };
}

async function cancelUnpaidForService(serviceId: string) {
  const unpaid = await prisma.invoice.findMany({
    where: { serviceId, status: 'unpaid' },
  });
  const orphans: string[] = [];
  await prisma.$transaction(async (tx) => {
    for (const invoice of unpaid) {
      const result = await cancelUnpaidInvoice(tx, invoice);
      if (result.orphanPanelServerId) orphans.push(result.orphanPanelServerId);
    }
  });
  for (const panelServerId of orphans) {
    await deletePanelServer(panelServerId).catch(() => undefined);
  }
}

/**
 * Enforce unpaid renewal invoices:
 * 1. After dueAt + suspend days → suspend panel server
 * 2. After dueAt + terminate days → delete panel server and cancel the service
 *
 * Also delete any pending_payment services that already have a panel server
 * (legacy admin bill-now path) so clients cannot see/manage unpaid servers.
 */
export async function runOverdueEnforcement(now = new Date()) {
  const suspendDays = await getOverdueSuspendDays();
  const terminateDays = await getOverdueTerminateDays();

  const suspendCutoff = new Date(now);
  suspendCutoff.setDate(suspendCutoff.getDate() - suspendDays);
  const terminateCutoff = new Date(now);
  terminateCutoff.setDate(terminateCutoff.getDate() - terminateDays);

  const terminated: Array<{ serviceId: string; invoiceId: string; number: string }> = [];
  const suspended: Array<{ serviceId: string; invoiceId: string; number: string }> = [];
  const failed: Array<{ serviceId: string; reason: string }> = [];
  const seenTerminate = new Set<string>();
  const seenSuspend = new Set<string>();

  // Remove unpaid/pre-provisioned servers left over from older bill-now creates.
  const leakedPending = await prisma.service.findMany({
    where: { status: 'pending_payment', panelServerId: { not: null } },
    select: { id: true, name: true, panelServerId: true, userId: true },
  });
  for (const service of leakedPending) {
    if (!service.panelServerId) continue;
    try {
      try {
        await deletePanelServer(service.panelServerId);
      } catch (err) {
        if (!(err instanceof PanelApiError && err.status === 404)) {
          throw err;
        }
      }
      await prisma.service.update({
        where: { id: service.id },
        data: { panelServerId: null },
      });
    } catch (err) {
      failed.push({
        serviceId: service.id,
        reason: err instanceof Error ? err.message : 'Failed to remove unpaid panel server',
      });
    }
  }
  // Terminate first (harder action) for invoices past the terminate threshold.
  const terminateInvoices = await prisma.invoice.findMany({
    where: {
      status: 'unpaid',
      upgradeToProductId: null,
      dueAt: { lte: terminateCutoff },
      serviceId: { not: null },
      service: { status: { in: ['active', 'suspended'] } },
    },
    include: {
      service: {
        select: { id: true, name: true, panelServerId: true, status: true, userId: true },
      },
    },
    orderBy: { dueAt: 'asc' },
  });

  for (const invoice of terminateInvoices) {
    const service = invoice.service;
    if (!service || seenTerminate.has(service.id)) continue;
    seenTerminate.add(service.id);
    seenSuspend.add(service.id);

    try {
      if (service.panelServerId) {
        try {
          await deletePanelServer(service.panelServerId);
        } catch (err) {
          if (!(err instanceof PanelApiError && err.status === 404)) {
            throw err;
          }
        }
      }

      await cancelUnpaidForService(service.id);

      await prisma.$transaction(async (tx) => {
        await tx.service.update({
          where: { id: service.id },
          data: {
            status: 'cancelled',
            panelServerId: null,
            nextDueAt: null,
          },
        });
        await tx.notification.create({
          data: {
            userId: service.userId,
            type: 'warning',
            title: 'Service terminated',
            message: `${service.name} was terminated because invoice ${invoice.number} was not paid.`,
            href: '/services',
          },
        });
      });

      terminated.push({ serviceId: service.id, invoiceId: invoice.id, number: invoice.number });
    } catch (err) {
      failed.push({
        serviceId: service.id,
        reason:
          err instanceof PanelApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Terminate failed',
      });
    }
  }

  // Suspend active services past the suspend threshold (and not yet terminated).
  const suspendInvoices = await prisma.invoice.findMany({
    where: {
      status: 'unpaid',
      upgradeToProductId: null,
      dueAt: { lte: suspendCutoff },
      serviceId: { not: null },
      service: { status: 'active', panelServerId: { not: null } },
    },
    include: {
      service: { select: { id: true, name: true, panelServerId: true, status: true } },
    },
    orderBy: { dueAt: 'asc' },
  });

  for (const invoice of suspendInvoices) {
    const service = invoice.service;
    if (!service?.panelServerId || seenSuspend.has(service.id)) continue;
    seenSuspend.add(service.id);

    try {
      await suspendPanelServer(service.panelServerId);
      await prisma.$transaction(async (tx) => {
        await tx.service.update({
          where: { id: service.id },
          data: { status: 'suspended' },
        });
        await tx.notification.create({
          data: {
            userId: invoice.userId,
            type: 'warning',
            title: 'Service suspended',
            message: `${service.name} was suspended because invoice ${invoice.number} is overdue.`,
            href: `/invoices/${invoice.id}`,
          },
        });
      });
      suspended.push({ serviceId: service.id, invoiceId: invoice.id, number: invoice.number });
    } catch (err) {
      failed.push({
        serviceId: service.id,
        reason:
          err instanceof PanelApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Suspend failed',
      });
    }
  }

  return {
    suspended,
    terminated,
    failed,
    scanned: terminateInvoices.length + suspendInvoices.length,
    suspendDays,
    terminateDays,
  };
}

/** @deprecated Prefer runOverdueEnforcement */
export async function runOverdueSuspensions(now = new Date()) {
  const result = await runOverdueEnforcement(now);
  return {
    suspended: result.suspended,
    failed: result.failed,
    scanned: result.scanned,
    graceDays: result.suspendDays,
    terminated: result.terminated,
    terminateDays: result.terminateDays,
  };
}
