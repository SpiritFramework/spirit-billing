import { prisma } from './prisma.js';

export const DEFAULT_PRODUCT_FEATURES = [
  'Instant server deployment',
  'DDoS protection included',
  'Full Spirit-Panel access',
] as const;

const MAX_FEATURES = 20;
const MAX_FEATURE_LENGTH = 120;

/** Normalize product feature bullets from JSON / API input. */
export function normalizeProductFeatures(raw: unknown, fallbackToDefaults = false): string[] {
  let list: unknown[] = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) list = parsed;
    } catch {
      list = raw
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
    }
  }

  const features = list
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .map((item) => item.slice(0, MAX_FEATURE_LENGTH))
    .slice(0, MAX_FEATURES);

  if (!features.length && fallbackToDefaults) {
    return [...DEFAULT_PRODUCT_FEATURES];
  }
  return features;
}

/** Persist features as a JSON array string (Product.features is Text, not Json). */
export function serializeProductFeatures(raw: unknown, fallbackToDefaults = false): string {
  return JSON.stringify(normalizeProductFeatures(raw, fallbackToDefaults));
}

/**
 * Fix empty/truncated product.features values that previously crashed Prisma Json decoding.
 */
export async function repairInvalidProductFeatures(categoryId?: string) {
  if (categoryId) {
    return prisma.$executeRaw`
      UPDATE products
      SET features = '[]'
      WHERE category_id = ${categoryId}
        AND (
          features IS NULL
          OR features = ''
          OR features = 'null'
        )
    `;
  }
  return prisma.$executeRaw`
    UPDATE products
    SET features = '[]'
    WHERE features IS NULL
      OR features = ''
      OR features = 'null'
  `;
}

export type StorefrontProductRow = {
  id: string;
  name: string;
  description: string;
  features: string | null;
  priceCents: number;
  currency: string;
  cycle: 'monthly' | 'quarterly' | 'yearly';
  memoryMb: number;
  diskMb: number;
  cpuPercent: number;
  backupLimit: number;
  databaseLimit: number;
};

/** Load sellable products without Prisma Json decoding (avoids corrupt features crashes). */
export async function loadStorefrontProducts(categoryId: string): Promise<StorefrontProductRow[]> {
  return prisma.$queryRaw<StorefrontProductRow[]>`
    SELECT
      id,
      name,
      description,
      CAST(features AS CHAR) AS features,
      price_cents AS priceCents,
      currency,
      cycle,
      memory_mb AS memoryMb,
      disk_mb AS diskMb,
      cpu_percent AS cpuPercent,
      backup_limit AS backupLimit,
      database_limit AS databaseLimit
    FROM products
    WHERE category_id = ${categoryId}
      AND active = 1
      AND panel_egg_id IS NOT NULL
      AND panel_egg_id <> ''
      AND panel_node_id IS NOT NULL
      AND panel_node_id <> ''
    ORDER BY sort_order ASC, price_cents ASC
  `;
}

export function isPrismaJsonParseError(err: unknown) {
  return (
    err instanceof SyntaxError ||
    (err instanceof Error && /unexpected end of json|json input/i.test(err.message))
  );
}
