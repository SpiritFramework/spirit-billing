import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { requireAuth } from '../lib/auth.js';
import { addBillingCycle, getInvoiceDueDays, getInvoicePrefix, getSetting, nextInvoiceNumber } from '../lib/billing.js';
import { adjustCredits, allocateDiscount, claimCouponRedemption, findValidCoupon } from '../lib/credits.js';
import { getConfig } from '../lib/env.js';
import { getPanelConnectionConfig } from '../lib/panel-config.js';
import { resolvePanelUserLink } from '../lib/panel-link.js';
import { prisma } from '../lib/prisma.js';
import { cancelUnpaidInvoice, cancelUnpaidInvoiceAndCleanupPanel } from '../lib/invoices.js';
import { markInvoicePaidAndProvision } from '../lib/provision.js';
import {
  createUpgradeInvoice,
  deleteOwnedService,
  listUpgradeOptions,
  previewServiceDeletionRefund,
} from '../lib/service-lifecycle.js';
import { withEffectiveServiceCategory } from '../lib/service-display.js';
import { normalizeProductFeatures, loadStorefrontProducts, repairInvalidProductFeatures } from '../lib/product-features.js';
import { recordLogFireAndForget } from '../lib/system-log.js';

function withProductFeatures<T extends { features?: unknown }>(product: T) {
  return {
    ...product,
    features: normalizeProductFeatures(product.features, true),
  };
}

const orderRateLimit = {
  config: {
    rateLimit: {
      max: 10,
      timeWindow: '1 minute',
    },
  },
};

const categoryPublicSelect = {
  id: true,
  name: true,
  slug: true,
  color: true,
  icon: true,
  logoUrl: true,
} as const;

const productPublicSelect = {
  id: true,
  name: true,
  description: true,
  features: true,
  priceCents: true,
  currency: true,
  cycle: true,
  memoryMb: true,
  diskMb: true,
  cpuPercent: true,
  backupLimit: true,
  databaseLimit: true,
} as const;

/** List/detail fields used by client services UI (avoid full-row include). */
const serviceListSelect = {
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
  createdAt: true,
  updatedAt: true,
  category: { select: categoryPublicSelect },
  product: {
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
      category: { select: categoryPublicSelect },
    },
  },
} as const;

/** Only sell plans that can actually be provisioned on the panel. */
const provisionableProductWhere: Prisma.ProductWhereInput = {
  active: true,
  panelEggId: { not: '' },
  AND: [{ panelNodeId: { not: null } }, { panelNodeId: { not: '' } }],
};

async function createServiceInvoice(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    product: {
      id: string;
      name: string;
      cycle: 'monthly' | 'quarterly' | 'yearly';
      currency: string;
      priceCents: number;
      subdomainAccess: boolean;
      fivemMarketplaceAccess: boolean;
      minecraftPluginsAccess: boolean;
    };
    name?: string;
    invoiceNumber: string;
    dueAt: Date;
    discountCents?: number;
    creditAppliedCents?: number;
    couponId?: string | null;
    couponCode?: string | null;
  },
) {
  const discountCents = Math.max(0, input.discountCents ?? 0);
  const creditAppliedCents = Math.max(0, input.creditAppliedCents ?? 0);
  const totalCents = Math.max(0, input.product.priceCents - discountCents - creditAppliedCents);

  const service = await tx.service.create({
    data: {
      userId: input.userId,
      productId: input.product.id,
      name: input.name?.trim() || input.product.name,
      status: 'pending_payment',
      subdomainAccess: input.product.subdomainAccess,
      fivemMarketplaceAccess: input.product.fivemMarketplaceAccess,
      minecraftPluginsAccess: input.product.minecraftPluginsAccess,
      nextDueAt: addBillingCycle(new Date(), input.product.cycle),
    },
  });

  const invoice = await tx.invoice.create({
    data: {
      number: input.invoiceNumber,
      userId: input.userId,
      serviceId: service.id,
      status: 'unpaid',
      currency: input.product.currency,
      subtotalCents: input.product.priceCents,
      discountCents,
      creditAppliedCents,
      totalCents,
      couponId: input.couponId ?? null,
      couponCode: input.couponCode ?? null,
      description: `${input.product.name} (${input.product.cycle})`,
      dueAt: input.dueAt,
    },
  });

  return { service, invoice };
}

export async function clientRoutes(app: FastifyInstance) {
  app.get('/products', async () => {
    const products = await prisma.product.findMany({
      where: provisionableProductWhere,
      orderBy: [{ sortOrder: 'asc' }, { priceCents: 'asc' }],
      select: {
        ...productPublicSelect,
        category: {
          select: { id: true, name: true, slug: true, color: true, icon: true, logoUrl: true, description: true },
        },
      },
    });
    return products.map(withProductFeatures);
  });

  app.get('/categories', async () => {
    const categories = await prisma.category.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        color: true,
        icon: true,
        logoUrl: true,
        _count: { select: { products: { where: provisionableProductWhere } } },
        products: {
          where: provisionableProductWhere,
          orderBy: [{ priceCents: 'asc' }, { sortOrder: 'asc' }],
          take: 1,
          select: { priceCents: true, currency: true, cycle: true },
        },
      },
    });

    return categories.map(({ products, ...category }) => ({
      ...category,
      startingFrom: products[0]
        ? {
            priceCents: products[0].priceCents,
            currency: products[0].currency,
            cycle: products[0].cycle,
          }
        : null,
    }));
  });

  app.get('/categories/:idOrSlug', async (request, reply) => {
    const { idOrSlug } = request.params as { idOrSlug: string };
    try {
      const category = await prisma.category.findFirst({
        where: {
          active: true,
          OR: [{ id: idOrSlug }, { slug: idOrSlug }],
        },
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          color: true,
          icon: true,
          logoUrl: true,
        },
      });
      if (!category) return reply.status(404).send({ error: 'Category not found' });

      // Read features as text so corrupt JSON cannot crash Prisma's decoder.
      const products = await loadStorefrontProducts(category.id);
      return {
        category,
        products: products.map((product) =>
          withProductFeatures({
            id: product.id,
            name: product.name,
            description: product.description,
            features: product.features,
            priceCents: Number(product.priceCents),
            currency: product.currency,
            cycle: product.cycle,
            memoryMb: Number(product.memoryMb),
            diskMb: Number(product.diskMb),
            cpuPercent: Number(product.cpuPercent),
            backupLimit: Number(product.backupLimit),
            databaseLimit: Number(product.databaseLimit),
          }),
        ),
      };
    } catch (err) {
      request.log.error({ err, idOrSlug }, 'Failed to load category storefront');
      // Last resort: wipe bad features for this slug's category and ask client to retry.
      if (err instanceof Error && /json/i.test(err.message)) {
        try {
          await repairInvalidProductFeatures();
        } catch {
          /* ignore */
        }
      }
      const prismaCode = (err as { code?: string }).code;
      const message = err instanceof Error ? err.message : 'Could not load category';
      if (prismaCode === 'P2022' || /unknown column|no such column/i.test(message)) {
        return reply.status(500).send({
          error: 'Database schema is out of date. Run prisma db push on the API host.',
        });
      }
      return reply.status(500).send({ error: 'Could not load category' });
    }
  });

  app.get('/dashboard', { preHandler: requireAuth }, async (request) => {
    const userId = request.user!.id;
    const [
      totalServices,
      activeServices,
      pendingServices,
      unpaidInvoices,
      unpaidBalance,
      paidInvoices,
      recentInvoices,
      recentServices,
      user,
    ] = await Promise.all([
      prisma.service.count({ where: { userId } }),
      prisma.service.count({ where: { userId, status: 'active' } }),
      prisma.service.count({ where: { userId, status: 'pending_payment' } }),
      prisma.invoice.count({ where: { userId, status: 'unpaid' } }),
      prisma.invoice.aggregate({
        where: { userId, status: 'unpaid' },
        _sum: { totalCents: true },
      }),
      prisma.invoice.count({ where: { userId, status: 'paid' } }),
      prisma.invoice.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          number: true,
          status: true,
          totalCents: true,
          currency: true,
          dueAt: true,
          createdAt: true,
          service: { select: { name: true } },
        },
      }),
      prisma.service.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        take: 6,
        select: {
          id: true,
          name: true,
          status: true,
          nextDueAt: true,
          panelServerId: true,
          panelEggName: true,
          memoryMb: true,
          diskMb: true,
          cpuPercent: true,
          priceCents: true,
          currency: true,
          cycle: true,
          category: { select: categoryPublicSelect },
          product: {
            select: {
              name: true,
              cycle: true,
              priceCents: true,
              currency: true,
              memoryMb: true,
              diskMb: true,
              cpuPercent: true,
              category: { select: categoryPublicSelect },
            },
          },
        },
      }),
      prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { id: true, email: true, creditBalanceCents: true, createdAt: true, panelUserId: true },
      }),
    ]);
    const link = await resolvePanelUserLink(user);
    const statusRank: Record<string, number> = {
      active: 0,
      pending_payment: 1,
      suspended: 2,
      cancelled: 3,
    };
    return {
      services: totalServices,
      totalServices,
      activeServices,
      pendingServices,
      unpaidInvoices,
      unpaidBalanceCents: unpaidBalance._sum.totalCents ?? 0,
      paidInvoices,
      recentInvoices,
      recentServices: recentServices
        .map(withEffectiveServiceCategory)
        .sort((a, b) => (statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9)),
      creditBalanceCents: user.creditBalanceCents,
      memberSince: user.createdAt,
      panelLinked: link.panelLinked,
      panelStatus: link.panelStatus,
      panelWebUrl: (await getPanelConnectionConfig()).panelWebUrl,
    };
  });

  app.get('/notifications', { preHandler: requireAuth }, async (request) => {
    const userId = request.user!.id;
    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
      prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return { notifications, unreadCount };
  });

  app.post('/notifications/read-all', { preHandler: requireAuth }, async (request) => {
    const result = await prisma.notification.updateMany({
      where: { userId: request.user!.id, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  });

  app.delete('/notifications', { preHandler: requireAuth }, async (request) => {
    const result = await prisma.notification.deleteMany({
      where: { userId: request.user!.id },
    });
    return { deleted: result.count };
  });

  app.post('/notifications/:id/read', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const result = await prisma.notification.updateMany({
      where: { id, userId: request.user!.id },
      data: { readAt: new Date() },
    });
    if (!result.count) return reply.status(404).send({ error: 'Notification not found' });
    return { ok: true };
  });

  app.get('/credits', { preHandler: requireAuth }, async (request) => {
    const userId = request.user!.id;
    const [user, ledger] = await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { creditBalanceCents: true },
      }),
      prisma.creditLedger.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: {
          id: true,
          amountCents: true,
          balanceAfterCents: true,
          reason: true,
          note: true,
          invoiceId: true,
          createdAt: true,
        },
      }),
    ]);
    return { creditBalanceCents: user.creditBalanceCents, ledger };
  });

  app.post('/coupons/validate', { preHandler: requireAuth, ...orderRateLimit }, async (request) => {
    const body = z
      .object({
        code: z.string().min(1).max(64),
        subtotalCents: z.number().int().min(0).max(100_000_000).default(0),
      })
      .parse(request.body);

    const { coupon, discountCents, creditBonusCents } = await findValidCoupon(
      body.code,
      request.user!.id,
      body.subtotalCents,
    );
    return {
      code: coupon.code,
      type: coupon.type,
      value: coupon.value,
      description: coupon.description,
      discountCents,
      creditBonusCents,
      minOrderCents: coupon.minOrderCents,
    };
  });

  /** Redeem a credit-granting coupon into account balance (no order required when min order is met / 0). */
  app.post('/coupons/redeem', { preHandler: requireAuth, ...orderRateLimit }, async (request, reply) => {
    const body = z.object({ code: z.string().min(1).max(64) }).parse(request.body);
    const userId = request.user!.id;

    let preview;
    try {
      preview = await findValidCoupon(body.code, userId, 0);
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status && status < 500) {
        return reply.status(status).send({ error: err instanceof Error ? err.message : 'Invalid coupon' });
      }
      throw err;
    }

    if (preview.coupon.type !== 'credit' || preview.creditBonusCents <= 0) {
      return reply.status(422).send({
        error: 'Only credit coupons can be redeemed without checkout. Discount coupons must be applied in the cart.',
      });
    }
    if (preview.coupon.minOrderCents > 0) {
      return reply.status(422).send({
        error: `This coupon requires an order of at least ${(preview.coupon.minOrderCents / 100).toFixed(2)}. Apply it at checkout.`,
      });
    }

    try {
      const result = await prisma.$transaction(async (tx) => {
        const coupon = await tx.coupon.findUniqueOrThrow({ where: { id: preview.coupon.id } });
        await claimCouponRedemption(tx, {
          couponId: coupon.id,
          userId,
          discountCents: 0,
          creditCents: preview.creditBonusCents,
          perUserLimit: coupon.perUserLimit,
        });
        return adjustCredits(tx, {
          userId,
          amountCents: preview.creditBonusCents,
          reason: 'coupon_bonus',
          note: `Coupon ${coupon.code}`,
        });
      });

      return {
        code: preview.coupon.code,
        creditBonusCents: preview.creditBonusCents,
        creditBalanceCents: result.user.creditBalanceCents,
      };
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status && status < 500) {
        return reply.status(status).send({ error: err instanceof Error ? err.message : 'Redeem failed' });
      }
      throw err;
    }
  });

  app.get('/services', { preHandler: requireAuth }, async (request) => {
    const services = await prisma.service.findMany({
      where: { userId: request.user!.id },
      orderBy: { createdAt: 'desc' },
      select: serviceListSelect,
    });
    return services.map(withEffectiveServiceCategory);
  });

  app.get('/services/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const service = await prisma.service.findFirst({
      where: { id, userId: request.user!.id },
      select: {
        ...serviceListSelect,
        invoices: { orderBy: { createdAt: 'desc' as const } },
      },
    });
    if (!service) return reply.status(404).send({ error: 'Not found' });
    const deletion = previewServiceDeletionRefund(service);
    return {
      ...withEffectiveServiceCategory(service),
      panelWebUrl: (await getPanelConnectionConfig()).panelWebUrl,
      deletion,
    };
  });

  app.get('/services/:id/upgrade-options', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return await listUpgradeOptions(id, request.user!.id);
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status && status < 500) {
        return reply.status(status).send({ error: err instanceof Error ? err.message : 'Failed' });
      }
      throw err;
    }
  });

  app.post('/services/:id/upgrade', { preHandler: requireAuth, ...orderRateLimit }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = z.object({ productId: z.string().min(1) }).parse(request.body);
    try {
      const result = await createUpgradeInvoice({
        serviceId: id,
        userId: request.user!.id,
        productId: body.productId,
      });
      return {
        invoice: result.invoice,
        chargeCents: result.chargeCents,
        targetProduct: {
          id: result.target.id,
          name: result.target.name,
          priceCents: result.target.priceCents,
          currency: result.target.currency,
        },
        paymentInstructions: await getSetting(
          'payment_instructions',
          getConfig().paymentInstructions,
        ),
      };
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status && status < 500) {
        return reply.status(status).send({ error: err instanceof Error ? err.message : 'Failed' });
      }
      throw err;
    }
  });

  app.delete('/services/:id', { preHandler: requireAuth, ...orderRateLimit }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return await deleteOwnedService({
        serviceId: id,
        userId: request.user!.id,
        asAdmin: false,
      });
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status && status < 500) {
        return reply.status(status).send({ error: err instanceof Error ? err.message : 'Failed' });
      }
      throw err;
    }
  });

  app.post('/orders', { preHandler: requireAuth, ...orderRateLimit }, async (request, reply) => {
    const body = z
      .object({
        productId: z.string(),
        name: z.string().min(1).max(64).optional(),
      })
      .parse(request.body);

    const product = await prisma.product.findFirst({
      where: { id: body.productId, ...provisionableProductWhere },
    });
    if (!product) {
      return reply.status(404).send({
        error: 'Product not found or not ready for provisioning (missing egg/node).',
      });
    }

    const user = await prisma.user.findUniqueOrThrow({ where: { id: request.user!.id } });
    const link = await resolvePanelUserLink(user);
    if (!link.panelLinked) {
      return reply.status(422).send({
        error:
          link.panelStatus === 'unreachable'
            ? 'Spirit-Panel is unreachable right now. Try again shortly, or ask an admin to check the panel link.'
            : 'Your billing account is not linked to Spirit-Panel. Ask an admin to relink your panel account before ordering.',
      });
    }

    const dueAt = new Date();
    dueAt.setDate(dueAt.getDate() + (await getInvoiceDueDays()));

    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const invoiceNumber = await nextInvoiceNumber();
      try {
        const result = await prisma.$transaction((tx) =>
          createServiceInvoice(tx, {
            userId: user.id,
            product,
            name: body.name,
            invoiceNumber,
            dueAt,
          }),
        );
        return {
          ...result,
          paymentInstructions: await getSetting(
            'payment_instructions',
            getConfig().paymentInstructions,
          ),
        };
      } catch (err) {
        lastError = err;
        if ((err as { code?: string }).code !== 'P2002') throw err;
      }
    }

    request.log.error({ err: lastError }, 'order create failed after retries');
    return reply.status(500).send({ error: 'Could not create order. Try again.' });
  });

  app.post('/orders/checkout', { preHandler: requireAuth, ...orderRateLimit }, async (request, reply) => {
    const body = z
      .object({
        items: z
          .array(
            z.object({
              productId: z.string(),
              name: z.string().min(1).max(64).optional(),
            }),
          )
          .min(1)
          .max(10),
        couponCode: z.string().max(64).optional(),
        applyCredits: z.boolean().optional().default(false),
      })
      .parse(request.body);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: request.user!.id } });
    const link = await resolvePanelUserLink(user);
    if (!link.panelLinked) {
      return reply.status(422).send({
        error:
          link.panelStatus === 'unreachable'
            ? 'Spirit-Panel is unreachable right now. Try again shortly, or ask an admin to check the panel link.'
            : 'Your billing account is not linked to Spirit-Panel. Ask an admin to relink your panel account before ordering.',
      });
    }

    const productIds = [...new Set(body.items.map((i) => i.productId))];
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, ...provisionableProductWhere },
    });
    if (products.length !== productIds.length) {
      return reply.status(422).send({
        error: 'One or more cart items are unavailable or missing panel egg/node configuration.',
      });
    }
    const byId = new Map(products.map((p) => [p.id, p]));

    const lines = body.items.map((item) => {
      const product = byId.get(item.productId)!;
      return {
        product,
        name: item.name,
        priceCents: product.priceCents,
      };
    });

    const subtotalCents = lines.reduce((sum, line) => sum + line.priceCents, 0);
    let couponId: string | null = null;
    let couponCode: string | null = null;
    let discountTotal = 0;
    let creditBonusCents = 0;

    if (body.couponCode?.trim()) {
      const preview = await findValidCoupon(body.couponCode, user.id, subtotalCents);
      couponId = preview.coupon.id;
      couponCode = preview.coupon.code;
      discountTotal = preview.discountCents;
      creditBonusCents = preview.creditBonusCents;
    }

    const lineDiscounts = allocateDiscount(
      lines.map((l) => l.priceCents),
      discountTotal,
    );
    const afterDiscount = lines.map((l, i) => Math.max(0, l.priceCents - lineDiscounts[i]));
    const dueBeforeCredits = afterDiscount.reduce((a, b) => a + b, 0);
    const availableCredits = user.creditBalanceCents + creditBonusCents;
    const creditToApply = body.applyCredits
      ? Math.min(availableCredits, dueBeforeCredits)
      : 0;
    const lineCredits = allocateDiscount(afterDiscount, creditToApply);

    const dueAt = new Date();
    dueAt.setDate(dueAt.getDate() + (await getInvoiceDueDays()));

    let created: Array<{
      service: { id: string };
      invoice: { id: string; number: string; totalCents: number; creditAppliedCents: number; discountCents: number };
    }> = [];

    try {
      created = await prisma.$transaction(async (tx) => {
        let couponPerUserLimit = 1;
        if (couponId) {
          const coupon = await tx.coupon.findUniqueOrThrow({ where: { id: couponId } });
          if (!coupon.active) {
            throw Object.assign(new Error('Coupon not found or inactive'), { statusCode: 404 });
          }
          couponPerUserLimit = coupon.perUserLimit;
        }

        // Grant credit-bonus coupons before spending credits on this order.
        if (couponId && creditBonusCents > 0) {
          await adjustCredits(tx, {
            userId: user.id,
            amountCents: creditBonusCents,
            reason: 'coupon_bonus',
            note: `Coupon ${couponCode}`,
          });
        }

        const results: typeof created = [];
        const year = new Date().getFullYear();
        const prefix = await getInvoicePrefix();
        const latest = await tx.invoice.findFirst({
          where: { number: { startsWith: `${prefix}-${year}-` } },
          orderBy: { number: 'desc' },
          select: { number: true },
        });
        let seq = latest ? Number(latest.number.split('-').pop()) : 0;
        if (!Number.isFinite(seq)) seq = 0;

        for (let i = 0; i < lines.length; i += 1) {
          seq += 1;
          const invoiceNumber = `${prefix}-${year}-${String(seq).padStart(5, '0')}`;
          const result = await createServiceInvoice(tx, {
            userId: user.id,
            product: lines[i].product,
            name: lines[i].name,
            invoiceNumber,
            dueAt,
            discountCents: lineDiscounts[i],
            creditAppliedCents: lineCredits[i],
            couponId,
            couponCode,
          });
          results.push(result);
        }

        if (couponId && (discountTotal > 0 || creditBonusCents > 0)) {
          await claimCouponRedemption(tx, {
            couponId,
            userId: user.id,
            invoiceId: results[0]?.invoice.id,
            discountCents: discountTotal,
            creditCents: creditBonusCents,
            perUserLimit: couponPerUserLimit,
          });
        }

        if (creditToApply > 0) {
          await adjustCredits(tx, {
            userId: user.id,
            amountCents: -creditToApply,
            reason: 'order_payment',
            note: `Checkout ${results.map((r) => r.invoice.number).join(', ')}`,
            invoiceId: results[0]?.invoice.id,
          });
        }

        await tx.notification.create({
          data: {
            userId: user.id,
            type: results.every((row) => row.invoice.totalCents === 0) ? 'success' : 'info',
            title: results.length === 1 ? 'Order created' : `${results.length} orders created`,
            message:
              results.length === 1
                ? `Invoice ${results[0].invoice.number} has been created.`
                : `Invoices ${results.map((row) => row.invoice.number).join(', ')} have been created.`,
            href: results.length === 1 ? `/invoices/${results[0].invoice.id}` : '/invoices',
          },
        });

        return results;
      });
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status && status < 500) {
        return reply.status(status).send({ error: err instanceof Error ? err.message : 'Checkout failed' });
      }
      throw err;
    }

    recordLogFireAndForget({
      level: 'info',
      category: 'billing',
      action: 'order.checkout',
      message: `${user.username} checked out ${created.length} item${created.length === 1 ? '' : 's'}`,
      actorUserId: user.id,
      ip: request.ip,
      method: 'POST',
      path: '/api/client/orders/checkout',
      meta: {
        invoiceCount: created.length,
        invoiceNumbers: created.map((row) => row.invoice.number),
      },
    });

    const provisioned: string[] = [];
    const provisionErrors: Array<{ invoiceId: string; error: string }> = [];
    for (const row of created) {
      if (row.invoice.totalCents > 0) continue;
      try {
        await markInvoicePaidAndProvision({
          invoiceId: row.invoice.id,
          paidById: user.id,
          log: request.log,
        });
        provisioned.push(row.invoice.id);
      } catch (err) {
        provisionErrors.push({
          invoiceId: row.invoice.id,
          error: err instanceof Error ? err.message : 'Provisioning failed',
        });
      }
    }

    const freshUser = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { creditBalanceCents: true },
    });

    return {
      invoices: created.map((c) => ({
        id: c.invoice.id,
        number: c.invoice.number,
        totalCents: c.invoice.totalCents,
        discountCents: c.invoice.discountCents,
        creditAppliedCents: c.invoice.creditAppliedCents,
      })),
      discountCents: discountTotal,
      creditBonusCents,
      creditAppliedCents: creditToApply,
      creditBalanceCents: freshUser.creditBalanceCents,
      provisionedInvoiceIds: provisioned,
      provisionErrors,
      paymentInstructions: await getSetting(
        'payment_instructions',
        getConfig().paymentInstructions,
      ),
    };
  });

  app.post('/invoices/:id/pay-with-credits', { preHandler: requireAuth, ...orderRateLimit }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user!.id;

    const invoice = await prisma.invoice.findFirst({
      where: { id, userId },
    });
    if (!invoice) return reply.status(404).send({ error: 'Not found' });
    if (invoice.status !== 'unpaid') {
      return reply.status(422).send({ error: 'Only unpaid invoices can be paid with credits' });
    }
    if (invoice.totalCents <= 0) {
      return reply.status(422).send({ error: 'Invoice has nothing due' });
    }

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { creditBalanceCents: true, panelUserId: true },
    });
    if (user.creditBalanceCents <= 0) {
      return reply.status(422).send({ error: 'No credit balance available' });
    }

    const apply = Math.min(user.creditBalanceCents, invoice.totalCents);

    try {
      await prisma.$transaction(async (tx) => {
        const claim = await tx.invoice.updateMany({
          where: { id: invoice.id, status: 'unpaid', totalCents: invoice.totalCents },
          data: {
            creditAppliedCents: invoice.creditAppliedCents + apply,
            totalCents: invoice.totalCents - apply,
          },
        });
        if (claim.count === 0) {
          throw Object.assign(new Error('Invoice changed — refresh and try again'), { statusCode: 409 });
        }
        await adjustCredits(tx, {
          userId,
          amountCents: -apply,
          reason: 'order_payment',
          note: `Invoice ${invoice.number}`,
          invoiceId: invoice.id,
        });
      });
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status && status < 500) {
        return reply.status(status).send({ error: err instanceof Error ? err.message : 'Payment failed' });
      }
      throw err;
    }

    const updated = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    let provisioned = false;
    let provisionError: string | undefined;

    if (updated.totalCents === 0) {
      if (!user.panelUserId) {
        provisionError = 'Credits applied, but panel account is not linked — ask an admin to provision.';
      } else {
        try {
          await markInvoicePaidAndProvision({
            invoiceId: updated.id,
            paidById: userId,
            log: request.log,
          });
          provisioned = true;
        } catch (err) {
          provisionError = err instanceof Error ? err.message : 'Provisioning failed';
        }
      }
    }

    const fresh = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { creditBalanceCents: true },
    });
    const finalInvoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });

    return {
      invoice: finalInvoice,
      creditAppliedCents: apply,
      creditBalanceCents: fresh.creditBalanceCents,
      provisioned,
      provisionError,
    };
  });

  app.get('/invoices', { preHandler: requireAuth }, async (request) => {
    const invoices = await prisma.invoice.findMany({
      where: { userId: request.user!.id },
      include: {
        service: {
          select: {
            id: true,
            name: true,
            status: true,
            product: { select: { id: true, name: true } },
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
          select: productPublicSelect,
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

  app.post('/invoices/:id/cancel', { preHandler: requireAuth, ...orderRateLimit }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const invoice = await prisma.invoice.findFirst({
      where: { id, userId: request.user!.id },
    });
    if (!invoice) return reply.status(404).send({ error: 'Not found' });
    if (invoice.status !== 'unpaid') {
      return reply.status(422).send({ error: 'Only unpaid invoices can be cancelled' });
    }
    if (!invoice.upgradeToProductId) {
      return reply.status(422).send({
        error: 'Only unpaid plan upgrade invoices can be cancelled from the client area',
      });
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

  app.get('/invoices/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const invoice = await prisma.invoice.findFirst({
      where: { id, userId: request.user!.id },
      include: {
        service: {
          include: {
            product: { select: productPublicSelect },
          },
        },
      },
    });
    if (!invoice) return reply.status(404).send({ error: 'Not found' });

    const upgradeToProduct = invoice.upgradeToProductId
      ? await prisma.product.findUnique({
          where: { id: invoice.upgradeToProductId },
          select: productPublicSelect,
        })
      : null;

    return {
      ...invoice,
      isUpgrade: Boolean(invoice.upgradeToProductId),
      canCancelUpgrade: Boolean(invoice.upgradeToProductId && invoice.status === 'unpaid'),
      upgradeToProduct,
      companyName: await getSetting('company_name', getConfig().companyName),
      tagline: await getSetting('brand_tagline', 'Billing'),
      invoiceFooter: await getSetting('invoice_footer', ''),
      supportEmail: await getSetting('support_email', ''),
      supportUrl: await getSetting('support_url', ''),
      paymentInstructions: await getSetting(
        'payment_instructions',
        getConfig().paymentInstructions,
      ),
    };
  });
}
