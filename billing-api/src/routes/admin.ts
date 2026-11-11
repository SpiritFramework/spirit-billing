import type { FastifyInstance } from 'fastify';
import { z } from 'zod/v3';
import {
  assertPasswordOk,
  assertStepUpPassword,
  hashPassword,
  requireCapability,
  requireFullAdmin,
  requireStaffAccess,
  revokeAllUserSessions,
} from '../lib/auth.js';
import {
  CATEGORY_COLORS,
  CATEGORY_ICONS,
  addBillingCycle,
  getDefaultCurrency,
  getInvoiceDueDays,
  getServiceRefundWindowDays,
  getInvoicePrefix,
  getSetting,
  setSetting,
  uniqueCategorySlug,
} from '../lib/billing.js';
import { adjustCredits, normalizeCouponCode } from '../lib/credits.js';
import { cancelUnpaidInvoice, cancelUnpaidInvoiceAndCleanupPanel, deleteAdminInvoice } from '../lib/invoices.js';
import { deleteOwnedService } from '../lib/service-lifecycle.js';
import { syncPanelServersIntoBilling } from '../lib/sync-panel-services.js';
import { withEffectiveServiceCategory } from '../lib/service-display.js';
import { adminCreateCustomService } from '../lib/admin-create-service.js';
import {
  createRenewalInvoiceForService,
  getOverdueSuspendDays,
  getOverdueTerminateDays,
  runDueRenewals,
  runExpiredTrialEnforcement,
  runOverdueEnforcement,
} from '../lib/renewals.js';
import { pruneSystemLogs, recordLogFireAndForget } from '../lib/system-log.js';
import { getConfig } from '../lib/env.js';
import { getAboutPayload } from '../lib/version.js';
import {
  getPanelConnectionConfig,
  savePanelConnectionConfig,
  testPanelConnection,
} from '../lib/panel-config.js';
import { getSecuritySettings, saveSecuritySettings } from '../lib/security-settings.js';
import { prisma } from '../lib/prisma.js';
import { markInvoicePaidAndProvision } from '../lib/provision.js';
import { publicErrorMessage } from '../lib/public-errors.js';
import { resolvePanelUserLink } from '../lib/panel-link.js';
import {
  createPanelUser,
  findPanelUserByEmail,
  listPanelEggs,
  listPanelNodes,
  deletePanelUser,
  PanelApiError,
  suspendPanelServer,
  unsuspendPanelServer,
  updatePanelServer,
  isProtectedPanelPasswordError,
  PANEL_PASSWORD_PROTECTED_HINT,
  updatePanelUser,
} from '../services/panel.js';
import { isSafeHttpUrl } from '../lib/url-safety.js';
import { normalizeProductFeatures, serializeProductFeatures, repairInvalidProductFeatures } from '../lib/product-features.js';
import { saveBrandingAsset, type BrandingAssetKind } from '../lib/uploads.js';
import {
  AUTH_ATMOSPHERE_ENUM,
  NAV_LAYOUT_ENUM,
  NAVBAR_STYLE_ENUM,
  SHELL_ATMOSPHERE_ENUM,
  SIDEBAR_STYLE_ENUM,
  normalizeAuthAtmosphereSetting,
  normalizeNavLayoutSetting,
  normalizeNavbarStyleSetting,
  normalizeSidebarStyleSetting,
  resolveShellAtmosphereSetting,
} from '../lib/atmosphere.js';

const adminMutationRateLimit = {
  config: {
    rateLimit: {
      max: 40,
      timeWindow: '1 minute',
    },
  },
};

const panelTestRateLimit = {
  config: {
    rateLimit: {
      max: 5,
      timeWindow: '1 minute',
    },
  },
};

const productBody = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(2000).default(''),
  features: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
  categoryId: z.string().nullable().optional(),
  priceCents: z.number().int().min(0).max(100_000_000),
  currency: z.string().length(3).default('GBP'),
  cycle: z.enum(['monthly', 'quarterly', 'yearly']).default('monthly'),
  freeTrialDays: z.number().int().min(0).max(3650).default(0),
  active: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
  panelEggId: z.string().min(1),
  panelNodeId: z.string().nullable().optional(),
  memoryMb: z.number().int().min(0).default(1024),
  diskMb: z.number().int().min(0).default(10240),
  cpuPercent: z.number().int().min(0).default(100),
  backupLimit: z.number().int().min(0).default(1),
  databaseLimit: z.number().int().min(0).default(1),
  allocationLimit: z.number().int().min(0).default(0),
  subdomainAccess: z.boolean().default(false),
  fivemMarketplaceAccess: z.boolean().default(false),
  minecraftPluginsAccess: z.boolean().default(false),
});

const serviceEditBody = z.object({
  name: z.string().trim().min(1).max(64),
  memoryMb: z.number().int().min(0).max(10_000_000),
  diskMb: z.number().int().min(0).max(100_000_000),
  cpuPercent: z.number().int().min(0).max(100_000),
  backupLimit: z.number().int().min(0).max(1_000),
  databaseLimit: z.number().int().min(0).max(1_000),
  allocationLimit: z.number().int().min(0).max(1_000),
  subdomainAccess: z.boolean(),
  fivemMarketplaceAccess: z.boolean(),
  minecraftPluginsAccess: z.boolean(),
  priceCents: z.number().int().min(0).max(100_000_000),
  currency: z.string().trim().length(3).regex(/^[A-Za-z]{3}$/).transform((value) => value.toUpperCase()),
  cycle: z.enum(['monthly', 'quarterly', 'yearly']),
  /** ISO date or YYYY-MM-DD; null clears the schedule. Omit to leave unchanged (with auto-schedule rules). */
  nextDueAt: z.union([z.string().min(1).max(40), z.null()]).optional(),
});

const customServiceBody = z.object({
  userId: z.string().min(1),
  name: z.string().trim().min(1).max(64),
  categoryId: z.union([z.string().min(1), z.null()]).optional(),
  panelEggId: z.string().min(1),
  panelNodeId: z.string().min(1),
  memoryMb: z.number().int().min(0).max(10_000_000),
  diskMb: z.number().int().min(0).max(100_000_000),
  cpuPercent: z.number().int().min(0).max(100_000),
  backupLimit: z.number().int().min(0).max(1_000).default(0),
  databaseLimit: z.number().int().min(0).max(1_000).default(0),
  allocationLimit: z.number().int().min(0).max(1_000).default(0),
  subdomainAccess: z.boolean().default(false),
  fivemMarketplaceAccess: z.boolean().default(false),
  minecraftPluginsAccess: z.boolean().default(false),
  priceCents: z.number().int().min(0).max(100_000_000),
  currency: z
    .string()
    .trim()
    .length(3)
    .regex(/^[A-Za-z]{3}$/)
    .transform((value) => value.toUpperCase())
    .optional(),
  cycle: z.enum(['monthly', 'quarterly', 'yearly']).default('monthly'),
  billNow: z.boolean().optional(),
  nextDueAt: z.union([z.string().min(1).max(40), z.null()]).optional(),
  provision: z.boolean().optional(),
});

const categoryBody = z.object({
  name: z.string().min(1).max(64),
  description: z.string().max(500).default(''),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#6366f1'),
  icon: z.string().trim().min(1).max(32).default('gamepad'),
  logoUrl: z
    .union([
      z.literal(''),
      z.null(),
      z.string().max(512).refine(isSafeHttpUrl, { message: 'Logo URL must use http or https' }),
    ])
    .optional(),
  backgroundUrl: z
    .union([
      z.literal(''),
      z.null(),
      z.string().max(512).refine(isSafeHttpUrl, { message: 'Background URL must use http or https' }),
    ])
    .optional(),
  panelEggId: z
    .union([z.literal(''), z.null(), z.string().min(1).max(191)])
    .optional()
    .transform((value) => (value === '' || value === undefined ? null : value)),
  sortOrder: z.number().int().default(0),
  active: z.boolean().default(true),
});

function normalizeCategoryLogo(logoUrl: string | null | undefined | '') {
  if (logoUrl === undefined) return undefined;
  if (logoUrl === '' || logoUrl === null) return null;
  return logoUrl;
}

export async function adminRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireStaffAccess);

  app.get('/stats', async () => {
    const now = new Date();
    const chartStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const dueSoonEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const clientsSince = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const invoicePerson = {
      username: true,
      email: true,
      firstName: true,
      lastName: true,
      avatarUrl: true,
    } as const;

    const [
      users,
      linkedUsers,
      newClients30d,
      serviceStatusCounts,
      renewalsDueSoon,
      unpaidInvoices,
      overdueInvoices,
      dueSoonInvoices,
      paidThisMonth,
      paidLastMonth,
      activeProducts,
      totalProducts,
      revenuePaid,
      paidTimeline,
      recentInvoices,
      overdueInvoiceList,
      recentServices,
    ] = await Promise.all([
      prisma.user.count({ where: { role: 'client' } }),
      prisma.user.count({ where: { role: 'client', panelUserId: { not: null } } }),
      prisma.user.count({ where: { role: 'client', createdAt: { gte: clientsSince } } }),
      prisma.service.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      prisma.service.count({
        where: {
          status: 'active',
          nextDueAt: { gte: now, lte: dueSoonEnd },
        },
      }),
      prisma.invoice.aggregate({
        where: { status: 'unpaid' },
        _count: { _all: true },
        _sum: { totalCents: true },
      }),
      prisma.invoice.count({
        where: { status: 'unpaid', dueAt: { lt: now } },
      }),
      prisma.invoice.count({
        where: { status: 'unpaid', dueAt: { gte: now, lte: dueSoonEnd } },
      }),
      prisma.invoice.aggregate({
        where: { status: 'paid', paidAt: { gte: monthStart } },
        _count: { _all: true },
        _sum: { totalCents: true, creditAppliedCents: true },
      }),
      prisma.invoice.aggregate({
        where: { status: 'paid', paidAt: { gte: lastMonthStart, lt: monthStart } },
        _count: { _all: true },
        _sum: { totalCents: true, creditAppliedCents: true },
      }),
      prisma.product.count({ where: { active: true } }),
      prisma.product.count(),
      prisma.invoice.aggregate({
        where: { status: 'paid' },
        _sum: { totalCents: true, creditAppliedCents: true },
      }),
      prisma.invoice.findMany({
        where: { status: 'paid', paidAt: { gte: chartStart } },
        select: { paidAt: true, totalCents: true, creditAppliedCents: true },
      }),
      prisma.invoice.findMany({
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: {
          id: true,
          number: true,
          status: true,
          totalCents: true,
          creditAppliedCents: true,
          currency: true,
          dueAt: true,
          paidAt: true,
          createdAt: true,
          user: { select: invoicePerson },
          service: { select: { name: true } },
        },
      }),
      prisma.invoice.findMany({
        where: { status: 'unpaid', dueAt: { lt: now } },
        orderBy: { dueAt: 'asc' },
        take: 5,
        select: {
          id: true,
          number: true,
          totalCents: true,
          currency: true,
          dueAt: true,
          user: { select: invoicePerson },
          service: { select: { name: true } },
        },
      }),
      prisma.service.findMany({
        orderBy: { createdAt: 'desc' },
        take: 6,
        select: {
          id: true,
          name: true,
          status: true,
          createdAt: true,
          nextDueAt: true,
          panelServerId: true,
          user: { select: { username: true } },
          product: {
            select: {
              name: true,
              category: { select: { name: true, color: true, icon: true, logoUrl: true } },
            },
          },
        },
      }),
    ]);

    const ticketBundle = await Promise.allSettled([
      prisma.ticket.count({ where: { status: 'open' } }),
      prisma.ticket.count({ where: { status: 'awaiting_customer' } }),
      prisma.ticket.count({ where: { status: 'answered' } }),
      prisma.ticket.findMany({
        where: { status: { in: ['open', 'answered', 'awaiting_customer'] } },
        orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
        take: 6,
        select: {
          id: true,
          number: true,
          subject: true,
          status: true,
          priority: true,
          updatedAt: true,
          user: { select: { username: true, firstName: true, lastName: true, avatarUrl: true } },
          category: { select: { name: true, color: true, icon: true } },
        },
      }),
      prisma.systemLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: {
          id: true,
          level: true,
          category: true,
          action: true,
          message: true,
          createdAt: true,
        },
      }),
    ]);

    const settledValue = <T,>(result: PromiseSettledResult<T>, fallback: T) =>
      result.status === 'fulfilled' ? result.value : fallback;

    const openTickets = settledValue(ticketBundle[0], 0);
    const awaitingTickets = settledValue(ticketBundle[1], 0);
    const answeredTickets = settledValue(ticketBundle[2], 0);
    const recentTickets = settledValue(ticketBundle[3], []);
    const recentLogs = settledValue(ticketBundle[4], []);

    const revenueByMonth = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
      return {
        key: `${date.getFullYear()}-${date.getMonth()}`,
        label: date.toLocaleDateString('en-GB', { month: 'short' }),
        revenueCents: 0,
      };
    });
    for (const invoice of paidTimeline) {
      if (!invoice.paidAt) continue;
      const key = `${invoice.paidAt.getFullYear()}-${invoice.paidAt.getMonth()}`;
      const bucket = revenueByMonth.find((month) => month.key === key);
      // Settled value includes credits applied (not only remaining cash total).
      if (bucket) bucket.revenueCents += invoice.totalCents + invoice.creditAppliedCents;
    }

    const settled = (row: { _sum: { totalCents: number | null; creditAppliedCents: number | null } }) =>
      (row._sum.totalCents ?? 0) + (row._sum.creditAppliedCents ?? 0);

    const totalServices = serviceStatusCounts.reduce((sum, row) => sum + row._count._all, 0);
    const activeServices = serviceStatusCounts.find((row) => row.status === 'active')?._count._all ?? 0;
    const pendingServices =
      serviceStatusCounts.find((row) => row.status === 'pending_payment')?._count._all ?? 0;
    const suspendedServices =
      serviceStatusCounts.find((row) => row.status === 'suspended')?._count._all ?? 0;

    return {
      generatedAt: now.toISOString(),
      users,
      linkedUsers,
      newClients30d,
      services: {
        total: totalServices,
        active: activeServices,
        pending: pendingServices,
        suspended: suspendedServices,
        renewalsDueSoon,
      },
      invoices: {
        unpaid: unpaidInvoices._count._all,
        unpaidCents: unpaidInvoices._sum.totalCents ?? 0,
        overdue: overdueInvoices,
        dueSoon: dueSoonInvoices,
      },
      products: {
        total: totalProducts,
        active: activeProducts,
      },
      tickets: {
        open: openTickets,
        awaiting: awaitingTickets,
        answered: answeredTickets,
        hot: openTickets + awaitingTickets,
      },
      revenuePaidCents: settled(revenuePaid),
      revenueThisMonthCents: settled(paidThisMonth),
      revenueLastMonthCents: settled(paidLastMonth),
      paidThisMonthCount: paidThisMonth._count._all,
      revenueByMonth: revenueByMonth.map(({ label, revenueCents }) => ({ label, revenueCents })),
      recentInvoices,
      overdueInvoices: overdueInvoiceList,
      recentServices,
      recentTickets,
      recentLogs,
    };
  });

  app.get('/analytics', async () => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const chartStart = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 13);
    dayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const priorWeekStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const clientsSince = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const dueSoonEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const paySampleSince = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const settled = (row: { _sum: { totalCents: number | null; creditAppliedCents: number | null } }) =>
      (row._sum.totalCents ?? 0) + (row._sum.creditAppliedCents ?? 0);

    const monthBuckets = Array.from({ length: 12 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - 11 + index, 1);
      return {
        key: `${date.getFullYear()}-${date.getMonth()}`,
        label: date.toLocaleDateString('en-GB', { month: 'short' }),
        revenueCents: 0,
        paidCount: 0,
        newClients: 0,
        servicesCreated: 0,
      };
    });

    const dayBuckets = Array.from({ length: 14 }, (_, index) => {
      const date = new Date(dayStart.getTime() + index * 24 * 60 * 60 * 1000);
      return {
        key: `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`,
        label: date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
        revenueCents: 0,
        paidCount: 0,
      };
    });

    const [
      clients,
      linkedClients,
      newClients30d,
      creditOutstanding,
      servicesByStatus,
      unpaidInvoices,
      overdueCount,
      cancelledInvoices,
      paidAllTime,
      paidThisMonth,
      paidLastMonth,
      paidThisWeek,
      paidPriorWeek,
      paidTimeline,
      newClientsTimeline,
      servicesTimeline,
      paidWithCatalog,
      paySamples,
      renewalsDueSoon,
      overdueInvoiceList,
      ticketOpen,
      ticketAwaiting,
      ticketAnswered,
      ticketClosed,
      activeCoupons,
      redemptions30d,
      productsActive,
      productsTotal,
      logsByLevel,
    ] = await Promise.all([
      prisma.user.count({ where: { role: 'client' } }),
      prisma.user.count({ where: { role: 'client', panelUserId: { not: null } } }),
      prisma.user.count({ where: { role: 'client', createdAt: { gte: clientsSince } } }),
      prisma.user.aggregate({
        where: { role: 'client', creditBalanceCents: { gt: 0 } },
        _sum: { creditBalanceCents: true },
        _count: { _all: true },
      }),
      prisma.service.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.invoice.aggregate({
        where: { status: 'unpaid' },
        _count: { _all: true },
        _sum: { totalCents: true },
      }),
      prisma.invoice.count({ where: { status: 'unpaid', dueAt: { lt: now } } }),
      prisma.invoice.aggregate({
        where: { status: 'cancelled' },
        _count: { _all: true },
        _sum: { totalCents: true },
      }),
      prisma.invoice.aggregate({
        where: { status: 'paid' },
        _sum: { totalCents: true, creditAppliedCents: true },
        _count: { _all: true },
      }),
      prisma.invoice.aggregate({
        where: { status: 'paid', paidAt: { gte: monthStart } },
        _sum: { totalCents: true, creditAppliedCents: true },
        _count: { _all: true },
      }),
      prisma.invoice.aggregate({
        where: { status: 'paid', paidAt: { gte: lastMonthStart, lt: monthStart } },
        _sum: { totalCents: true, creditAppliedCents: true },
        _count: { _all: true },
      }),
      prisma.invoice.aggregate({
        where: { status: 'paid', paidAt: { gte: weekStart } },
        _sum: { totalCents: true, creditAppliedCents: true },
        _count: { _all: true },
      }),
      prisma.invoice.aggregate({
        where: { status: 'paid', paidAt: { gte: priorWeekStart, lt: weekStart } },
        _sum: { totalCents: true, creditAppliedCents: true },
        _count: { _all: true },
      }),
      prisma.invoice.findMany({
        where: { status: 'paid', paidAt: { gte: chartStart } },
        select: { paidAt: true, totalCents: true, creditAppliedCents: true },
      }),
      prisma.user.findMany({
        where: { role: 'client', createdAt: { gte: chartStart } },
        select: { createdAt: true },
      }),
      prisma.service.findMany({
        where: { createdAt: { gte: chartStart } },
        select: { createdAt: true },
      }),
      prisma.invoice.findMany({
        where: { status: 'paid', paidAt: { gte: chartStart } },
        select: {
          totalCents: true,
          creditAppliedCents: true,
          service: {
            select: {
              category: { select: { id: true, name: true, color: true, icon: true } },
              product: {
                select: {
                  id: true,
                  name: true,
                  category: { select: { id: true, name: true, color: true, icon: true } },
                },
              },
            },
          },
        },
      }),
      prisma.invoice.findMany({
        where: { status: 'paid', paidAt: { gte: paySampleSince } },
        select: { createdAt: true, paidAt: true },
        take: 500,
      }),
      prisma.service.count({
        where: { status: 'active', nextDueAt: { gte: now, lte: dueSoonEnd } },
      }),
      prisma.invoice.findMany({
        where: { status: 'unpaid', dueAt: { lt: now } },
        orderBy: { dueAt: 'asc' },
        take: 6,
        select: {
          id: true,
          number: true,
          totalCents: true,
          currency: true,
          dueAt: true,
          user: { select: { username: true, firstName: true, lastName: true } },
          service: { select: { name: true } },
        },
      }),
      prisma.ticket.count({ where: { status: 'open' } }).catch(() => 0),
      prisma.ticket.count({ where: { status: 'awaiting_customer' } }).catch(() => 0),
      prisma.ticket.count({ where: { status: 'answered' } }).catch(() => 0),
      prisma.ticket.count({ where: { status: 'closed' } }).catch(() => 0),
      prisma.coupon.count({ where: { active: true } }),
      prisma.couponRedemption.aggregate({
        where: { createdAt: { gte: clientsSince } },
        _count: { _all: true },
        _sum: { discountCents: true, creditCents: true },
      }),
      prisma.product.count({ where: { active: true } }),
      prisma.product.count(),
      prisma.systemLog.groupBy({
        by: ['level'],
        where: { createdAt: { gte: clientsSince } },
        _count: { _all: true },
      }).catch(() => []),
    ]);

    for (const invoice of paidTimeline) {
      if (!invoice.paidAt) continue;
      const monthKey = `${invoice.paidAt.getFullYear()}-${invoice.paidAt.getMonth()}`;
      const monthBucket = monthBuckets.find((month) => month.key === monthKey);
      if (monthBucket) {
        monthBucket.revenueCents += invoice.totalCents + invoice.creditAppliedCents;
        monthBucket.paidCount += 1;
      }
      const dayKey = `${invoice.paidAt.getFullYear()}-${invoice.paidAt.getMonth()}-${invoice.paidAt.getDate()}`;
      const dayBucket = dayBuckets.find((day) => day.key === dayKey);
      if (dayBucket) {
        dayBucket.revenueCents += invoice.totalCents + invoice.creditAppliedCents;
        dayBucket.paidCount += 1;
      }
    }

    for (const user of newClientsTimeline) {
      const key = `${user.createdAt.getFullYear()}-${user.createdAt.getMonth()}`;
      const bucket = monthBuckets.find((month) => month.key === key);
      if (bucket) bucket.newClients += 1;
    }

    for (const service of servicesTimeline) {
      const key = `${service.createdAt.getFullYear()}-${service.createdAt.getMonth()}`;
      const bucket = monthBuckets.find((month) => month.key === key);
      if (bucket) bucket.servicesCreated += 1;
    }

    const categoryMap = new Map<
      string,
      { id: string; name: string; color: string; icon: string; revenueCents: number; paidCount: number }
    >();
    const productMap = new Map<
      string,
      {
        id: string;
        name: string;
        color: string;
        icon: string;
        categoryName: string;
        revenueCents: number;
        paidCount: number;
      }
    >();

    for (const invoice of paidWithCatalog) {
      const amount = invoice.totalCents + invoice.creditAppliedCents;
      const category =
        invoice.service?.category || invoice.service?.product?.category || null;
      const categoryId = category?.id || 'uncategorized';
      const categoryRow = categoryMap.get(categoryId) || {
        id: categoryId,
        name: category?.name || 'Uncategorized',
        color: category?.color || '#64748b',
        icon: category?.icon || 'server',
        revenueCents: 0,
        paidCount: 0,
      };
      categoryRow.revenueCents += amount;
      categoryRow.paidCount += 1;
      categoryMap.set(categoryId, categoryRow);

      const product = invoice.service?.product;
      if (product) {
        const productRow = productMap.get(product.id) || {
          id: product.id,
          name: product.name,
          color: product.category?.color || category?.color || '#64748b',
          icon: product.category?.icon || category?.icon || 'package',
          categoryName: product.category?.name || category?.name || 'Uncategorized',
          revenueCents: 0,
          paidCount: 0,
        };
        productRow.revenueCents += amount;
        productRow.paidCount += 1;
        productMap.set(product.id, productRow);
      }
    }

    const revenueByCategory = [...categoryMap.values()]
      .sort((a, b) => b.revenueCents - a.revenueCents)
      .slice(0, 8);
    const topProducts = [...productMap.values()]
      .sort((a, b) => b.revenueCents - a.revenueCents)
      .slice(0, 6);

    const services = {
      total: 0,
      active: 0,
      pending_payment: 0,
      suspended: 0,
      cancelled: 0,
    };
    for (const row of servicesByStatus) {
      services.total += row._count._all;
      if (row.status in services) {
        services[row.status as keyof typeof services] = row._count._all;
      }
    }

    let payDaysTotal = 0;
    let payDaysSamples = 0;
    for (const sample of paySamples) {
      if (!sample.paidAt) continue;
      const days = Math.max(
        0,
        Math.round((sample.paidAt.getTime() - sample.createdAt.getTime()) / (24 * 60 * 60 * 1000)),
      );
      payDaysTotal += days;
      payDaysSamples += 1;
    }

    const revenueThisMonth = settled(paidThisMonth);
    const revenueLastMonth = settled(paidLastMonth);
    const revenueThisWeek = settled(paidThisWeek);
    const revenuePriorWeek = settled(paidPriorWeek);
    const revenueMomPct =
      revenueLastMonth > 0
        ? Math.round(((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 1000) / 10
        : revenueThisMonth > 0
          ? 100
          : 0;
    const revenueWowPct =
      revenuePriorWeek > 0
        ? Math.round(((revenueThisWeek - revenuePriorWeek) / revenuePriorWeek) * 1000) / 10
        : revenueThisWeek > 0
          ? 100
          : 0;

    const paidCount = paidAllTime._count._all;
    const unpaidCount = unpaidInvoices._count._all;
    const collectionRate =
      paidCount + unpaidCount > 0
        ? Math.round((paidCount / (paidCount + unpaidCount)) * 1000) / 10
        : 100;

    const logs = { info: 0, warn: 0, error: 0, total: 0 };
    for (const row of logsByLevel as Array<{ level: 'info' | 'warn' | 'error'; _count: { _all: number } }>) {
      logs[row.level] = row._count._all;
      logs.total += row._count._all;
    }

    return {
      generatedAt: now.toISOString(),
      kpis: {
        revenueAllTimeCents: settled(paidAllTime),
        paidAllTimeCount: paidCount,
        revenueThisMonthCents: revenueThisMonth,
        revenueLastMonthCents: revenueLastMonth,
        revenueMomPct,
        revenueThisWeekCents: revenueThisWeek,
        revenuePriorWeekCents: revenuePriorWeek,
        revenueWowPct,
        paidThisMonthCount: paidThisMonth._count._all,
        unpaidCount,
        unpaidCents: unpaidInvoices._sum.totalCents ?? 0,
        overdueCount,
        cancelledCount: cancelledInvoices._count._all,
        cancelledCents: cancelledInvoices._sum.totalCents ?? 0,
        clients,
        linkedClients,
        newClients30d,
        activeServices: services.active,
        renewalsDueSoon,
        arpuCents: services.active > 0 ? Math.round(revenueThisMonth / services.active) : 0,
        panelLinkRate: clients > 0 ? Math.round((linkedClients / clients) * 1000) / 10 : 0,
        creditOutstandingCents: creditOutstanding._sum.creditBalanceCents ?? 0,
        creditHolders: creditOutstanding._count._all,
        collectionRate,
        avgDaysToPay: payDaysSamples > 0 ? Math.round((payDaysTotal / payDaysSamples) * 10) / 10 : 0,
      },
      series: monthBuckets.map(({ label, revenueCents, paidCount: count, newClients, servicesCreated }) => ({
        label,
        revenueCents,
        paidCount: count,
        newClients,
        servicesCreated,
      })),
      daily: dayBuckets.map(({ label, revenueCents, paidCount: count }) => ({
        label,
        revenueCents,
        paidCount: count,
      })),
      services,
      revenueByCategory,
      topProducts,
      invoices: {
        paid: paidCount,
        unpaid: unpaidCount,
        cancelled: cancelledInvoices._count._all,
        paidCents: settled(paidAllTime),
        unpaidCents: unpaidInvoices._sum.totalCents ?? 0,
        cancelledCents: cancelledInvoices._sum.totalCents ?? 0,
      },
      overdueInvoices: overdueInvoiceList,
      tickets: {
        open: ticketOpen,
        awaiting: ticketAwaiting,
        answered: ticketAnswered,
        closed: ticketClosed,
      },
      coupons: {
        active: activeCoupons,
        redemptions30d: redemptions30d._count._all,
        discountCents30d: redemptions30d._sum.discountCents ?? 0,
        creditCents30d: redemptions30d._sum.creditCents ?? 0,
      },
      products: { total: productsTotal, active: productsActive },
      logs,
    };
  });

  app.get('/meta', async () => ({
    categoryColors: CATEGORY_COLORS,
    categoryIcons: CATEGORY_ICONS,
  }));

  app.get('/categories', async () =>
    prisma.category.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { products: true } } },
    }),
  );

  app.get('/categories/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const category = await prisma.category.findUnique({
      where: { id },
      include: { _count: { select: { products: true } } },
    });
    if (!category) return reply.status(404).send({ error: 'Category not found' });
    return category;
  });

  app.post('/categories', { preHandler: requireFullAdmin }, async (request, reply) => {
    const body = categoryBody.parse(request.body);
    const slug = await uniqueCategorySlug(body.name);
    const logoUrl = normalizeCategoryLogo(body.logoUrl) ?? null;
    const backgroundUrl = normalizeCategoryLogo(body.backgroundUrl) ?? null;
    try {
      return await prisma.category.create({
        data: {
          name: body.name,
          description: body.description,
          color: body.color,
          icon: body.icon,
          logoUrl,
          backgroundUrl,
          panelEggId: body.panelEggId ?? null,
          sortOrder: body.sortOrder,
          active: body.active,
          slug,
        },
      });
    } catch {
      return reply.status(409).send({ error: 'Category name already exists' });
    }
  });

  app.patch('/categories/:id', { preHandler: requireFullAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = categoryBody.partial().parse(request.body);
    const existing = await prisma.category.findUnique({ where: { id } });
    if (!existing) return reply.status(404).send({ error: 'Not found' });
    try {
      const updated = await prisma.category.update({
        where: { id },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.description !== undefined ? { description: body.description } : {}),
          ...(body.color !== undefined ? { color: body.color } : {}),
          ...(body.icon !== undefined ? { icon: body.icon } : {}),
          ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
          ...(body.active !== undefined ? { active: body.active } : {}),
          ...(body.logoUrl !== undefined ? { logoUrl: normalizeCategoryLogo(body.logoUrl) } : {}),
          ...(body.backgroundUrl !== undefined
            ? { backgroundUrl: normalizeCategoryLogo(body.backgroundUrl) }
            : {}),
          ...(body.panelEggId !== undefined ? { panelEggId: body.panelEggId } : {}),
          ...(body.name ? { slug: await uniqueCategorySlug(body.name, id) } : {}),
        },
      });
      // Keep sellable products in this category on the same egg as the category.
      if (body.panelEggId) {
        await prisma.product.updateMany({
          where: {
            categoryId: id,
            NOT: [
              { panelEggId: 'custom' },
              { name: 'Custom' },
              { name: { startsWith: 'Custom · ' } },
            ],
          },
          data: { panelEggId: body.panelEggId },
        });
      }
      return updated;
    } catch (err) {
      const prismaCode = (err as { code?: string }).code;
      const meta = (err as { meta?: { target?: string | string[] } }).meta;
      const target = Array.isArray(meta?.target) ? meta.target.join(', ') : meta?.target;
      request.log.error({ err, categoryId: id, prismaCode, target }, 'Category update failed');
      if (prismaCode === 'P2002') {
        if (target?.includes('name')) {
          return reply.status(409).send({ error: 'Another category already uses that name' });
        }
        if (target?.includes('slug')) {
          return reply.status(409).send({ error: 'Another category already uses that URL slug' });
        }
        return reply.status(409).send({ error: 'Category name or slug already exists' });
      }
      if (prismaCode === 'P2022' || /unknown column|no such column/i.test(err instanceof Error ? err.message : '')) {
        return reply.status(500).send({
          error: 'Database schema is out of date. Run prisma db push on the API host.',
        });
      }
      request.log.error({ err }, 'category update failed');
      return reply.status(500).send({
        error: 'Could not update category',
      });
    }
  });

  app.delete('/categories/:id', { preHandler: requireFullAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const count = await prisma.product.count({ where: { categoryId: id } });
    if (count > 0) {
      return reply.status(422).send({
        error: `Category has ${count} product(s). Reassign or delete them first.`,
      });
    }
    try {
      await prisma.category.delete({ where: { id } });
      return { deleted: true };
    } catch {
      return reply.status(404).send({ error: 'Not found' });
    }
  });

  app.get('/products', async () => {
    async function load() {
      const products = await prisma.product.findMany({
        include: {
          category: {
            select: {
              id: true,
              name: true,
              color: true,
              icon: true,
              slug: true,
              logoUrl: true,
              sortOrder: true,
              active: true,
            },
          },
          _count: { select: { services: true } },
        },
        orderBy: [
          { category: { sortOrder: 'asc' } },
          { category: { name: 'asc' } },
          { sortOrder: 'asc' },
          { name: 'asc' },
        ],
      });
      // Hide the internal Custom import product from the sellable catalog UI.
      return products
        .filter(
          (product) =>
            !(
              product.panelEggId === 'custom' ||
              product.name === 'Custom' ||
              product.name.startsWith('Custom · ')
            ),
        )
        .map((product) => ({
          ...product,
          features: normalizeProductFeatures(product.features, true),
        }));
    }
    try {
      return await load();
    } catch (err) {
      if (
        !(err instanceof SyntaxError) &&
        !(err instanceof Error && /json/i.test(err.message))
      ) {
        throw err;
      }
      await repairInvalidProductFeatures();
      return load();
    }
  });

  app.get('/products/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    async function load() {
      return prisma.product.findUnique({
        where: { id },
        include: {
          category: { select: { id: true, name: true, color: true, icon: true, slug: true, logoUrl: true } },
          _count: { select: { services: true } },
        },
      });
    }
    let product;
    try {
      product = await load();
    } catch (err) {
      if (
        !(err instanceof SyntaxError) &&
        !(err instanceof Error && /json/i.test(err.message))
      ) {
        throw err;
      }
      await repairInvalidProductFeatures();
      product = await load();
    }
    if (!product) return reply.status(404).send({ error: 'Product not found' });
    return {
      ...product,
      features: normalizeProductFeatures(product.features, true),
    };
  });

  app.post('/products', { preHandler: requireFullAdmin }, async (request, reply) => {
    const body = productBody.parse(request.body);
    let panelEggId = body.panelEggId;
    if (body.categoryId) {
      const cat = await prisma.category.findUnique({ where: { id: body.categoryId } });
      if (!cat) return reply.status(422).send({ error: 'Category not found' });
      if (cat.panelEggId) {
        panelEggId = cat.panelEggId;
      }
    }
    if (!body.panelNodeId) {
      return reply.status(422).send({ error: 'Node ID is required for provisioning' });
    }
    const { features: featuresRaw, ...rest } = body;
    const features = serializeProductFeatures(
      featuresRaw ?? [
        'Instant server deployment',
        'DDoS protection included',
        'Full Spirit-Panel access',
      ],
    );
    return prisma.product.create({
      data: { ...rest, panelEggId, features },
      include: {
        category: { select: { id: true, name: true, color: true, icon: true, slug: true, logoUrl: true, panelEggId: true } },
      },
    });
  });

  app.patch('/products/:id', { preHandler: requireFullAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = productBody.partial().parse(request.body);
    const { features: featuresRaw, ...rest } = body;
    const data: Record<string, unknown> = { ...rest };
    if (featuresRaw !== undefined) {
      data.features = serializeProductFeatures(featuresRaw);
    }
    if (body.categoryId) {
      const cat = await prisma.category.findUnique({ where: { id: body.categoryId } });
      if (!cat) return reply.status(422).send({ error: 'Category not found' });
      if (cat.panelEggId) {
        data.panelEggId = cat.panelEggId;
      }
    } else if (body.categoryId === null) {
      // clearing category — leave egg as-is
    } else if (body.panelEggId === undefined) {
      // no category change; keep egg from body if provided
    }
    if (body.panelNodeId !== undefined && !body.panelNodeId) {
      return reply.status(422).send({ error: 'Node ID is required for provisioning — cannot clear it.' });
    }
    if (data.panelEggId !== undefined && !String(data.panelEggId).trim()) {
      return reply.status(422).send({ error: 'Egg ID is required for provisioning.' });
    }
    try {
      return await prisma.product.update({
        where: { id },
        data,
        include: {
          category: { select: { id: true, name: true, color: true, icon: true, slug: true, logoUrl: true, panelEggId: true } },
        },
      });
    } catch {
      return reply.status(404).send({ error: 'Not found' });
    }
  });

  app.delete('/products/:id', { preHandler: requireFullAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await prisma.product.delete({ where: { id } });
      return { deleted: true };
    } catch {
      return reply.status(404).send({ error: 'Not found' });
    }
  });

  app.get('/services', async () => {
    const [services, panel] = await Promise.all([
      prisma.service.findMany({
        include: {
          user: {
            select: {
              id: true,
              email: true,
              username: true,
              firstName: true,
              lastName: true,
            },
          },
          category: {
            select: { id: true, name: true, color: true, icon: true, logoUrl: true },
          },
          product: {
            select: {
              id: true,
              name: true,
              cycle: true,
              priceCents: true,
              currency: true,
              memoryMb: true,
              diskMb: true,
              cpuPercent: true,
              backupLimit: true,
              databaseLimit: true,
              allocationLimit: true,
              category: {
                select: { id: true, name: true, color: true, icon: true, logoUrl: true },
              },
            },
          },
          invoices: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              id: true,
              number: true,
              status: true,
              totalCents: true,
              currency: true,
              dueAt: true,
              paidAt: true,
            },
          },
          _count: { select: { invoices: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      getPanelConnectionConfig(),
    ]);
    return {
      services: services.map(withEffectiveServiceCategory),
      panelWebUrl: panel.panelWebUrl,
    };
  });

  app.post('/services/sync-from-panel', { preHandler: requireFullAdmin, ...adminMutationRateLimit }, async (request, reply) => {
    try {
      const body = z
        .object({
          createMissingUsers: z.boolean().optional(),
          currentPassword: z.string().min(1).max(128).optional(),
        })
        .passthrough()
        .parse(request.body ?? {});
      await assertStepUpPassword(request.user!.id, body.currentPassword);
      const createMissingUsers = body.createMissingUsers !== false;
      const result = await syncPanelServersIntoBilling({ createMissingUsers });
      // Never log temporary passwords — only counts for the audit trail.
      recordLogFireAndForget({
        level: 'info',
        category: 'provision',
        action: 'services.sync_panel',
        message: `Synced panel servers (imported ${result.imported.length}, users ${result.usersCreated.length}, updated ${result.updated.length})`,
        actorUserId: request.user!.id,
        ip: request.ip,
        method: 'POST',
        path: '/api/admin/services/sync-from-panel',
        meta: {
          imported: result.imported.length,
          updated: result.updated.length,
          skipped: result.skipped.length,
          backfilled: result.backfilled.length,
          usersCreated: result.usersCreated.length,
          usersLinked: result.usersLinked.length,
          createMissingUsers,
        },
      });
      // Temporary passwords are returned once to the full admin (HTTPS). Installer CLI also writes them to disk.
      return {
        ...result,
        importedCount: result.imported.length,
        skippedCount: result.skipped.length,
        backfilledCount: result.backfilled.length,
        updatedCount: result.updated.length,
        usersCreatedCount: result.usersCreated.length,
        usersLinkedCount: result.usersLinked.length,
      };
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status && status < 500) {
        return reply.status(status).send({ error: err instanceof Error ? err.message : 'Sync failed' });
      }
      if (err instanceof PanelApiError) {
        return reply.status(err.status >= 400 && err.status < 500 ? err.status : 502).send({
          error: publicErrorMessage(err, 'Could not sync from Spirit-Panel', request.log),
        });
      }
      throw err;
    }
  });

  app.post('/services/custom', { preHandler: requireFullAdmin, ...adminMutationRateLimit }, async (request, reply) => {
    try {
      const body = customServiceBody.parse(request.body);
      const result = await adminCreateCustomService(body);
      recordLogFireAndForget({
        level: 'info',
        category: 'provision',
        action: 'services.create_custom',
        message: `Created custom server ${result.service.name}`,
        actorUserId: request.user!.id,
        targetUserId: body.userId,
        ip: request.ip,
        method: 'POST',
        path: '/api/admin/services/custom',
        meta: { serviceId: result.service.id, billNow: Boolean(body.billNow) },
      });
      return result;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status && status < 500) {
        return reply.status(status).send({ error: err instanceof Error ? err.message : 'Failed' });
      }
      throw err;
    }
  });

  app.post('/services/run-renewals', { preHandler: requireFullAdmin, ...adminMutationRateLimit }, async (request) => {
    const result = await runDueRenewals();
    const trials = await runExpiredTrialEnforcement();
    recordLogFireAndForget({
      level: 'info',
      category: 'billing',
      action: 'services.run_renewals',
      message: `Ran renewals: created ${result.created.length}, skipped ${result.skipped.length}`,
      actorUserId: request.user!.id,
      ip: request.ip,
      method: 'POST',
      path: '/api/admin/services/run-renewals',
      meta: { created: result.created.length, skipped: result.skipped.length, scanned: result.scanned, trialsTerminated: trials.terminated.length },
    });
    return { ...result, trials };
  });

  app.post('/services/run-overdue-suspensions', { preHandler: requireFullAdmin, ...adminMutationRateLimit }, async (request) => {
    const trials = await runExpiredTrialEnforcement();
    const result = await runOverdueEnforcement();
    const terminated = [...trials.terminated, ...result.terminated];
    const failed = [...trials.failed, ...result.failed];
    recordLogFireAndForget({
      level: 'info',
      category: 'billing',
      action: 'services.run_overdue',
      message: `Overdue enforcement: suspended ${result.suspended.length}, terminated ${terminated.length}`,
      actorUserId: request.user!.id,
      ip: request.ip,
      method: 'POST',
      path: '/api/admin/services/run-overdue-suspensions',
      meta: {
        suspended: result.suspended.length,
        terminated: terminated.length,
        failed: failed.length,
        suspendDays: result.suspendDays,
        terminateDays: result.terminateDays,
      },
    });
    return { ...result, terminated, failed, trialsTerminated: trials.terminated.length };
  });

  app.get('/services/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const [service, panel] = await Promise.all([
      prisma.service.findUnique({
        where: { id },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              username: true,
              firstName: true,
              lastName: true,
              creditBalanceCents: true,
            },
          },
          category: {
            select: { id: true, name: true, color: true, icon: true, logoUrl: true },
          },
          product: {
            select: {
              id: true,
              name: true,
              description: true,
              cycle: true,
              priceCents: true,
              currency: true,
              memoryMb: true,
              diskMb: true,
              cpuPercent: true,
              backupLimit: true,
              databaseLimit: true,
              allocationLimit: true,
              panelEggId: true,
              panelNodeId: true,
              category: {
                select: { id: true, name: true, color: true, icon: true, logoUrl: true },
              },
            },
          },
          invoices: {
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              number: true,
              status: true,
              totalCents: true,
              currency: true,
              description: true,
              dueAt: true,
              paidAt: true,
              createdAt: true,
              upgradeToProductId: true,
            },
          },
        },
      }),
      getPanelConnectionConfig(),
    ]);
    if (!service) return reply.status(404).send({ error: 'Not found' });
    return { ...withEffectiveServiceCategory(service), panelWebUrl: panel.panelWebUrl };
  });

  app.patch('/services/:id', { preHandler: requireFullAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = serviceEditBody.parse(request.body);
    const service = await prisma.service.findUnique({
      where: { id },
      include: { product: true },
    });
    if (!service) return reply.status(404).send({ error: 'Not found' });
    if (service.status === 'cancelled') {
      return reply.status(422).send({ error: 'Cancelled services cannot be edited' });
    }

    const { nextDueAt: nextDueRaw, ...rest } = body;
    let nextDueAt: Date | null | undefined;
    if (nextDueRaw === null) {
      nextDueAt = null;
    } else if (nextDueRaw !== undefined) {
      const parsed = new Date(nextDueRaw.includes('T') ? nextDueRaw : `${nextDueRaw}T12:00:00`);
      if (Number.isNaN(parsed.getTime())) {
        return reply.status(422).send({ error: 'Invalid next renewal date' });
      }
      nextDueAt = parsed;
    } else if (rest.priceCents > 0 && !service.nextDueAt) {
      nextDueAt = addBillingCycle(new Date(), rest.cycle);
    } else if (rest.priceCents <= 0) {
      nextDueAt = null;
    }

    if (service.panelServerId) {
      try {
        await updatePanelServer(service.panelServerId, {
          name: rest.name,
          memory: rest.memoryMb,
          disk: rest.diskMb,
          cpu: rest.cpuPercent,
          backupLimit: rest.backupLimit,
          databaseLimit: rest.databaseLimit,
          allocationLimit: rest.allocationLimit,
          subdomainAccess: rest.subdomainAccess,
          fivemMarketplaceAccess: rest.fivemMarketplaceAccess,
          minecraftPluginsAccess: rest.minecraftPluginsAccess,
        });
      } catch (err) {
        if (err instanceof PanelApiError) {
          return reply.status(err.status >= 400 && err.status < 500 ? err.status : 502).send({
            error: `Spirit-Panel rejected the server update: ${err.message}`,
          });
        }
        throw err;
      }
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.service.update({
        where: { id },
        data: {
          ...rest,
          ...(nextDueAt !== undefined ? { nextDueAt } : {}),
        },
      });
      await tx.notification.create({
        data: {
          userId: service.userId,
          type: 'info',
          title: 'Server settings updated',
          message: `${rest.name}'s name or resource limits were updated by an administrator.`,
          href: `/services/${service.id}`,
        },
      });
      return updated;
    });
  });

  app.post('/services/:id/create-renewal', { preHandler: requireFullAdmin, ...adminMutationRateLimit }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = z
      .object({ dueImmediately: z.boolean().optional() })
      .parse(request.body ?? {});
    try {
      return await createRenewalInvoiceForService(id, {
        dueImmediately: body.dueImmediately,
      });
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status && status < 500) {
        return reply.status(status).send({ error: err instanceof Error ? err.message : 'Failed' });
      }
      throw err;
    }
  });

  app.delete('/services/:id', { preHandler: requireFullAdmin, ...adminMutationRateLimit }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return await deleteOwnedService({
        serviceId: id,
        userId: request.user!.id,
        asAdmin: true,
      });
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status && status < 500) {
        return reply.status(status).send({ error: err instanceof Error ? err.message : 'Failed' });
      }
      throw err;
    }
  });

  app.get('/invoices', async () => {
    const invoices = await prisma.invoice.findMany({
      include: {
        user: {
          select: {
            id: true,
            email: true,
            username: true,
            firstName: true,
            lastName: true,
          },
        },
        paidBy: { select: { id: true, username: true } },
        service: {
          select: {
            id: true,
            name: true,
            status: true,
            panelServerId: true,
            product: {
              select: {
                id: true,
                name: true,
                category: {
                  select: { id: true, name: true, color: true, icon: true, logoUrl: true },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const upgradeIds = [
      ...new Set(invoices.map((inv) => inv.upgradeToProductId).filter(Boolean)),
    ] as string[];
    const upgradeProducts = upgradeIds.length
      ? await prisma.product.findMany({
          where: { id: { in: upgradeIds } },
          select: {
            id: true,
            name: true,
            priceCents: true,
            currency: true,
            cycle: true,
            memoryMb: true,
            diskMb: true,
            cpuPercent: true,
          },
        })
      : [];
    const upgradeById = Object.fromEntries(upgradeProducts.map((p) => [p.id, p]));

    return invoices.map((invoice) => ({
      ...invoice,
      isUpgrade: Boolean(invoice.upgradeToProductId),
      upgradeToProduct: invoice.upgradeToProductId
        ? upgradeById[invoice.upgradeToProductId] ?? null
        : null,
    }));
  });

  app.get('/invoices/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            username: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
            creditBalanceCents: true,
          },
        },
        paidBy: { select: { id: true, username: true } },
        service: {
          select: {
            id: true,
            name: true,
            status: true,
            panelServerId: true,
            panelEggName: true,
            memoryMb: true,
            diskMb: true,
            cpuPercent: true,
            priceCents: true,
            currency: true,
            cycle: true,
            nextDueAt: true,
            product: {
              select: {
                id: true,
                name: true,
                description: true,
                cycle: true,
                priceCents: true,
                currency: true,
                memoryMb: true,
                diskMb: true,
                cpuPercent: true,
                category: {
                  select: { id: true, name: true, color: true, icon: true, logoUrl: true },
                },
              },
            },
          },
        },
      },
    });
    if (!invoice) return reply.status(404).send({ error: 'Not found' });

    const upgradeToProduct = invoice.upgradeToProductId
      ? await prisma.product.findUnique({
          where: { id: invoice.upgradeToProductId },
          select: {
            id: true,
            name: true,
            priceCents: true,
            currency: true,
            cycle: true,
            memoryMb: true,
            diskMb: true,
            cpuPercent: true,
          },
        })
      : null;

    return {
      ...invoice,
      isUpgrade: Boolean(invoice.upgradeToProductId),
      upgradeToProduct,
      companyName: await getSetting('company_name', getConfig().companyName),
      paymentInstructions: await getSetting(
        'payment_instructions',
        getConfig().paymentInstructions,
      ),
    };
  });

  app.post('/invoices/:id/mark-paid', { preHandler: requireFullAdmin, ...adminMutationRateLimit }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = z
      .object({ currentPassword: z.string().min(1).max(128).optional() })
      .parse(request.body ?? {});
    try {
      await assertStepUpPassword(request.user!.id, body.currentPassword);
      const result = await markInvoicePaidAndProvision({
        invoiceId: id,
        paidById: request.user!.id,
        log: request.log,
      });
      return {
        invoice: result.invoice,
        panelServerId: result.panelServerId,
        panelWebUrl: (await getPanelConnectionConfig()).panelWebUrl,
      };
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status && status < 500) {
        return reply.status(status).send({ error: err instanceof Error ? err.message : 'Failed' });
      }
      if (status === 502 || err instanceof PanelApiError) {
        return reply
          .status(502)
          .send({ error: publicErrorMessage(err, 'Provisioning failed', request.log) });
      }
      throw err;
    }
  });

  app.post('/invoices/:id/cancel', {
    preHandler: requireCapability('invoices.cancel_unpaid'),
    ...adminMutationRateLimit,
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const invoice = await prisma.invoice.findUnique({ where: { id } });
    if (!invoice) return reply.status(404).send({ error: 'Not found' });
    if (invoice.status !== 'unpaid') {
      return reply.status(422).send({ error: 'Only unpaid invoices can be cancelled' });
    }
    try {
      return await cancelUnpaidInvoiceAndCleanupPanel(invoice);
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status && status < 500) {
        return reply.status(status).send({ error: err instanceof Error ? err.message : 'Failed' });
      }
      throw err;
    }
  });

  app.delete('/invoices/:id', { preHandler: requireFullAdmin, ...adminMutationRateLimit }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return await deleteAdminInvoice(id);
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status && status < 500) {
        return reply.status(status).send({ error: err instanceof Error ? err.message : 'Failed' });
      }
      throw err;
    }
  });

  app.patch('/invoices/:id/status', { preHandler: requireFullAdmin, ...adminMutationRateLimit }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = z
      .object({
        status: z.enum(['unpaid', 'paid', 'cancelled']),
        currentPassword: z.string().min(1).max(128).optional(),
      })
      .parse(request.body);

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: { service: true },
    });
    if (!invoice) return reply.status(404).send({ error: 'Not found' });
    if (invoice.status === body.status) {
      return {
        invoice,
        panelServerId: invoice.service?.panelServerId ?? null,
      };
    }

    if (invoice.status === 'paid') {
      return reply.status(422).send({
        error: 'Paid invoices cannot be reopened or cancelled from here. Suspend the service separately if needed.',
      });
    }

    if (body.status === 'paid') {
      try {
        await assertStepUpPassword(request.user!.id, body.currentPassword);
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode ?? 422;
        return reply.status(status).send({ error: err instanceof Error ? err.message : 'Failed' });
      }

      if (invoice.status === 'cancelled') {
        await prisma.$transaction(async (tx) => {
          await tx.invoice.update({
            where: { id },
            data: { status: 'unpaid', paidAt: null, paidById: null },
          });
          if (
            invoice.serviceId &&
            invoice.service?.status === 'cancelled' &&
            !invoice.service.panelServerId
          ) {
            await tx.service.update({
              where: { id: invoice.serviceId },
              data: { status: 'pending_payment' },
            });
          }
        });
      }

      const current = await prisma.invoice.findUnique({
        where: { id },
        include: { service: true },
      });
      if (!current) return reply.status(404).send({ error: 'Not found' });

      if (!current.serviceId) {
        const claimed = await prisma.invoice.updateMany({
          where: { id, status: 'unpaid' },
          data: {
            status: 'paid',
            paidAt: new Date(),
            paidById: request.user!.id,
          },
        });
        if (claimed.count === 0) {
          return reply.status(422).send({ error: 'Only unpaid invoices can be marked paid' });
        }
        const updated = await prisma.invoice.findUniqueOrThrow({ where: { id } });
        return { invoice: updated, panelServerId: null };
      }

      try {
        const result = await markInvoicePaidAndProvision({
          invoiceId: id,
          paidById: request.user!.id,
          log: request.log,
        });
        return {
          invoice: result.invoice,
          panelServerId: result.panelServerId,
          panelWebUrl: (await getPanelConnectionConfig()).panelWebUrl,
        };
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status && status < 500) {
          return reply.status(status).send({ error: err instanceof Error ? err.message : 'Failed' });
        }
        if (status === 502 || err instanceof PanelApiError) {
          return reply
            .status(502)
            .send({ error: publicErrorMessage(err, 'Provisioning failed', request.log) });
        }
        throw err;
      }
    }

    if (body.status === 'cancelled') {
      if (invoice.status !== 'unpaid') {
        return reply.status(422).send({ error: 'Only unpaid invoices can be cancelled' });
      }
      try {
        const updated = await cancelUnpaidInvoiceAndCleanupPanel(invoice);
        return { invoice: updated, panelServerId: null };
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status && status < 500) {
          return reply.status(status).send({ error: err instanceof Error ? err.message : 'Failed' });
        }
        throw err;
      }
    }

    // unpaid — only from cancelled
    if (invoice.status !== 'cancelled') {
      return reply.status(422).send({ error: 'Only cancelled invoices can be reopened as unpaid' });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.invoice.update({
        where: { id },
        data: { status: 'unpaid', paidAt: null, paidById: null },
      });
      if (invoice.serviceId) {
        await tx.service.updateMany({
          where: {
            id: invoice.serviceId,
            status: 'cancelled',
            panelServerId: null,
          },
          data: { status: 'pending_payment' },
        });
      }
      return next;
    });
    return { invoice: updated, panelServerId: invoice.service?.panelServerId ?? null };
  });

  app.post('/services/:id/suspend', {
    preHandler: requireCapability('services.suspend'),
    ...adminMutationRateLimit,
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const service = await prisma.service.findUnique({ where: { id } });
    if (!service) return reply.status(404).send({ error: 'Not found' });
    if (service.status === 'suspended') return service;
    if (service.status !== 'active') {
      return reply.status(422).send({ error: 'Only active services can be suspended' });
    }
    if (service.panelServerId) {
      try {
        await suspendPanelServer(service.panelServerId);
      } catch (err) {
        if (err instanceof PanelApiError) {
          return reply.status(502).send({ error: err.message });
        }
        throw err;
      }
    }
    return prisma.$transaction(async (tx) => {
      const updated = await tx.service.update({
        where: { id },
        data: { status: 'suspended' },
      });
      await tx.notification.create({
        data: {
          userId: service.userId,
          type: 'warning',
          title: 'Service suspended',
          message: `${service.name} has been suspended by an administrator.`,
          href: `/services/${service.id}`,
        },
      });
      return updated;
    });
  });

  app.post('/services/:id/unsuspend', {
    preHandler: requireCapability('services.unsuspend'),
    ...adminMutationRateLimit,
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const service = await prisma.service.findUnique({ where: { id } });
    if (!service) return reply.status(404).send({ error: 'Not found' });
    if (service.status === 'active') return service;
    if (service.status !== 'suspended') {
      return reply.status(422).send({ error: 'Only suspended services can be restored' });
    }
    if (service.panelServerId) {
      try {
        await unsuspendPanelServer(service.panelServerId);
      } catch (err) {
        if (err instanceof PanelApiError) {
          return reply.status(502).send({ error: err.message });
        }
        throw err;
      }
    }
    return prisma.$transaction(async (tx) => {
      const updated = await tx.service.update({
        where: { id },
        data: { status: 'active' },
      });
      await tx.notification.create({
        data: {
          userId: service.userId,
          type: 'success',
          title: 'Service restored',
          message: `${service.name} has been restored and is available again.`,
          href: `/services/${service.id}`,
        },
      });
      return updated;
    });
  });

  app.get('/panel/nodes', async (_request, reply) => {
    try {
      return await listPanelNodes();
    } catch (err) {
      if (err instanceof PanelApiError) {
        // Older panels lack inventory routes — fall back to manual egg/node IDs in the UI.
        if (err.status === 404) return reply.send([]);
        return reply.status(err.status).send({ error: err.message });
      }
      throw err;
    }
  });

  app.get('/panel/eggs', async (_request, reply) => {
    try {
      return await listPanelEggs();
    } catch (err) {
      if (err instanceof PanelApiError) {
        if (err.status === 404) return reply.send([]);
        return reply.status(err.status).send({ error: err.message });
      }
      throw err;
    }
  });

  app.get('/panel/catalog', async () => {
    const panel = await getPanelConnectionConfig();
    const result = {
      panelApiUrl: panel.panelApiUrl,
      panelKeyConfigured: panel.panelKeyConfigured,
      eggs: [] as Awaited<ReturnType<typeof listPanelEggs>>,
      nodes: [] as Awaited<ReturnType<typeof listPanelNodes>>,
      eggsError: null as string | null,
      nodesError: null as string | null,
    };

    if (!panel.panelKeyConfigured) {
      result.eggsError = 'Application API key is not configured in Settings.';
      result.nodesError = result.eggsError;
      return result;
    }

    const [eggsSettled, nodesSettled] = await Promise.allSettled([
      listPanelEggs(),
      listPanelNodes(),
    ]);

    if (eggsSettled.status === 'fulfilled') {
      result.eggs = eggsSettled.value;
    } else {
      const err = eggsSettled.reason;
      result.eggsError =
        err instanceof PanelApiError
          ? err.status === 404
            ? 'This panel build does not expose /api/application/eggs yet.'
            : err.message
          : 'Could not load eggs';
    }

    if (nodesSettled.status === 'fulfilled') {
      result.nodes = nodesSettled.value;
    } else {
      const err = nodesSettled.reason;
      result.nodesError =
        err instanceof PanelApiError
          ? err.status === 404
            ? 'This panel build does not expose /api/application/nodes yet.'
            : err.message
          : 'Could not load nodes';
    }

    return result;
  });

  app.get('/users', async () =>
    prisma.user.findMany({
      select: {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        role: true,
        panelUserId: true,
        creditBalanceCents: true,
        enabled: true,
        createdAt: true,
        _count: { select: { services: true, invoices: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
  );

  app.get('/users/:id', async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        role: true,
        panelUserId: true,
        creditBalanceCents: true,
        enabled: true,
        createdAt: true,
        updatedAt: true,
        services: {
          orderBy: { createdAt: 'desc' },
          include: {
            category: {
              select: { id: true, name: true, color: true, icon: true, logoUrl: true },
            },
            product: {
              select: {
                id: true,
                name: true,
                cycle: true,
                priceCents: true,
                currency: true,
                category: {
                  select: { id: true, name: true, color: true, icon: true, logoUrl: true },
                },
              },
            },
          },
        },
        invoices: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: {
            id: true,
            number: true,
            status: true,
            totalCents: true,
            currency: true,
            description: true,
            createdAt: true,
            dueAt: true,
            paidAt: true,
            serviceId: true,
            service: {
              select: {
                id: true,
                name: true,
                category: {
                  select: { id: true, name: true, color: true, icon: true, logoUrl: true },
                },
                product: {
                  select: {
                    id: true,
                    name: true,
                    category: {
                      select: { id: true, name: true, color: true, icon: true, logoUrl: true },
                    },
                  },
                },
              },
            },
          },
        },
        creditLedgers: {
          where: { reason: 'admin_adjust' },
          orderBy: { createdAt: 'desc' },
          take: 25,
          select: {
            id: true,
            amountCents: true,
            balanceAfterCents: true,
            reason: true,
            note: true,
            invoiceId: true,
            createdAt: true,
          },
        },
        _count: { select: { services: true, invoices: true } },
      },
    });

    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    const [unpaidInvoices, paidInvoices, activeServices] = await Promise.all([
      prisma.invoice.count({ where: { userId: id, status: 'unpaid' } }),
      prisma.invoice.count({ where: { userId: id, status: 'paid' } }),
      prisma.service.count({ where: { userId: id, status: 'active' } }),
    ]);
    const panel = await getPanelConnectionConfig();
    const link = await resolvePanelUserLink(user);

    return {
      ...user,
      services: user.services.map(withEffectiveServiceCategory),
      invoices: user.invoices.map((invoice) => ({
        ...invoice,
        service: invoice.service ? withEffectiveServiceCategory(invoice.service) : null,
      })),
      panelUserId: link.panelUserId,
      panelLinked: link.panelLinked,
      panelStatus: link.panelStatus,
      panelWebUrl: panel.panelWebUrl,
      stats: {
        services: user._count.services,
        activeServices,
        invoices: user._count.invoices,
        unpaidInvoices,
        paidInvoices,
      },
    };
  });

  app.post('/users/:id/relink-panel', { preHandler: requireFullAdmin, ...adminMutationRateLimit }, async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = z.object({ password: z.string().min(1).max(200) }).parse(request.body);
    assertPasswordOk(body.password);

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) return reply.status(404).send({ error: 'User not found' });

    const link = await resolvePanelUserLink(existing);
    if (link.panelLinked && link.panelStatus === 'linked') {
      return {
        panelUserId: link.panelUserId,
        panelLinked: true,
        panelStatus: 'linked' as const,
        alreadyLinked: true,
      };
    }

    try {
      let panelUser = await findPanelUserByEmail(existing.email);
      let panelPasswordSkipped = false;
      if (panelUser) {
        try {
          await updatePanelUser(panelUser.id, { password: body.password });
        } catch (err) {
          if (isProtectedPanelPasswordError(err)) {
            // Elevated Panel accounts cannot have passwords reset via Application API —
            // still link the accounts; billing password is set below.
            panelPasswordSkipped = true;
          } else {
            throw err;
          }
        }
      } else {
        panelUser = await createPanelUser({
          email: existing.email,
          username: existing.username,
          password: body.password,
          firstName: existing.firstName ?? undefined,
          lastName: existing.lastName ?? undefined,
        });
      }

      await prisma.user.update({
        where: { id },
        data: {
          panelUserId: panelUser.id,
          passwordHash: await hashPassword(body.password),
          tokenVersion: { increment: 1 },
        },
      });

      return {
        panelUserId: panelUser.id,
        panelLinked: true,
        alreadyLinked: false,
        panelPasswordSkipped,
        ...(panelPasswordSkipped ? { warning: PANEL_PASSWORD_PROTECTED_HINT } : {}),
      };
    } catch (err) {
      if (err instanceof PanelApiError) {
        const lower = err.message.toLowerCase();
        if (err.status === 409 || lower.includes('already') || lower.includes('exist')) {
          return reply.status(409).send({
            error: 'That email or username is already used on Spirit-Panel. Resolve the conflict, then try again.',
          });
        }
        if (err.status === 422 || (lower.includes('password') && !isProtectedPanelPasswordError(err))) {
          return reply.status(422).send({
            error: 'Password does not meet Spirit-Panel requirements (min 16 characters, not a common password).',
          });
        }
        return reply.status(err.status >= 400 && err.status < 500 ? err.status : 502).send({
          error: `Could not relink Spirit-Panel: ${err.message}`,
        });
      }
      throw err;
    }
  });

  app.post('/users/:id/credits', { preHandler: requireFullAdmin, ...adminMutationRateLimit }, async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = z
      .object({
        amountCents: z.number().int().refine((n) => n !== 0, 'Amount cannot be zero'),
        note: z.string().max(500).optional(),
      })
      .parse(request.body);

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) return reply.status(404).send({ error: 'User not found' });

    try {
      const result = await prisma.$transaction((tx) =>
        adjustCredits(tx, {
          userId: id,
          amountCents: body.amountCents,
          reason: 'admin_adjust',
          note: body.note,
          createdById: request.user!.id,
        }),
      );
      return result;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status && status < 500) {
        return reply.status(status).send({ error: err instanceof Error ? err.message : 'Failed' });
      }
      throw err;
    }
  });

  app.patch('/users/:id', {
    preHandler: [requireFullAdmin, requireCapability('users.role')],
    ...adminMutationRateLimit,
  }, async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = z
      .object({
        enabled: z.boolean().optional(),
        role: z.enum(['admin', 'staff', 'client']).optional(),
        currentPassword: z.string().min(1).max(200).optional(),
      })
      .parse(request.body ?? {});

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return reply.status(404).send({ error: 'User not found' });
    }

    const roleChanging = body.role !== undefined && body.role !== existing.role;
    if (roleChanging) {
      try {
        await assertStepUpPassword(request.user!.id, body.currentPassword);
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode ?? 403;
        return reply.status(status).send({ error: err instanceof Error ? err.message : 'Forbidden' });
      }
    }

    if (body.role === 'client' && existing.role === 'admin') {
      const adminCount = await prisma.user.count({ where: { role: 'admin', enabled: true } });
      if (adminCount <= 1 && existing.enabled) {
        return reply.status(422).send({ error: 'Cannot demote the last enabled admin' });
      }
    }

    if (body.enabled === false && existing.role === 'admin') {
      const adminCount = await prisma.user.count({ where: { role: 'admin', enabled: true } });
      if (adminCount <= 1) {
        return reply.status(422).send({ error: 'Cannot disable the last enabled admin' });
      }
    }

    const bumpSession =
      body.enabled === false ||
      (body.role !== undefined && body.role !== existing.role);

    const user = await prisma.user.update({
      where: { id },
      data: {
        ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
        ...(body.role !== undefined ? { role: body.role } : {}),
        ...(bumpSession ? { tokenVersion: { increment: 1 } } : {}),
      },
      select: {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        role: true,
        panelUserId: true,
        enabled: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (bumpSession) {
      await revokeAllUserSessions(id);
    }

    return user;
  });

  app.post('/users/:id/password', {
    preHandler: [requireFullAdmin, requireCapability('users.password')],
    ...adminMutationRateLimit,
  }, async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const { password, currentPassword } = z
      .object({
        password: z.string().min(1).max(200),
        currentPassword: z.string().min(1).max(200),
      })
      .parse(request.body);
    assertPasswordOk(password);

    try {
      await assertStepUpPassword(request.user!.id, currentPassword);
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode ?? 403;
      return reply.status(status).send({ error: err instanceof Error ? err.message : 'Forbidden' });
    }

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) return reply.status(404).send({ error: 'User not found' });

    if (existing.role === 'admin' && existing.id !== request.user!.id) {
      return reply.status(403).send({
        error: 'Cannot reset another administrator’s password',
      });
    }

    const passwordHash = await hashPassword(password);
    let panelUserId = existing.panelUserId;
    let panelPasswordSkipped = false;
    if (panelUserId) {
      try {
        await updatePanelUser(panelUserId, { password });
      } catch (err) {
        if (err instanceof PanelApiError && err.status === 404) {
          const byEmail = await findPanelUserByEmail(existing.email).catch(() => null);
          if (byEmail) {
            panelUserId = byEmail.id;
            try {
              await updatePanelUser(byEmail.id, { password });
            } catch (inner) {
              if (isProtectedPanelPasswordError(inner)) {
                panelPasswordSkipped = true;
              } else {
                throw inner;
              }
            }
            await prisma.user.update({
              where: { id },
              data: { panelUserId: byEmail.id, passwordHash, tokenVersion: { increment: 1 } },
            });
            await revokeAllUserSessions(id);
            return {
              updated: true,
              panelLinkRepaired: true,
              panelPasswordSkipped,
              ...(panelPasswordSkipped ? { warning: PANEL_PASSWORD_PROTECTED_HINT } : {}),
            };
          }
          await prisma.user.update({
            where: { id },
            data: { panelUserId: null, passwordHash, tokenVersion: { increment: 1 } },
          });
          await revokeAllUserSessions(id);
          return { updated: true, panelLinkCleared: true };
        }
        if (isProtectedPanelPasswordError(err)) {
          panelPasswordSkipped = true;
        } else if (err instanceof PanelApiError) {
          return reply.status(err.status >= 400 && err.status < 500 ? err.status : 502).send({
            error: `Panel password update failed: ${err.message}`,
          });
        } else {
          throw err;
        }
      }
    }

    await prisma.user.update({
      where: { id },
      data: { passwordHash, tokenVersion: { increment: 1 } },
    });
    await revokeAllUserSessions(id);
    return {
      updated: true,
      panelPasswordSkipped,
      ...(panelPasswordSkipped ? { warning: PANEL_PASSWORD_PROTECTED_HINT } : {}),
    };
  });

  app.delete('/users/:id', { preHandler: requireFullAdmin, ...adminMutationRateLimit }, async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = z
      .object({ currentPassword: z.string().min(1).max(128).optional() })
      .parse(request.body ?? {});
    try {
      await assertStepUpPassword(request.user!.id, body.currentPassword);
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode ?? 422;
      return reply.status(status).send({ error: err instanceof Error ? err.message : 'Failed' });
    }
    if (id === request.user!.id) {
      return reply.status(422).send({ error: 'You cannot delete your own account' });
    }

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) return reply.status(404).send({ error: 'User not found' });

    if (existing.role === 'admin' && existing.enabled) {
      const adminCount = await prisma.user.count({ where: { role: 'admin', enabled: true } });
      if (adminCount <= 1) {
        return reply.status(422).send({ error: 'Cannot delete the last enabled admin' });
      }
    }

    if (existing.panelUserId) {
      try {
        await deletePanelUser(existing.panelUserId);
      } catch (err) {
        if (err instanceof PanelApiError) {
          const msg = err.message.toLowerCase();
          const alreadyGone =
            err.status === 404 &&
            (msg.includes('panel user not found') || msg === 'not found');
          if (!alreadyGone) {
            return reply.status(err.status >= 400 && err.status < 500 ? err.status : 502).send({
              error: publicErrorMessage(err, 'Could not delete the linked Spirit-Panel user', request.log),
            });
          }
        } else {
          throw err;
        }
      }
    }

    await prisma.user.delete({ where: { id } });
    return { deleted: true };
  });

  async function settingsPayload() {
    const panel = await getPanelConnectionConfig();
    const security = await getSecuritySettings();
    const env = getConfig();
    return {
      companyName: await getSetting('company_name', env.companyName),
      tagline: await getSetting('brand_tagline', 'Billing'),
      logoUrl: await getSetting('logo_url', ''),
      faviconUrl: await getSetting('favicon_url', ''),
      accentColor: await getSetting('accent_color', ''),
      secondaryColor: await getSetting('secondary_color', ''),
      paymentInstructions: await getSetting('payment_instructions', env.paymentInstructions),
      supportEmail: await getSetting('support_email', ''),
      supportUrl: await getSetting('support_url', ''),
      termsUrl: await getSetting('terms_url', ''),
      privacyUrl: await getSetting('privacy_url', ''),
      invoiceFooter: await getSetting('invoice_footer', ''),
      announcementBanner: await getSetting('announcement_banner', ''),
      themeMode: await getSetting('theme_mode', 'dark'),
      themePreset: await getSetting('theme_preset', 'custom'),
      uiRadius: await getSetting('ui_radius', 'soft'),
      uiDensity: await getSetting('ui_density', 'comfortable'),
      sidebarStyle: normalizeSidebarStyleSetting(await getSetting('sidebar_style', 'solid')),
      navbarStyle: normalizeNavbarStyleSetting(await getSetting('navbar_style', 'glass')),
      authAtmosphere: normalizeAuthAtmosphereSetting(await getSetting('auth_atmosphere', 'stage')),
      clientAtmosphere: await resolveShellAtmosphereSetting(getSetting, 'client_atmosphere'),
      adminAtmosphere: await resolveShellAtmosphereSetting(getSetting, 'admin_atmosphere'),
      clientNavLayout: normalizeNavLayoutSetting(await getSetting('client_nav_layout', 'sidebar')),
      adminNavLayout: normalizeNavLayoutSetting(await getSetting('admin_nav_layout', 'sidebar')),
      invoicePrefix: await getInvoicePrefix(),
      defaultCurrency: await getDefaultCurrency(),
      invoiceDueDays: await getInvoiceDueDays(),
      serviceRefundWindowDays: await getServiceRefundWindowDays(),
      overdueSuspendDays: await getOverdueSuspendDays(),
      overdueTerminateDays: await getOverdueTerminateDays(),
      panelWebUrl: panel.panelWebUrl,
      panelApiUrl: panel.panelApiUrl,
      panelKeyConfigured: panel.panelKeyConfigured,
      panelKeyMasked: panel.panelKeyMasked,
      panelAllowPrivateUrls: panel.panelAllowPrivateUrls,
      maintenanceMode: security.maintenanceMode,
      maintenanceMessage: security.maintenanceMessage,
      registrationEnabled: security.registrationEnabled,
      ticketsEnabled: security.ticketsEnabled,
      turnstileEnabled: security.turnstileEnabled,
      turnstileSiteKey: security.turnstileSiteKey,
      turnstileSecretConfigured: security.turnstileSecretConfigured,
      turnstileSecretMasked: security.turnstileSecretMasked,
    };
  }

  function assertOptionalHttpUrl(value: string, label: string) {
    const trimmed = value.trim();
    if (!trimmed) return '';
    try {
      const parsed = new URL(trimmed);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('invalid');
      return trimmed;
    } catch {
      throw Object.assign(new Error(`${label} must be a valid http(s) URL`), { statusCode: 422 });
    }
  }

  /** External http(s) URL or local branding upload path. */
  function assertOptionalBrandAssetUrl(value: string, label: string) {
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (/^\/uploads\/branding\/[\w.\-]+$/.test(trimmed)) return trimmed;
    return assertOptionalHttpUrl(trimmed, label);
  }

  function guessImageMime(filename: string, mimetype: string) {
    const mime = (mimetype || '').toLowerCase().trim();
    if (mime && mime !== 'application/octet-stream') return mime;
    const ext = filename.split('.').pop()?.toLowerCase();
    if (ext === 'png') return 'image/png';
    if (ext === 'webp') return 'image/webp';
    if (ext === 'gif') return 'image/gif';
    if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
    return mime || 'application/octet-stream';
  }

  function assertOptionalEmail(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) || trimmed.length > 254) {
      throw Object.assign(new Error('Support email must be a valid email address'), { statusCode: 422 });
    }
    return trimmed.toLowerCase();
  }

  function assertHexColor(value: string, label: string) {
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (!/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
      throw Object.assign(new Error(`${label} must be a hex color like #6366f1`), { statusCode: 422 });
    }
    return trimmed.toLowerCase();
  }

  app.get('/about', async (request) => {
    const full = await getAboutPayload();
    if (request.user?.role === 'admin') return full;
    // Staff: version / product only — no update commands or deep runtime.
    return {
      product: full.product,
      tagline: full.tagline,
      version: full.version,
      installerVersion: full.installerVersion,
      updateAvailable: full.updateAvailable,
      latestRelease: full.latestRelease
        ? { tag: full.latestRelease.tag, name: full.latestRelease.name, url: full.latestRelease.url }
        : null,
      links: {
        changelog: full.links.changelog,
        releases: full.links.releases,
        panel: full.links.panel,
      },
      license: full.license,
      builtBy: full.builtBy,
    };
  });

  app.get('/settings', async () => settingsPayload());

  app.post('/settings/branding-upload', { preHandler: requireFullAdmin, ...adminMutationRateLimit }, async (request, reply) => {
    try {
      const query = z.object({ kind: z.enum(['logo', 'favicon']).default('logo') }).parse(request.query ?? {});
      const file = await (request as { file: () => Promise<any> }).file();
      if (!file) {
        return reply.status(422).send({ error: 'No image uploaded' });
      }
      const fields = file.fields as Record<string, { value?: string } | undefined> | undefined;
      const fieldKind = String(fields?.kind?.value || '').toLowerCase();
      const kind: BrandingAssetKind =
        fieldKind === 'favicon' || query.kind === 'favicon' ? 'favicon' : 'logo';
      const buffer = await file.toBuffer();
      const filename = file.filename || `${kind}.png`;
      const uploaded = await saveBrandingAsset({
        kind,
        buffer,
        filename,
        mimetype: guessImageMime(filename, file.mimetype || ''),
      });
      return uploaded;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode ?? 422;
      return reply.status(status).send({ error: err instanceof Error ? err.message : 'Upload failed' });
    }
  });

  app.patch('/settings', { preHandler: requireFullAdmin, ...adminMutationRateLimit }, async (request, reply) => {
    const body = z
      .object({
        companyName: z.string().min(1).max(120).optional(),
        tagline: z.string().min(1).max(64).optional(),
        logoUrl: z.string().max(2048).optional(),
        faviconUrl: z.string().max(2048).optional(),
        accentColor: z.string().max(16).optional(),
        secondaryColor: z.string().max(16).optional(),
        paymentInstructions: z.string().min(1).max(5000).optional(),
        supportEmail: z.string().max(254).optional(),
        supportUrl: z.string().max(2048).optional(),
        termsUrl: z.string().max(2048).optional(),
        privacyUrl: z.string().max(2048).optional(),
        invoiceFooter: z.string().max(500).optional(),
        announcementBanner: z.string().max(280).optional(),
        themeMode: z.enum(['light', 'dark', 'system']).optional(),
        themePreset: z
          .enum([
            'midnight',
            'ocean',
            'forest',
            'sunset',
            'rose',
            'mono',
            'lavender',
            'crimson',
            'arctic',
            'neon',
            'copper',
            'slate',
            'grape',
            'mint',
            'sand',
            'void',
            'cherry',
            'custom',
          ])
          .optional(),
        uiRadius: z.enum(['sharp', 'soft', 'rounded']).optional(),
        uiDensity: z.enum(['comfortable', 'compact']).optional(),
        sidebarStyle: z.enum(SIDEBAR_STYLE_ENUM).optional(),
        navbarStyle: z.enum(NAVBAR_STYLE_ENUM).optional(),
        authAtmosphere: z.enum(AUTH_ATMOSPHERE_ENUM).optional(),
        clientAtmosphere: z.enum(SHELL_ATMOSPHERE_ENUM).optional(),
        adminAtmosphere: z.enum(SHELL_ATMOSPHERE_ENUM).optional(),
        clientNavLayout: z.enum(NAV_LAYOUT_ENUM).optional(),
        adminNavLayout: z.enum(NAV_LAYOUT_ENUM).optional(),
        invoicePrefix: z.string().min(1).max(12).optional(),
        defaultCurrency: z.string().length(3).optional(),
        invoiceDueDays: z.number().int().min(1).max(90).optional(),
        serviceRefundWindowDays: z.number().int().min(0).max(90).optional(),
        overdueSuspendDays: z.number().int().min(0).max(365).optional(),
        overdueTerminateDays: z.number().int().min(0).max(365).optional(),
        panelApiUrl: z.string().min(1).max(2048).optional(),
        panelWebUrl: z.string().min(1).max(2048).optional(),
        panelApplicationApiKey: z.string().optional(),
        clearPanelKey: z.boolean().optional(),
        panelAllowPrivateUrls: z.boolean().optional(),
        maintenanceMode: z.boolean().optional(),
        maintenanceMessage: z.string().max(500).optional(),
        registrationEnabled: z.boolean().optional(),
        ticketsEnabled: z.boolean().optional(),
        turnstileEnabled: z.boolean().optional(),
        turnstileSiteKey: z.string().max(200).optional(),
        turnstileSecretKey: z.string().max(500).optional(),
      })
      .parse(request.body);

    if (body.companyName) await setSetting('company_name', body.companyName);
    if (body.tagline) await setSetting('brand_tagline', body.tagline.trim());
    if (body.paymentInstructions) await setSetting('payment_instructions', body.paymentInstructions);

    try {
      if (body.logoUrl !== undefined) {
        await setSetting('logo_url', assertOptionalBrandAssetUrl(body.logoUrl, 'Logo URL'));
      }
      if (body.faviconUrl !== undefined) {
        await setSetting('favicon_url', assertOptionalBrandAssetUrl(body.faviconUrl, 'Favicon URL'));
      }
      if (body.accentColor !== undefined) {
        await setSetting('accent_color', assertHexColor(body.accentColor, 'Accent color'));
      }
      if (body.secondaryColor !== undefined) {
        await setSetting('secondary_color', assertHexColor(body.secondaryColor, 'Secondary color'));
      }
      if (body.supportEmail !== undefined) {
        await setSetting('support_email', assertOptionalEmail(body.supportEmail));
      }
      if (body.supportUrl !== undefined) {
        await setSetting('support_url', assertOptionalHttpUrl(body.supportUrl, 'Support URL'));
      }
      if (body.termsUrl !== undefined) {
        await setSetting('terms_url', assertOptionalHttpUrl(body.termsUrl, 'Terms URL'));
      }
      if (body.privacyUrl !== undefined) {
        await setSetting('privacy_url', assertOptionalHttpUrl(body.privacyUrl, 'Privacy URL'));
      }
      if (body.invoiceFooter !== undefined) {
        await setSetting('invoice_footer', body.invoiceFooter.trim().slice(0, 500));
      }
      if (body.announcementBanner !== undefined) {
        await setSetting('announcement_banner', body.announcementBanner.trim().slice(0, 280));
      }
      if (body.themeMode !== undefined) await setSetting('theme_mode', body.themeMode);
      if (body.themePreset !== undefined) await setSetting('theme_preset', body.themePreset);
      if (body.uiRadius !== undefined) await setSetting('ui_radius', body.uiRadius);
      if (body.uiDensity !== undefined) await setSetting('ui_density', body.uiDensity);
      if (body.sidebarStyle !== undefined) await setSetting('sidebar_style', body.sidebarStyle);
      if (body.navbarStyle !== undefined) await setSetting('navbar_style', body.navbarStyle);
      if (body.authAtmosphere !== undefined) await setSetting('auth_atmosphere', body.authAtmosphere);
      if (body.clientAtmosphere !== undefined) await setSetting('client_atmosphere', body.clientAtmosphere);
      if (body.adminAtmosphere !== undefined) await setSetting('admin_atmosphere', body.adminAtmosphere);
      if (body.clientNavLayout !== undefined) await setSetting('client_nav_layout', body.clientNavLayout);
      if (body.adminNavLayout !== undefined) await setSetting('admin_nav_layout', body.adminNavLayout);
      if (body.invoicePrefix !== undefined) {
        const prefix = body.invoicePrefix.trim().toUpperCase();
        if (!/^[A-Z0-9]{1,12}$/.test(prefix)) {
          throw Object.assign(new Error('Invoice prefix must be 1–12 letters or numbers'), { statusCode: 422 });
        }
        await setSetting('invoice_prefix', prefix);
      }
      if (body.defaultCurrency !== undefined) {
        const currency = body.defaultCurrency.trim().toUpperCase();
        if (!/^[A-Z]{3}$/.test(currency)) {
          throw Object.assign(new Error('Currency must be a 3-letter ISO code'), { statusCode: 422 });
        }
        await setSetting('default_currency', currency);
      }
      if (body.invoiceDueDays !== undefined) {
        await setSetting('invoice_due_days', String(body.invoiceDueDays));
      }
      if (body.serviceRefundWindowDays !== undefined) {
        await setSetting('service_refund_window_days', String(body.serviceRefundWindowDays));
      }
      if (body.overdueSuspendDays !== undefined || body.overdueTerminateDays !== undefined) {
        const currentSuspend = await getOverdueSuspendDays();
        const currentTerminate = await getOverdueTerminateDays();
        const suspendDays = body.overdueSuspendDays ?? currentSuspend;
        const terminateDays = Math.max(
          suspendDays,
          body.overdueTerminateDays ?? currentTerminate,
        );
        await setSetting('overdue_suspend_days', String(suspendDays));
        await setSetting('overdue_terminate_days', String(terminateDays));
      }
      if (
        body.panelApiUrl !== undefined ||
        body.panelWebUrl !== undefined ||
        body.panelApplicationApiKey !== undefined ||
        body.clearPanelKey !== undefined ||
        body.panelAllowPrivateUrls !== undefined
      ) {
        await savePanelConnectionConfig({
          panelApiUrl: body.panelApiUrl,
          panelWebUrl: body.panelWebUrl,
          panelApplicationApiKey: body.panelApplicationApiKey,
          clearPanelKey: body.clearPanelKey,
          panelAllowPrivateUrls: body.panelAllowPrivateUrls,
        });
      }
      if (
        body.maintenanceMode !== undefined ||
        body.maintenanceMessage !== undefined ||
        body.registrationEnabled !== undefined ||
        body.ticketsEnabled !== undefined ||
        body.turnstileEnabled !== undefined ||
        body.turnstileSiteKey !== undefined ||
        body.turnstileSecretKey !== undefined
      ) {
        await saveSecuritySettings({
          maintenanceMode: body.maintenanceMode,
          maintenanceMessage: body.maintenanceMessage,
          registrationEnabled: body.registrationEnabled,
          ticketsEnabled: body.ticketsEnabled,
          turnstileEnabled: body.turnstileEnabled,
          turnstileSiteKey: body.turnstileSiteKey,
          turnstileSecretKey: body.turnstileSecretKey,
        });
      }
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode ?? 422;
      return reply.status(status).send({
        error: err instanceof Error ? err.message : 'Invalid settings',
      });
    }

    return settingsPayload();
  });

  app.post('/panel/test', { preHandler: requireFullAdmin, ...panelTestRateLimit }, async (request) => {
    const body = z
      .object({
        panelApiUrl: z.string().url().optional(),
        panelApplicationApiKey: z.string().optional(),
        panelAllowPrivateUrls: z.boolean().optional(),
      })
      .parse(request.body ?? {});

    return testPanelConnection({
      panelApiUrl: body.panelApiUrl,
      panelApplicationApiKey: body.panelApplicationApiKey || undefined,
      panelAllowPrivateUrls: body.panelAllowPrivateUrls,
    });
  });

  app.get('/logs', async (request) => {
    const query = z
      .object({
        category: z
          .enum(['auth', 'billing', 'support', 'provision', 'admin', 'panel', 'system'])
          .optional(),
        level: z.enum(['info', 'warn', 'error']).optional(),
        q: z.string().max(120).optional(),
        take: z.coerce.number().int().min(1).max(200).default(80),
      })
      .parse(request.query);

    const where = {
      ...(query.category ? { category: query.category } : {}),
      ...(query.level ? { level: query.level } : {}),
      ...(query.q?.trim()
        ? {
            OR: [
              { message: { contains: query.q.trim() } },
              { action: { contains: query.q.trim() } },
              { path: { contains: query.q.trim() } },
            ],
          }
        : {}),
    };

    const [logs, levelTotals, categoryTotals] = await Promise.all([
      prisma.systemLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: query.take,
        include: {
          actor: { select: { id: true, username: true, email: true, role: true } },
          target: { select: { id: true, username: true, email: true } },
        },
      }),
      prisma.systemLog.groupBy({
        by: ['level'],
        _count: { _all: true },
      }),
      prisma.systemLog.groupBy({
        by: ['category'],
        _count: { _all: true },
      }),
    ]);

    const counts = { info: 0, warn: 0, error: 0, total: 0 };
    for (const row of levelTotals) {
      counts[row.level] = row._count._all;
      counts.total += row._count._all;
    }

    const categories = {
      auth: 0,
      billing: 0,
      support: 0,
      provision: 0,
      admin: 0,
      panel: 0,
      system: 0,
    };
    for (const row of categoryTotals) {
      categories[row.category] = row._count._all;
    }

    return { logs, counts, categories };
  });

  app.delete('/logs', { preHandler: requireFullAdmin, ...adminMutationRateLimit }, async (request) => {
    const body = z
      .object({
        olderThanDays: z.number().int().min(1).max(365).default(30),
      })
      .parse(request.body ?? {});
    const result = await pruneSystemLogs(body.olderThanDays);
    recordLogFireAndForget({
      level: 'info',
      category: 'admin',
      action: 'logs.prune',
      message: `Pruned ${result.deleted} log${result.deleted === 1 ? '' : 's'} older than ${body.olderThanDays} days`,
      actorUserId: request.user!.id,
      ip: request.ip,
      method: 'DELETE',
      path: '/api/admin/logs',
      meta: result,
    });
    return result;
  });

  const couponBody = z.object({
    code: z.string().min(1).max(64),
    type: z.enum(['percent', 'fixed', 'credit']),
    value: z.number().int().min(1).max(100_000_000),
    description: z.string().max(255).default(''),
    maxRedemptions: z.number().int().min(1).nullable().optional(),
    perUserLimit: z.number().int().min(1).max(1000).default(1),
    minOrderCents: z.number().int().min(0).default(0),
    startsAt: z.string().datetime().nullable().optional(),
    endsAt: z.string().datetime().nullable().optional(),
    active: z.boolean().default(true),
  });

  app.get('/coupons', async () =>
    prisma.coupon.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { redemptions: true } } },
    }),
  );

  app.get('/coupons/redemptions', async (request) => {
    const query = z
      .object({
        couponId: z.string().min(1).optional(),
        take: z.coerce.number().int().min(1).max(500).optional(),
      })
      .parse(request.query ?? {});

    return prisma.couponRedemption.findMany({
      where: query.couponId ? { couponId: query.couponId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: query.take ?? 200,
      include: {
        coupon: {
          select: { id: true, code: true, type: true, value: true, description: true },
        },
        user: {
          select: {
            id: true,
            email: true,
            username: true,
            firstName: true,
            lastName: true,
          },
        },
        invoice: {
          select: {
            id: true,
            number: true,
            status: true,
            totalCents: true,
            currency: true,
          },
        },
      },
    });
  });

  app.post('/coupons', { preHandler: requireFullAdmin }, async (request, reply) => {
    const body = couponBody.parse(request.body);
    const code = normalizeCouponCode(body.code);
    if (!code) return reply.status(422).send({ error: 'Coupon code is required' });
    if (body.type === 'percent' && body.value > 100) {
      return reply.status(422).send({ error: 'Percent coupons cannot exceed 100' });
    }

    try {
      return await prisma.coupon.create({
        data: {
          code,
          type: body.type,
          value: body.value,
          description: body.description,
          maxRedemptions: body.maxRedemptions ?? null,
          perUserLimit: body.perUserLimit,
          minOrderCents: body.minOrderCents,
          startsAt: body.startsAt ? new Date(body.startsAt) : null,
          endsAt: body.endsAt ? new Date(body.endsAt) : null,
          active: body.active,
        },
      });
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') {
        return reply.status(422).send({ error: 'A coupon with that code already exists' });
      }
      throw err;
    }
  });

  app.patch('/coupons/:id', { preHandler: requireFullAdmin }, async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = couponBody.partial().parse(request.body ?? {});
    const existing = await prisma.coupon.findUnique({ where: { id } });
    if (!existing) return reply.status(404).send({ error: 'Coupon not found' });

    const nextType = body.type ?? existing.type;
    const nextValue = body.value ?? existing.value;
    if (nextType === 'percent' && nextValue > 100) {
      return reply.status(422).send({ error: 'Percent coupons cannot exceed 100' });
    }

    try {
      return await prisma.coupon.update({
        where: { id },
        data: {
          ...(body.code !== undefined ? { code: normalizeCouponCode(body.code) } : {}),
          ...(body.type !== undefined ? { type: body.type } : {}),
          ...(body.value !== undefined ? { value: body.value } : {}),
          ...(body.description !== undefined ? { description: body.description } : {}),
          ...(body.maxRedemptions !== undefined ? { maxRedemptions: body.maxRedemptions } : {}),
          ...(body.perUserLimit !== undefined ? { perUserLimit: body.perUserLimit } : {}),
          ...(body.minOrderCents !== undefined ? { minOrderCents: body.minOrderCents } : {}),
          ...(body.startsAt !== undefined
            ? { startsAt: body.startsAt ? new Date(body.startsAt) : null }
            : {}),
          ...(body.endsAt !== undefined ? { endsAt: body.endsAt ? new Date(body.endsAt) : null } : {}),
          ...(body.active !== undefined ? { active: body.active } : {}),
        },
      });
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') {
        return reply.status(422).send({ error: 'A coupon with that code already exists' });
      }
      throw err;
    }
  });

  app.delete('/coupons/:id', { preHandler: requireFullAdmin }, async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const existing = await prisma.coupon.findUnique({ where: { id } });
    if (!existing) return reply.status(404).send({ error: 'Coupon not found' });
    await prisma.coupon.delete({ where: { id } });
    return { ok: true };
  });
}
