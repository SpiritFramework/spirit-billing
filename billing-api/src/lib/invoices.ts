import type { Prisma } from '@prisma/client';
import { adjustCredits } from './credits.js';
import { prisma } from './prisma.js';
import { deletePanelServer } from '../services/panel.js';

/** Cancel an unpaid invoice atomically; refund applied credits; cancel pending service. */
export async function cancelUnpaidInvoice(
  tx: Prisma.TransactionClient,
  invoice: {
    id: string;
    userId: string;
    serviceId: string | null;
    creditAppliedCents: number;
    number: string;
  },
): Promise<{ invoice: Awaited<ReturnType<typeof prisma.invoice.findUniqueOrThrow>>; orphanPanelServerId: string | null }> {
  const claim = await tx.invoice.updateMany({
    where: { id: invoice.id, status: 'unpaid' },
    data: {
      status: 'cancelled',
      creditAppliedCents: 0,
    },
  });
  if (claim.count === 0) {
    throw Object.assign(new Error('Only unpaid invoices can be cancelled'), { statusCode: 422 });
  }

  if (invoice.creditAppliedCents > 0) {
    await adjustCredits(tx, {
      userId: invoice.userId,
      amountCents: invoice.creditAppliedCents,
      reason: 'refund',
      note: `Refund credits from cancelled invoice ${invoice.number}`,
      invoiceId: invoice.id,
    });
  }

  let orphanPanelServerId: string | null = null;
  if (invoice.serviceId) {
    const pending = await tx.service.findFirst({
      where: { id: invoice.serviceId, status: 'pending_payment' },
      select: { panelServerId: true },
    });
    orphanPanelServerId = pending?.panelServerId ?? null;
    await tx.service.updateMany({
      where: { id: invoice.serviceId, status: 'pending_payment' },
      data: { status: 'cancelled', panelServerId: null },
    });
  }

  const updated = await tx.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
  return { invoice: updated, orphanPanelServerId };
}

/** Run cancelUnpaidInvoice then delete any orphaned panel server outside the transaction. */
export async function cancelUnpaidInvoiceAndCleanupPanel(
  invoice: {
    id: string;
    userId: string;
    serviceId: string | null;
    creditAppliedCents: number;
    number: string;
  },
) {
  const { invoice: updated, orphanPanelServerId } = await prisma.$transaction(async (tx) =>
    cancelUnpaidInvoice(tx, invoice),
  );
  if (orphanPanelServerId) {
    await deletePanelServer(orphanPanelServerId).catch(() => undefined);
  }
  return updated;
}

/**
 * Permanently delete an invoice.
 * Unpaid invoices are cancelled first so applied credits are refunded.
 */
export async function deleteAdminInvoice(invoiceId: string) {
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) {
    throw Object.assign(new Error('Invoice not found'), { statusCode: 404 });
  }

  let orphanPanelServerId: string | null = null;
  await prisma.$transaction(async (tx) => {
    if (invoice.status === 'unpaid') {
      const result = await cancelUnpaidInvoice(tx, invoice);
      orphanPanelServerId = result.orphanPanelServerId;
    }
    await tx.invoice.delete({ where: { id: invoiceId } });
  });

  if (orphanPanelServerId) {
    await deletePanelServer(orphanPanelServerId).catch(() => undefined);
  }

  return { deleted: true as const, number: invoice.number };
}
