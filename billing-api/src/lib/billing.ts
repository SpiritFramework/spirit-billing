import { prisma } from './prisma.js';
import { getConfig } from './env.js';

export async function getSetting(key: string, fallback = ''): Promise<string> {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row?.value ?? fallback;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await prisma.setting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

export async function getInvoicePrefix(): Promise<string> {
  const raw = (await getSetting('invoice_prefix', getConfig().invoicePrefix)).trim().toUpperCase();
  return /^[A-Z0-9]{1,12}$/.test(raw) ? raw : getConfig().invoicePrefix;
}

export async function getDefaultCurrency(): Promise<string> {
  const raw = (await getSetting('default_currency', getConfig().defaultCurrency)).trim().toUpperCase();
  return /^[A-Z]{3}$/.test(raw) ? raw : getConfig().defaultCurrency;
}

export async function getInvoiceDueDays(): Promise<number> {
  const raw = Number(await getSetting('invoice_due_days', '7'));
  if (!Number.isFinite(raw)) return 7;
  return Math.min(90, Math.max(1, Math.round(raw)));
}

/** Days after purchase during which deleting a service can still refund unused time. */
export async function getServiceRefundWindowDays(): Promise<number> {
  const raw = Number(await getSetting('service_refund_window_days', '3'));
  if (!Number.isFinite(raw)) return 3;
  return Math.min(90, Math.max(0, Math.round(raw)));
}

export async function nextInvoiceNumber(): Promise<string> {
  const prefix = await getInvoicePrefix();
  const year = new Date().getFullYear();
  const latest = await prisma.invoice.findFirst({
    where: { number: { startsWith: `${prefix}-${year}-` } },
    orderBy: { number: 'desc' },
    select: { number: true },
  });
  const lastSeq = latest ? Number(latest.number.split('-').pop()) : 0;
  const next = Number.isFinite(lastSeq) ? lastSeq + 1 : 1;
  return `${prefix}-${year}-${String(next).padStart(5, '0')}`;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'category';
}

export async function uniqueCategorySlug(name: string, excludeId?: string): Promise<string> {
  const base = slugify(name);
  let slug = base;
  let i = 2;
  while (true) {
    const existing = await prisma.category.findFirst({
      where: {
        slug,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (!existing) return slug;
    slug = `${base}-${i}`;
    i += 1;
  }
}

export function addBillingCycle(from: Date, cycle: 'monthly' | 'quarterly' | 'yearly'): Date {
  const d = new Date(from);
  if (cycle === 'monthly') d.setMonth(d.getMonth() + 1);
  else if (cycle === 'quarterly') d.setMonth(d.getMonth() + 3);
  else d.setFullYear(d.getFullYear() + 1);
  return d;
}

/** Approximate cycle length in ms (used for prorated upgrades / refunds). */
export function billingCycleMs(cycle: 'monthly' | 'quarterly' | 'yearly'): number {
  const day = 24 * 60 * 60 * 1000;
  if (cycle === 'yearly') return 365 * day;
  if (cycle === 'quarterly') return 91 * day;
  return 30 * day;
}

/**
 * Prorate `amountCents` for the fraction of the billing cycle still remaining until `nextDueAt`.
 * Returns 0 if the period has already ended.
 */
export function prorateRemainingCents(
  amountCents: number,
  nextDueAt: Date | null | undefined,
  cycle: 'monthly' | 'quarterly' | 'yearly',
  now = new Date(),
): number {
  if (!nextDueAt || amountCents <= 0) return 0;
  const remainingMs = nextDueAt.getTime() - now.getTime();
  if (remainingMs <= 0) return 0;
  const cycleLen = billingCycleMs(cycle);
  const fraction = Math.min(1, remainingMs / cycleLen);
  return Math.max(0, Math.round(amountCents * fraction));
}

export function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

export const CATEGORY_COLORS = [
  '#6366f1',
  '#22d3ee',
  '#22c55e',
  '#f59e0b',
  '#f43f5e',
  '#a855f7',
  '#3b82f6',
  '#14b8a6',
] as const;

export const CATEGORY_ICONS = [
  'gamepad',
  'server',
  'cpu',
  'globe',
  'box',
  'zap',
  'shield',
  'rocket',
  'sword',
  'pickaxe',
  'car',
  'plane',
  'fish',
  'mountain',
  'music',
  'radio',
  'target',
  'hexagon',
] as const;
