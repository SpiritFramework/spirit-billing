import type { Coupon, Prisma } from '@prisma/client';
import { prisma } from './prisma.js';

export type CouponPreview = {
  coupon: Pick<Coupon, 'id' | 'code' | 'type' | 'value' | 'description' | 'minOrderCents'>;
  discountCents: number;
  creditBonusCents: number;
};

export function normalizeCouponCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, '');
}

export function computeCouponDiscount(coupon: Coupon, subtotalCents: number): number {
  if (coupon.type === 'credit') return 0;
  if (subtotalCents <= 0) return 0;
  if (coupon.minOrderCents > 0 && subtotalCents < coupon.minOrderCents) return 0;

  let discount = 0;
  if (coupon.type === 'percent') {
    const pct = Math.min(Math.max(coupon.value, 0), 100);
    discount = Math.floor((subtotalCents * pct) / 100);
  } else {
    discount = Math.max(coupon.value, 0);
  }
  return Math.min(discount, subtotalCents);
}

export function computeCouponCreditBonus(coupon: Coupon): number {
  if (coupon.type !== 'credit') return 0;
  return Math.max(coupon.value, 0);
}

export async function findValidCoupon(code: string, userId: string, subtotalCents: number) {
  const normalized = normalizeCouponCode(code);
  if (!normalized) {
    throw Object.assign(new Error('Coupon code is required'), { statusCode: 422 });
  }

  const coupon = await prisma.coupon.findUnique({ where: { code: normalized } });
  if (!coupon || !coupon.active) {
    throw Object.assign(new Error('Coupon not found or inactive'), { statusCode: 404 });
  }

  const now = new Date();
  if (coupon.startsAt && coupon.startsAt > now) {
    throw Object.assign(new Error('Coupon is not active yet'), { statusCode: 422 });
  }
  if (coupon.endsAt && coupon.endsAt < now) {
    throw Object.assign(new Error('Coupon has expired'), { statusCode: 422 });
  }
  if (coupon.maxRedemptions != null && coupon.redemptionCount >= coupon.maxRedemptions) {
    throw Object.assign(new Error('Coupon has reached its redemption limit'), { statusCode: 422 });
  }
  if (coupon.minOrderCents > 0 && subtotalCents < coupon.minOrderCents) {
    throw Object.assign(
      new Error(`Order must be at least ${(coupon.minOrderCents / 100).toFixed(2)} to use this coupon`),
      { statusCode: 422 },
    );
  }

  const userUses = await prisma.couponRedemption.count({
    where: { couponId: coupon.id, userId },
  });
  if (userUses >= coupon.perUserLimit) {
    throw Object.assign(new Error('You have already used this coupon'), { statusCode: 422 });
  }

  const discountCents = computeCouponDiscount(coupon, subtotalCents);
  const creditBonusCents = computeCouponCreditBonus(coupon);
  if (discountCents <= 0 && creditBonusCents <= 0) {
    throw Object.assign(new Error('Coupon does not apply to this order'), { statusCode: 422 });
  }

  return { coupon, discountCents, creditBonusCents } satisfies CouponPreview;
}

/** Split a cart-level discount across line items (largest remainder method). */
export function allocateDiscount(lineSubtotals: number[], totalDiscount: number): number[] {
  const subtotal = lineSubtotals.reduce((a, b) => a + b, 0);
  if (subtotal <= 0 || totalDiscount <= 0) return lineSubtotals.map(() => 0);

  const capped = Math.min(totalDiscount, subtotal);
  const raw = lineSubtotals.map((line) => (line / subtotal) * capped);
  const floors = raw.map((n) => Math.floor(n));
  let remainder = capped - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((n, i) => ({ i, frac: n - Math.floor(n) }))
    .sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (remainder <= 0) break;
    floors[i] += 1;
    remainder -= 1;
  }
  return floors;
}

/**
 * Atomically claim a coupon use (global max + per-user limit) and write the redemption row.
 * Must run inside a transaction.
 */
export async function claimCouponRedemption(
  tx: Prisma.TransactionClient,
  input: {
    couponId: string;
    userId: string;
    invoiceId?: string | null;
    discountCents: number;
    creditCents: number;
    perUserLimit: number;
  },
) {
  await tx.$queryRaw`SELECT id FROM coupons WHERE id = ${input.couponId} FOR UPDATE`;

  const claimed = await tx.$executeRaw`
    UPDATE coupons
    SET redemption_count = redemption_count + 1
    WHERE id = ${input.couponId}
      AND active = true
      AND (max_redemptions IS NULL OR redemption_count < max_redemptions)
  `;
  if (Number(claimed) === 0) {
    const coupon = await tx.coupon.findUnique({
      where: { id: input.couponId },
      select: { active: true, maxRedemptions: true, redemptionCount: true },
    });
    if (!coupon || !coupon.active) {
      throw Object.assign(new Error('Coupon not found or inactive'), { statusCode: 404 });
    }
    throw Object.assign(new Error('Coupon has reached its redemption limit'), { statusCode: 422 });
  }

  const userUses = await tx.couponRedemption.count({
    where: { couponId: input.couponId, userId: input.userId },
  });
  if (userUses >= input.perUserLimit) {
    throw Object.assign(new Error('You have already used this coupon'), { statusCode: 422 });
  }

  return tx.couponRedemption.create({
    data: {
      couponId: input.couponId,
      userId: input.userId,
      invoiceId: input.invoiceId ?? null,
      discountCents: input.discountCents,
      creditCents: input.creditCents,
    },
  });
}

export async function adjustCredits(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    amountCents: number;
    reason: 'admin_adjust' | 'order_payment' | 'coupon_bonus' | 'refund' | 'purchase_topup';
    note?: string;
    invoiceId?: string;
    createdById?: string;
  },
) {
  if (input.amountCents === 0) {
    throw Object.assign(new Error('Credit amount cannot be zero'), { statusCode: 422 });
  }

  const updatedRows = await tx.$executeRaw`
    UPDATE users
    SET credit_balance_cents = credit_balance_cents + ${input.amountCents}
    WHERE id = ${input.userId}
      AND credit_balance_cents + ${input.amountCents} >= 0
  `;
  if (Number(updatedRows) === 0) {
    const exists = await tx.user.findUnique({
      where: { id: input.userId },
      select: { id: true },
    });
    if (!exists) {
      throw Object.assign(new Error('User not found'), { statusCode: 404 });
    }
    throw Object.assign(new Error('Insufficient credit balance'), { statusCode: 422 });
  }

  const updated = await tx.user.findUniqueOrThrow({
    where: { id: input.userId },
    select: { id: true, creditBalanceCents: true },
  });

  const ledger = await tx.creditLedger.create({
    data: {
      userId: input.userId,
      amountCents: input.amountCents,
      balanceAfterCents: updated.creditBalanceCents,
      reason: input.reason,
      note: input.note?.slice(0, 500) || null,
      invoiceId: input.invoiceId,
      createdById: input.createdById,
    },
  });

  const isCredit = input.amountCents > 0;
  await tx.notification.create({
    data: {
      userId: input.userId,
      type: isCredit ? 'success' : 'info',
      title: isCredit ? 'Credits added' : 'Credits used',
      message: `${isCredit ? '+' : '-'}£${(Math.abs(input.amountCents) / 100).toFixed(2)} · ${
        input.note?.slice(0, 420) || input.reason.replaceAll('_', ' ')
      }`,
      href: input.invoiceId ? `/invoices/${input.invoiceId}` : '/dashboard',
    },
  });

  return { user: updated, ledger };
}
