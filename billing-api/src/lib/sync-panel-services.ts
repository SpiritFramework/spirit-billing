import { randomBytes } from 'node:crypto';
import {
  cleanupLegacyCustomEggProducts,
  ensureCustomProduct,
  isCustomProduct,
  resolveCategoryForEgg,
} from './custom-product.js';
import { getDefaultCurrency } from './billing.js';
import { hashPassword } from './auth.js';
import { prisma } from './prisma.js';
import {
  getPanelUser,
  listPanelEggs,
  listPanelServers,
  PanelApiError,
  type PanelEgg,
  type PanelServer,
  type PanelUser,
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

export type SyncUserCreated = {
  userId: string;
  email: string;
  username: string;
  panelUserId: string | null;
  temporaryPassword: string;
};

export type SyncUserLinked = {
  userId: string;
  email: string;
  panelUserId: string;
};

export type SyncFromPanelOptions = {
  /** Create billing client accounts for panel server owners that are missing in billing. */
  createMissingUsers?: boolean;
};

export type SyncFromPanelResult = {
  imported: SyncImported[];
  skipped: SyncSkipped[];
  backfilled: Array<{ serviceId: string; panelServerId: string }>;
  updated: Array<{ serviceId: string; eggName: string | null; categoryName: string | null }>;
  usersCreated: SyncUserCreated[];
  usersLinked: SyncUserLinked[];
};

type BillingUserRef = { id: string; email: string; panelUserId: string | null };

function ownerEmail(server: PanelServer): string | null {
  const email = server.owner?.email?.trim().toLowerCase();
  return email || null;
}

function sanitizeUsername(raw: string): string {
  let u = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 24);
  if (u.length < 3) {
    u = `user${randomBytes(3).toString('hex')}`;
  }
  return u;
}

function temporaryPassword(): string {
  // Meets billing + typical panel rules: ≥16 chars, letter + number.
  return `${randomBytes(12).toString('hex')}Aa1`;
}

async function allocateUsername(preferred: string): Promise<string> {
  const base = sanitizeUsername(preferred);
  const taken = await prisma.user.findUnique({
    where: { username: base },
    select: { id: true },
  });
  if (!taken) return base;
  for (let i = 0; i < 8; i++) {
    const candidate = sanitizeUsername(`${base}${randomBytes(2).toString('hex')}`);
    const hit = await prisma.user.findUnique({
      where: { username: candidate },
      select: { id: true },
    });
    if (!hit) return candidate;
  }
  return sanitizeUsername(`u${randomBytes(6).toString('hex')}`);
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

async function resolvePanelOwner(server: PanelServer): Promise<{
  email: string | null;
  panelUserId: string | null;
  usernameHint: string | null;
  firstName: string | null;
  lastName: string | null;
}> {
  let panelUser: PanelUser | null = null;
  if (server.ownerId) {
    try {
      panelUser = await getPanelUser(server.ownerId, { timeoutMs: 8_000 });
    } catch {
      panelUser = null;
    }
  }
  const email =
    panelUser?.email?.trim().toLowerCase() ||
    ownerEmail(server) ||
    null;
  return {
    email,
    panelUserId: panelUser?.id ?? server.ownerId ?? null,
    usernameHint: panelUser?.username ?? (email ? email.split('@')[0] : null),
    firstName: panelUser?.firstName ?? null,
    lastName: panelUser?.lastName ?? null,
  };
}

/**
 * Ensure a billing client exists for a panel owner. Never changes the panel password.
 */
async function ensureBillingUserForOwner(
  owner: Awaited<ReturnType<typeof resolvePanelOwner>>,
  maps: {
    userByPanelId: Map<string, BillingUserRef>;
    userByEmail: Map<string, BillingUserRef>;
  },
): Promise<{
  user: BillingUserRef;
  created?: SyncUserCreated;
  linked?: SyncUserLinked;
} | null> {
  if (!owner.email) return null;

  const byPanel = owner.panelUserId ? maps.userByPanelId.get(owner.panelUserId) : undefined;
  if (byPanel) return { user: byPanel };

  const byEmail = maps.userByEmail.get(owner.email);
  if (byEmail) {
    if (!byEmail.panelUserId && owner.panelUserId) {
      const updated = await prisma.user.update({
        where: { id: byEmail.id },
        data: { panelUserId: owner.panelUserId },
        select: { id: true, email: true, panelUserId: true },
      });
      maps.userByPanelId.set(owner.panelUserId, updated);
      maps.userByEmail.set(updated.email, updated);
      return {
        user: updated,
        linked: {
          userId: updated.id,
          email: updated.email,
          panelUserId: owner.panelUserId,
        },
      };
    }
    return { user: byEmail };
  }

  if (owner.panelUserId) {
    const clash = await prisma.user.findUnique({
      where: { panelUserId: owner.panelUserId },
      select: { id: true, email: true, panelUserId: true },
    });
    if (clash) {
      maps.userByPanelId.set(owner.panelUserId, clash);
      maps.userByEmail.set(clash.email.trim().toLowerCase(), clash);
      return { user: clash };
    }
  }

  const username = await allocateUsername(owner.usernameHint || owner.email.split('@')[0] || 'user');
  const password = temporaryPassword();
  const created = await prisma.user.create({
    data: {
      email: owner.email,
      username,
      firstName: owner.firstName,
      lastName: owner.lastName,
      role: 'client',
      panelUserId: owner.panelUserId,
      passwordHash: await hashPassword(password),
    },
    select: { id: true, email: true, panelUserId: true, username: true },
  });
  const ref: BillingUserRef = {
    id: created.id,
    email: created.email,
    panelUserId: created.panelUserId,
  };
  maps.userByEmail.set(ref.email, ref);
  if (ref.panelUserId) maps.userByPanelId.set(ref.panelUserId, ref);

  return {
    user: ref,
    created: {
      userId: created.id,
      email: created.email,
      username: created.username,
      panelUserId: created.panelUserId,
      temporaryPassword: password,
    },
  };
}

export async function syncPanelServersIntoBilling(
  options: SyncFromPanelOptions = {},
): Promise<SyncFromPanelResult> {
  const createMissingUsers = options.createMissingUsers === true;
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
  const maps = { userByPanelId, userByEmail };

  const imported: SyncImported[] = [];
  const skipped: SyncSkipped[] = [];
  const backfilled: Array<{ serviceId: string; panelServerId: string }> = [];
  const updated: Array<{ serviceId: string; eggName: string | null; categoryName: string | null }> = [];
  const usersCreated: SyncUserCreated[] = [];
  const usersLinked: SyncUserLinked[] = [];
  const metaCache = new Map<string, Awaited<ReturnType<typeof eggMeta>>>();
  const ownerCache = new Map<string, Awaited<ReturnType<typeof resolvePanelOwner>>>();

  async function cachedMeta(server: PanelServer) {
    const key = server.eggId?.trim() || 'none';
    const hit = metaCache.get(key);
    if (hit) return hit;
    const meta = await eggMeta(server, eggsById);
    metaCache.set(key, meta);
    return meta;
  }

  async function cachedOwner(server: PanelServer) {
    const key = server.ownerId || ownerEmail(server) || server.id;
    const hit = ownerCache.get(key);
    if (hit) return hit;
    const owner = await resolvePanelOwner(server);
    ownerCache.set(key, owner);
    return owner;
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

    let email = ownerEmail(server);
    let user =
      (server.ownerId ? userByPanelId.get(server.ownerId) : undefined) ||
      (email ? userByEmail.get(email) : undefined);

    if (!user && createMissingUsers) {
      try {
        const owner = await cachedOwner(server);
        email = owner.email;
        const ensured = await ensureBillingUserForOwner(owner, maps);
        if (ensured) {
          user = ensured.user;
          if (ensured.created && !usersCreated.some((u) => u.userId === ensured.created!.userId)) {
            usersCreated.push(ensured.created);
          }
          if (ensured.linked && !usersLinked.some((u) => u.userId === ensured.linked!.userId)) {
            usersLinked.push(ensured.linked);
          }
        }
      } catch (err) {
        skipped.push({
          panelServerId: server.id,
          name: server.name,
          reason: 'import_failed',
          email,
          detail: err instanceof Error ? err.message : 'Could not create billing user',
        });
        continue;
      }
    }

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

  return { imported, skipped, backfilled, updated, usersCreated, usersLinked };
}
