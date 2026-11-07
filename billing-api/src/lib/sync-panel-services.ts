import {
  cleanupLegacyCustomEggProducts,
  ensureCustomProduct,
  isCustomProduct,
  resolveCategoryForEgg,
} from './custom-product.js';
import { getDefaultCurrency } from './billing.js';
import { prisma } from './prisma.js';
import {
  listPanelEggs,
  listPanelServers,
  PanelApiError,
  type PanelEgg,
  type PanelServer,
} from '../services/panel.js';

export type SyncSkipped = {
  panelServerId: string;
  name: string;
  reason: 'no_billing_user' | 'import_failed';
  email?: string | null;
  detail?: string;
};

export type SyncImported = {
  panelServerId: string;
  serviceId: string;
  name: string;
  userId: string;
  status: 'active' | 'suspended';
  eggName: string | null;
  categoryName: string | null;
};

export type SyncFromPanelResult = {
  imported: SyncImported[];
  skipped: SyncSkipped[];
  backfilled: Array<{ serviceId: string; panelServerId: string }>;
  updated: Array<{ serviceId: string; eggName: string | null; categoryName: string | null }>;
};

function ownerEmail(server: PanelServer): string | null {
  const email = server.owner?.email?.trim().toLowerCase();
  return email || null;
}

async function eggMeta(server: PanelServer, eggsById: Map<string, PanelEgg>) {
  const eggId = server.eggId?.trim() || null;
  const egg = eggId ? eggsById.get(eggId) ?? null : null;
  const category = await resolveCategoryForEgg(egg);
  return {
    panelEggId: eggId,
    panelEggName: egg?.name ?? null,
    categoryId: category?.id ?? null,
    categoryName: category?.name ?? null,
    eggName: egg?.name ?? null,
  };
}

export async function syncPanelServersIntoBilling(): Promise<SyncFromPanelResult> {
  let panelServers: PanelServer[];
  let panelEggs: PanelEgg[];
  try {
    [panelServers, panelEggs] = await Promise.all([listPanelServers(), listPanelEggs()]);
  } catch (err) {
    if (err instanceof PanelApiError) {
      throw Object.assign(new Error(err.message), { statusCode: err.status >= 400 ? err.status : 502 });
    }
    throw err;
  }

  const eggsById = new Map(panelEggs.map((egg) => [egg.id, egg]));
  const externalIds = panelServers
    .map((s) => s.externalId?.trim())
    .filter((id): id is string => Boolean(id));

  const [customProduct, currency, linkedServices, users] = await Promise.all([
    ensureCustomProduct(),
    getDefaultCurrency(),
    prisma.service.findMany({
      where: {
        OR: [
          { panelServerId: { not: null } },
          ...(externalIds.length ? [{ id: { in: externalIds } }] : []),
        ],
      },
      select: {
        id: true,
        panelServerId: true,
        productId: true,
        categoryId: true,
        panelEggId: true,
        panelEggName: true,
        product: { select: { id: true, name: true, panelEggId: true } },
      },
    }),
    prisma.user.findMany({
      select: { id: true, email: true, panelUserId: true },
    }),
  ]);

  await cleanupLegacyCustomEggProducts(customProduct.id);

  const linkedByPanelId = new Map(
    linkedServices
      .filter((s) => s.panelServerId)
      .map((s) => [s.panelServerId as string, s]),
  );
  const serviceById = new Map(linkedServices.map((s) => [s.id, s]));
  const userByPanelId = new Map(
    users.filter((u) => u.panelUserId).map((u) => [u.panelUserId as string, u]),
  );
  const userByEmail = new Map(users.map((u) => [u.email.trim().toLowerCase(), u]));

  const imported: SyncImported[] = [];
  const skipped: SyncSkipped[] = [];
  const backfilled: Array<{ serviceId: string; panelServerId: string }> = [];
  const updated: Array<{ serviceId: string; eggName: string | null; categoryName: string | null }> = [];
  const metaCache = new Map<string, Awaited<ReturnType<typeof eggMeta>>>();

  async function cachedMeta(server: PanelServer) {
    const key = server.eggId?.trim() || 'none';
    const hit = metaCache.get(key);
    if (hit) return hit;
    const meta = await eggMeta(server, eggsById);
    metaCache.set(key, meta);
    return meta;
  }

  for (const server of panelServers) {
    const existing = linkedByPanelId.get(server.id);
    if (existing) {
      if (isCustomProduct(existing.product)) {
        try {
          const meta = await cachedMeta(server);
          const needsUpdate =
            existing.productId !== customProduct.id ||
            existing.panelEggId !== meta.panelEggId ||
            existing.panelEggName !== meta.panelEggName ||
            existing.categoryId !== meta.categoryId;
          if (needsUpdate) {
            await prisma.service.update({
              where: { id: existing.id },
              data: {
                productId: customProduct.id,
                panelEggId: meta.panelEggId,
                panelEggName: meta.panelEggName,
                categoryId: meta.categoryId,
              },
            });
            updated.push({
              serviceId: existing.id,
              eggName: meta.eggName,
              categoryName: meta.categoryName,
            });
          }
        } catch {
          // Keep existing link if meta resolve fails.
        }
      }
      continue;
    }

    const externalService = server.externalId ? serviceById.get(server.externalId) : undefined;
    if (externalService) {
      if (!externalService.panelServerId) {
        try {
          await prisma.service.update({
            where: { id: externalService.id },
            data: { panelServerId: server.id },
          });
          linkedByPanelId.set(server.id, { ...externalService, panelServerId: server.id });
          backfilled.push({ serviceId: externalService.id, panelServerId: server.id });
        } catch (err) {
          skipped.push({
            panelServerId: server.id,
            name: server.name,
            reason: 'import_failed',
            detail: err instanceof Error ? err.message : 'Could not backfill panel link',
          });
        }
      }
      continue;
    }

    const email = ownerEmail(server);
    const user =
      (server.ownerId ? userByPanelId.get(server.ownerId) : undefined) ||
      (email ? userByEmail.get(email) : undefined);

    if (!user) {
      skipped.push({
        panelServerId: server.id,
        name: server.name,
        reason: 'no_billing_user',
        email,
      });
      continue;
    }

    const status = server.suspended ? 'suspended' : 'active';
    try {
      const meta = await cachedMeta(server);
      const service = await prisma.service.create({
        data: {
          userId: user.id,
          productId: customProduct.id,
          categoryId: meta.categoryId,
          panelEggId: meta.panelEggId,
          panelEggName: meta.panelEggName,
          name: server.name.slice(0, 64) || 'Imported server',
          status,
          panelServerId: server.id,
          memoryMb: server.memory ?? customProduct.memoryMb,
          diskMb: server.disk ?? customProduct.diskMb,
          cpuPercent: server.cpu ?? customProduct.cpuPercent,
          backupLimit: server.backupLimit ?? customProduct.backupLimit,
          databaseLimit: server.databaseLimit ?? customProduct.databaseLimit,
          allocationLimit: server.allocationLimit ?? customProduct.allocationLimit,
          // £0 until an admin sets pricing — renewals stay unscheduled until then.
          priceCents: 0,
          currency,
          cycle: 'monthly',
          nextDueAt: null,
        },
      });
      linkedByPanelId.set(server.id, {
        id: service.id,
        panelServerId: server.id,
        productId: customProduct.id,
        categoryId: meta.categoryId,
        panelEggId: meta.panelEggId,
        panelEggName: meta.panelEggName,
        product: {
          id: customProduct.id,
          name: customProduct.name,
          panelEggId: customProduct.panelEggId,
        },
      });
      imported.push({
        panelServerId: server.id,
        serviceId: service.id,
        name: service.name,
        userId: user.id,
        status,
        eggName: meta.eggName,
        categoryName: meta.categoryName,
      });
    } catch (err) {
      skipped.push({
        panelServerId: server.id,
        name: server.name,
        reason: 'import_failed',
        email,
        detail: err instanceof Error ? err.message : 'Import failed',
      });
    }
  }

  return { imported, skipped, backfilled, updated };
}
