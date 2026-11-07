import { getDefaultCurrency } from './billing.js';
import { prisma } from './prisma.js';
import type { PanelEgg } from '../services/panel.js';

export const CUSTOM_PRODUCT_NAME = 'Custom';
export const CUSTOM_PANEL_EGG_ID = 'custom';

export function isCustomProduct(product: { name: string; panelEggId: string }) {
  return (
    product.panelEggId === CUSTOM_PANEL_EGG_ID ||
    product.name === CUSTOM_PRODUCT_NAME ||
    product.name.startsWith(`${CUSTOM_PRODUCT_NAME} · `)
  );
}

function normalizeLabel(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

const categoryDisplaySelect = {
  id: true,
  name: true,
  color: true,
  icon: true,
  logoUrl: true,
  slug: true,
  panelEggId: true,
} as const;

/**
 * Resolve billing category for a panel egg.
 * Prefer categories that explicitly set panelEggId (source of truth).
 */
export async function resolveCategoryForEgg(egg: PanelEgg | null | undefined) {
  if (!egg?.id) return null;

  const byCategoryEgg = await prisma.category.findFirst({
    where: { panelEggId: egg.id },
    select: categoryDisplaySelect,
  });
  if (byCategoryEgg) return byCategoryEgg;

  const byProduct = await prisma.product.findFirst({
    where: {
      panelEggId: egg.id,
      categoryId: { not: null },
      NOT: [
        { panelEggId: CUSTOM_PANEL_EGG_ID },
        { name: CUSTOM_PRODUCT_NAME },
        { name: { startsWith: `${CUSTOM_PRODUCT_NAME} · ` } },
      ],
    },
    select: {
      category: { select: categoryDisplaySelect },
    },
  });
  if (byProduct?.category) return byProduct.category;

  // Last resort: name/slug match for categories that have not set an egg yet.
  const categories = await prisma.category.findMany({
    select: categoryDisplaySelect,
  });
  if (!categories.length) return null;

  const eggKey = normalizeLabel(egg.name);
  const nestKey = egg.nest?.name ? normalizeLabel(egg.nest.name) : '';

  const exact =
    categories.find((c) => normalizeLabel(c.name) === eggKey || normalizeLabel(c.slug) === eggKey) ||
    (nestKey
      ? categories.find((c) => normalizeLabel(c.name) === nestKey || normalizeLabel(c.slug) === nestKey)
      : undefined);
  if (exact) return exact;

  return (
    categories.find(
      (c) =>
        normalizeLabel(c.name).includes(eggKey) ||
        eggKey.includes(normalizeLabel(c.name)) ||
        (nestKey &&
          (normalizeLabel(c.name).includes(nestKey) || nestKey.includes(normalizeLabel(c.name)))),
    ) || null
  );
}

/**
 * Single hidden Custom product for all panel imports.
 * Egg identity and game logo live on the Service (categoryId / panelEgg*), not on catalog products.
 */
export async function ensureCustomProduct() {
  const currency = await getDefaultCurrency();
  const existing = await prisma.product.findFirst({
    where: {
      OR: [{ panelEggId: CUSTOM_PANEL_EGG_ID }, { name: CUSTOM_PRODUCT_NAME }],
    },
  });

  const data = {
    name: CUSTOM_PRODUCT_NAME,
    description: 'Imported Spirit-Panel servers. Egg and category are stored on each service.',
    priceCents: 0,
    currency,
    cycle: 'monthly' as const,
    active: false,
    sortOrder: 9999,
    panelEggId: CUSTOM_PANEL_EGG_ID,
    panelNodeId: null as string | null,
    categoryId: null as string | null,
    memoryMb: 1024,
    diskMb: 10240,
    cpuPercent: 100,
    backupLimit: 0,
    databaseLimit: 0,
    allocationLimit: 0,
  };

  if (existing) {
    return prisma.product.update({
      where: { id: existing.id },
      data: {
        name: data.name,
        description: data.description,
        active: false,
        panelEggId: CUSTOM_PANEL_EGG_ID,
        panelNodeId: null,
        priceCents: 0,
        currency,
        cycle: 'monthly',
        categoryId: null,
      },
    });
  }

  return prisma.product.create({ data });
}

/** Remove leftover per-egg Custom products created by an earlier sync approach. */
export async function cleanupLegacyCustomEggProducts(keepProductId: string) {
  const legacy = await prisma.product.findMany({
    where: {
      id: { not: keepProductId },
      name: { startsWith: `${CUSTOM_PRODUCT_NAME} · ` },
      active: false,
    },
    select: { id: true, _count: { select: { services: true } } },
  });

  for (const product of legacy) {
    if (product._count.services > 0) {
      await prisma.service.updateMany({
        where: { productId: product.id },
        data: { productId: keepProductId },
      });
    }
    await prisma.product.delete({ where: { id: product.id } }).catch(() => undefined);
  }
}
