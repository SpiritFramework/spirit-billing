import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Archive,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Cpu,
  Database,
  Eye,
  EyeOff,
  Globe2,
  HardDrive,
  Layers3,
  MemoryStick,
  Package,
  Plus,
  Puzzle,
  RefreshCw,
  Save,
  Search,
  Server,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react';
import { api, ApiError, money } from '../../lib/api';
import { CategoryMark } from '../../lib/icons';
import { ConfirmModal } from '../../components/ConfirmModal';
import { ThemedSelect } from '../../components/ThemedSelect';

type Category = {
  id: string;
  name: string;
  color?: string;
  icon?: string;
  logoUrl?: string | null;
  panelEggId?: string | null;
  active?: boolean;
  sortOrder?: number;
  slug?: string;
};

type Product = {
  id: string;
  name: string;
  description: string;
  features?: string[];
  priceCents: number;
  currency: string;
  cycle: 'monthly' | 'quarterly' | 'yearly';
  freeTrialDays?: number;
  active: boolean;
  sortOrder?: number;
  categoryId?: string | null;
  category?: Category | null;
  panelEggId: string;
  panelNodeId: string | null;
  memoryMb: number;
  diskMb: number;
  cpuPercent: number;
  backupLimit: number;
  databaseLimit: number;
  allocationLimit?: number;
  subdomainAccess?: boolean;
  fivemMarketplaceAccess?: boolean;
  minecraftPluginsAccess?: boolean;
  _count?: { services: number };
};

type PanelEgg = { id: string; name: string; nest?: { id: string; name: string } };
type PanelNode = {
  id: string;
  name: string;
  fqdn: string;
  maintenanceMode: boolean;
  location?: { short: string; long: string };
  memory?: number;
  disk?: number;
};

type PanelCatalog = {
  panelApiUrl: string;
  panelKeyConfigured: boolean;
  eggs: PanelEgg[];
  nodes: PanelNode[];
  eggsError: string | null;
  nodesError: string | null;
};

type ProductForm = {
  name: string;
  description: string;
  features: string[];
  categoryId: string;
  priceCents: number;
  currency: string;
  cycle: 'monthly' | 'quarterly' | 'yearly';
  freeTrialDays: number;
  active: boolean;
  sortOrder: number;
  panelEggId: string;
  panelNodeId: string;
  memoryMb: number;
  diskMb: number;
  cpuPercent: number;
  backupLimit: number;
  databaseLimit: number;
  allocationLimit: number;
  subdomainAccess: boolean;
  fivemMarketplaceAccess: boolean;
  minecraftPluginsAccess: boolean;
};

type VisibilityFilter = 'all' | 'active' | 'hidden';
type ReadyFilter = 'all' | 'ready' | 'attention';

const DEFAULT_FEATURES = [
  'Instant server deployment',
  'DDoS protection included',
  'Full Spirit-Panel access',
];

const RESOURCE_PRESETS = [
  {
    id: 'starter',
    label: 'Starter',
    hint: '1 GB · 100% · 10 GB',
    memoryMb: 1024,
    cpuPercent: 100,
    diskMb: 10240,
    backupLimit: 1,
    databaseLimit: 1,
    allocationLimit: 1,
  },
  {
    id: 'standard',
    label: 'Standard',
    hint: '2 GB · 150% · 20 GB',
    memoryMb: 2048,
    cpuPercent: 150,
    diskMb: 20480,
    backupLimit: 2,
    databaseLimit: 2,
    allocationLimit: 2,
  },
  {
    id: 'performance',
    label: 'Performance',
    hint: '4 GB · 200% · 50 GB',
    memoryMb: 4096,
    cpuPercent: 200,
    diskMb: 51200,
    backupLimit: 3,
    databaseLimit: 3,
    allocationLimit: 3,
  },
  {
    id: 'pro',
    label: 'Pro',
    hint: '8 GB · 400% · 100 GB',
    memoryMb: 8192,
    cpuPercent: 400,
    diskMb: 102400,
    backupLimit: 5,
    databaseLimit: 5,
    allocationLimit: 4,
  },
] as const;

const emptyForm: ProductForm = {
  name: '',
  description: '',
  features: [...DEFAULT_FEATURES],
  categoryId: '',
  priceCents: 1000,
  currency: 'GBP',
  cycle: 'monthly',
  freeTrialDays: 0,
  active: true,
  sortOrder: 0,
  panelEggId: '',
  panelNodeId: '',
  memoryMb: 1024,
  diskMb: 10240,
  cpuPercent: 100,
  backupLimit: 1,
  databaseLimit: 1,
  allocationLimit: 1,
  subdomainAccess: false,
  fivemMarketplaceAccess: false,
  minecraftPluginsAccess: false,
};

function formatAdminResource(mb: number) {
  if (mb <= 0) return 'Unlimited';
  if (mb >= 1024 && mb % 1024 === 0) return `${mb / 1024} GB`;
  return `${mb.toLocaleString()} MB`;
}

function cycleAdminLabel(cycle: string) {
  if (cycle === 'monthly') return 'mo';
  if (cycle === 'quarterly') return 'qtr';
  if (cycle === 'yearly') return 'yr';
  return cycle;
}

function cycleFullLabel(cycle: string) {
  if (cycle === 'monthly') return 'month';
  if (cycle === 'quarterly') return 'quarter';
  if (cycle === 'yearly') return 'year';
  return cycle;
}

function isReady(product: Pick<Product, 'panelEggId' | 'panelNodeId'>) {
  return Boolean(product.panelEggId && product.panelNodeId);
}

function categoryKey(product: Product) {
  return product.categoryId || product.category?.id || 'uncategorised';
}

function groupEggs(eggs: PanelEgg[]) {
  const map = new Map<string, PanelEgg[]>();
  for (const egg of eggs) {
    const nest = egg.nest?.name || 'Other';
    const list = map.get(nest) ?? [];
    list.push(egg);
    map.set(nest, list);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export function AdminProducts() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [visibility, setVisibility] = useState<VisibilityFilter>('all');
  const [readyFilter, setReadyFilter] = useState<ReadyFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [error, setError] = useState('');
  const [reorderingId, setReorderingId] = useState<string | null>(null);

  async function load() {
    setError('');
    try {
      setProducts(await api<Product[]>('/admin/products'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load products');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const stats = useMemo(() => {
    const active = products.filter((p) => p.active).length;
    const ready = products.filter((p) => isReady(p)).length;
    const attention = products.length - ready;
    const services = products.reduce((sum, p) => sum + (p._count?.services ?? 0), 0);
    return {
      total: products.length,
      active,
      hidden: products.length - active,
      ready,
      attention,
      services,
    };
  }, [products]);

  const categories = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number; color?: string; icon?: string; logoUrl?: string | null }>();
    for (const product of products) {
      const cat = product.category;
      const id = product.categoryId || cat?.id || 'uncategorised';
      const existing = map.get(id);
      if (existing) existing.count += 1;
      else {
        map.set(id, {
          id,
          name: cat?.name ?? 'Uncategorised',
          count: 1,
          color: cat?.color,
          icon: cat?.icon,
          logoUrl: cat?.logoUrl,
        });
      }
    }
    return [...map.values()].sort((a, b) => {
      if (a.id === 'uncategorised') return 1;
      if (b.id === 'uncategorised') return -1;
      return a.name.localeCompare(b.name);
    });
  }, [products]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return products
      .filter((product) => {
        if (visibility === 'active' && !product.active) return false;
        if (visibility === 'hidden' && product.active) return false;
        if (readyFilter === 'ready' && !isReady(product)) return false;
        if (readyFilter === 'attention' && isReady(product)) return false;
        if (categoryFilter !== 'all' && categoryKey(product) !== categoryFilter) return false;
        if (!needle) return true;
        return `${product.name} ${product.description} ${product.category?.name ?? ''} ${product.panelEggId} ${product.panelNodeId ?? ''}`
          .toLowerCase()
          .includes(needle);
      })
      .sort((a, b) => {
        const catA = a.category?.sortOrder ?? (a.category ? 0 : 999);
        const catB = b.category?.sortOrder ?? (b.category ? 0 : 999);
        if (catA !== catB) return catA - catB;
        const nameA = a.category?.name ?? 'Uncategorised';
        const nameB = b.category?.name ?? 'Uncategorised';
        const byName = nameA.localeCompare(nameB);
        if (byName !== 0) return byName;
        const order = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
        if (order !== 0) return order;
        return a.name.localeCompare(b.name);
      });
  }, [products, visibility, readyFilter, categoryFilter, query]);

  const filtersActive =
    visibility !== 'all' ||
    readyFilter !== 'all' ||
    categoryFilter !== 'all' ||
    Boolean(query.trim());

  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    if (visibility === 'active') parts.push('Live');
    if (visibility === 'hidden') parts.push('Hidden');
    if (readyFilter === 'ready') parts.push('Provision ready');
    if (readyFilter === 'attention') parts.push('Needs attention');
    if (categoryFilter !== 'all') {
      parts.push(categories.find((c) => c.id === categoryFilter)?.name || 'Category');
    }
    if (query.trim()) parts.push(`“${query.trim()}”`);
    return parts;
  }, [visibility, readyFilter, categoryFilter, query, categories]);

  function clearFilters() {
    setVisibility('all');
    setReadyFilter('all');
    setCategoryFilter('all');
    setQuery('');
  }

  function setChipFilter(next: { visibility?: VisibilityFilter; ready?: ReadyFilter }) {
    setVisibility(next.visibility ?? 'all');
    setReadyFilter(next.ready ?? 'all');
    setCategoryFilter('all');
    setQuery('');
  }

  async function moveProduct(productId: string, direction: -1 | 1) {
    const product = products.find((item) => item.id === productId);
    if (!product) return;
    const key = categoryKey(product);
    const siblings = products
      .filter((item) => categoryKey(item) === key)
      .sort((a, b) => {
        const order = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
        if (order !== 0) return order;
        return a.name.localeCompare(b.name);
      });
    const index = siblings.findIndex((item) => item.id === productId);
    const swapIndex = index + direction;
    if (index < 0 || swapIndex < 0 || swapIndex >= siblings.length) return;

    const nextOrder = siblings.map((item) => item.id);
    [nextOrder[index], nextOrder[swapIndex]] = [nextOrder[swapIndex], nextOrder[index]];
    const updates = nextOrder.map((id, sortOrder) => ({ id, sortOrder }));

    setReorderingId(productId);
    setProducts((list) =>
      list.map((item) => {
        const update = updates.find((entry) => entry.id === item.id);
        return update ? { ...item, sortOrder: update.sortOrder } : item;
      }),
    );

    try {
      await Promise.all(
        updates.map((update) =>
          api(`/admin/products/${update.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ sortOrder: update.sortOrder }),
          }),
        ),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reorder plans');
      const refreshed = await api<Product[]>('/admin/products').catch(() => null);
      if (refreshed) setProducts(refreshed);
    } finally {
      setReorderingId(null);
    }
  }

  function siblingIndex(product: Product) {
    const key = categoryKey(product);
    const siblings = products
      .filter((item) => categoryKey(item) === key)
      .sort((a, b) => {
        const order = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
        if (order !== 0) return order;
        return a.name.localeCompare(b.name);
      });
    return {
      index: siblings.findIndex((item) => item.id === product.id),
      total: siblings.length,
    };
  }

  return (
    <div className="ops-users ops-products">
      <header className="ops-users__mast">
        <div className="ops-users__mast-copy">
          <span>Catalog</span>
          <h1>Products</h1>
          <p>Hosting plans, pricing, and Spirit-Panel provisioning maps.</p>
        </div>
        <div className="ops-users__mast-meta">
          <button
            type="button"
            className={`ops-users__chip${!filtersActive ? ' is-active' : ''}`}
            onClick={clearFilters}
            title="Show all products"
          >
            <span className="ops-users__chip-icon" aria-hidden>
              <Package size={14} />
            </span>
            <span className="ops-users__chip-copy">
              <small>Catalog</small>
              <strong>{stats.total}</strong>
            </span>
          </button>
          <button
            type="button"
            className={`ops-users__chip is-ok${
              visibility === 'active' && readyFilter === 'all' && categoryFilter === 'all' && !query.trim()
                ? ' is-active'
                : ''
            }`}
            onClick={() => setChipFilter({ visibility: 'active' })}
            title="Show live products"
          >
            <span className="ops-users__chip-icon" aria-hidden>
              <Eye size={14} />
            </span>
            <span className="ops-users__chip-copy">
              <small>Live</small>
              <strong>{stats.active}</strong>
            </span>
          </button>
          <button
            type="button"
            className={`ops-users__chip${stats.hidden ? ' is-warn' : ''}${
              visibility === 'hidden' && readyFilter === 'all' && categoryFilter === 'all' && !query.trim()
                ? ' is-active'
                : ''
            }`}
            onClick={() => setChipFilter({ visibility: 'hidden' })}
            title="Show hidden products"
          >
            <span className="ops-users__chip-icon" aria-hidden>
              <EyeOff size={14} />
            </span>
            <span className="ops-users__chip-copy">
              <small>Hidden</small>
              <strong>{stats.hidden}</strong>
            </span>
          </button>
          <button
            type="button"
            className={`ops-users__chip${stats.attention ? ' is-warn' : ''}${
              readyFilter === 'attention' && visibility === 'all' && categoryFilter === 'all' && !query.trim()
                ? ' is-active'
                : ''
            }`}
            onClick={() => setChipFilter({ ready: 'attention' })}
            title="Show products missing egg or node"
          >
            <span className="ops-users__chip-icon" aria-hidden>
              <TriangleAlert size={14} />
            </span>
            <span className="ops-users__chip-copy">
              <small>Attention</small>
              <strong>{stats.attention}</strong>
            </span>
          </button>
        </div>
      </header>

      {error ? <div className="ds-alert ds-alert--error">{error}</div> : null}

      <div className="ops-users__shell">
        <aside className="ops-users__rail" aria-label="Product filters">
          <div className="ops-users__rail-block">
            <span>Visibility</span>
            <div>
              {(
                [
                  ['all', 'Any visibility', stats.total],
                  ['active', 'Live', stats.active],
                  ['hidden', 'Hidden', stats.hidden],
                ] as const
              ).map(([value, label, count]) => (
                <button
                  key={value}
                  type="button"
                  className={visibility === value ? 'is-on' : ''}
                  onClick={() => setVisibility(value)}
                >
                  {label}
                  <em>{count}</em>
                </button>
              ))}
            </div>
          </div>

          <div className="ops-users__rail-block">
            <span>Provision</span>
            <div>
              {(
                [
                  ['all', 'Any mapping', stats.total],
                  ['ready', 'Ready', stats.ready],
                  ['attention', 'Needs attention', stats.attention],
                ] as const
              ).map(([value, label, count]) => (
                <button
                  key={value}
                  type="button"
                  className={readyFilter === value ? 'is-on' : ''}
                  onClick={() => setReadyFilter(value)}
                >
                  {label}
                  <em>{count}</em>
                </button>
              ))}
            </div>
          </div>

          {categories.length ? (
            <div className="ops-users__rail-block">
              <span>Category</span>
              <div>
                <button
                  type="button"
                  className={categoryFilter === 'all' ? 'is-on' : ''}
                  onClick={() => setCategoryFilter('all')}
                >
                  All categories
                  <em>{stats.total}</em>
                </button>
                {categories.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    className={categoryFilter === category.id ? 'is-on' : ''}
                    onClick={() => setCategoryFilter(category.id)}
                  >
                    {category.name}
                    <em>{category.count}</em>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </aside>

        <div className="ops-users__main">
          <div className="ops-users__command ops-products__command">
            <label className="ops-users__search">
              <Search size={16} aria-hidden />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    setQuery('');
                  }
                }}
                placeholder="Filter by plan, category, egg, or node"
                aria-label="Search products"
              />
              {query ? (
                <button
                  type="button"
                  className="ops-users__search-clear"
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                >
                  <X size={14} />
                </button>
              ) : null}
            </label>

            <div className="ops-services__jobs" role="group" aria-label="Catalog actions">
              <Link className="ops-services__create" to="/admin/products/new">
                <Plus size={14} /> New
              </Link>
              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  setLoading(true);
                  void load();
                }}
              >
                <RefreshCw size={14} /> Refresh
              </button>
            </div>

            <div className="ops-users__command-meta">
              <span>
                Showing <strong>{filtered.length}</strong> / {stats.total}
                {stats.services ? (
                  <>
                    {' '}
                    · <strong>{stats.services}</strong> services
                  </>
                ) : null}
              </span>
              {filtersActive ? (
                <>
                  <span className="ops-users__filter-summary">{filterSummary.join(' · ')}</span>
                  <button type="button" className="ops-users__clear" onClick={clearFilters}>
                    Clear
                  </button>
                </>
              ) : null}
            </div>
          </div>

          <section className="ops-users__table" aria-label="Products">
            <div className="ops-users__head ops-products__head" aria-hidden>
              <span>Order</span>
              <span>Plan</span>
              <span>Price</span>
              <span>Resources</span>
              <span>Services</span>
              <span>Status</span>
              <span />
            </div>

            {loading ? (
              <div className="ops-users__empty">
                <RefreshCw size={22} />
                <h3>Loading catalog…</h3>
              </div>
            ) : (
              filtered.map((product) => {
                const ready = isReady(product);
                const { index, total } = siblingIndex(product);
                const services = product._count?.services ?? 0;
                return (
                  <div key={product.id} className="ops-products__row-wrap">
                    <div className="ops-products__sort" onClick={(event) => event.stopPropagation()}>
                      <button
                        type="button"
                        aria-label={`Move ${product.name} up`}
                        disabled={index <= 0 || reorderingId === product.id}
                        onClick={() => void moveProduct(product.id, -1)}
                      >
                        <ChevronUp size={14} />
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${product.name} down`}
                        disabled={index < 0 || index >= total - 1 || reorderingId === product.id}
                        onClick={() => void moveProduct(product.id, 1)}
                      >
                        <ChevronDown size={14} />
                      </button>
                    </div>
                    <button
                      type="button"
                      className={`ops-users__row ops-products__row${!product.active ? ' is-hidden' : ''}${
                        !ready ? ' is-attention' : ''
                      }`}
                      onClick={() => navigate(`/admin/products/${product.id}`)}
                    >
                      <span className="ops-products__who">
                        <CategoryMark
                          icon={product.category?.icon}
                          logoUrl={product.category?.logoUrl}
                          color={product.category?.color}
                          size={34}
                          className="ops-services__mark"
                        />
                        <span>
                          <strong>{product.name}</strong>
                          <small>{product.category?.name ?? 'Uncategorised'}</small>
                          <em>
                            #{index + 1}
                            {!ready ? ' · Mapping needed' : ''}
                          </em>
                        </span>
                      </span>

                      <span className="ops-products__price">
                        <strong>{money(product.priceCents, product.currency)}</strong>
                        <small>/ {cycleAdminLabel(product.cycle)}</small>
                      </span>

                      <span className="ops-products__specs">
                        <span>
                          <MemoryStick size={11} aria-hidden /> {formatAdminResource(product.memoryMb)}
                        </span>
                        <span>
                          <Cpu size={11} aria-hidden />{' '}
                          {product.cpuPercent <= 0 ? '∞ CPU' : `${product.cpuPercent}%`}
                        </span>
                        <span>
                          <HardDrive size={11} aria-hidden /> {formatAdminResource(product.diskMb)}
                        </span>
                      </span>

                      <span className="ops-products__services">
                        <Server size={13} aria-hidden />
                        <strong>{services}</strong>
                      </span>

                      <span className="ops-products__badges">
                        <span className={`ops-products__status${product.active ? ' is-live' : ' is-off'}`}>
                          {product.active ? (
                            <>
                              <Eye size={12} aria-hidden /> Live
                            </>
                          ) : (
                            <>
                              <EyeOff size={12} aria-hidden /> Hidden
                            </>
                          )}
                        </span>
                        {!ready ? (
                          <span className="ops-products__status is-warn">
                            <TriangleAlert size={12} aria-hidden /> Map
                          </span>
                        ) : (
                          <span className="ops-products__status is-live">
                            <ShieldCheck size={12} aria-hidden /> Ready
                          </span>
                        )}
                      </span>

                      <ChevronRight size={16} aria-hidden />
                    </button>
                  </div>
                );
              })
            )}

            {!loading && !filtered.length ? (
              <div className="ops-users__empty">
                <Package size={24} />
                <h3>{products.length ? 'No matching products' : 'No products yet'}</h3>
                <p>
                  {products.length
                    ? 'Try another search or clear the filters.'
                    : 'Create a hosting plan and map it to Spirit-Panel.'}
                </p>
                {!products.length ? (
                  <Link to="/admin/products/new" className="ops-services__create">
                    <Plus size={14} /> New product
                  </Link>
                ) : (
                  <button type="button" className="ops-users__clear" onClick={clearFilters}>
                    Clear filters
                  </button>
                )}
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}

export function AdminProductEdit() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isNew = !id || id === 'new';
  const prefillCategoryId = searchParams.get('categoryId') || '';

  const [form, setForm] = useState<ProductForm>(() => ({
    ...emptyForm,
    categoryId: prefillCategoryId,
  }));
  const [categories, setCategories] = useState<Category[]>([]);
  const [catalog, setCatalog] = useState<PanelCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [serviceCount, setServiceCount] = useState(0);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const eggGroups = useMemo(() => groupEggs(catalog?.eggs ?? []), [catalog?.eggs]);
  const availableNodes = catalog?.nodes ?? [];

  async function loadCatalog(preferAutoSelect: boolean) {
    setRefreshing(true);
    try {
      const data = await api<PanelCatalog>('/admin/panel/catalog');
      setCatalog(data);
      if (preferAutoSelect) {
        setForm((f) => {
          const next = { ...f };
          if (!next.panelEggId && data.eggs[0]) next.panelEggId = data.eggs[0].id;
          if (!next.panelNodeId) {
            const node = data.nodes.find((n) => !n.maintenanceMode) ?? data.nodes[0];
            if (node) next.panelNodeId = node.id;
          }
          return next;
        });
      }
      return data;
    } catch (err) {
      setCatalog({
        panelApiUrl: '',
        panelKeyConfigured: false,
        eggs: [],
        nodes: [],
        eggsError: err instanceof ApiError ? err.message : 'Could not load panel catalog',
        nodesError: err instanceof ApiError ? err.message : 'Could not load panel catalog',
      });
      return null;
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    async function boot() {
      setLoading(true);
      try {
        const cats = await api<Category[]>('/admin/categories');
        setCategories(cats.filter((c) => c.active !== false));

        if (!isNew && id) {
          const product = await api<Product>(`/admin/products/${id}`);
          setForm({
            name: product.name,
            description: product.description,
            features: product.features?.length ? product.features : [...DEFAULT_FEATURES],
            categoryId: product.categoryId ?? '',
            priceCents: product.priceCents,
            currency: product.currency,
            cycle: product.cycle,
            freeTrialDays: product.freeTrialDays ?? 0,
            active: product.active,
            sortOrder: product.sortOrder ?? 0,
            panelEggId: product.panelEggId,
            panelNodeId: product.panelNodeId ?? '',
            memoryMb: product.memoryMb,
            diskMb: product.diskMb,
            cpuPercent: product.cpuPercent,
            backupLimit: product.backupLimit,
            databaseLimit: product.databaseLimit,
            allocationLimit: product.allocationLimit ?? 1,
            subdomainAccess: Boolean(product.subdomainAccess),
            fivemMarketplaceAccess: Boolean(product.fivemMarketplaceAccess),
            minecraftPluginsAccess: Boolean(product.minecraftPluginsAccess),
          });
          setServiceCount(product._count?.services ?? 0);
          await loadCatalog(false);
        } else {
          setForm((current) => ({
            ...current,
            categoryId: current.categoryId || prefillCategoryId,
          }));
          await loadCatalog(true);
        }
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not load product');
      } finally {
        setLoading(false);
      }
    }
    void boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isNew]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    const payload = {
      ...form,
      features: form.features.map((item) => item.trim()).filter(Boolean),
      categoryId: form.categoryId || null,
      panelNodeId: form.panelNodeId || null,
    };
    try {
      if (isNew) {
        const created = await api<Product>('/admin/products', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        navigate(`/admin/products/${created.id}`, { replace: true });
        setMessage('Product created.');
      } else {
        await api(`/admin/products/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        setMessage('Product saved.');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save product');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (isNew || !id) return;
    setDeleting(true);
    try {
      await api(`/admin/products/${id}`, { method: 'DELETE' });
      navigate('/admin/products');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Delete failed');
      setDeleteModalOpen(false);
    } finally {
      setDeleting(false);
    }
  }

  const eggsReady = (catalog?.eggs.length ?? 0) > 0;
  const nodesReady = (catalog?.nodes.length ?? 0) > 0;
  const selectedCategory = categories.find((category) => category.id === form.categoryId);
  const selectedEgg = catalog?.eggs.find((egg) => egg.id === form.panelEggId);
  const selectedNode = catalog?.nodes.find((node) => node.id === form.panelNodeId);
  const hasName = Boolean(form.name.trim());
  const hasEgg = Boolean(form.panelEggId);
  const hasNode = Boolean(form.panelNodeId);
  const productReady = hasName && hasEgg && hasNode;
  const missingSetup = (
    [
      [!hasName, 'Name', 'identity'],
      [!hasEgg, 'Server egg', 'mapping'],
      [!hasNode, 'Destination node', 'mapping'],
    ] as const
  )
    .filter(([missing]) => missing)
    .map(([, label, target]) => ({ label, target }));
  const readyBits = [hasName, form.priceCents >= 0, hasEgg, hasNode].filter(Boolean).length;
  const featureCount = form.features.filter((item) => item.trim()).length;
  const activePreset = RESOURCE_PRESETS.find(
    (preset) =>
      preset.memoryMb === form.memoryMb &&
      preset.cpuPercent === form.cpuPercent &&
      preset.diskMb === form.diskMb &&
      preset.backupLimit === form.backupLimit &&
      preset.databaseLimit === form.databaseLimit &&
      preset.allocationLimit === form.allocationLimit,
  );
  const priceMajor = ((form.priceCents || 0) / 100).toFixed(2);
  const capabilityCount = [
    form.subdomainAccess,
    form.fivemMarketplaceAccess,
    form.minecraftPluginsAccess,
  ].filter(Boolean).length;

  function applyPreset(preset: (typeof RESOURCE_PRESETS)[number]) {
    setForm((current) => ({
      ...current,
      memoryMb: preset.memoryMb,
      cpuPercent: preset.cpuPercent,
      diskMb: preset.diskMb,
      backupLimit: preset.backupLimit,
      databaseLimit: preset.databaseLimit,
      allocationLimit: preset.allocationLimit,
    }));
  }

  function scrollToSection(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  if (loading) {
    return (
      <div className="ops-user ops-prod">
        <Link to="/admin/products" className="ops-user__back">
          <ArrowLeft size={14} /> Products
        </Link>
        <div className="ops-user__loading">
          <RefreshCw size={22} />
          <span>Loading product…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="ops-user ops-prod">
      <Link to="/admin/products" className="ops-user__back">
        <ArrowLeft size={14} /> Products
      </Link>

      {error ? <div className="ops-user__alert is-error">{error}</div> : null}
      {message ? <div className="ops-user__alert is-info">{message}</div> : null}

      <header className="ops-user__mast">
        <div className="ops-user__identity">
          <CategoryMark
            icon={selectedCategory?.icon}
            logoUrl={selectedCategory?.logoUrl}
            color={selectedCategory?.color}
            size={48}
            className="ops-svc__mark"
          />
          <div className="ops-user__identity-copy">
            <span>{isNew ? 'New product' : 'Product'}</span>
            <h1>{form.name.trim() || (isNew ? 'Untitled plan' : 'Product')}</h1>
            <p>
              {isNew
                ? 'Shape a sellable plan — identity, price, panel map, and resources.'
                : `${serviceCount} service${serviceCount === 1 ? '' : 's'} · ${selectedCategory?.name || 'Uncategorised'}`}
            </p>
            <div className="ops-user__badges">
              <span className={`ops-user__state${form.active ? ' is-on' : ' is-off'}`}>
                <i />
                {form.active ? 'Live' : 'Hidden'}
              </span>
              <span className={`ops-prod__pill${productReady ? ' is-ok' : ' is-warn'}`}>
                {productReady ? <ShieldCheck size={11} /> : <TriangleAlert size={11} />}
                {productReady ? 'Provision ready' : 'Mapping incomplete'}
              </span>
              {selectedCategory ? (
                <span className="ops-prod__pill">{selectedCategory.name}</span>
              ) : (
                <span className="ops-prod__pill">Uncategorised</span>
              )}
              {capabilityCount ? (
                <span className="ops-prod__pill">
                  {capabilityCount} add-on{capabilityCount === 1 ? '' : 's'}
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <div className="ops-user__actions">
          <div className="ops-prod__mast-price" aria-hidden>
            <small>Client price</small>
            <strong>{money(form.priceCents || 0, form.currency)}</strong>
            <em>/ {cycleFullLabel(form.cycle)}</em>
          </div>
          <Link to="/admin/products" className="ops-user__btn is-ghost">
            Cancel
          </Link>
          <button
            type="submit"
            form="ops-prod-form"
            className="ops-user__btn is-primary"
            disabled={saving || !form.name.trim()}
          >
            <Save size={14} />
            {saving ? 'Saving…' : isNew ? 'Create plan' : 'Save'}
          </button>
        </div>
      </header>

      {!productReady ? (
        <div className="ops-svc__attention" role="status">
          <div className="ops-svc__attention-item ops-prod__attention is-warn">
            <span className="ops-prod__attention-icon" aria-hidden>
              <TriangleAlert size={16} />
            </span>
            <div>
              <strong>Setup incomplete</strong>
              <span>Fill the required fields before this plan can provision new servers.</span>
            </div>
            <ul className="ops-prod__attention-gaps">
              {missingSetup.map((item) => (
                <li key={item.label}>
                  <button type="button" onClick={() => scrollToSection(`ops-prod-${item.target}`)}>
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <div className="ops-svc__attention" role="status">
          <div className="ops-svc__attention-item ops-prod__attention is-ready">
            <span className="ops-prod__attention-icon" aria-hidden>
              <ShieldCheck size={16} />
            </span>
            <div>
              <strong>Ready to provision</strong>
              <span>Name, egg, and node are set — new purchases can create servers from this plan.</span>
            </div>
          </div>
        </div>
      )}

      <section className="ops-user__metrics ops-prod__metrics" aria-label="Product metrics">
        <div className="ops-users__chip ops-user__metric">
          <span className="ops-user__metric-icon" aria-hidden>
            <Package size={14} />
          </span>
          <span className="ops-users__chip-copy">
            <small>Price</small>
            <strong className="ops-svc__metric-stack">
              {money(form.priceCents || 0, form.currency)}
              <em>/ {cycleAdminLabel(form.cycle)}</em>
            </strong>
          </span>
        </div>
        <div className="ops-users__chip ops-user__metric">
          <span className="ops-user__metric-icon" aria-hidden>
            <Layers3 size={14} />
          </span>
          <span className="ops-users__chip-copy">
            <small>Cycle</small>
            <strong>{form.cycle}</strong>
          </span>
        </div>
        <div className="ops-users__chip ops-user__metric">
          <span className="ops-user__metric-icon" aria-hidden>
            <MemoryStick size={14} />
          </span>
          <span className="ops-users__chip-copy">
            <small>Specs</small>
            <strong className="ops-svc__metric-stack">
              {formatAdminResource(form.memoryMb)}
              <em>
                {form.cpuPercent <= 0 ? '∞ CPU' : `${form.cpuPercent}%`} · {formatAdminResource(form.diskMb)}
              </em>
            </strong>
          </span>
        </div>
        <div className={`ops-users__chip ops-user__metric${productReady ? ' is-ok' : ' is-warn'}`}>
          <span className="ops-user__metric-icon" aria-hidden>
            {productReady ? <ShieldCheck size={14} /> : <TriangleAlert size={14} />}
          </span>
          <span className="ops-users__chip-copy">
            <small>{isNew ? 'Launch' : 'Services'}</small>
            <strong>{isNew ? `${readyBits}/4` : serviceCount}</strong>
          </span>
        </div>
      </section>

      <div className="ops-prod__desk">
        <form id="ops-prod-form" className="ops-prod__main" onSubmit={onSubmit}>
          <section className="ops-user__panel" id="ops-prod-identity">
            <header>
              <span className="ops-user__panel-icon" aria-hidden>
                <Package size={14} />
              </span>
              <div>
                <h2>Identity</h2>
                <p>Name, category, and description clients see first.</p>
              </div>
            </header>
            <div className="ops-prod__fields">
              <label className="ops-user__field">
                <span>
                  Name <em>Required</em>
                </span>
                <input
                  value={form.name}
                  required
                  placeholder="e.g. Minecraft Performance"
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                />
              </label>
              <label className="ops-user__field">
                <span>Category</span>
                <ThemedSelect
                  ariaLabel="Category"
                  value={form.categoryId}
                  onChange={(categoryId) => {
                    const category = categories.find((item) => item.id === categoryId);
                    setForm({
                      ...form,
                      categoryId,
                      ...(category?.panelEggId ? { panelEggId: category.panelEggId } : {}),
                    });
                  }}
                  options={[
                    { value: '', label: 'No category' },
                    ...categories.map((category) => ({
                      value: category.id,
                      label: category.name,
                      description: category.panelEggId ? 'Egg linked' : 'No egg on category',
                    })),
                  ]}
                />
              </label>
              <label className="ops-user__field ops-prod__full">
                <span>Description</span>
                <textarea
                  rows={3}
                  value={form.description}
                  placeholder="Explain who this plan is designed for…"
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                />
              </label>
            </div>
          </section>

          <section className="ops-user__panel" id="ops-prod-features">
            <header>
              <span className="ops-user__panel-icon" aria-hidden>
                <CheckCircle2 size={14} />
              </span>
              <div>
                <h2>What’s included</h2>
                <p>Feature bullets shown on the storefront card.</p>
              </div>
              <button
                type="button"
                className="ops-user__btn is-ghost"
                disabled={form.features.length >= 20}
                onClick={() => setForm({ ...form, features: [...form.features, ''] })}
              >
                <Plus size={13} /> Add
              </button>
            </header>
            <div className="ops-prod__features">
              <div className="ops-prod__features-list">
                {form.features.map((feature, index) => (
                  <div key={`feature-${index}`} className="ops-prod__feature-row">
                    <em aria-hidden>{String(index + 1).padStart(2, '0')}</em>
                    <input
                      value={feature}
                      maxLength={120}
                      placeholder="e.g. Instant server deployment"
                      onChange={(event) => {
                        const features = [...form.features];
                        features[index] = event.target.value;
                        setForm({ ...form, features });
                      }}
                    />
                    <div className="ops-prod__feature-actions">
                      <button
                        type="button"
                        aria-label="Move feature up"
                        disabled={index === 0}
                        onClick={() => {
                          if (index === 0) return;
                          const features = [...form.features];
                          [features[index - 1], features[index]] = [features[index], features[index - 1]];
                          setForm({ ...form, features });
                        }}
                      >
                        <ChevronUp size={13} />
                      </button>
                      <button
                        type="button"
                        aria-label="Move feature down"
                        disabled={index >= form.features.length - 1}
                        onClick={() => {
                          if (index >= form.features.length - 1) return;
                          const features = [...form.features];
                          [features[index + 1], features[index]] = [features[index], features[index + 1]];
                          setForm({ ...form, features });
                        }}
                      >
                        <ChevronDown size={13} />
                      </button>
                      <button
                        type="button"
                        className="is-danger"
                        aria-label="Remove feature"
                        disabled={form.features.length <= 1}
                        onClick={() =>
                          setForm({
                            ...form,
                            features: form.features.filter((_, i) => i !== index),
                          })
                        }
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <p className="ops-user__hint">
                Empty lines are removed on save ({featureCount}/20 used).
              </p>
            </div>
          </section>

          <section className="ops-user__panel" id="ops-prod-pricing">
            <header>
              <span className="ops-user__panel-icon" aria-hidden>
                <Layers3 size={14} />
              </span>
              <div>
                <h2>Pricing & visibility</h2>
                <p>Billing cycle, storefront presence, and plan add-ons.</p>
              </div>
            </header>
            <div className="ops-prod__fields ops-prod__fields--3">
              <label className="ops-user__field">
                <span>Price</span>
                <div className="ops-prod__money">
                  <b>£</b>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={priceMajor}
                    required
                    onChange={(event) => {
                      const next = Math.max(0, Math.round(Number(event.target.value || 0) * 100));
                      setForm({ ...form, priceCents: Number.isFinite(next) ? next : 0 });
                    }}
                  />
                </div>
                <p className="ops-user__hint">{money(form.priceCents || 0, form.currency)} charged after any trial</p>
              </label>
              <label className="ops-user__field">
                <span>Free trial days</span>
                <input
                  type="number"
                  min={0}
                  max={3650}
                  step={1}
                  value={form.freeTrialDays}
                  onChange={(event) => {
                    const next = Math.max(0, Math.round(Number(event.target.value || 0)));
                    setForm({ ...form, freeTrialDays: Number.isFinite(next) ? next : 0 });
                  }}
                />
                <p className="ops-user__hint">
                  {form.freeTrialDays > 0
                    ? `Server starts immediately. If unpaid 48 hours after day ${form.freeTrialDays}, it is deleted.`
                    : '0 means no trial. A £0 price is free forever, not a trial.'}
                </p>
              </label>
              <label className="ops-user__field">
                <span>Billing cycle</span>
                <ThemedSelect
                  ariaLabel="Billing cycle"
                  value={form.cycle}
                  onChange={(cycle) => setForm({ ...form, cycle: cycle as ProductForm['cycle'] })}
                  options={[
                    { value: 'monthly', label: 'Monthly', description: 'Billed every month' },
                    { value: 'quarterly', label: 'Quarterly', description: 'Billed every three months' },
                    { value: 'yearly', label: 'Yearly', description: 'Billed once per year' },
                  ]}
                />
              </label>
              <label className="ops-user__field">
                <span>Sort priority</span>
                <input
                  type="number"
                  value={form.sortOrder}
                  onChange={(event) => setForm({ ...form, sortOrder: Number(event.target.value) })}
                />
                <p className="ops-user__hint">Lower values appear first</p>
              </label>
            </div>

            <div className="ops-prod__toggles">
              {(
                [
                  {
                    key: 'active',
                    icon: form.active ? <Eye size={16} /> : <EyeOff size={16} />,
                    title: form.active ? 'Visible in storefront' : 'Hidden from storefront',
                    body: form.active
                      ? 'Customers can browse and purchase this product.'
                      : 'This product is hidden from customers.',
                    checked: form.active,
                    onChange: (checked: boolean) => setForm({ ...form, active: checked }),
                  },
                  {
                    key: 'subdomain',
                    icon: <Globe2 size={16} />,
                    title: 'Subdomain access',
                    body: form.subdomainAccess
                      ? 'Clients can create a hostname on this plan.'
                      : 'Clients on this plan cannot manage subdomains.',
                    checked: form.subdomainAccess,
                    onChange: (checked: boolean) => setForm({ ...form, subdomainAccess: checked }),
                  },
                  {
                    key: 'fivem',
                    icon: <Package size={16} />,
                    title: 'FiveM marketplace',
                    body: form.fivemMarketplaceAccess
                      ? 'Clients can one-click install marketplace resources.'
                      : 'FiveM marketplace install is disabled.',
                    checked: form.fivemMarketplaceAccess,
                    onChange: (checked: boolean) => setForm({ ...form, fivemMarketplaceAccess: checked }),
                  },
                  {
                    key: 'mc',
                    icon: <Puzzle size={16} />,
                    title: 'Minecraft plugins',
                    body: form.minecraftPluginsAccess
                      ? 'Clients can one-click install plugins.'
                      : 'Minecraft plugin install is disabled.',
                    checked: form.minecraftPluginsAccess,
                    onChange: (checked: boolean) => setForm({ ...form, minecraftPluginsAccess: checked }),
                  },
                ] as const
              ).map((toggle) => (
                <button
                  key={toggle.key}
                  type="button"
                  className={`ops-prod__toggle${toggle.checked ? ' is-on' : ''}`}
                  onClick={() => toggle.onChange(!toggle.checked)}
                >
                  <span aria-hidden>{toggle.icon}</span>
                  <div>
                    <strong>{toggle.title}</strong>
                    <p>{toggle.body}</p>
                  </div>
                  <i>
                    <span />
                  </i>
                </button>
              ))}
            </div>
          </section>

          <section className="ops-user__panel" id="ops-prod-mapping">
            <header>
              <span className="ops-user__panel-icon" aria-hidden>
                <Server size={14} />
              </span>
              <div>
                <h2>Spirit-Panel mapping</h2>
                <p>Software egg and destination node for new servers.</p>
              </div>
              <button
                type="button"
                className="ops-user__btn is-ghost"
                disabled={refreshing}
                onClick={() => void loadCatalog(isNew)}
              >
                <RefreshCw size={13} />
                {refreshing ? 'Syncing…' : 'Sync panel'}
              </button>
            </header>

            <div className="ops-prod__health ops-prod__health--cards">
              <div className={`ops-prod__health-card${catalog?.panelKeyConfigured ? ' is-ok' : ' is-warn'}`}>
                {catalog?.panelKeyConfigured ? <CheckCircle2 size={15} /> : <TriangleAlert size={15} />}
                <div>
                  <strong>API</strong>
                  <small>{catalog?.panelKeyConfigured ? 'Connected' : 'Key missing'}</small>
                </div>
              </div>
              <div className={`ops-prod__health-card${eggsReady ? ' is-ok' : ' is-warn'}`}>
                {eggsReady ? <CheckCircle2 size={15} /> : <TriangleAlert size={15} />}
                <div>
                  <strong>Eggs</strong>
                  <small>{eggsReady ? `${catalog!.eggs.length} synced` : 'Unavailable'}</small>
                </div>
              </div>
              <div className={`ops-prod__health-card${nodesReady ? ' is-ok' : ' is-warn'}`}>
                {nodesReady ? <CheckCircle2 size={15} /> : <TriangleAlert size={15} />}
                <div>
                  <strong>Nodes</strong>
                  <small>{nodesReady ? `${catalog!.nodes.length} synced` : 'Unavailable'}</small>
                </div>
              </div>
            </div>

            {(catalog?.eggsError || catalog?.nodesError) && (
              <div className="ops-user__alert is-info">
                {[catalog.eggsError, catalog.nodesError].filter(Boolean).join(' ')} You can still paste IDs
                manually.
              </div>
            )}

            <div className="ops-prod__fields">
              <label className="ops-user__field">
                <span>
                  Server egg <em>Required</em>
                </span>
                {eggsReady ? (
                  <ThemedSelect
                    ariaLabel="Server egg"
                    value={form.panelEggId}
                    onChange={(panelEggId) => setForm({ ...form, panelEggId })}
                    placeholder="Choose an egg"
                    required
                    disabled={Boolean(selectedCategory?.panelEggId)}
                    options={eggGroups.flatMap(([nest, eggs]) =>
                      eggs.map((egg) => ({ value: egg.id, label: egg.name, group: nest })),
                    )}
                  />
                ) : (
                  <input
                    value={form.panelEggId}
                    onChange={(event) => setForm({ ...form, panelEggId: event.target.value })}
                    placeholder="Paste egg ID"
                    required
                    disabled={Boolean(selectedCategory?.panelEggId)}
                  />
                )}
                <p className="ops-user__hint">
                  {selectedCategory?.panelEggId
                    ? `Locked to category egg${selectedEgg ? ` · ${selectedEgg.nest?.name || 'Panel'} / ${selectedEgg.name}` : ''}`
                    : selectedEgg
                      ? `${selectedEgg.nest?.name || 'Panel'} / ${selectedEgg.name}`
                      : form.panelEggId || 'Software template used when provisioning'}
                </p>
              </label>
              <label className="ops-user__field">
                <span>
                  Destination node <em>Required</em>
                </span>
                {nodesReady ? (
                  <ThemedSelect
                    ariaLabel="Destination node"
                    value={form.panelNodeId}
                    onChange={(panelNodeId) => setForm({ ...form, panelNodeId })}
                    placeholder="Choose a node"
                    required
                    options={availableNodes.map((node) => ({
                      value: node.id,
                      label: node.name,
                      description: `${node.location?.short ? `${node.location.short} · ` : ''}${node.fqdn}${node.maintenanceMode ? ' · Maintenance' : ''}`,
                      disabled: node.maintenanceMode,
                    }))}
                  />
                ) : (
                  <input
                    value={form.panelNodeId}
                    onChange={(event) => setForm({ ...form, panelNodeId: event.target.value })}
                    placeholder="Paste node ID"
                    required
                  />
                )}
                <p className="ops-user__hint">
                  {selectedNode
                    ? `${selectedNode.name} · ${selectedNode.fqdn}`
                    : form.panelNodeId || 'Server location used when provisioning'}
                </p>
              </label>
            </div>
          </section>

          <section className="ops-user__panel" id="ops-prod-resources">
            <header>
              <span className="ops-user__panel-icon" aria-hidden>
                <Cpu size={14} />
              </span>
              <div>
                <h2>Resources</h2>
                <p>Limits allocated to every server created from this plan.</p>
              </div>
            </header>

            <div className="ops-prod__presets" role="group" aria-label="Resource presets">
              {RESOURCE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={activePreset?.id === preset.id ? 'is-on' : ''}
                  onClick={() => applyPreset(preset)}
                >
                  <strong>{preset.label}</strong>
                  <small>{preset.hint}</small>
                </button>
              ))}
            </div>

            <div className="ops-prod__resources">
              {(
                [
                  ['memoryMb', 'Memory', 'MB · 0 = unlimited', <MemoryStick size={16} key="m" />],
                  ['cpuPercent', 'CPU limit', '% · 0 = unlimited', <Cpu size={16} key="c" />],
                  ['diskMb', 'Storage', 'MB · 0 = unlimited', <HardDrive size={16} key="d" />],
                  ['backupLimit', 'Backups', 'slots · 0 = disabled', <Archive size={16} key="b" />],
                  ['databaseLimit', 'Databases', 'slots · 0 = disabled', <Database size={16} key="db" />],
                  ['allocationLimit', 'Allocations', 'ports · 0 = disabled', <Layers3 size={16} key="a" />],
                ] as const
              ).map(([key, label, hint, icon]) => (
                <label key={key} className="ops-prod__resource">
                  <span aria-hidden>{icon}</span>
                  <span>
                    {label}
                    <small>{hint}</small>
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={form[key]}
                    onChange={(event) => setForm({ ...form, [key]: Number(event.target.value) })}
                  />
                </label>
              ))}
            </div>
          </section>

          {!isNew ? (
            <section className="ops-user__panel ops-user__panel--danger">
              <header>
                <span className="ops-user__panel-icon is-danger" aria-hidden>
                  <Trash2 size={14} />
                </span>
                <div>
                  <h2>Delete</h2>
                  <p>Products with existing services cannot be removed.</p>
                </div>
              </header>
              <div className="ops-user__danger">
                <p>
                  {serviceCount > 0
                    ? `${serviceCount} service${serviceCount === 1 ? '' : 's'} currently use this product.`
                    : 'This cannot be undone.'}
                </p>
                <button
                  type="button"
                  className="ops-user__btn is-danger"
                  disabled={serviceCount > 0}
                  onClick={() => setDeleteModalOpen(true)}
                >
                  <Trash2 size={14} /> Delete product
                </button>
              </div>
            </section>
          ) : null}
        </form>

        <aside className="ops-prod__aside">
          <section className="ops-user__panel ops-prod__preview">
            <header>
              <span className="ops-user__panel-icon" aria-hidden>
                <Eye size={14} />
              </span>
              <div>
                <h2>Preview</h2>
                <p>How the plan reads on the storefront.</p>
              </div>
            </header>
            <div
              className="ops-prod__preview-stage"
              style={{ ['--product-color' as string]: selectedCategory?.color || '#5abff2' }}
            >
              <div className="ops-prod__preview-card">
                <div className="ops-prod__preview-top">
                  <CategoryMark
                    icon={selectedCategory?.icon}
                    logoUrl={selectedCategory?.logoUrl}
                    color={selectedCategory?.color}
                    size={40}
                  />
                  <span>{selectedCategory?.name || 'Game hosting'}</span>
                </div>
                <h3>{form.name.trim() || 'Your product name'}</h3>
                <p>{form.description.trim() || 'A short product description will appear here.'}</p>
                <div className="ops-prod__preview-price">
                  <strong>{money(form.priceCents || 0, form.currency)}</strong>
                  <span>/ {cycleFullLabel(form.cycle)}</span>
                </div>
                <div className="ops-prod__preview-specs">
                  <span>
                    <MemoryStick size={12} /> {formatAdminResource(form.memoryMb)}
                  </span>
                  <span>
                    <Cpu size={12} /> {form.cpuPercent <= 0 ? 'Unlimited CPU' : `${form.cpuPercent}%`}
                  </span>
                  <span>
                    <HardDrive size={12} /> {formatAdminResource(form.diskMb)}
                  </span>
                </div>
                {(form.subdomainAccess || form.fivemMarketplaceAccess || form.minecraftPluginsAccess) && (
                  <div className="ops-prod__preview-caps">
                    {form.subdomainAccess ? <span>Subdomains</span> : null}
                    {form.fivemMarketplaceAccess ? <span>FiveM market</span> : null}
                    {form.minecraftPluginsAccess ? <span>MC plugins</span> : null}
                  </div>
                )}
                <ul className="ops-prod__preview-features">
                  {form.features
                    .filter((item) => item.trim())
                    .slice(0, 5)
                    .map((feature) => (
                      <li key={feature}>
                        <CheckCircle2 size={12} /> {feature}
                      </li>
                    ))}
                  {!form.features.some((item) => item.trim()) ? (
                    <li>
                      <CheckCircle2 size={12} /> Add plan features
                    </li>
                  ) : null}
                </ul>
              </div>
            </div>

            <div className="ops-prod__ready">
              <div>
                <span>Launch</span>
                <strong>{readyBits}/4</strong>
              </div>
              <i>
                <span style={{ width: `${(readyBits / 4) * 100}%` }} />
              </i>
              <ul>
                {(
                  [
                    ['Identity', hasName, 'ops-prod-identity'],
                    ['Pricing', form.priceCents >= 0, 'ops-prod-pricing'],
                    ['Server egg', hasEgg, 'ops-prod-mapping'],
                    ['Node', hasNode, 'ops-prod-mapping'],
                  ] as const
                ).map(([label, done, target]) => (
                  <li key={label} className={done ? 'is-done' : ''}>
                    <button type="button" onClick={() => scrollToSection(target)}>
                      {done ? <Check size={11} /> : <i />}
                      {label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="ops-prod__aside-facts">
              <div>
                <small>Features</small>
                <strong>{featureCount}</strong>
              </div>
              <div>
                <small>Preset</small>
                <strong>{activePreset?.label || 'Custom'}</strong>
              </div>
              <div>
                <small>Add-ons</small>
                <strong>{capabilityCount}</strong>
              </div>
            </div>

            <div className="ops-prod__source">
              <Server size={14} aria-hidden />
              <span>
                <strong>Panel source</strong>
                <small>{catalog?.panelApiUrl || 'Not configured'}</small>
              </span>
            </div>
          </section>
        </aside>
      </div>

      <ConfirmModal
        open={deleteModalOpen}
        title={`Delete ${form.name || 'this product'}?`}
        description="This product will be permanently removed from your catalogue."
        confirmLabel="Delete product"
        busy={deleting}
        consequences={[
          `${serviceCount} service${serviceCount === 1 ? '' : 's'} currently use this product.`,
          'Products with existing services cannot be deleted.',
        ]}
        onCancel={() => setDeleteModalOpen(false)}
        onConfirm={() => void remove()}
      />
    </div>
  );
}
