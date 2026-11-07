import { type FormEvent, useEffect, useMemo, useState } from 'react';
import {
  Check,
  Eye,
  EyeOff,
  Layers3,
  LayoutGrid,
  Palette,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { CATEGORY_COLOR_OPTIONS, CATEGORY_ICON_OPTIONS, CategoryIcon, CategoryMark } from '../../lib/icons';
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

const emptyForm: CategoryForm = {
  name: '',
  description: '',
  color: '#22d3ee',
  icon: 'life-buoy',
  sortOrder: 0,
  active: true,
};

export function AdminTicketCategories() {
  const [categories, setCategories] = useState<TicketCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'hidden'>('all');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState<CategoryForm>(emptyForm);
  const [createBusy, setCreateBusy] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<CategoryForm>(emptyForm);
  const [saveBusy, setSaveBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TicketCategory | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  async function createCategory(event: FormEvent) {
    event.preventDefault();
    setCreateBusy(true);
    setError('');
    setMessage('');
    try {
      const created = await api<TicketCategory>('/admin/ticket-categories', {
        method: 'POST',
        body: JSON.stringify(createForm),
      });
      setCategories((list) =>
        [...list, created].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
      );
      setCreateForm(emptyForm);
      setCreating(false);
      setMessage(`${created.name} was created.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create category');
    } finally {
      setCreateBusy(false);
    }
  }

  function startEdit(category: TicketCategory) {
    setEditId(category.id);
    setEditForm({
      name: category.name,
      description: category.description,
      color: category.color || '#22d3ee',
      icon: category.icon || 'life-buoy',
      sortOrder: category.sortOrder,
      active: category.active,
    });
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editId) return;
    setSaveBusy(true);
    setError('');
    setMessage('');
    try {
      const updated = await api<TicketCategory>(`/admin/ticket-categories/${editId}`, {
        method: 'PATCH',
        body: JSON.stringify(editForm),
      });
      setCategories((list) =>
        list
          .map((item) => (item.id === editId ? { ...item, ...updated } : item))
          .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
      );
      setEditId(null);
      setMessage(`${updated.name} was updated.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save category');
    } finally {
      setSaveBusy(false);
    }
  }

  async function remove(category: TicketCategory) {
    setDeleting(true);
    setError('');
    setMessage('');
    try {
      await api(`/admin/ticket-categories/${category.id}`, { method: 'DELETE' });
      setCategories((list) => list.filter((item) => item.id !== category.id));
      if (editId === category.id) setEditId(null);
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
      const matchesQuery = `${category.name} ${category.description}`.toLowerCase().includes(needle);
      return matchesFilter && matchesQuery;
    });
  }, [categories, filter, query]);

  const activeCount = categories.filter((category) => category.active).length;
  const ticketCount = categories.reduce((sum, category) => sum + (category._count?.tickets ?? 0), 0);

  return (
    <div className="support-v3 cats-v3">
      <header className="support-v3__hero">
        <div>
          <span>Support configuration</span>
          <h1>Ticket categories</h1>
          <p>Labels clients pick when opening a ticket — keep queues clear for staff.</p>
        </div>
        {!creating && (
          <button type="button" className="support-v3__cta" onClick={() => setCreating(true)}>
            <Plus size={15} /> New category
          </button>
        )}
      </header>

      {error && <div className="ds-alert ds-alert--error">{error}</div>}
      {message && <div className="ds-alert ds-alert--success">{message}</div>}

      {creating && (
        <section className="cats-v3__panel">
          <header>
            <div>
              <span>New label</span>
              <h2>Create category</h2>
            </div>
            <button type="button" aria-label="Cancel" onClick={() => setCreating(false)}>
              <X size={16} />
            </button>
          </header>
          <form onSubmit={createCategory}>
            <div className="cats-v3__form-grid">
              <label>
                <span>Name</span>
                <input
                  required
                  maxLength={64}
                  value={createForm.name}
                  onChange={(event) => setCreateForm({ ...createForm, name: event.target.value })}
                  placeholder="e.g. Billing"
                />
              </label>
              <label>
                <span>Sort order</span>
                <input
                  type="number"
                  value={createForm.sortOrder}
                  onChange={(event) =>
                    setCreateForm({ ...createForm, sortOrder: Number(event.target.value) })
                  }
                />
              </label>
              <label className="is-full">
                <span>Description</span>
                <input
                  maxLength={255}
                  value={createForm.description}
                  onChange={(event) =>
                    setCreateForm({ ...createForm, description: event.target.value })
                  }
                  placeholder="Short helper text for clients"
                />
              </label>
            </div>
            <div className="cats-v3__swatches">
              <span>Colour</span>
              <div>
                {CATEGORY_COLOR_OPTIONS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={createForm.color === color ? 'is-active' : ''}
                    style={{ ['--swatch' as string]: color }}
                    onClick={() => setCreateForm({ ...createForm, color })}
                  >
                    {createForm.color === color && <Check size={12} />}
                  </button>
                ))}
                <label title="Custom colour" className="cats-v3__custom-color">
                  <Palette size={13} />
                  <input
                    type="color"
                    value={createForm.color}
                    onChange={(event) => setCreateForm({ ...createForm, color: event.target.value })}
                  />
                </label>
              </div>
            </div>
            <div className="cats-v3__icons">
              <span>Icon</span>
              <div>
                {CATEGORY_ICON_OPTIONS.map((icon) => (
                  <button
                    key={icon}
                    type="button"
                    title={icon}
                    className={createForm.icon === icon ? 'is-active' : ''}
                    style={{ ['--category-color' as string]: createForm.color }}
                    onClick={() => setCreateForm({ ...createForm, icon })}
                  >
                    <CategoryIcon name={icon} size={16} />
                  </button>
                ))}
              </div>
            </div>
            <label className="cats-v3__toggle">
              <input
                type="checkbox"
                checked={createForm.active}
                onChange={(event) => setCreateForm({ ...createForm, active: event.target.checked })}
              />
              <span>Active for clients</span>
            </label>
            <footer>
              <button
                type="submit"
                className="support-v3__cta"
                disabled={createBusy || !createForm.name.trim()}
              >
                <Save size={14} /> {createBusy ? 'Creating…' : 'Create category'}
              </button>
            </footer>
          </form>
        </section>
      )}

      <section className="support-v3__metrics">
        <article>
          <span className="is-sky"><LayoutGrid size={17} /></span>
          <div><small>Categories</small><strong>{categories.length}</strong></div>
        </article>
        <article>
          <span className="is-mint"><Eye size={17} /></span>
          <div><small>Active</small><strong>{activeCount}</strong></div>
        </article>
        <article>
          <span className="is-amber"><Layers3 size={17} /></span>
          <div><small>Tickets</small><strong>{ticketCount}</strong></div>
        </article>
        <article>
          <span className="is-rose"><EyeOff size={17} /></span>
          <div><small>Hidden</small><strong>{categories.length - activeCount}</strong></div>
        </article>
      </section>

      <section className="support-v3__inbox">
        <header>
          <div>
            <span>Directory</span>
            <h2>Support labels</h2>
          </div>
          <label>
            <Search size={14} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name or description…"
            />
          </label>
          <div className="support-v3__filters">
            {([
              ['all', 'All'],
              ['active', 'Active'],
              ['hidden', 'Hidden'],
            ] as const).map(([value, label]) => (
              <button
                type="button"
                key={value}
                className={filter === value ? 'is-active' : ''}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </header>

        {loading ? (
          <div className="support-v3__empty">
            <RefreshCw size={26} className="support-v3__spin" />
            <h3>Loading categories…</h3>
          </div>
        ) : (
          <div className="cats-v3__grid">
            {visible.map((category) => (
              <article
                key={category.id}
                className={`cats-v3__card ${category.active ? 'is-active' : 'is-hidden'} ${editId === category.id ? 'is-editing' : ''}`}
                style={{ ['--category-color' as string]: category.color || '#22d3ee' }}
              >
                {editId === category.id ? (
                  <form className="cats-v3__edit" onSubmit={saveEdit}>
                    <label>
                      <span>Name</span>
                      <input
                        required
                        maxLength={64}
                        value={editForm.name}
                        onChange={(event) => setEditForm({ ...editForm, name: event.target.value })}
                      />
                    </label>
                    <label>
                      <span>Sort order</span>
                      <input
                        type="number"
                        value={editForm.sortOrder}
                        onChange={(event) =>
                          setEditForm({ ...editForm, sortOrder: Number(event.target.value) })
                        }
                      />
                    </label>
                    <label className="is-full">
                      <span>Description</span>
                      <input
                        maxLength={255}
                        value={editForm.description}
                        onChange={(event) =>
                          setEditForm({ ...editForm, description: event.target.value })
                        }
                      />
                    </label>
                    <div className="cats-v3__swatches">
                      <span>Colour</span>
                      <div>
                        {CATEGORY_COLOR_OPTIONS.map((color) => (
                          <button
                            key={color}
                            type="button"
                            className={editForm.color === color ? 'is-active' : ''}
                            style={{ ['--swatch' as string]: color }}
                            onClick={() => setEditForm({ ...editForm, color })}
                          >
                            {editForm.color === color && <Check size={12} />}
                          </button>
                        ))}
                        <label title="Custom colour" className="cats-v3__custom-color">
                          <Palette size={13} />
                          <input
                            type="color"
                            value={editForm.color}
                            onChange={(event) =>
                              setEditForm({ ...editForm, color: event.target.value })
                            }
                          />
                        </label>
                      </div>
                    </div>
                    <div className="cats-v3__icons">
                      <span>Icon</span>
                      <div>
                        {CATEGORY_ICON_OPTIONS.map((icon) => (
                          <button
                            key={icon}
                            type="button"
                            title={icon}
                            className={editForm.icon === icon ? 'is-active' : ''}
                            style={{ ['--category-color' as string]: editForm.color }}
                            onClick={() => setEditForm({ ...editForm, icon })}
                          >
                            <CategoryIcon name={icon} size={16} />
                          </button>
                        ))}
                      </div>
                    </div>
                    <label className="cats-v3__toggle">
                      <input
                        type="checkbox"
                        checked={editForm.active}
                        onChange={(event) =>
                          setEditForm({ ...editForm, active: event.target.checked })
                        }
                      />
                      <span>Active for clients</span>
                    </label>
                    <footer>
                      <button type="button" className="support-v3__ghost" onClick={() => setEditId(null)}>
                        Cancel
                      </button>
                      <button type="submit" className="support-v3__cta" disabled={saveBusy}>
                        <Save size={13} /> {saveBusy ? 'Saving…' : 'Save'}
                      </button>
                    </footer>
                  </form>
                ) : (
                  <>
                    <div className="cats-v3__visual">
                      <CategoryMark
                        color={category.color}
                        icon={category.icon || 'life-buoy'}
                        size={52}
                      />
                      <span className={category.active ? 'is-live' : 'is-off'}>
                        {category.active ? (
                          <><Eye size={11} /> Active</>
                        ) : (
                          <><EyeOff size={11} /> Hidden</>
                        )}
                      </span>
                    </div>
                    <div className="cats-v3__body">
                      <h2>{category.name}</h2>
                      <p>{category.description || 'No description yet.'}</p>
                      <div className="cats-v3__stats">
                        <span>
                          <Layers3 size={12} /> {category._count?.tickets ?? 0} ticket
                          {(category._count?.tickets ?? 0) === 1 ? '' : 's'}
                        </span>
                        <span>Order {category.sortOrder}</span>
                      </div>
                    </div>
                    <footer>
                      <button type="button" onClick={() => startEdit(category)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className="is-danger"
                        aria-label={`Delete ${category.name}`}
                        onClick={() => setDeleteTarget(category)}
                      >
                        <Trash2 size={13} />
                      </button>
                    </footer>
                  </>
                )}
              </article>
            ))}

            {!visible.length && (
              <div className="support-v3__empty is-grid">
                <LayoutGrid size={28} />
                <h3>{categories.length ? 'No matching categories' : 'Create your first category'}</h3>
                <p>
                  {categories.length
                    ? 'Try another search or visibility filter.'
                    : 'Categories help clients choose the right support queue.'}
                </p>
                {!categories.length && !creating && (
                  <button type="button" className="support-v3__cta" onClick={() => setCreating(true)}>
                    <Plus size={13} /> New category
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </section>

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
