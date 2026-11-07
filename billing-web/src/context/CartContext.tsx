import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type CartProduct = {
  id: string;
  name: string;
  description?: string;
  features?: string[];
  priceCents: number;
  currency: string;
  cycle: string;
  memoryMb: number;
  diskMb: number;
  cpuPercent: number;
  backupLimit?: number;
  databaseLimit?: number;
  categoryName?: string;
  categoryColor?: string;
  categoryIcon?: string;
  categoryLogoUrl?: string | null;
};

export type CartItem = CartProduct & {
  qty: number;
  serverName?: string;
};

type CartState = {
  items: CartItem[];
  count: number;
  totalCents: number;
  currency: string;
  addItem: (product: CartProduct, opts?: { qty?: number; serverName?: string }) => void;
  removeItem: (productId: string) => void;
  setQty: (productId: string, qty: number) => void;
  setServerName: (productId: string, name: string) => void;
  clear: () => void;
};

const STORAGE_KEY = 'spirit_billing_cart_v2';
const CartContext = createContext<CartState | null>(null);

function loadCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem('spirit_billing_cart_v1');
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CartItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((i) => i && typeof i.id === 'string' && i.qty > 0).slice(0, 20);
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() =>
    typeof window === 'undefined' ? [] : loadCart(),
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const addItem = useCallback((product: CartProduct, opts?: { qty?: number; serverName?: string }) => {
    const addQty = Math.min(Math.max(opts?.qty ?? 1, 1), 5);
    setItems((prev) => {
      const existing = prev.find((i) => i.id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.id === product.id
            ? {
                ...i,
                ...product,
                qty: Math.min(i.qty + addQty, 5),
                serverName: opts?.serverName ?? i.serverName,
              }
            : i,
        );
      }
      return [
        ...prev,
        {
          ...product,
          qty: addQty,
          serverName: opts?.serverName,
        },
      ];
    });
  }, []);

  const removeItem = useCallback((productId: string) => {
    setItems((prev) => prev.filter((i) => i.id !== productId));
  }, []);

  const setQty = useCallback((productId: string, qty: number) => {
    const next = Math.min(Math.max(qty, 0), 5);
    setItems((prev) => {
      if (next <= 0) return prev.filter((i) => i.id !== productId);
      return prev.map((i) => (i.id === productId ? { ...i, qty: next } : i));
    });
  }, []);

  const setServerName = useCallback((productId: string, name: string) => {
    setItems((prev) =>
      prev.map((i) => (i.id === productId ? { ...i, serverName: name.slice(0, 64) } : i)),
    );
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const value = useMemo<CartState>(() => {
    const count = items.reduce((sum, i) => sum + i.qty, 0);
    const totalCents = items.reduce((sum, i) => sum + i.priceCents * i.qty, 0);
    const currency = items[0]?.currency ?? 'GBP';
    return { items, count, totalCents, currency, addItem, removeItem, setQty, setServerName, clear };
  }, [items, addItem, removeItem, setQty, setServerName, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart outside CartProvider');
  return ctx;
}
