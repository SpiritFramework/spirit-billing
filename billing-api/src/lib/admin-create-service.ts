import { addBillingCycle, getDefaultCurrency, getInvoiceDueDays, nextInvoiceNumber } from './billing.js';
import { ensureCustomProduct } from './custom-product.js';
import { prisma } from './prisma.js';
import { createPanelServer, PanelApiError, listPanelEggs } from '../services/panel.js';

export type AdminCreateCustomServiceInput = {
  userId: string;
  name: string;
  categoryId?: string | null;
  panelEggId: string;
  panelNodeId: string;
  memoryMb: number;
  diskMb: number;
  cpuPercent: number;
  backupLimit?: number;
  databaseLimit?: number;
  allocationLimit?: number;
  subdomainAccess?: boolean;
  fivemMarketplaceAccess?: boolean;
  minecraftPluginsAccess?: boolean;
  priceCents: number;
  currency?: string;
  cycle?: 'monthly' | 'quarterly' | 'yearly';
  /** When true, create unpaid invoice instead of marking active immediately. */
  billNow?: boolean;
  /** Start renewal schedule from this date (defaults to now + cycle if price > 0). */
  nextDueAt?: string | null;
  provision?: boolean;
};

export async function adminCreateCustomService(input: AdminCreateCustomServiceInput) {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, panelUserId: true, email: true, username: true },
  });
  if (!user) {
    throw Object.assign(new Error('User not found'), { statusCode: 404 });
  }

  const priceCents = Math.max(0, Math.round(input.priceCents));
  const billNow = Boolean(input.billNow && priceCents > 0);
  // Match storefront checkout: never put an unpaid server on the game panel.
  // Provision runs in markInvoicePaidAndProvision after payment.
  const provision = input.provision !== false && !billNow;

  if (provision && !user.panelUserId) {
    throw Object.assign(
      new Error('User is not linked to Spirit-Panel. Relink their account first.'),
      { statusCode: 422 },
    );
  }
  if (billNow && !user.panelUserId) {
    throw Object.assign(
      new Error('User is not linked to Spirit-Panel. Relink their account before invoicing.'),
      { statusCode: 422 },
    );
  }

  if (input.categoryId) {
    const category = await prisma.category.findUnique({ where: { id: input.categoryId } });
    if (!category) {
      throw Object.assign(new Error('Category not found'), { statusCode: 422 });
    }
  }

  const eggs = await listPanelEggs().catch(() => []);
  const egg = eggs.find((item) => item.id === input.panelEggId);
  const customProduct = await ensureCustomProduct();
  const currency = (input.currency || (await getDefaultCurrency())).toUpperCase();
  const cycle = input.cycle || 'monthly';

  let nextDueAt: Date | null = null;
  if (input.nextDueAt) {
    const parsed = new Date(input.nextDueAt);
    if (Number.isNaN(parsed.getTime())) {
      throw Object.assign(new Error('Invalid nextDueAt'), { statusCode: 422 });
    }
    nextDueAt = parsed;
  } else if (priceCents > 0) {
    nextDueAt = addBillingCycle(new Date(), cycle);
  }

  const service = await prisma.service.create({
    data: {
      userId: user.id,
      productId: customProduct.id,
      categoryId: input.categoryId || null,
      name: input.name.trim().slice(0, 64),
      status: billNow ? 'pending_payment' : 'active',
      panelEggId: input.panelEggId,
      panelEggName: egg?.name ?? null,
      panelNodeId: input.panelNodeId,
      memoryMb: input.memoryMb,
      diskMb: input.diskMb,
      cpuPercent: input.cpuPercent,
      backupLimit: input.backupLimit ?? 0,
      databaseLimit: input.databaseLimit ?? 0,
      allocationLimit: input.allocationLimit ?? 0,
      subdomainAccess: Boolean(input.subdomainAccess),
      fivemMarketplaceAccess: Boolean(input.fivemMarketplaceAccess),
      minecraftPluginsAccess: Boolean(input.minecraftPluginsAccess),
      priceCents,
      currency,
      cycle,
      nextDueAt: billNow ? addBillingCycle(new Date(), cycle) : nextDueAt,
    },
  });

  let panelServerId: string | null = null;
  if (provision) {
    try {
      const panelServer = await createPanelServer({
        ownerId: user.panelUserId!,
        nodeId: input.panelNodeId,
        eggId: input.panelEggId,
        name: service.name,
        externalId: service.id,
        memory: input.memoryMb,
        disk: input.diskMb,
        cpu: input.cpuPercent,
        backupLimit: input.backupLimit ?? 0,
        databaseLimit: input.databaseLimit ?? 0,
        allocationLimit: input.allocationLimit ?? 0,
        subdomainAccess: Boolean(input.subdomainAccess),
        fivemMarketplaceAccess: Boolean(input.fivemMarketplaceAccess),
        minecraftPluginsAccess: Boolean(input.minecraftPluginsAccess),
      });
      panelServerId = panelServer.id;
      await prisma.service.update({
        where: { id: service.id },
        data: { panelServerId },
      });
    } catch (err) {
      await prisma.service.delete({ where: { id: service.id } }).catch(() => undefined);
      if (err instanceof PanelApiError) {
        throw Object.assign(new Error(`Spirit-Panel could not create the server: ${err.message}`), {
          statusCode: err.status >= 400 && err.status < 500 ? err.status : 502,
        });
      }
      throw err;
    }
  }

  let invoice = null;
  if (billNow) {
    const dueAt = new Date();
    dueAt.setDate(dueAt.getDate() + (await getInvoiceDueDays()));
    const number = await nextInvoiceNumber();
    invoice = await prisma.invoice.create({
      data: {
        number,
        userId: user.id,
        serviceId: service.id,
        status: 'unpaid',
        currency,
        subtotalCents: priceCents,
        discountCents: 0,
        creditAppliedCents: 0,
        totalCents: priceCents,
        description: `${service.name} (custom plan)`,
        dueAt,
      },
    });
  }

  await prisma.notification.create({
    data: {
      userId: user.id,
      type: 'info',
      title: billNow ? 'Custom server awaiting payment' : 'Custom server ready',
      message: billNow
        ? `${service.name} was queued. Pay ${numberSafe(invoice?.number)} to provision it on the game panel.`
        : `${service.name} was provisioned on your account.`,
      href: billNow && invoice ? `/invoices/${invoice.id}` : `/services/${service.id}`,
    },
  });

  return {
    service: { ...service, panelServerId },
    invoice,
  };
}

function numberSafe(value?: string | null) {
  return value || 'the invoice';
}
