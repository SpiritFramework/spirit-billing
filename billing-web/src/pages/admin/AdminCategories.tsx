import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Gamepad2,
  Image,
  Layers3,
  LayoutGrid,
  Palette,
  Plus,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import {
  CATEGORY_COLOR_OPTIONS,
  CATEGORY_ICON_OPTIONS,
  CategoryIcon,
  CategoryMark,
} from '../../lib/icons';
import { ConfirmModal } from '../../components/ConfirmModal';
import { ThemedSelect } from '../../components/ThemedSelect';

type PanelEgg = {
  id: string;
  name: string;
  nest?: { id: string; name: string } | null;
};

type Category = {
  id: string;
  name: string;
  slug?: string;
  description: string;
  color?: string;
  icon?: string;
  logoUrl?: string | null;
  panelEggId?: string | null;
  sortOrder: number;
  active: boolean;
  _count?: { products: number };
};

type CategoryForm = {
  name: string;
  description: string;
  sortOrder: number;
  active: boolean;
  color: string;
  icon: string;
  logoUrl: string;
  panelEggId: string;
};

const emptyForm: CategoryForm = {
  name: '',
  description: '',
  sortOrder: 0,
  active: true,
  color: '#6366f1',
  icon: 'gamepad',
  logoUrl: '',
  panelEggId: '',
};

export function AdminCategories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'hidden'>('all');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    setError('');
    try {
      setCategories(await api<Category[]>('/admin/categories'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load categories');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function remove(category: Category) {
    setDeleting(true);
    setError('');
    setMessage('');
    try {
      await api(`/admin/categories/${category.id}`, { method: 'DELETE' });
      setCategories((list) => list.filter((item) => item.id !== category.id));
      setDeleteTarget(null);
      setMessage(`${category.name} was deleted.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete category');
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return categories.filter((category) => {
      const matchesFilter =
        filter === 'all' || (filter === 'active' ? category.active : !category.active);
      const matchesQuery = `${category.name} ${category.slug ?? ''} ${category.description}`
        .toLowerCase()
        .includes(needle);
      return matchesFilter && matchesQuery;
    });
  }, [categories, filter, query]);

  const activeCount = categories.filter((category) => category.active).length;
  const productCount = categories.reduce((sum, category) => sum + (category._count?.products ?? 0), 0);
  const customLogoCount = categories.filter((category) => Boolean(category.logoUrl)).length;

  return (
    <div className="category-admin-v2">
      <header className="category-admin-v2__header">
        <div>
          <span>Storefront architecture</span>
          <h1>Categories</h1>
          <p>Shape how clients discover products with distinct collections, artwork, and positioning.</p>
        </div>
        <Link to="/admin/categories/new"><Plus size={15} /> Create category</Link>
      </header>

      {error && <div className="ds-alert ds-alert--error">{error}</div>}
      {message && <div className="ds-alert ds-alert--success">{message}</div>}

      <section className="category-admin-metrics">
        <article><span className="is-blue"><LayoutGrid size={17} /></span><div><small>Collections</small><strong>{categories.length}</strong><p>Total storefront categories</p></div></article>
        <article><span className="is-green"><Eye size={17} /></span><div><small>Published</small><strong>{activeCount}</strong><p>Visible to clients</p></div></article>
        <article><span className="is-purple"><Layers3 size={17} /></span><div><small>Products</small><strong>{productCount}</strong><p>Plans organised</p></div></article>
        <article><span className="is-amber"><Image size={17} /></span><div><small>Custom artwork</small><strong>{customLogoCount}</strong><p>Categories using logos</p></div></article>
      </section>

      <section className="category-admin-toolbar">
        <div><span>Category directory</span><h2>Store collections</h2></div>
        <label><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, slug, or description…" /></label>
        <div>
          {([
            ['all', 'All'],
            ['active', 'Published'],
            ['hidden', 'Hidden'],
          ] as const).map(([value, label]) => (
            <button type="button" key={value} className={filter === value ? 'is-active' : ''} onClick={() => setFilter(value)}>{label}</button>
          ))}
        </div>
      </section>

      {loading ? (
        <div className="category-admin-empty"><RefreshCw size={26} /><h3>Loading categories…</h3></div>
      ) : (
        <section className="category-admin-grid">
          {visible.map((category) => (
            <article
              key={category.id}
              className="category-admin-card"
              style={{ ['--category-color' as string]: category.color || '#6366f1' }}
            >
              <div className="category-admin-card__visual">
                <span className="category-admin-card__glow" />
                <CategoryMark icon={category.icon} logoUrl={category.logoUrl} color={category.color} size={54} />
                <span className={category.active ? 'is-live' : 'is-hidden'}>
                  {category.active ? <><Eye size={11} /> Published</> : <><EyeOff size={11} /> Hidden</>}
                </span>
              </div>
              <div className="category-admin-card__body">
                <small>{category.slug || 'category'}</small>
                <h2>{category.name}</h2>
                <p>{category.description || 'Add a short description to introduce this collection to clients.'}</p>
                <div>
                  <span><Layers3 size={12} /> {category._count?.products ?? 0} product{category._count?.products === 1 ? '' : 's'}</span>
                  <span>{category.panelEggId ? 'Egg linked' : 'No egg'}</span>
                  <span>Position {category.sortOrder}</span>
                </div>
              </div>
              <footer>
                <Link to={`/admin/categories/${category.id}`}>Open builder <ArrowRight size={13} /></Link>
                <button type="button" aria-label={`Delete ${category.name}`} onClick={() => setDeleteTarget(category)}><Trash2 size={13} /></button>
              </footer>
            </article>
          ))}
          {!visible.length && (
            <div className="category-admin-empty">
              <Gamepad2 size={28} />
              <h3>{categories.length ? 'No matching categories' : 'Build your first category'}</h3>
              <p>{categories.length ? 'Try another search or visibility filter.' : 'Create a collection to organise products in Game Hosting.'}</p>
              {!categories.length && <Link to="/admin/categories/new"><Plus size={13} /> Create category</Link>}
            </div>
          )}
        </section>
      )}

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title={`Delete ${deleteTarget?.name ?? 'category'}?`}
        description="This permanently removes the category from your storefront."
        confirmLabel="Delete category"
        busyLabel="Deleting…"
        busy={deleting}
        requireText={deleteTarget?.name}
        consequences={[
          `${deleteTarget?._count?.products ?? 0} product(s) currently use this category.`,
          'Categories with assigned products cannot be deleted.',
          'This action cannot be undone.',
        ]}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) void remove(deleteTarget);
        }}
      />
    </div>
  );
}

export function AdminCategoryEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id || id === 'new';
  const [form, setForm] = useState<CategoryForm>(emptyForm);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!isNew);
  const [logoBroken, setLogoBroken] = useState(false);
  const [productCount, setProductCount] = useState(0);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [eggs, setEggs] = useState<PanelEgg[]>([]);
  const [eggsError, setEggsError] = useState('');

  useEffect(() => {
    void api<PanelEgg[]>('/admin/panel/eggs')
      .then((list) => {
        setEggs(list);
        setEggsError('');
      })
      .catch((err) => {
        setEggs([]);
        setEggsError(err instanceof ApiError ? err.message : 'Could not load panel eggs');
      });
  }, []);

  useEffect(() => {
    if (isNew) {
      setForm(emptyForm);
      setLoading(false);
      return;
    }
    setLoading(true);
    void api<Category>(`/admin/categories/${id}`)
      .then((category) => {
        setForm({
          name: category.name,
          description: category.description,
          sortOrder: category.sortOrder,
          active: category.active,
          color: category.color || '#6366f1',
          icon: category.icon || 'gamepad',
          logoUrl: category.logoUrl || '',
          panelEggId: category.panelEggId || '',
        });
        setProductCount(category._count?.products ?? 0);
        setLogoBroken(false);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load category'))
      .finally(() => setLoading(false));
  }, [id, isNew]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    const payload = {
      ...form,
      logoUrl: form.logoUrl.trim() || null,
      panelEggId: form.panelEggId.trim() || null,
    };
    try {
      if (isNew) {
        const created = await api<Category>('/admin/categories', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        navigate(`/admin/categories/${created.id}`, { replace: true });
        setMessage('Category created and ready for products.');
      } else {
        await api(`/admin/categories/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        setMessage('Category changes published.');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save category');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (isNew || !id) return;
    setDeleting(true);
    setError('');
    try {
      await api(`/admin/categories/${id}`, { method: 'DELETE' });
      navigate('/admin/categories');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete category');
      setDeleteModalOpen(false);
    } finally {
      setDeleting(false);
    }
  }

  const liveLogo = form.logoUrl.trim();
  const showLogo = Boolean(liveLogo && /^https?:\/\//i.test(liveLogo) && !logoBroken);
  const selectedEgg = eggs.find((egg) => egg.id === form.panelEggId);
  const completion = [
    form.name.trim(),
    form.description.trim(),
    form.color,
    form.icon,
    form.panelEggId.trim(),
  ].filter(Boolean).length;

  if (loading) return <div className="category-builder-loading"><RefreshCw size={26} /><span>Loading category builder…</span></div>;

  return (
    <div className="category-builder-v2">
      <Link to="/admin/categories" className="category-builder-v2__back"><ArrowLeft size={14} /> Category directory</Link>

      <header className="category-builder-v2__header">
        <div>
          <span>{isNew ? 'New collection' : 'Category builder'}</span>
          <h1>{isNew ? 'Create category' : `Edit ${form.name || 'category'}`}</h1>
          <p>{isNew ? 'Design a clear storefront destination for a group of hosting products.' : `${productCount} product${productCount === 1 ? '' : 's'} currently belong to this collection.`}</p>
        </div>
        <div>
          <Link to="/admin/categories">Cancel</Link>
          <button type="submit" form="category-builder-form" disabled={saving || !form.name.trim()}><Save size={14} /> {saving ? 'Saving…' : isNew ? 'Create category' : 'Save changes'}</button>
        </div>
      </header>

      {error && <div className="ds-alert ds-alert--error">{error}</div>}
      {message && <div className="ds-alert ds-alert--success">{message}</div>}

      <div className="category-builder-layout">
        <form id="category-builder-form" className="category-builder-form" onSubmit={onSubmit}>
          <section>
            <header><span>01</span><div><h2>Collection identity</h2><p>Name and describe the category clients will browse.</p></div></header>
            <div className="category-builder-fields">
              <label className="is-wide"><span>Category name <small>Required</small></span><input value={form.name} maxLength={64} required placeholder="e.g. Minecraft Hosting" onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
              <label><span>Store position</span><input type="number" value={form.sortOrder} onChange={(event) => setForm({ ...form, sortOrder: Number(event.target.value) })} /></label>
              <label className="is-full"><span>Description <small>{form.description.length}/500</small></span><textarea rows={4} maxLength={500} value={form.description} placeholder="Explain what makes this collection useful…" onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
            </div>
          </section>

          <section>
            <header><span>02</span><div><h2>Spirit-Panel egg</h2><p>Pick the panel egg this game category uses for products and imports.</p></div></header>
            {eggsError && <div className="ds-alert ds-alert--info">{eggsError} You can paste an egg ID manually.</div>}
            <div className="category-builder-fields">
              <label className="is-full">
                <span>Panel egg <small>Recommended</small></span>
                {eggs.length > 0 ? (
                  <ThemedSelect
                    ariaLabel="Panel egg"
                    value={form.panelEggId}
                    onChange={(panelEggId) => setForm({ ...form, panelEggId })}
                    placeholder="Choose the egg for this game"
                    options={[
                      { value: '', label: 'No egg linked' },
                      ...eggs.map((egg) => ({
                        value: egg.id,
                        label: egg.name,
                        group: egg.nest?.name || 'Other',
                      })),
                    ]}
                  />
                ) : (
                  <input
                    value={form.panelEggId}
                    onChange={(event) => setForm({ ...form, panelEggId: event.target.value })}
                    placeholder="Paste Spirit-Panel egg ID"
                  />
                )}
                <small>
                  {selectedEgg
                    ? `${selectedEgg.nest?.name || 'Panel'} / ${selectedEgg.name} · products and panel sync use this egg`
                    : form.panelEggId
                      ? 'Egg ID saved — sync panel eggs to see its name'
                      : 'Without an egg, imports match this category by name only'}
                </small>
              </label>
            </div>
          </section>

          <section>
            <header><span>03</span><div><h2>Visual language</h2><p>Choose the accent and mark used throughout the storefront.</p></div></header>
            <div className="category-builder-appearance">
              <div>
                <label>Accent colour</label>
                <div className="category-builder-swatches">
                  {CATEGORY_COLOR_OPTIONS.map((color) => (
                    <button key={color} type="button" className={form.color === color ? 'is-active' : ''} style={{ ['--swatch' as string]: color }} onClick={() => setForm({ ...form, color })} aria-label={`Use ${color}`}>
                      {form.color === color && <Check size={12} />}
                    </button>
                  ))}
                  <label className="category-builder-color-custom" title="Custom colour"><Palette size={13} /><input type="color" value={form.color} onChange={(event) => setForm({ ...form, color: event.target.value })} /></label>
                </div>
              </div>
              <div>
                <label>Fallback icon</label>
                <div className="category-builder-icons">
                  {CATEGORY_ICON_OPTIONS.map((icon) => (
                    <button key={icon} type="button" title={icon} className={form.icon === icon ? 'is-active' : ''} style={{ ['--category-color' as string]: form.color }} onClick={() => setForm({ ...form, icon })}>
                      <CategoryIcon name={icon} size={18} />
                    </button>
                  ))}
                </div>
              </div>
              <label className="category-builder-logo">
                <span>Custom logo URL <small>Optional · overrides the icon</small></span>
                <div><Image size={14} /><input type="url" value={form.logoUrl} placeholder="https://cdn.example.com/game-logo.png" onChange={(event) => { setLogoBroken(false); setForm({ ...form, logoUrl: event.target.value }); }} /></div>
              </label>
            </div>
          </section>

          <section>
            <header><span>04</span><div><h2>Storefront visibility</h2><p>Control whether clients can discover this collection.</p></div></header>
            <button type="button" className={`category-builder-publish ${form.active ? 'is-active' : ''}`} onClick={() => setForm({ ...form, active: !form.active })}>
              <span>{form.active ? <Eye size={17} /> : <EyeOff size={17} />}</span>
              <div><strong>{form.active ? 'Published on Game Hosting' : 'Hidden from clients'}</strong><p>{form.active ? 'Clients can browse this category and its active products.' : 'The category remains available to admins but is removed from the storefront.'}</p></div>
              <i><span /></i>
            </button>
          </section>

          {!isNew && (
            <section className="category-builder-danger">
              <header><span><Trash2 size={14} /></span><div><h2>Delete category</h2><p>Only empty categories can be permanently removed.</p></div></header>
              <button type="button" disabled={productCount > 0} onClick={() => setDeleteModalOpen(true)}>Delete category</button>
            </section>
          )}
        </form>

        <aside className="category-builder-preview">
          <header><div><span>Live storefront preview</span><h2>Client experience</h2></div><Sparkles size={17} /></header>
          <div className="category-builder-preview__stage" style={{ ['--category-color' as string]: form.color }}>
            <div className="category-builder-preview__card">
              <span className="category-builder-preview__glow" />
              {showLogo ? (
                <img src={liveLogo} alt="" onError={() => setLogoBroken(true)} />
              ) : (
                <CategoryMark icon={form.icon} color={form.color} size={54} />
              )}
              <small>{form.active ? 'Available now' : 'Hidden preview'}</small>
              <h3>{form.name || 'Category name'}</h3>
              <p>{form.description || 'Your category description will appear here for clients.'}</p>
              <div><span>{productCount} plan{productCount === 1 ? '' : 's'}</span><strong>Browse collection <ArrowRight size={12} /></strong></div>
            </div>
          </div>
          <section>
            <div><span>Builder completion</span><strong>{completion}/5</strong></div>
            <i><span style={{ width: `${(completion / 5) * 100}%` }} /></i>
            <ul>
              <li className={form.name.trim() ? 'is-done' : ''}><Check size={11} /> Category name</li>
              <li className={form.description.trim() ? 'is-done' : ''}><Check size={11} /> Store description</li>
              <li className={form.panelEggId.trim() ? 'is-done' : ''}><Check size={11} /> Panel egg</li>
              <li className={form.color ? 'is-done' : ''}><Check size={11} /> Accent selected</li>
              <li className={form.icon ? 'is-done' : ''}><Check size={11} /> Visual mark</li>
            </ul>
          </section>
        </aside>
      </div>

      <ConfirmModal
        open={deleteModalOpen}
        title={`Delete ${form.name || 'this category'}?`}
        description="This category will be permanently removed from Game Hosting."
        confirmLabel="Delete category"
        busyLabel="Deleting…"
        busy={deleting}
        requireText={form.name || undefined}
        consequences={[
          `${productCount} product${productCount === 1 ? '' : 's'} currently use this category.`,
          'Products must be reassigned before deletion.',
          'This action cannot be undone.',
        ]}
        onCancel={() => setDeleteModalOpen(false)}
        onConfirm={() => void remove()}
      />
    </div>
  );
}
