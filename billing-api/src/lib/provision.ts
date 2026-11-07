import type { FastifyBaseLogger } from 'fastify';
import { addBillingCycle } from './billing.js';
import { prisma } from './prisma.js';
import { applyServiceUpgrade } from './service-lifecycle.js';
import { recordLogFireAndForget } from './system-log.js';
import {
  createPanelServer,
  deletePanelServer,
  findPanelServerByExternalId,
  PanelApiError,
  unsuspendPanelServer,
  updatePanelServer,
} from '../services/panel.js';

/**
 * Mark an unpaid invoice paid and provision/unsuspend/upgrade the linked panel server.
 * Claims the invoice first to avoid orphan servers under concurrency.
 */
export async function markInvoicePaidAndProvision(input: {
  invoiceId: string;
  paidById: string;
  log?: FastifyBaseLogger;
}) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: input.invoiceId },
    include: {
      service: { include: { product: true } },
      user: true,
    },
  });
  if (!invoice) {
    throw Object.assign(new Error('Invoice not found'), { statusCode: 404 });
  }
  if (invoice.status === 'paid') {
    throw Object.assign(new Error('Invoice already paid'), { statusCode: 422 });
  }
  if (invoice.status === 'cancelled') {
    throw Object.assign(new Error('Invoice is cancelled'), { statusCode: 422 });
  }
  if (!invoice.service) {
    throw Object.assign(new Error('Invoice has no service'), { statusCode: 422 });
  }
  if (!invoice.user.panelUserId) {
    throw Object.assign(new Error('Client has no linked panel user'), { statusCode: 422 });
  }

  const isUpgrade = Boolean(invoice.upgradeToProductId);
  const product = invoice.service.product;
  const serviceId = invoice.service.id;
  const paidAt = new Date();

  const claim = await prisma.invoice.updateMany({
    where: { id: invoice.id, status: 'unpaid' },
    data: {
      status: 'paid',
      paidAt,
      paidById: input.paidById,
    },
  });
  if (claim.count === 0) {
    const current = await prisma.invoice.findUnique({
      where: { id: invoice.id },
      select: { status: true },
    });
    if (current?.status === 'cancelled') {
      throw Object.assign(new Error('Invoice is cancelled'), { statusCode: 422 });
    }
    throw Object.assign(new Error('Invoice already paid'), { statusCode: 422 });
  }

  let panelServerId = invoice.service.panelServerId;
  let createdServerId: string | null = null;

  try {
    if (isUpgrade) {
      const upgradeProduct = await prisma.product.findUnique({
        where: { id: invoice.upgradeToProductId! },
      });
      if (!upgradeProduct) {
        throw Object.assign(new Error('Upgrade target product no longer exists'), { statusCode: 422 });
      }
      if (upgradeProduct.panelEggId !== product.panelEggId) {
        throw Object.assign(new Error('Upgrade target must use the same panel egg'), { statusCode: 422 });
      }
      if (!panelServerId) {
        throw Object.assign(new Error('Service has no panel server to upgrade'), { statusCode: 422 });
      }

      try {
        await updatePanelServer(panelServerId, {
          memory: upgradeProduct.memoryMb,
          disk: upgradeProduct.diskMb,
          cpu: upgradeProduct.cpuPercent,
          backupLimit: upgradeProduct.backupLimit,
          databaseLimit: upgradeProduct.databaseLimit,
          allocationLimit: upgradeProduct.allocationLimit,
          subdomainAccess: upgradeProduct.subdomainAccess,
          fivemMarketplaceAccess: upgradeProduct.fivemMarketplaceAccess,
          minecraftPluginsAccess: upgradeProduct.minecraftPluginsAccess,
        });
      } catch (err) {
        if (err instanceof PanelApiError) {
          throw Object.assign(new Error(`Could not update panel server resources: ${err.message}`), {
            statusCode: 502,
          });
        }
        throw err;
      }

      const updated = await prisma.$transaction(async (tx) => {
        await applyServiceUpgrade(tx, {
          serviceId,
          productId: upgradeProduct.id,
        });
        await tx.notification.create({
          data: {
            userId: invoice.userId,
            type: 'success',
            title: 'Plan upgraded',
            message: `${invoice.service!.name} was upgraded to ${upgradeProduct.name}.`,
            href: `/services/${serviceId}`,
          },
        });
        return tx.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
      });

      recordLogFireAndForget({
        level: 'info',
        category: 'billing',
        action: 'invoice.upgrade_paid',
        message: `Invoice ${invoice.number} paid (upgrade) — ${invoice.service.name}`,
        actorUserId: input.paidById,
        targetUserId: invoice.userId,
        meta: {
          invoiceId: invoice.id,
          invoiceNumber: invoice.number,
          serviceId,
          panelServerId,
          totalCents: invoice.totalCents,
        },
      });

      return { invoice: updated, panelServerId, upgraded: true as const };
    }

    if (!panelServerId) {
      const nodeId = invoice.service.panelNodeId?.trim() || product.panelNodeId?.trim();
      const eggId = invoice.service.panelEggId?.trim() || product.panelEggId?.trim();
      if (!nodeId || !eggId) {
        throw Object.assign(
          new Error(
            'Service is missing panel egg or node ID. For custom plans, recreate with a node selected, or edit the catalog product.',
          ),
          { statusCode: 422 },
        );
      }

      const freshService = await prisma.service.findUnique({ where: { id: serviceId } });
      if (freshService?.panelServerId) {
        panelServerId = freshService.panelServerId;
      } else {
        try {
          const server = await createPanelServer({
            ownerId: invoice.user.panelUserId,
            nodeId,
            eggId,
            name: invoice.service.name,
            externalId: serviceId,
            memory: invoice.service.memoryMb ?? product.memoryMb,
            disk: invoice.service.diskMb ?? product.diskMb,
            cpu: invoice.service.cpuPercent ?? product.cpuPercent,
            backupLimit: invoice.service.backupLimit ?? product.backupLimit,
            databaseLimit: invoice.service.databaseLimit ?? product.databaseLimit,
            allocationLimit: invoice.service.allocationLimit ?? product.allocationLimit,
            subdomainAccess: invoice.service.subdomainAccess ?? product.subdomainAccess,
            fivemMarketplaceAccess:
              invoice.service.fivemMarketplaceAccess ?? product.fivemMarketplaceAccess,
            minecraftPluginsAccess:
              invoice.service.minecraftPluginsAccess ?? product.minecraftPluginsAccess,
          });
          panelServerId = server.id;
          createdServerId = server.id;
        } catch (err) {
          if (err instanceof PanelApiError && (err.status === 409 || /already|exist|unique/i.test(err.message))) {
            const existing = await findPanelServerByExternalId(serviceId);
            if (existing) {
              panelServerId = existing.id;
            } else {
              input.log?.warn(
                { err: err.message, status: err.status },
                'panel provision conflict without recoverable server',
              );
              throw Object.assign(
                new Error(
                  'Provisioning failed. Check Application API key, egg ID, node ID, and panel allocations.',
                ),
                { statusCode: 502 },
              );
            }
          } else if (err instanceof PanelApiError) {
            input.log?.warn({ err: err.message, status: err.status }, 'panel provision failed');
            throw Object.assign(
              new Error(
                'Provisioning failed. Check Application API key, egg ID, node ID, and panel allocations.',
              ),
              { statusCode: 502 },
            );
          } else {
            throw err;
          }
        }
      }
    } else if (invoice.service.status === 'suspended') {
      try {
        await unsuspendPanelServer(panelServerId);
      } catch (err) {
        if (err instanceof PanelApiError) {
          throw Object.assign(new Error('Could not unsuspend the panel server.'), { statusCode: 502 });
        }
        throw err;
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.service.update({
        where: { id: serviceId },
        data: {
          status: 'active',
          panelServerId,
          nextDueAt: addBillingCycle(new Date(), invoice.service!.cycle ?? product.cycle),
        },
      });
      await tx.notification.create({
        data: {
          userId: invoice.userId,
          type: 'success',
          title: 'Service activated',
          message: `${invoice.service!.name} is paid and ready to manage.`,
          href: `/services/${serviceId}`,
        },
      });
      return tx.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    });

    recordLogFireAndForget({
      level: 'info',
      category: 'billing',
      action: isUpgrade ? 'invoice.upgrade_paid' : 'invoice.paid',
      message: `Invoice ${invoice.number} paid${isUpgrade ? ' (upgrade)' : ''} — ${invoice.service.name}`,
      actorUserId: input.paidById,
      targetUserId: invoice.userId,
      meta: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.number,
        serviceId,
        panelServerId,
        totalCents: invoice.totalCents,
      },
    });

    return { invoice: updated, panelServerId, upgraded: false as const };
  } catch (err) {
    if (createdServerId) {
      try {
        await deletePanelServer(createdServerId);
      } catch (cleanupErr) {
        input.log?.warn({ err: cleanupErr }, 'failed to delete orphan panel server after provision failure');
      }
    }

    await prisma.invoice.updateMany({
      where: { id: invoice.id, status: 'paid', paidAt },
      data: { status: 'unpaid', paidAt: null, paidById: null },
    });

    recordLogFireAndForget({
      level: 'error',
      category: 'provision',
      action: 'invoice.provision_failed',
      message: `Provision failed for invoice ${invoice.number}: ${err instanceof Error ? err.message : 'Unknown error'}`,
      actorUserId: input.paidById,
      targetUserId: invoice.userId,
      meta: { invoiceId: invoice.id, serviceId },
    });

    throw err;
  }
}
