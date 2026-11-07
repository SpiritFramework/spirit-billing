const categorySelect = {
  id: true,
  name: true,
  color: true,
  icon: true,
  logoUrl: true,
} as const;

/**
 * Prefer the service's own category (imports) over the product catalog category,
 * so UI can keep reading `product.category` for logos without per-egg products.
 */
export function withEffectiveServiceCategory<
  T extends {
    panelEggName?: string | null;
    category?: {
      id: string;
      name: string;
      color: string;
      icon: string;
      logoUrl: string | null;
    } | null;
    product: {
      name: string;
      category?: {
        id: string;
        name: string;
        color: string;
        icon: string;
        logoUrl: string | null;
      } | null;
    } | null;
  },
>(service: T) {
  const { category: serviceCategory, ...rest } = service;
  const product = service.product;
  const effective = serviceCategory ?? product?.category ?? null;
  return {
    ...rest,
    panelEggName: service.panelEggName ?? null,
    product: product
      ? {
          ...product,
          category: effective,
        }
      : ({
          id: 'missing',
          name: 'Unknown product',
          description: '',
          priceCents: 0,
          currency: 'GBP',
          cycle: 'monthly',
          memoryMb: 0,
          diskMb: 0,
          cpuPercent: 0,
          category: effective,
        } as NonNullable<T['product']> & { category: typeof effective }),
  };
}

export { categorySelect };
