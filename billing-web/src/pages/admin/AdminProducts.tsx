import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
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
  Pencil,
  Plus,
  Puzzle,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  Trash2,
  TriangleAlert,
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

const DEFAULT_FEATURES = [
  'Instant server deployment',
  'DDoS protection included',
  'Full Spirit-Panel access',
];

const emptyForm: ProductForm = {
  name: '',
  description: '',
  features: [...DEFAULT_FEATURES],
  categoryId: '',
  priceCents: 1000,
  currency: 'GBP',
  cycle: 'monthly',
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
  if (cycle === 'monthly') return 'month';
  if (cycle === 'quarterly') return 'quarter';
  if (cycle === 'yearly') return 'year';
  return cycle;
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
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | 'active' | 'hidden' | 'attention'>('all');
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [reorderingId, setReorderingId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    void api<Product[]>('/admin/products')
      .then(setProducts)
      .finally(() => setLoading(false));
  }, []);

  async function remove(id: string) {
    setDeleting(true);
    try {
      await api(`/admin/products/${id}`, { method: 'DELETE' });
      setProducts((list) => list.filter((p) => p.id !== id));
      setDeleteTarget(null);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  }

  const visibleProducts = products.filter((product) => {
    const matchesQuery = `${product.name} ${product.category?.name ?? ''}`
      .toLowerCase()
      .includes(query.trim().toLowerCase());
    const ready = Boolean(product.panelEggId && product.panelNodeId);
    const matchesStatus =
      status === 'all' ||
      (status === 'active' && product.active) ||
      (status === 'hidden' && !product.active) ||
      (status === 'attention' && !ready);
    return matchesQuery && matchesStatus;
  });

  const grouped = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        category: Category | null;
        products: Product[];
      }
    >();

    for (const product of visibleProducts) {
      const key = product.categoryId || product.category?.id || 'uncategorised';
      const existing = map.get(key);
      if (existing) {
        existing.products.push(product);
      } else {
        map.set(key, {
          key,
          category: product.category ?? null,
          products: [product],
        });
      }
    }

    for (const group of map.values()) {
      group.products.sort((a, b) => {
        const order = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
        if (order !== 0) return order;
        return a.name.localeCompare(b.name);
      });
    }

    return [...map.values()].sort((a, b) => {
      if (!a.category && b.category) return 1;
      if (a.category && !b.category) return -1;
      const order = (a.category?.sortOrder ?? 0) - (b.category?.sortOrder ?? 0);
      if (order !== 0) return order;
      return (a.category?.name ?? 'Uncategorised').localeCompare(b.category?.name ?? 'Uncategorised');
    });
  }, [visibleProducts]);

  async function moveProduct(productId: string, direction: -1 | 1) {
    const product = products.find((item) => item.id === productId);
    if (!product) return;
    const categoryKey = product.categoryId || product.category?.id || 'uncategorised';
    const siblings = products
      .filter((item) => (item.categoryId || item.category?.id || 'uncategorised') === categoryKey)
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
      alert(err instanceof ApiError ? err.message : 'Could not reorder plans');
      const refreshed = await api<Product[]>('/admin/products').catch(() => null);
      if (refreshed) setProducts(refreshed);
    } finally {
      setReorderingId(null);
    }
  }

  const activeCount = products.filter((product) => product.active).length;
  const readyCount = products.filter((product) => product.panelEggId && product.panelNodeId).length;
  const serviceCount = products.reduce((total, product) => total + (product._count?.services ?? 0), 0);

  return (
    <div className="ap-v2">
      <header className="ap-v2__header">
        <div>
          <span className="ap-v2__eyebrow">Store catalogue</span>
          <h1>Products</h1>
          <p>Plans grouped by game category. Use the arrows to set storefront order.</p>
        </div>
        <Link className="ap-v2__create" to="/admin/products/new">
          <Plus size={15} /> Create product
        </Link>
      </header>

      <section className="ap-v2-metrics">
        <div><span><Layers3 size={16} /></span><p>Total products<small>All configured plans</small></p><strong>{products.length}</strong></div>
        <div><span><Eye size={16} /></span><p>Live in store<small>{products.length - activeCount} currently hidden</small></p><strong>{activeCount}</strong></div>
        <div><span><ShieldCheck size={16} /></span><p>Provision ready<small>{products.length - readyCount} need attention</small></p><strong>{readyCount}</strong></div>
        <div><span><Server size={16} /></span><p>Services sold<small>Across all products</small></p><strong>{serviceCount}</strong></div>
      </section>

      <section className="ap-v2-toolbar">
        <label>
          <Search size={15} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search products or categories…" />
        </label>
        <div>
          {(['all', 'active', 'hidden', 'attention'] as const).map((option) => (
            <button key={option} type="button" className={status === option ? 'is-active' : ''} onClick={() => setStatus(option)}>
              {option === 'attention' ? 'Needs attention' : option[0].toUpperCase() + option.slice(1)}
            </button>
          ))}
        </div>
      </section>

      {loading ? (
        <div className="ap-v2-loading">Loading product catalogue…</div>
      ) : (
        <div className="ap-v2-groups">
          {grouped.map((group) => {
            const accent = group.category?.color || '#5abff2';
            const isCollapsed = Boolean(collapsed[group.key]);
            return (
              <section
                key={group.key}
                className="ap-v2-group"
                style={{ ['--product-color' as string]: accent }}
              >
                <header className="ap-v2-group__head">
                  <button
                    type="button"
                    className="ap-v2-group__toggle"
                    onClick={() => setCollapsed((prev) => ({ ...prev, [group.key]: !prev[group.key] }))}
                    aria-expanded={!isCollapsed}
                  >
                    <ChevronDown size={16} className={isCollapsed ? '' : 'is-open'} />
                    <CategoryMark
                      icon={group.category?.icon}
                      logoUrl={group.category?.logoUrl}
                      color={group.category?.color}
                      size={36}
                    />
                    <span>
                      <strong>{group.category?.name ?? 'Uncategorised'}</strong>
                      <small>
                        {group.products.length} plan{group.products.length === 1 ? '' : 's'}
                        {group.category?.active === false ? ' · category hidden' : ''}
                      </small>
                    </span>
                  </button>
                  <Link
                    className="ap-v2-group__add"
                    to={group.category ? `/admin/products/new?categoryId=${group.category.id}` : '/admin/products/new'}
                  >
                    <Plus size={13} /> Add plan
                  </Link>
                </header>

                {!isCollapsed && (
                  <div className="ap-v2-rows">
                    {group.products.map((product, index) => {
                      const ready = Boolean(product.panelEggId && product.panelNodeId);
                      return (
                        <article
                          key={product.id}
                          className={`ap-v2-row ${ready ? '' : 'ap-v2-row--attention'} ${product.active ? '' : 'ap-v2-row--hidden'}`}
                        >
                          <div className="ap-v2-row__sort">
                            <button
                              type="button"
                              aria-label={`Move ${product.name} up`}
                              disabled={index === 0 || reorderingId === product.id}
                              onClick={() => void moveProduct(product.id, -1)}
                            >
                              <ChevronUp size={14} />
                            </button>
                            <button
                              type="button"
                              aria-label={`Move ${product.name} down`}
                              disabled={index >= group.products.length - 1 || reorderingId === product.id}
                              onClick={() => void moveProduct(product.id, 1)}
                            >
                              <ChevronDown size={14} />
                            </button>
                          </div>

                          <div className="ap-v2-row__main">
                            <div className="ap-v2-row__title">
                              <h2>{product.name}</h2>
                              <span className={`ap-v2-card__visibility ${product.active ? 'is-live' : ''}`}>
                                {product.active ? <Eye size={12} /> : <EyeOff size={12} />}
                                {product.active ? 'Live' : 'Hidden'}
                              </span>
                              {!ready && (
                                <span className="ap-v2-row__warn">
                                  <TriangleAlert size={12} /> Mapping needed
                                </span>
                              )}
                            </div>
                            <p>
                              {formatAdminResource(product.memoryMb)} RAM ·{' '}
                              {product.cpuPercent <= 0 ? 'Unlimited CPU' : `${product.cpuPercent}% CPU`} ·{' '}
                              {formatAdminResource(product.diskMb)} disk
                            </p>
                          </div>

                          <div className="ap-v2-row__price">
                            <strong>{money(product.priceCents, product.currency)}</strong>
                            <small>/ {cycleAdminLabel(product.cycle)}</small>
                          </div>

                          <div className="ap-v2-row__meta">
                            <span><Server size={12} /> {product._count?.services ?? 0}</span>
                            <span>#{index + 1}</span>
                          </div>

                          <div className="ap-v2-row__actions">
                            <Link to={`/admin/products/${product.id}`}><Pencil size={13} /> Edit</Link>
                            <button type="button" onClick={() => setDeleteTarget(product)} aria-label={`Delete ${product.name}`}>
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}

          {!grouped.length && (
            <div className="ap-v2-empty">
              <Archive size={24} />
              <h2>{products.length ? 'No matching products' : 'Your catalogue is empty'}</h2>
              <p>{products.length ? 'Try another search or filter.' : 'Create your first hosting plan and connect it to Spirit-Panel.'}</p>
              {!products.length && <Link to="/admin/products/new"><Plus size={14} /> Create product</Link>}
            </div>
          )}
        </div>
      )}
      <ConfirmModal
        open={Boolean(deleteTarget)}
        title={`Delete ${deleteTarget?.name ?? 'product'}?`}
        description="This product will be permanently removed from your catalogue."
        confirmLabel="Delete product"
        busy={deleting}
        consequences={['Existing services may prevent deletion.', 'This action cannot be undone.']}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && void remove(deleteTarget.id)}
      />
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
            features:
              product.features?.length
                ? product.features
                : [...DEFAULT_FEATURES],
            categoryId: product.categoryId ?? '',
            priceCents: product.priceCents,
            currency: product.currency,
            cycle: product.cycle,
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

  if (loading) return <div className="ds-muted">Loading product…</div>;

  const eggsReady = (catalog?.eggs.length ?? 0) > 0;
  const nodesReady = (catalog?.nodes.length ?? 0) > 0;
  const selectedCategory = categories.find((category) => category.id === form.categoryId);
  const selectedEgg = catalog?.eggs.find((egg) => egg.id === form.panelEggId);
  const selectedNode = catalog?.nodes.find((node) => node.id === form.panelNodeId);
  const productReady = Boolean(form.name.trim() && form.panelEggId && form.panelNodeId);

  return (
    <div className="ap-builder">
      <header className="ap-builder__header">
        <div>
          <Link to="/admin/products"><ArrowLeft size={14} /> Products</Link>
          <span>{isNew ? 'Create catalogue item' : 'Manage catalogue item'}</span>
          <h1>{isNew ? 'New product' : form.name || 'Edit product'}</h1>
          <p>{isNew ? 'Configure everything needed to sell and automatically provision a server.' : `${serviceCount} live service${serviceCount === 1 ? '' : 's'} use this configuration.`}</p>
        </div>
        <div className={`ap-builder__status ${productReady ? 'is-ready' : ''}`}>
          {productReady ? <CheckCircle2 size={17} /> : <TriangleAlert size={17} />}
          <span><strong>{productReady ? 'Ready to save' : 'Setup incomplete'}</strong><small>{productReady ? 'Required fields are configured' : 'Complete identity and panel mapping'}</small></span>
        </div>
      </header>

      {error && <div className="ds-alert ds-alert--error">{error}</div>}
      {message && <div className="ds-alert ds-alert--info">{message}</div>}

      <div className="ap-builder-layout">
        <form className="ap-builder-form" onSubmit={onSubmit}>
          <section className="ap-builder-section">
            <header><span>01</span><div><h2>Product identity</h2><p>The name, category, and description customers see.</p></div></header>
            <div className="ap-builder-fields ap-builder-fields--2">
              <label><span>Product name</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Minecraft Performance" required /></label>
              <label>
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
              <label className="is-wide"><span>Description</span><textarea rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Explain who this plan is designed for…" /></label>
              <div className="ap-builder-features is-wide">
                <div className="ap-builder-features__head">
                  <span>
                    Plan features
                    <small>Shown under “What’s included” on the storefront</small>
                  </span>
                  <button
                    type="button"
                    disabled={form.features.length >= 20}
                    onClick={() => setForm({ ...form, features: [...form.features, ''] })}
                  >
                    <Plus size={13} /> Add feature
                  </button>
                </div>
                <div className="ap-builder-features__list">
                  {form.features.map((feature, index) => (
                    <div key={`feature-${index}`} className="ap-builder-features__row">
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
                      <div className="ap-builder-features__actions">
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
                <small>
                  Tip: lead with protection, panel access, and deployment. Keep each line under ~60 characters.
                  Empty lines are removed on save ({form.features.filter((item) => item.trim()).length}/20 used).
                </small>
              </div>
            </div>
          </section>

          <section className="ap-builder-section">
            <header><span>02</span><div><h2>Pricing & visibility</h2><p>Control billing and how the product appears in the store.</p></div></header>
            <div className="ap-builder-fields ap-builder-fields--3">
              <label><span>Price in pence</span><div className="ap-builder-money"><b>£</b><input type="number" min={0} value={form.priceCents} onChange={(event) => setForm({ ...form, priceCents: Number(event.target.value) })} required /></div><small>{money(form.priceCents || 0, form.currency)} charged to clients</small></label>
              <label><span>Billing cycle</span><ThemedSelect ariaLabel="Billing cycle" value={form.cycle} onChange={(cycle) => setForm({ ...form, cycle: cycle as ProductForm['cycle'] })} options={[{ value: 'monthly', label: 'Monthly', description: 'Billed every month' }, { value: 'quarterly', label: 'Quarterly', description: 'Billed every three months' }, { value: 'yearly', label: 'Yearly', description: 'Billed once per year' }]} /></label>
              <label><span>Sort priority</span><input type="number" value={form.sortOrder} onChange={(event) => setForm({ ...form, sortOrder: Number(event.target.value) })} /><small>Lower values appear first</small></label>
            </div>
            <label className={`ap-builder-toggle ${form.active ? 'is-active' : ''}`}>
              <span className="ap-builder-toggle__icon">{form.active ? <Eye size={16} /> : <EyeOff size={16} />}</span>
              <span><strong>Visible in storefront</strong><small>{form.active ? 'Customers can browse and purchase this product.' : 'This product is hidden from customers.'}</small></span>
              <input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /><i />
            </label>
            <label className={`ap-builder-toggle ${form.subdomainAccess ? 'is-active' : ''}`}>
              <span className="ap-builder-toggle__icon"><Globe2 size={16} /></span>
              <span>
                <strong>Subdomain access</strong>
                <small>
                  {form.subdomainAccess
                    ? 'Clients can create a hostname on this plan (requires Cloudflare DNS in Spirit-Panel).'
                    : 'Clients on this plan cannot manage subdomains.'}
                </small>
              </span>
              <input
                type="checkbox"
                checked={form.subdomainAccess}
                onChange={(event) => setForm({ ...form, subdomainAccess: event.target.checked })}
              />
              <i />
            </label>
            <label className={`ap-builder-toggle ${form.fivemMarketplaceAccess ? 'is-active' : ''}`}>
              <span className="ap-builder-toggle__icon"><Package size={16} /></span>
              <span>
                <strong>FiveM marketplace</strong>
                <small>
                  {form.fivemMarketplaceAccess
                    ? 'Clients can one-click install marketplace resources on FiveM servers.'
                    : 'FiveM marketplace install is disabled on this plan.'}
                </small>
              </span>
              <input
                type="checkbox"
                checked={form.fivemMarketplaceAccess}
                onChange={(event) => setForm({ ...form, fivemMarketplaceAccess: event.target.checked })}
              />
              <i />
            </label>
            <label className={`ap-builder-toggle ${form.minecraftPluginsAccess ? 'is-active' : ''}`}>
              <span className="ap-builder-toggle__icon"><Puzzle size={16} /></span>
              <span>
                <strong>Minecraft plugins</strong>
                <small>
                  {form.minecraftPluginsAccess
                    ? 'Clients can one-click install plugins (e.g. Modrinth) on Minecraft servers.'
                    : 'Minecraft plugin install is disabled on this plan.'}
                </small>
              </span>
              <input
                type="checkbox"
                checked={form.minecraftPluginsAccess}
                onChange={(event) => setForm({ ...form, minecraftPluginsAccess: event.target.checked })}
              />
              <i />
            </label>
          </section>

          <section className="ap-builder-section">
            <header className="ap-builder-section__split">
              <span>03</span>
              <div><h2>Spirit-Panel mapping</h2><p>Select the software template and destination node.</p></div>
              <button type="button" disabled={refreshing} onClick={() => void loadCatalog(isNew)}><RefreshCw size={13} className={refreshing ? 'admin-spin' : undefined} />{refreshing ? 'Syncing…' : 'Sync panel'}</button>
            </header>

            <div className="ap-builder-panel-health">
              <span className={catalog?.panelKeyConfigured ? 'is-ok' : ''}>{catalog?.panelKeyConfigured ? <CheckCircle2 size={13} /> : <TriangleAlert size={13} />} API connection</span>
              <span className={eggsReady ? 'is-ok' : ''}>{eggsReady ? <CheckCircle2 size={13} /> : <TriangleAlert size={13} />} {eggsReady ? `${catalog!.eggs.length} eggs synced` : 'Eggs unavailable'}</span>
              <span className={nodesReady ? 'is-ok' : ''}>{nodesReady ? <CheckCircle2 size={13} /> : <TriangleAlert size={13} />} {nodesReady ? `${catalog!.nodes.length} nodes synced` : 'Nodes unavailable'}</span>
            </div>

            {(catalog?.eggsError || catalog?.nodesError) && <div className="ds-alert ds-alert--info">{[catalog.eggsError, catalog.nodesError].filter(Boolean).join(' ')} You can still paste IDs manually.</div>}

            <div className="ap-builder-fields ap-builder-fields--2">
              <label>
                <span>Server egg <b>Required</b></span>
                {eggsReady ? (
                  <ThemedSelect
                    ariaLabel="Server egg"
                    value={form.panelEggId}
                    onChange={(panelEggId) => setForm({ ...form, panelEggId })}
                    placeholder="Choose an egg"
                    required
                    disabled={Boolean(selectedCategory?.panelEggId)}
                    options={eggGroups.flatMap(([nest, eggs]) => eggs.map((egg) => ({ value: egg.id, label: egg.name, group: nest })))}
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
                <small>
                  {selectedCategory?.panelEggId
                    ? `Locked to category egg${selectedEgg ? ` · ${selectedEgg.nest?.name || 'Panel'} / ${selectedEgg.name}` : ''}`
                    : selectedEgg
                      ? `${selectedEgg.nest?.name || 'Panel'} / ${selectedEgg.name}`
                      : form.panelEggId || 'Software template used when provisioning'}
                </small>
              </label>
              <label>
                <span>Destination node <b>Required</b></span>
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
                ) : <input value={form.panelNodeId} onChange={(event) => setForm({ ...form, panelNodeId: event.target.value })} placeholder="Paste node ID" required />}
                <small>{selectedNode ? `${selectedNode.name} · ${selectedNode.fqdn}` : form.panelNodeId || 'Server location used when provisioning'}</small>
              </label>
            </div>
          </section>

          <section className="ap-builder-section">
            <header><span>04</span><div><h2>Server resources</h2><p>Limits allocated to every server created from this product.</p></div></header>
            <div className="ap-builder-resources">
              <label><MemoryStick size={16} /><span>Memory<small>MB · 0 = unlimited</small></span><input type="number" min={0} value={form.memoryMb} onChange={(event) => setForm({ ...form, memoryMb: Number(event.target.value) })} /></label>
              <label><Cpu size={16} /><span>CPU limit<small>% · 0 = unlimited</small></span><input type="number" min={0} value={form.cpuPercent} onChange={(event) => setForm({ ...form, cpuPercent: Number(event.target.value) })} /></label>
              <label><HardDrive size={16} /><span>Storage<small>MB · 0 = unlimited</small></span><input type="number" min={0} value={form.diskMb} onChange={(event) => setForm({ ...form, diskMb: Number(event.target.value) })} /></label>
              <label><Archive size={16} /><span>Backups<small>slots · 0 = disabled</small></span><input type="number" min={0} value={form.backupLimit} onChange={(event) => setForm({ ...form, backupLimit: Number(event.target.value) })} /></label>
              <label><Database size={16} /><span>Databases<small>slots · 0 = disabled</small></span><input type="number" min={0} value={form.databaseLimit} onChange={(event) => setForm({ ...form, databaseLimit: Number(event.target.value) })} /></label>
              <label><Layers3 size={16} /><span>Allocations<small>ports · 0 = disabled</small></span><input type="number" min={0} value={form.allocationLimit} onChange={(event) => setForm({ ...form, allocationLimit: Number(event.target.value) })} /></label>
            </div>
          </section>

          <footer className="ap-builder-actions">
            <div>{!isNew && <button className="is-danger" type="button" onClick={() => setDeleteModalOpen(true)}><Trash2 size={14} /> Delete product</button>}</div>
            <Link to="/admin/products">Cancel</Link>
            <button className="is-primary" disabled={saving} type="submit">{saving ? 'Saving product…' : isNew ? 'Create product' : 'Save changes'}<ArrowRight size={15} /></button>
          </footer>
        </form>

        <aside className="ap-builder-aside">
          <section className="ap-builder-preview">
            <header><span>Storefront preview</span><small>Updates as you type</small></header>
            <article style={{ ['--product-color' as string]: selectedCategory?.color || '#5abff2' }}>
              <div className="ap-builder-preview__glow" />
              <div className="ap-builder-preview__top">
                <CategoryMark icon={selectedCategory?.icon} logoUrl={selectedCategory?.logoUrl} color={selectedCategory?.color} size={42} />
                <span>{selectedCategory?.name || 'Game hosting'}</span>
              </div>
              <h2>{form.name || 'Your product name'}</h2>
              <p>{form.description || 'A short product description will appear here for customers.'}</p>
              <div className="ap-builder-preview__price"><strong>{money(form.priceCents || 0, form.currency)}</strong><span>/ {form.cycle}</span></div>
              <div className="ap-builder-preview__specs">
                <span><MemoryStick size={13} /> {form.memoryMb <= 0 ? 'Unlimited' : `${form.memoryMb.toLocaleString()} MB`}</span>
                <span><Cpu size={13} /> {form.cpuPercent <= 0 ? 'Unlimited CPU' : `${form.cpuPercent}% CPU`}</span>
                <span><HardDrive size={13} /> {form.diskMb <= 0 ? 'Unlimited' : `${form.diskMb.toLocaleString()} MB`}</span>
              </div>
              <div className="ap-builder-preview__features">
                <div className="ap-builder-preview__features-head">
                  <span>What’s included</span>
                  <em>{form.features.filter((item) => item.trim()).length || 0}</em>
                </div>
                <ul>
                  {form.features.filter((item) => item.trim()).slice(0, 6).map((feature) => (
                    <li key={feature}><CheckCircle2 size={12} /> {feature}</li>
                  ))}
                  {!form.features.some((item) => item.trim()) && (
                    <li><CheckCircle2 size={12} /> Add plan features</li>
                  )}
                </ul>
              </div>
              <button type="button">Add to cart <ArrowRight size={14} /></button>
            </article>
          </section>

          <section className="ap-builder-checklist">
            <header><span>Launch checklist</span><strong>{[Boolean(form.name), Boolean(form.priceCents >= 0), Boolean(form.panelEggId), Boolean(form.panelNodeId)].filter(Boolean).length}/4</strong></header>
            <div className={form.name ? 'is-done' : ''}>{form.name ? <CheckCircle2 size={14} /> : <span />} Product identity</div>
            <div className={form.priceCents >= 0 ? 'is-done' : ''}>{form.priceCents >= 0 ? <CheckCircle2 size={14} /> : <span />} Pricing configured</div>
            <div className={form.panelEggId ? 'is-done' : ''}>{form.panelEggId ? <CheckCircle2 size={14} /> : <span />} Server egg selected</div>
            <div className={form.panelNodeId ? 'is-done' : ''}>{form.panelNodeId ? <CheckCircle2 size={14} /> : <span />} Destination node selected</div>
          </section>

          <section className="ap-builder-source"><Server size={15} /><span><strong>Panel source</strong><small>{catalog?.panelApiUrl || 'Not configured'}</small></span></section>
        </aside>
      </div>
      <ConfirmModal
        open={deleteModalOpen}
        title={`Delete ${form.name || 'this product'}?`}
        description="This product will be permanently removed from your catalogue."
        confirmLabel="Delete product"
        busy={deleting}
        consequences={[`${serviceCount} service${serviceCount === 1 ? '' : 's'} currently use this product.`, 'Products with existing services cannot be deleted.']}
        onCancel={() => setDeleteModalOpen(false)}
        onConfirm={() => void remove()}
      />
    </div>
  );
}
