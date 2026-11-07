import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  Layers3,
  LayoutGrid,
  Palette,
  Plus,
  RefreshCw,
  Save,
  Search,
  Ticket,
  Trash2,
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

type TicketCategory = {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  sortOrder: number;
  active: boolean;
  _count?: { tickets: number };
};

type CategoryForm = {
  name: string;
  description: string;
  color: string;
  icon: string;
  sortOrder: number;
  active: boolean;
};

type VisibilityFilter = 'all' | 'active' | 'hidden';

const emptyForm: CategoryForm = {
  name: '',
  description: '',
  color: '#22d3ee',
  icon: 'life-buoy',
  sortOrder: 0,
  active: true,
};

export function AdminTicketCategories() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [categories, setCategories] = useState<TicketCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [visibility, setVisibility] = useState<VisibilityFilter>('all');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState<CategoryForm>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TicketCategory | null>(null);
  const [deleting, setDeleting] = useState(false);

  const creating = searchParams.get('new') === '1';
  const editId = searchParams.get('edit');
  const editing = Boolean(editId) && !creating;
  const deskOpen = creating || editing;

  function openCreate() {
    setForm(emptyForm);
    setMessage('');
    setSearchParams({ new: '1' }, { replace: true });
  }

  function openEdit(category: TicketCategory) {
    setForm({
      name: category.name,
      description: category.description,
      color: category.color || '#22d3ee',
      icon: category.icon || 'life-buoy',
      sortOrder: category.sortOrder,
      active: category.active,
    });
    setMessage('');
    setSearchParams({ edit: category.id }, { replace: true });
  }

  function closeDesk() {
    setForm(emptyForm);
    setSearchParams({}, { replace: true });
  }

  async function load() {
    setError('');
    try {
      setCategories(await api<TicketCategory[]>('/admin/ticket-categories'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load ticket categories');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!editId || creating) return;
    const category = categories.find((item) => item.id === editId);
    if (!category) return;
    setForm({
      name: category.name,
      description: category.description,
      color: category.color || '#22d3ee',
      icon: category.icon || 'life-buoy',
      sortOrder: category.sortOrder,
      active: category.active,
    });
  }, [editId, creating, categories]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (creating) {
        const created = await api<TicketCategory>('/admin/ticket-categories', {
          method: 'POST',
          body: JSON.stringify(form),
        });
        setCategories((list) =>
          [...list, created].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
        );
        setMessage(`${created.name} was created.`);
        closeDesk();
      } else if (editId) {
        const updated = await api<TicketCategory>(`/admin/ticket-categories/${editId}`, {
          method: 'PATCH',
          body: JSON.stringify(form),
        });
        setCategories((list) =>
          list
            .map((item) => (item.id === editId ? { ...item, ...updated } : item))
            .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
        );
        setMessage(`${updated.name} was updated.`);
        closeDesk();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save category');
    } finally {
      setBusy(false);
    }
  }

  async function remove(category: TicketCategory) {
    setDeleting(true);
    setError('');
    setMessage('');
    try {
      await api(`/admin/ticket-categories/${category.id}`, { method: 'DELETE' });
      setCategories((list) => list.filter((item) => item.id !== category.id));
      if (editId === category.id) closeDesk();
      setDeleteTarget(null);
      setMessage(`${category.name} was deleted.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete category');
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  const stats = useMemo(() => {
    const active = categories.filter((c) => c.active).length;
    const tickets = categories.reduce((sum, c) => sum + (c._count?.tickets ?? 0), 0);
    return {
      total: categories.length,
      active,
      hidden: categories.length - active,
      tickets,
    };
  }, [categories]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return categories.filter((category) => {
      if (visibility === 'active' && !category.active) return false;
      if (visibility === 'hidden' && category.active) return false;
      if (!needle) return true;
      return `${category.name} ${category.description}`.toLowerCase().includes(needle);
    });
  }, [categories, visibility, query]);

  const filtersActive = visibility !== 'all' || Boolean(query.trim());

  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    if (visibility === 'active') parts.push('Active');
    if (visibility === 'hidden') parts.push('Hidden');
    if (query.trim()) parts.push(`“${query.trim()}”`);
    return parts;
  }, [visibility, query]);

  function clearFilters() {
    setVisibility('all');
    setQuery('');
  }

  const editingCategory = editId ? categories.find((item) => item.id === editId) : null;
  const readyBits = [Boolean(form.name.trim()), Boolean(form.color), Boolean(form.icon)].filter(Boolean).length;

  return (
    <div className="ops-users ops-tkt-cats">
      <header className="ops-users__mast">
        <div className="ops-users__mast-copy">
          <span>Support</span>
          <h1>Ticket categories</h1>
          <p>Labels clients pick when opening a ticket — keep queues clear for staff.</p>
        </div>
        <div className="ops-users__mast-meta">
          <button
            type="button"
            className={`ops-users__chip${!filtersActive && !deskOpen ? ' is-active' : ''}`}
            onClick={() => {
              clearFilters();
              closeDesk();
            }}
            title="Show all categories"
          >
            <span className="ops-users__chip-icon" aria-hidden>
              <LayoutGrid size={14} />
            </span>
            <span className="ops-users__chip-copy">
              <small>Labels</small>
              <strong>{stats.total}</strong>
            </span>
          </button>
          <button
            type="button"
            className={`ops-users__chip is-ok${
              visibility === 'active' && !query.trim() && !deskOpen ? ' is-active' : ''
            }`}
            onClick={() => {
              setVisibility('active');
              setQuery('');
              closeDesk();
            }}
            title="Show active categories"
          >
            <span className="ops-users__chip-icon" aria-hidden>
              <Eye size={14} />
            </span>
            <span className="ops-users__chip-copy">
              <small>Active</small>
              <strong>{stats.active}</strong>
            </span>
          </button>
          <button
            type="button"
            className={`ops-users__chip${stats.hidden ? ' is-warn' : ''}${
              visibility === 'hidden' && !query.trim() && !deskOpen ? ' is-active' : ''
            }`}
            onClick={() => {
              setVisibility('hidden');
              setQuery('');
              closeDesk();
            }}
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
            className="ops-users__chip"
            onClick={() => {
              clearFilters();
              closeDesk();
            }}
            title="Tickets labelled"
          >
            <span className="ops-users__chip-icon" aria-hidden>
              <Ticket size={14} />
            </span>
            <span className="ops-users__chip-copy">
              <small>Tickets</small>
              <strong>{stats.tickets}</strong>
            </span>
          </button>
        </div>
      </header>

      {error ? <div className="ds-alert ds-alert--error">{error}</div> : null}
      {message ? <div className="ds-alert ds-alert--success">{message}</div> : null}

      {deskOpen ? (
        <div className="ops-tkt-cats__desk">
          <form className="ops-tkt-cats__main" onSubmit={(event) => void onSubmit(event)}>
            <header className="ops-tkt-cats__desk-head">
              <div>
                <span>{creating ? 'New label' : 'Edit label'}</span>
                <h2>{creating ? 'Create category' : form.name.trim() || editingCategory?.name || 'Category'}</h2>
                <p>
                  {creating
                    ? 'Name, mark, and visibility for the support queue.'
                    : `${editingCategory?._count?.tickets ?? 0} ticket${
                        (editingCategory?._count?.tickets ?? 0) === 1 ? '' : 's'
                      } use this label.`}
                </p>
              </div>
              <div className="ops-tkt-cats__desk-actions">
                <button type="button" className="ops-user__btn is-ghost" onClick={closeDesk}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="ops-user__btn is-primary"
                  disabled={busy || !form.name.trim()}
                >
                  <Save size={14} />
                  {busy ? 'Saving…' : creating ? 'Create' : 'Save'}
                </button>
              </div>
            </header>

            <section className="ops-user__panel">
              <header>
                <span className="ops-user__panel-icon" aria-hidden>
                  <LayoutGrid size={14} />
                </span>
                <div>
                  <h2>Identity</h2>
                  <p>What clients see when choosing a ticket topic.</p>
                </div>
              </header>
              <div className="ops-tkt-cats__fields">
                <label className="ops-user__field">
                  <span>
                    Name <em>Required</em>
                  </span>
                  <input
                    required
                    maxLength={64}
                    value={form.name}
                    placeholder="e.g. Billing"
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                  />
                </label>
                <label className="ops-user__field">
                  <span>Sort order</span>
                  <input
                    type="number"
                    value={form.sortOrder}
                    onChange={(event) => setForm({ ...form, sortOrder: Number(event.target.value) })}
                  />
                </label>
                <label className="ops-user__field ops-tkt-cats__full">
                  <span>Description</span>
                  <input
                    maxLength={255}
                    value={form.description}
                    placeholder="Short helper text for clients"
                    onChange={(event) => setForm({ ...form, description: event.target.value })}
                  />
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
                  <p>Accent colour and mark used in the inbox.</p>
                </div>
              </header>
              <div className="ops-tkt-cats__appearance">
                <div>
                  <span className="ops-tkt-cats__label">Colour</span>
                  <div className="ops-tkt-cats__swatches">
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
                    <label className="ops-tkt-cats__color-custom" title="Custom colour">
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
                  <span className="ops-tkt-cats__label">Icon</span>
                  <div className="ops-tkt-cats__icons">
                    {CATEGORY_ICON_OPTIONS.map((icon) => (
                      <button
                        key={icon}
                        type="button"
                        title={icon}
                        className={form.icon === icon ? 'is-active' : ''}
                        style={{ ['--category-color' as string]: form.color }}
                        onClick={() => setForm({ ...form, icon })}
                      >
                        <CategoryIcon name={icon} size={16} />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <button
                type="button"
                className={`ops-tkt-cats__toggle${form.active ? ' is-on' : ''}`}
                onClick={() => setForm({ ...form, active: !form.active })}
              >
                <span aria-hidden>{form.active ? <Eye size={16} /> : <EyeOff size={16} />}</span>
                <div>
                  <strong>{form.active ? 'Active for clients' : 'Hidden from clients'}</strong>
                  <p>
                    {form.active
                      ? 'Clients can pick this label when opening a ticket.'
                      : 'Admins keep the label; clients no longer see it.'}
                  </p>
                </div>
                <i>
                  <span />
                </i>
              </button>
            </section>

            {editing && editingCategory ? (
              <section className="ops-user__panel ops-user__panel--danger">
                <header>
                  <span className="ops-user__panel-icon is-danger" aria-hidden>
                    <Trash2 size={14} />
                  </span>
                  <div>
                    <h2>Delete</h2>
                    <p>Tickets may lose this label after deletion.</p>
                  </div>
                </header>
                <div className="ops-user__danger">
                  <p>
                    {(editingCategory._count?.tickets ?? 0) > 0
                      ? `${editingCategory._count?.tickets} ticket${
                          editingCategory._count?.tickets === 1 ? '' : 's'
                        } currently use this category.`
                      : 'This cannot be undone.'}
                  </p>
                  <button
                    type="button"
                    className="ops-user__btn is-danger"
                    onClick={() => setDeleteTarget(editingCategory)}
                  >
                    <Trash2 size={14} /> Delete category
                  </button>
                </div>
              </section>
            ) : null}
          </form>

          <aside className="ops-tkt-cats__aside">
            <section className="ops-user__panel">
              <header>
                <span className="ops-user__panel-icon" aria-hidden>
                  <Ticket size={14} />
                </span>
                <div>
                  <h2>Preview</h2>
                  <p>How the label reads in the inbox.</p>
                </div>
              </header>
              <div
                className="ops-tkt-cats__preview"
                style={{ ['--category-color' as string]: form.color }}
              >
                <CategoryMark icon={form.icon} color={form.color} size={48} />
                <small>{form.active ? 'Active label' : 'Hidden label'}</small>
                <h3>{form.name.trim() || 'Category name'}</h3>
                <p>{form.description.trim() || 'Helper text appears here for clients.'}</p>
                <div className="ops-tkt-cats__preview-meta">
                  <span>Order {form.sortOrder}</span>
                  <strong>
                    {editingCategory?._count?.tickets ?? 0} ticket
                    {(editingCategory?._count?.tickets ?? 0) === 1 ? '' : 's'}
                  </strong>
                </div>
              </div>
              <div className="ops-tkt-cats__ready">
                <div>
                  <span>Setup</span>
                  <strong>{readyBits}/3</strong>
                </div>
                <i>
                  <span style={{ width: `${(readyBits / 3) * 100}%` }} />
                </i>
                <ul>
                  {(
                    [
                      ['Name', Boolean(form.name.trim())],
                      ['Colour', Boolean(form.color)],
                      ['Icon', Boolean(form.icon)],
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
      ) : (
        <div className="ops-users__shell">
          <aside className="ops-users__rail" aria-label="Category filters">
            <div className="ops-users__rail-block">
              <span>Visibility</span>
              <div>
                {(
                  [
                    ['all', 'Any visibility', stats.total],
                    ['active', 'Active', stats.active],
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
          </aside>

          <div className="ops-users__main">
            <div className="ops-users__command ops-tkt-cats__command">
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
                  placeholder="Filter by name or description"
                  aria-label="Search ticket categories"
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

              <div className="ops-services__jobs" role="group" aria-label="Category actions">
                <button type="button" className="ops-services__create" onClick={openCreate}>
                  <Plus size={14} /> New
                </button>
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
                  {stats.tickets ? (
                    <>
                      {' '}
                      · <strong>{stats.tickets}</strong> tickets
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

            <section className="ops-users__table" aria-label="Ticket categories">
              <div className="ops-users__head ops-tkt-cats__head" aria-hidden>
                <span>Category</span>
                <span>Tickets</span>
                <span>Order</span>
                <span>Status</span>
                <span />
              </div>

              {loading ? (
                <div className="ops-users__empty">
                  <RefreshCw size={22} />
                  <h3>Loading categories…</h3>
                </div>
              ) : (
                filtered.map((category) => {
                  const tickets = category._count?.tickets ?? 0;
                  return (
                    <div key={category.id} className="ops-tkt-cats__row-wrap">
                      <button
                        type="button"
                        className={`ops-users__row ops-tkt-cats__row${!category.active ? ' is-off' : ''}`}
                        onClick={() => openEdit(category)}
                      >
                        <span className="ops-tkt-cats__who">
                          <CategoryMark
                            icon={category.icon || 'life-buoy'}
                            color={category.color}
                            size={34}
                            className="ops-services__mark"
                          />
                          <span>
                            <strong>{category.name}</strong>
                            <em>{category.description || 'No description'}</em>
                          </span>
                        </span>

                        <span className="ops-tkt-cats__tickets">
                          <Layers3 size={13} aria-hidden />
                          <strong>{tickets}</strong>
                        </span>

                        <span className="ops-tkt-cats__order">
                          <strong>{category.sortOrder}</strong>
                        </span>

                        <span className={`ops-tkt-cats__status${category.active ? ' is-live' : ' is-off'}`}>
                          {category.active ? (
                            <>
                              <CheckCircle2 size={12} aria-hidden /> Active
                            </>
                          ) : (
                            <>
                              <EyeOff size={12} aria-hidden /> Hidden
                            </>
                          )}
                        </span>

                        <span className="ops-tkt-cats__open">Edit</span>
                      </button>
                      <button
                        type="button"
                        className="ops-tkt-cats__delete"
                        aria-label={`Delete ${category.name}`}
                        title="Delete category"
                        onClick={() => setDeleteTarget(category)}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
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
                      : 'Create a label so clients can route tickets correctly.'}
                  </p>
                  {!categories.length ? (
                    <button type="button" className="ops-services__create" onClick={openCreate}>
                      <Plus size={14} /> New category
                    </button>
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
      )}

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title={`Delete ${deleteTarget?.name ?? 'category'}?`}
        description="This permanently removes the ticket category."
        confirmLabel="Delete category"
        busyLabel="Deleting…"
        busy={deleting}
        requireText={deleteTarget?.name}
        consequences={[
          `${deleteTarget?._count?.tickets ?? 0} ticket(s) currently use this category.`,
          'Tickets may lose their category label after deletion.',
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
