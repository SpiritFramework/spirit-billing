import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronRight,
  Eye,
  EyeOff,
  Image,
  Layers3,
  LayoutGrid,
  Link2,
  Palette,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  Unlink,
  X,
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
  backgroundUrl?: string | null;
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
  backgroundUrl: string;
  panelEggId: string;
};

type VisibilityFilter = 'all' | 'active' | 'hidden';
type EggFilter = 'all' | 'linked' | 'unlinked';
type ArtFilter = 'all' | 'logo' | 'icon';

const emptyForm: CategoryForm = {
  name: '',
  description: '',
  sortOrder: 0,
  active: true,
  color: '#6366f1',
  icon: 'gamepad',
  logoUrl: '',
  backgroundUrl: '',
  panelEggId: '',
};

export function AdminCategories() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [visibility, setVisibility] = useState<VisibilityFilter>('all');
  const [eggFilter, setEggFilter] = useState<EggFilter>('all');
  const [artFilter, setArtFilter] = useState<ArtFilter>('all');
  const [error, setError] = useState('');

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

  const stats = useMemo(() => {
    const active = categories.filter((c) => c.active).length;
    const hidden = categories.length - active;
    const linked = categories.filter((c) => Boolean(c.panelEggId)).length;
    const logos = categories.filter((c) => Boolean(c.logoUrl)).length;
    const products = categories.reduce((sum, c) => sum + (c._count?.products ?? 0), 0);
    return {
      total: categories.length,
      active,
      hidden,
      linked,
      unlinked: categories.length - linked,
      logos,
      icons: categories.length - logos,
      products,
    };
  }, [categories]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return categories.filter((category) => {
      if (visibility === 'active' && !category.active) return false;
      if (visibility === 'hidden' && category.active) return false;
      if (eggFilter === 'linked' && !category.panelEggId) return false;
      if (eggFilter === 'unlinked' && category.panelEggId) return false;
      if (artFilter === 'logo' && !category.logoUrl) return false;
      if (artFilter === 'icon' && category.logoUrl) return false;
      if (!needle) return true;
      return `${category.name} ${category.slug ?? ''} ${category.description} ${category.panelEggId ?? ''}`
        .toLowerCase()
        .includes(needle);
    });
  }, [categories, visibility, eggFilter, artFilter, query]);

  const filtersActive =
    visibility !== 'all' || eggFilter !== 'all' || artFilter !== 'all' || Boolean(query.trim());

  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    if (visibility === 'active') parts.push('Published');
    if (visibility === 'hidden') parts.push('Hidden');
    if (eggFilter === 'linked') parts.push('Egg linked');
    if (eggFilter === 'unlinked') parts.push('No egg');
    if (artFilter === 'logo') parts.push('Custom logo');
    if (artFilter === 'icon') parts.push('Icon only');
    if (query.trim()) parts.push(`“${query.trim()}”`);
    return parts;
  }, [visibility, eggFilter, artFilter, query]);

  function clearFilters() {
    setVisibility('all');
    setEggFilter('all');
    setArtFilter('all');
    setQuery('');
  }

  function setChipFilter(next: {
    visibility?: VisibilityFilter;
    egg?: EggFilter;
    art?: ArtFilter;
  }) {
    setVisibility(next.visibility ?? 'all');
    setEggFilter(next.egg ?? 'all');
    setArtFilter(next.art ?? 'all');
    setQuery('');
  }

  return (
    <div className="ops-users ops-categories">
      <header className="ops-users__mast">
        <div className="ops-users__mast-copy">
          <span>Catalog</span>
          <h1>Categories</h1>
          <p>Storefront collections, panel eggs, and plan groupings for Game Hosting.</p>
        </div>
        <div className="ops-users__mast-meta">
          <button
            type="button"
            className={`ops-users__chip${!filtersActive ? ' is-active' : ''}`}
            onClick={clearFilters}
            title="Show all categories"
          >
            <span className="ops-users__chip-icon" aria-hidden>
              <LayoutGrid size={14} />
            </span>
            <span className="ops-users__chip-copy">
              <small>Catalog</small>
              <strong>{stats.total}</strong>
            </span>
          </button>
          <button
            type="button"
            className={`ops-users__chip is-ok${
              visibility === 'active' && eggFilter === 'all' && artFilter === 'all' && !query.trim()
                ? ' is-active'
                : ''
            }`}
            onClick={() => setChipFilter({ visibility: 'active' })}
            title="Show published categories"
          >
            <span className="ops-users__chip-icon" aria-hidden>
              <Eye size={14} />
            </span>
            <span className="ops-users__chip-copy">
              <small>Published</small>
              <strong>{stats.active}</strong>
            </span>
          </button>
          <button
            type="button"
            className={`ops-users__chip${stats.hidden ? ' is-warn' : ''}${
              visibility === 'hidden' && eggFilter === 'all' && artFilter === 'all' && !query.trim()
                ? ' is-active'
                : ''
            }`}
            onClick={() => setChipFilter({ visibility: 'hidden' })}
            title="Show hidden categories"
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
            className={`ops-users__chip${
              eggFilter === 'unlinked' && visibility === 'all' && artFilter === 'all' && !query.trim()
                ? ' is-active'
                : ''
            }${stats.unlinked ? ' is-warn' : ''}`}
            onClick={() => setChipFilter({ egg: 'unlinked' })}
            title="Show categories without a panel egg"
          >
            <span className="ops-users__chip-icon" aria-hidden>
              <Unlink size={14} />
            </span>
            <span className="ops-users__chip-copy">
              <small>No egg</small>
              <strong>{stats.unlinked}</strong>
            </span>
          </button>
        </div>
      </header>

      {error ? <div className="ds-alert ds-alert--error">{error}</div> : null}

      <div className="ops-users__shell">
        <aside className="ops-users__rail" aria-label="Category filters">
          <div className="ops-users__rail-block">
            <span>Visibility</span>
            <div>
              {(
                [
                  ['all', 'Any visibility', stats.total],
                  ['active', 'Published', stats.active],
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
            <span>Panel egg</span>
            <div>
              {(
                [
                  ['all', 'Any linkage', stats.total],
                  ['linked', 'Egg linked', stats.linked],
                  ['unlinked', 'No egg', stats.unlinked],
                ] as const
              ).map(([value, label, count]) => (
                <button
                  key={value}
                  type="button"
                  className={eggFilter === value ? 'is-on' : ''}
                  onClick={() => setEggFilter(value)}
                >
                  {label}
                  <em>{count}</em>
                </button>
              ))}
            </div>
          </div>

          <div className="ops-users__rail-block">
            <span>Artwork</span>
            <div>
              {(
                [
                  ['all', 'Any artwork', stats.total],
                  ['logo', 'Custom logo', stats.logos],
                  ['icon', 'Icon only', stats.icons],
                ] as const
              ).map(([value, label, count]) => (
                <button
                  key={value}
                  type="button"
                  className={artFilter === value ? 'is-on' : ''}
                  onClick={() => setArtFilter(value)}
                >
                  {label}
                  <em>{count}</em>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <div className="ops-users__main">
          <div className="ops-users__command ops-categories__command">
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
                placeholder="Filter by name, slug, description, or egg ID"
                aria-label="Search categories"
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
              <Link className="ops-services__create" to="/admin/categories/new">
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
                {stats.products ? (
                  <>
                    {' '}
                    · <strong>{stats.products}</strong> products
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

          <section className="ops-users__table" aria-label="Categories">
            <div className="ops-users__head ops-categories__head" aria-hidden>
              <span>Category</span>
              <span>Products</span>
              <span>Egg</span>
              <span>Position</span>
              <span>Status</span>
              <span />
            </div>

            {loading ? (
              <div className="ops-users__empty">
                <RefreshCw size={22} />
                <h3>Loading catalog…</h3>
              </div>
            ) : (
              filtered.map((category) => {
                const products = category._count?.products ?? 0;
                return (
                  <button
                    type="button"
                    key={category.id}
                    className={`ops-users__row ops-categories__row${!category.active ? ' is-hidden' : ''}`}
                    onClick={() => navigate(`/admin/categories/${category.id}`)}
                  >
                    <span className="ops-categories__who">
                      <CategoryMark
                        icon={category.icon}
                        logoUrl={category.logoUrl}
                        color={category.color}
                        size={34}
                        className="ops-services__mark"
                      />
                      <span>
                        <strong>{category.name}</strong>
                        <small>{category.slug || '—'}</small>
                        <em>
                          {category.description?.trim()
                            ? category.description.trim().slice(0, 72) +
                              (category.description.trim().length > 72 ? '…' : '')
                            : 'No description'}
                        </em>
                      </span>
                    </span>

                    <span className="ops-categories__products">
                      <Layers3 size={13} aria-hidden />
                      <strong>{products}</strong>
                      <small>plan{products === 1 ? '' : 's'}</small>
                    </span>

                    <span className={`ops-categories__egg${category.panelEggId ? ' is-on' : ''}`}>
                      {category.panelEggId ? (
                        <>
                          <Link2 size={12} aria-hidden /> Linked
                        </>
                      ) : (
                        <>
                          <Unlink size={12} aria-hidden /> None
                        </>
                      )}
                    </span>

                    <span className="ops-categories__pos">
                      <strong>{category.sortOrder}</strong>
                    </span>

                    <span className={`ops-categories__status${category.active ? ' is-live' : ' is-off'}`}>
                      {category.active ? (
                        <>
                          <Eye size={12} aria-hidden /> Live
                        </>
                      ) : (
                        <>
                          <EyeOff size={12} aria-hidden /> Hidden
                        </>
                      )}
                    </span>

                    <ChevronRight size={16} aria-hidden />
                  </button>
                );
              })
            )}

            {!loading && !filtered.length ? (
              <div className="ops-users__empty">
                <LayoutGrid size={24} />
                <h3>{categories.length ? 'No matching categories' : 'No categories yet'}</h3>
                <p>
                  {categories.length
                    ? 'Try another search or clear the filters.'
                    : 'Create a collection so products can group under Game Hosting.'}
                </p>
                {!categories.length ? (
                  <Link to="/admin/categories/new" className="ops-services__create">
                    <Plus size={14} /> New category
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
  const [backgroundBroken, setBackgroundBroken] = useState(false);
  const [productCount, setProductCount] = useState(0);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [eggs, setEggs] = useState<PanelEgg[]>([]);
  const [eggsError, setEggsError] = useState('');
  const [slug, setSlug] = useState('');

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
      setSlug('');
      setProductCount(0);
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
          backgroundUrl: category.backgroundUrl || '',
          panelEggId: category.panelEggId || '',
        });
        setSlug(category.slug || '');
        setProductCount(category._count?.products ?? 0);
        setLogoBroken(false);
        setBackgroundBroken(false);
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
      backgroundUrl: form.backgroundUrl.trim() || null,
      panelEggId: form.panelEggId.trim() || null,
    };
    try {
      if (isNew) {
        const created = await api<Category>('/admin/categories', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        navigate(`/admin/categories/${created.id}`, { replace: true });
        setMessage('Category created.');
      } else {
        const updated = await api<Category>(`/admin/categories/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        if (updated.slug) setSlug(updated.slug);
        setMessage('Category saved.');
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
  const liveBackground = form.backgroundUrl.trim();
  const showLogo = Boolean(liveLogo && /^https?:\/\//i.test(liveLogo) && !logoBroken);
  const showBackground = Boolean(liveBackground && /^https?:\/\//i.test(liveBackground) && !backgroundBroken);
  const selectedEgg = eggs.find((egg) => egg.id === form.panelEggId);
  const readyBits = [
    form.name.trim(),
    form.description.trim(),
    form.panelEggId.trim(),
    form.color,
    form.icon || form.logoUrl.trim(),
  ].filter(Boolean).length;

  if (loading) {
    return (
      <div className="ops-user ops-cat">
        <Link to="/admin/categories" className="ops-user__back">
          <ArrowLeft size={14} /> Categories
        </Link>
        <div className="ops-user__loading">
          <RefreshCw size={22} />
          <span>Loading category…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="ops-user ops-cat">
      <Link to="/admin/categories" className="ops-user__back">
        <ArrowLeft size={14} /> Categories
      </Link>

      {error ? <div className="ops-user__alert is-error">{error}</div> : null}
      {message ? <div className="ops-user__alert is-info">{message}</div> : null}

      <header className="ops-user__mast">
        <div className="ops-user__identity">
          <CategoryMark
            icon={form.icon}
            logoUrl={liveLogo || null}
            color={form.color}
            size={44}
            className="ops-svc__mark"
          />
          <div className="ops-user__identity-copy">
            <span>{isNew ? 'New category' : 'Category'}</span>
            <h1>{form.name.trim() || (isNew ? 'Untitled collection' : 'Category')}</h1>
            <p>
              {isNew
                ? 'Define identity, panel egg, and storefront visibility.'
                : slug
                  ? `/${slug} · ${productCount} product${productCount === 1 ? '' : 's'}`
                  : `${productCount} product${productCount === 1 ? '' : 's'}`}
            </p>
            <div className="ops-user__badges">
              <span className={`ops-user__state${form.active ? ' is-on' : ' is-off'}`}>
                <i />
                {form.active ? 'Published' : 'Hidden'}
              </span>
              {form.panelEggId ? (
                <span className="ops-cat__pill is-egg">
                  <Link2 size={11} /> Egg linked
                </span>
              ) : (
                <span className="ops-cat__pill">
                  <Unlink size={11} /> No egg
                </span>
              )}
              {liveLogo ? (
                <span className="ops-cat__pill">
                  <Image size={11} /> Custom logo
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <div className="ops-user__actions">
          <Link to="/admin/categories" className="ops-user__btn is-ghost">
            Cancel
          </Link>
          <button
            type="submit"
            form="ops-cat-form"
            className="ops-user__btn is-primary"
            disabled={saving || !form.name.trim()}
          >
            <Save size={14} />
            {saving ? 'Saving…' : isNew ? 'Create' : 'Save'}
          </button>
        </div>
      </header>

      <section className="ops-user__metrics" aria-label="Category metrics">
        <div className="ops-users__chip ops-user__metric">
          <span className="ops-user__metric-icon" aria-hidden>
            <Layers3 size={14} />
          </span>
          <span className="ops-users__chip-copy">
            <small>Products</small>
            <strong>{productCount}</strong>
          </span>
        </div>
        <div className="ops-users__chip ops-user__metric">
          <span className="ops-user__metric-icon" aria-hidden>
            <LayoutGrid size={14} />
          </span>
          <span className="ops-users__chip-copy">
            <small>Position</small>
            <strong>{form.sortOrder}</strong>
          </span>
        </div>
        <div className={`ops-users__chip ops-user__metric${!form.panelEggId ? ' is-warn' : ''}`}>
          <span className="ops-user__metric-icon" aria-hidden>
            {form.panelEggId ? <Link2 size={14} /> : <Unlink size={14} />}
          </span>
          <span className="ops-users__chip-copy">
            <small>Panel egg</small>
            <strong>{form.panelEggId ? 'Linked' : 'None'}</strong>
          </span>
        </div>
        <div className={`ops-users__chip ops-user__metric${!form.active ? ' is-warn' : ' is-ok'}`}>
          <span className="ops-user__metric-icon" aria-hidden>
            {form.active ? <CheckCircle2 size={14} /> : <EyeOff size={14} />}
          </span>
          <span className="ops-users__chip-copy">
            <small>Storefront</small>
            <strong>{form.active ? 'Live' : 'Hidden'}</strong>
          </span>
        </div>
      </section>

      <div className="ops-cat__desk">
        <form id="ops-cat-form" className="ops-cat__main" onSubmit={onSubmit}>
          <section className="ops-user__panel">
            <header>
              <span className="ops-user__panel-icon" aria-hidden>
                <LayoutGrid size={14} />
              </span>
              <div>
                <h2>Identity</h2>
                <p>Name and describe the collection clients browse.</p>
              </div>
            </header>
            <div className="ops-cat__fields">
              <label className="ops-user__field">
                <span>
                  Name <em>Required</em>
                </span>
                <input
                  value={form.name}
                  maxLength={64}
                  required
                  placeholder="e.g. Minecraft Hosting"
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                />
              </label>
              <label className="ops-user__field">
                <span>Sort position</span>
                <input
                  type="number"
                  value={form.sortOrder}
                  onChange={(event) => setForm({ ...form, sortOrder: Number(event.target.value) })}
                />
              </label>
              <label className="ops-user__field ops-cat__full">
                <span>
                  Description <em>{form.description.length}/500</em>
                </span>
                <textarea
                  rows={4}
                  maxLength={500}
                  value={form.description}
                  placeholder="What belongs in this collection…"
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                />
              </label>
            </div>
          </section>

          <section className="ops-user__panel">
            <header>
              <span className="ops-user__panel-icon" aria-hidden>
                <Link2 size={14} />
              </span>
              <div>
                <h2>Panel egg</h2>
                <p>Egg used for products and imports in this category.</p>
              </div>
            </header>
            {eggsError ? (
              <div className="ops-user__alert is-info">{eggsError} You can paste an egg ID manually.</div>
            ) : null}
            <div className="ops-cat__fields">
              <label className="ops-user__field ops-cat__full">
                <span>Spirit-Panel egg</span>
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
                <p className="ops-user__hint">
                  {selectedEgg
                    ? `${selectedEgg.nest?.name || 'Panel'} / ${selectedEgg.name} · products sync to this egg`
                    : form.panelEggId
                      ? 'Egg ID saved — sync panel eggs to see its name'
                      : 'Without an egg, imports match this category by name only'}
                </p>
              </label>
            </div>
          </section>

          <section className="ops-user__panel">
            <header>
              <span className="ops-user__panel-icon" aria-hidden>
                <Palette size={14} />
              </span>
              <div>
                <h2>Appearance</h2>
                <p>Accent, fallback icon, and optional custom logo.</p>
              </div>
            </header>
            <div className="ops-cat__appearance">
              <div>
                <span className="ops-cat__label">Accent</span>
                <div className="ops-cat__swatches">
                  {CATEGORY_COLOR_OPTIONS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={form.color === color ? 'is-active' : ''}
                      style={{ ['--swatch' as string]: color }}
                      onClick={() => setForm({ ...form, color })}
                      aria-label={`Use ${color}`}
                    >
                      {form.color === color ? <Check size={12} /> : null}
                    </button>
                  ))}
                  <label className="ops-cat__color-custom" title="Custom colour">
                    <Palette size={13} />
                    <input
                      type="color"
                      value={form.color}
                      onChange={(event) => setForm({ ...form, color: event.target.value })}
                    />
                  </label>
                </div>
              </div>
              <div>
                <span className="ops-cat__label">Fallback icon</span>
                <div className="ops-cat__icons">
                  {CATEGORY_ICON_OPTIONS.map((icon) => (
                    <button
                      key={icon}
                      type="button"
                      title={icon}
                      className={form.icon === icon ? 'is-active' : ''}
                      style={{ ['--category-color' as string]: form.color }}
                      onClick={() => setForm({ ...form, icon })}
                    >
                      <CategoryIcon name={icon} size={18} />
                    </button>
                  ))}
                </div>
              </div>
              <label className="ops-user__field ops-cat__full">
                <span>
                  Card background <em>Optional · sits behind the logo</em>
                </span>
                <div className="ops-cat__logo-input">
                  <Image size={14} aria-hidden />
                  <input
                    type="url"
                    value={form.backgroundUrl}
                    placeholder="https://cdn.example.com/game-background.jpg"
                    onChange={(event) => {
                      setBackgroundBroken(false);
                      setForm({ ...form, backgroundUrl: event.target.value });
                    }}
                  />
                </div>
              </label>
              <label className="ops-user__field ops-cat__full">
                <span>
                  Logo URL <em>Optional · overrides icon</em>
                </span>
                <div className="ops-cat__logo-input">
                  <Image size={14} aria-hidden />
                  <input
                    type="url"
                    value={form.logoUrl}
                    placeholder="https://cdn.example.com/game-logo.png"
                    onChange={(event) => {
                      setLogoBroken(false);
                      setForm({ ...form, logoUrl: event.target.value });
                    }}
                  />
                </div>
              </label>
            </div>
          </section>

          <section className="ops-user__panel">
            <header>
              <span className="ops-user__panel-icon" aria-hidden>
                {form.active ? <Eye size={14} /> : <EyeOff size={14} />}
              </span>
              <div>
                <h2>Visibility</h2>
                <p>Control whether clients can discover this collection.</p>
              </div>
            </header>
            <button
              type="button"
              className={`ops-cat__toggle${form.active ? ' is-on' : ''}`}
              onClick={() => setForm({ ...form, active: !form.active })}
            >
              <span aria-hidden>{form.active ? <Eye size={16} /> : <EyeOff size={16} />}</span>
              <div>
                <strong>{form.active ? 'Published on Game Hosting' : 'Hidden from clients'}</strong>
                <p>
                  {form.active
                    ? 'Clients can browse this category and its active products.'
                    : 'Admins keep access; the storefront hides it.'}
                </p>
              </div>
              <i>
                <span />
              </i>
            </button>
          </section>

          {!isNew ? (
            <section className="ops-user__panel ops-user__panel--danger">
              <header>
                <span className="ops-user__panel-icon is-danger" aria-hidden>
                  <Trash2 size={14} />
                </span>
                <div>
                  <h2>Delete</h2>
                  <p>Only empty categories can be permanently removed.</p>
                </div>
              </header>
              <div className="ops-user__danger">
                <p>
                  {productCount > 0
                    ? `Reassign ${productCount} product${productCount === 1 ? '' : 's'} before deleting.`
                    : 'This cannot be undone.'}
                </p>
                <button
                  type="button"
                  className="ops-user__btn is-danger"
                  disabled={productCount > 0}
                  onClick={() => setDeleteModalOpen(true)}
                >
                  <Trash2 size={14} /> Delete category
                </button>
              </div>
            </section>
          ) : null}
        </form>

        <aside className="ops-cat__aside">
          <section className="ops-user__panel ops-cat__preview">
            <header>
              <span className="ops-user__panel-icon" aria-hidden>
                <Image size={14} />
              </span>
              <div>
                <h2>Preview</h2>
                <p>How the card reads in the catalog.</p>
              </div>
            </header>
            <div className="ops-cat__preview-stage" style={{ ['--category-color' as string]: form.color }}>
              <div className={`ops-cat__preview-card${showBackground ? ' has-bg' : ''}`}>
                {showBackground ? (
                  <img
                    className="ops-cat__preview-bg"
                    src={liveBackground}
                    alt=""
                    onError={() => setBackgroundBroken(true)}
                  />
                ) : null}
                {showLogo ? (
                  <img className="ops-cat__preview-logo" src={liveLogo} alt="" onError={() => setLogoBroken(true)} />
                ) : (
                  <CategoryMark icon={form.icon} color={form.color} size={52} />
                )}
                <small>{form.active ? 'Available now' : 'Hidden preview'}</small>
                <h3>{form.name.trim() || 'Category name'}</h3>
                <p>{form.description.trim() || 'Description appears here for clients.'}</p>
                <div className="ops-cat__preview-meta">
                  <span>
                    {productCount} plan{productCount === 1 ? '' : 's'}
                  </span>
                  <strong>{form.panelEggId ? 'Egg linked' : 'No egg'}</strong>
                </div>
              </div>
            </div>
            <div className="ops-cat__ready">
              <div>
                <span>Setup</span>
                <strong>
                  {readyBits}/5
                </strong>
              </div>
              <i>
                <span style={{ width: `${(readyBits / 5) * 100}%` }} />
              </i>
              <ul>
                {(
                  [
                    ['Name', Boolean(form.name.trim())],
                    ['Description', Boolean(form.description.trim())],
                    ['Panel egg', Boolean(form.panelEggId.trim())],
                    ['Accent', Boolean(form.color)],
                    ['Mark', Boolean(form.icon || form.logoUrl.trim())],
                  ] as const
                ).map(([label, done]) => (
                  <li key={label} className={done ? 'is-done' : ''}>
                    {done ? <Check size={11} /> : <i />}
                    {label}
                  </li>
                ))}
              </ul>
            </div>
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
