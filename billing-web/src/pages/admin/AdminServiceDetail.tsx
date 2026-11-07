import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Archive,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Cpu,
  Database,
  ExternalLink,
  FileText,
  Globe2,
  HardDrive,
  Layers3,
  MemoryStick,
  Package,
  PauseCircle,
  PlayCircle,
  Puzzle,
  Receipt,
  Save,
  Server,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import { api, ApiError, money, safeExternalHref, statusBadge } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { isFullAdmin } from '../../lib/roles';
import { CategoryMark } from '../../lib/icons';
import { ConfirmModal } from '../../components/ConfirmModal';
import { ThemedSelect } from '../../components/ThemedSelect';

type AdminServiceDetail = {
  id: string;
  name: string;
  status: string;
  panelServerId: string | null;
  memoryMb: number | null;
  diskMb: number | null;
  cpuPercent: number | null;
  backupLimit: number | null;
  databaseLimit: number | null;
  allocationLimit: number | null;
  subdomainAccess?: boolean;
  fivemMarketplaceAccess?: boolean;
  minecraftPluginsAccess?: boolean;
  priceCents: number | null;
  currency: string | null;
  cycle: string | null;
  nextDueAt: string | null;
  createdAt: string;
  updatedAt: string;
  panelWebUrl: string;
  panelEggId?: string | null;
  panelEggName?: string | null;
  user: {
    id: string;
    email: string;
    username: string;
    firstName: string | null;
    lastName: string | null;
    creditBalanceCents: number;
  };
  product: {
    id: string;
    name: string;
    description: string;
    cycle: string;
    priceCents: number;
    currency: string;
    memoryMb: number;
    diskMb: number;
    cpuPercent: number;
    backupLimit: number;
    databaseLimit: number;
    allocationLimit: number;
    category: {
      id: string;
      name: string;
      color: string;
      icon: string;
      logoUrl: string | null;
    } | null;
  };
  invoices: Array<{
    id: string;
    number: string;
    status: string;
    totalCents: number;
    currency: string;
    description: string;
    dueAt: string;
    paidAt: string | null;
    createdAt: string;
    upgradeToProductId: string | null;
  }>;
};

type ServiceEditForm = {
  name: string;
  priceCents: number;
  currency: string;
  cycle: 'monthly' | 'quarterly' | 'yearly';
  nextDueAt: string;
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

const currencyOptions = ['GBP', 'USD', 'EUR', 'CAD', 'AUD'].map((value) => ({ value, label: value }));
const cycleOptions = [
  { value: 'monthly', label: 'Monthly', description: 'Bills every month' },
  { value: 'quarterly', label: 'Every 3 months', description: 'Bills once per quarter' },
  { value: 'yearly', label: 'Yearly', description: 'Bills once per year' },
];

function toDateInputValue(iso: string | null) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 10);
}

function statusLabel(status: string) {
  return status.replaceAll('_', ' ');
}

function displayName(user: AdminServiceDetail['user']) {
  return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username;
}

export function AdminServiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const fullAdmin = isFullAdmin(currentUser?.role);
  const [service, setService] = useState<AdminServiceDetail | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<ServiceEditForm | null>(null);

  async function load() {
    if (!id) return;
    setError('');
    try {
      setService(await api<AdminServiceDetail>(`/admin/services/${id}`));
    } catch (err) {
      setService(null);
      setError(err instanceof ApiError ? err.message : 'Service not found');
    }
  }

  useEffect(() => {
    void load();
  }, [id]);

  function openEditor() {
    if (!service) return;
    setEditForm({
      name: service.name,
      priceCents: service.priceCents ?? service.product.priceCents,
      currency: service.currency ?? service.product.currency,
      cycle: (service.cycle ?? service.product.cycle) as ServiceEditForm['cycle'],
      nextDueAt: toDateInputValue(service.nextDueAt),
      memoryMb: service.memoryMb ?? service.product.memoryMb,
      diskMb: service.diskMb ?? service.product.diskMb,
      cpuPercent: service.cpuPercent ?? service.product.cpuPercent,
      backupLimit: service.backupLimit ?? service.product.backupLimit,
      databaseLimit: service.databaseLimit ?? service.product.databaseLimit,
      allocationLimit: service.allocationLimit ?? service.product.allocationLimit,
      subdomainAccess: Boolean(service.subdomainAccess),
      fivemMarketplaceAccess: Boolean(service.fivemMarketplaceAccess),
      minecraftPluginsAccess: Boolean(service.minecraftPluginsAccess),
    });
    setEditOpen(true);
    setError('');
  }

  async function saveService() {
    if (!service || !editForm) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const { nextDueAt, ...rest } = editForm;
      await api(`/admin/services/${service.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...rest,
          ...(nextDueAt.trim()
            ? { nextDueAt: nextDueAt.trim() }
            : rest.priceCents > 0
              ? {}
              : { nextDueAt: null }),
        }),
      });
      setMessage(
        service.panelServerId
          ? `${editForm.name} was updated in billing and Spirit-Panel.`
          : `${editForm.name} was updated and will use these limits when provisioned.`,
      );
      setEditOpen(false);
      setEditForm(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update server');
    } finally {
      setBusy(false);
    }
  }

  async function createRenewal(dueImmediately = false) {
    if (!service) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await api<{ invoice: { id: string; number: string } }>(
        `/admin/services/${service.id}/create-renewal`,
        {
          method: 'POST',
          body: JSON.stringify({ dueImmediately }),
        },
      );
      setMessage(
        dueImmediately
          ? `Created ${result.invoice.number} due yesterday � use Run overdue enforcement to test suspend/terminate.`
          : `Created renewal invoice ${result.invoice.number}.`,
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create renewal');
    } finally {
      setBusy(false);
    }
  }

  async function setSuspended(suspend: boolean) {
    if (!service) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api(`/admin/services/${service.id}/${suspend ? 'suspend' : 'unsuspend'}`, {
        method: 'POST',
        body: '{}',
      });
      setMessage(suspend ? 'Service suspended.' : 'Service unsuspended.');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update service status');
    } finally {
      setBusy(false);
    }
  }

  async function deleteService() {
    if (!service) return;
    setBusy(true);
    setError('');
    try {
      await api(`/admin/services/${service.id}`, { method: 'DELETE' });
      navigate('/admin/services', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete service');
      setBusy(false);
      setDeleteOpen(false);
    }
  }

  if (error && !service) {
    return (
      <div className="asd-v2">
        <Link to="/admin/services" className="asd-v2__back"><ArrowLeft size={14} /> All services</Link>
        <div className="ds-alert ds-alert--error">{error}</div>
      </div>
    );
  }
  if (!service) return <div className="ds-muted">Loading�</div>;

  const category = service.product.category;
  const memory = service.memoryMb ?? service.product.memoryMb;
  const disk = service.diskMb ?? service.product.diskMb;
  const cpu = service.cpuPercent ?? service.product.cpuPercent;
  const price = service.priceCents ?? service.product.priceCents;
  const currency = service.currency ?? service.product.currency;
  const cycle = service.cycle ?? service.product.cycle;
  const panelHref = safeExternalHref(service.panelWebUrl);
  const canSuspend = service.status === 'active' && Boolean(service.panelServerId);
  const canUnsuspend = service.status === 'suspended' && Boolean(service.panelServerId);

  return (
    <div className="asd-v2">
      <Link to="/admin/services" className="asd-v2__back"><ArrowLeft size={14} /> All services</Link>

      {error && <div className="ds-alert ds-alert--error">{error}</div>}
      {message && <div className="ds-alert ds-alert--success">{message}</div>}

      <section
        className={`asd-v2-hero is-${service.status}`}
        style={category?.color ? { ['--service-color' as string]: category.color } : undefined}
      >
        <div className="asd-v2-hero__glow" />
        <CategoryMark
          icon={category?.icon}
          logoUrl={category?.logoUrl}
          color={category?.color}
          size={64}
        />
        <div className="asd-v2-hero__identity">
          <span>{category?.name || 'Hosting service'}</span>
          <h1>{service.name}</h1>
          <p>
            <span className={statusBadge(service.status)}>{statusLabel(service.status)}</span>
            <i />
            {service.product.name}
            <i />
            Created {new Date(service.createdAt).toLocaleDateString()}
          </p>
        </div>
        <div className="asd-v2-hero__actions">
          {fullAdmin && service.status !== 'cancelled' && (
            <button type="button" disabled={busy} onClick={openEditor}>
              <SlidersHorizontal size={14} /> Edit server
            </button>
          )}
          {fullAdmin && service.status !== 'cancelled' && price > 0 && (
            <button type="button" disabled={busy} onClick={() => void createRenewal(false)}>
              <Receipt size={14} /> Create renewal
            </button>
          )}
          {fullAdmin && service.status !== 'cancelled' && price > 0 && (
            <button type="button" disabled={busy} onClick={() => void createRenewal(true)}>
              <CalendarDays size={14} /> Test overdue invoice
            </button>
          )}
          {canSuspend && (
            <button type="button" disabled={busy} onClick={() => void setSuspended(true)}>
              <PauseCircle size={14} /> Suspend
            </button>
          )}
          {canUnsuspend && (
            <button type="button" disabled={busy} onClick={() => void setSuspended(false)}>
              <PlayCircle size={14} /> Unsuspend
            </button>
          )}
          {fullAdmin && service.status !== 'cancelled' && (
            <button type="button" className="is-danger" disabled={busy} onClick={() => setDeleteOpen(true)}>
              <Trash2 size={14} /> Delete
            </button>
          )}
        </div>
      </section>

      <section className="asd-v2-metrics">
        <article>
          <span><ShieldCheck size={16} /></span>
          <div>
            <small>Status</small>
            <strong>{statusLabel(service.status)}</strong>
          </div>
        </article>
        <article>
          <span><CalendarDays size={16} /></span>
          <div>
            <small>Next renewal</small>
            <strong>
              {service.nextDueAt
                ? new Date(service.nextDueAt).toLocaleDateString(undefined, {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })
                : 'Not scheduled'}
            </strong>
          </div>
        </article>
        <article>
          <span><CircleDollarSign size={16} /></span>
          <div>
            <small>Plan price</small>
            <strong>{money(price, currency)} / {cycle}</strong>
          </div>
        </article>
        <article>
          <span><FileText size={16} /></span>
          <div>
            <small>Invoices</small>
            <strong>{service.invoices.length}</strong>
          </div>
        </article>
      </section>

      <div className="asd-v2-layout">
        <main>
          <section className="asd-v2-card">
            <header>
              <div>
                <span>Configuration</span>
                <h2>Server resources</h2>
              </div>
              <Server size={17} />
            </header>
            <div className="asd-v2-resources">
              <article>
                <span className="is-purple"><MemoryStick size={16} /></span>
                <div><small>Memory</small><strong>{memory <= 0 ? 'Unlimited' : `${Math.round(memory / 1024)} GB`}</strong></div>
              </article>
              <article>
                <span className="is-blue"><Cpu size={16} /></span>
                <div><small>CPU</small><strong>{cpu <= 0 ? 'Unlimited' : `${cpu}%`}</strong></div>
              </article>
              <article>
                <span className="is-green"><HardDrive size={16} /></span>
                <div><small>Disk</small><strong>{disk <= 0 ? 'Unlimited' : `${Math.round(disk / 1024)} GB`}</strong></div>
              </article>
            </div>
            {service.product.description && <p className="asd-v2-card__note">{service.product.description}</p>}
          </section>

          <section className="asd-v2-card">
            <header>
              <div>
                <span>Billing</span>
                <h2>Invoice history</h2>
              </div>
              <Link to="/admin/invoices">All invoices <ChevronRight size={13} /></Link>
            </header>
            <div className="asd-v2-invoices">
              {service.invoices.map((invoice) => (
                <Link key={invoice.id} to={`/admin/invoices/${invoice.id}`}>
                  <span className={`asd-v2-invoices__icon is-${invoice.status}`}><FileText size={14} /></span>
                  <span>
                    <small>{invoice.number}</small>
                    <strong>
                      {invoice.upgradeToProductId
                        ? 'Plan upgrade'
                        : invoice.status === 'paid' && invoice.paidAt
                          ? `Paid ${new Date(invoice.paidAt).toLocaleDateString()}`
                          : `Due ${new Date(invoice.dueAt).toLocaleDateString()}`}
                    </strong>
                  </span>
                  <span className={statusBadge(invoice.status)}>{invoice.status}</span>
                  <strong>{money(invoice.totalCents, invoice.currency)}</strong>
                  <ChevronRight size={14} />
                </Link>
              ))}
              {!service.invoices.length && (
                <div className="asd-v2-empty">
                  <FileText size={20} />
                  <span>No invoices linked to this service.</span>
                </div>
              )}
            </div>
          </section>
        </main>

        <aside>
          <section className="asd-v2-side">
            <header>
              <UserRound size={15} />
              <div>
                <small>Client</small>
                <strong>{displayName(service.user)}</strong>
              </div>
            </header>
            <div><span>Email</span><strong>{service.user.email}</strong></div>
            <div><span>Username</span><strong>@{service.user.username}</strong></div>
            <div><span>Credits</span><strong>{money(service.user.creditBalanceCents, 'GBP')}</strong></div>
            <Link to={`/admin/users/${service.user.id}`}>Open client <ChevronRight size={13} /></Link>
          </section>

          <section className="asd-v2-side">
            <header>
              <span className={service.panelServerId ? 'is-online' : ''}><i /></span>
              <div>
                <small>Spirit-Panel</small>
                <strong>{service.panelServerId ? 'Server linked' : 'Not provisioned'}</strong>
              </div>
            </header>
            <div><span>Panel server ID</span><strong>{service.panelServerId || '�'}</strong></div>
            {service.panelServerId && panelHref ? (
              <a href={panelHref} target="_blank" rel="noopener noreferrer">
                Open panel <ExternalLink size={13} />
              </a>
            ) : (
              <span className="asd-v2-side__muted">Panel access appears after provisioning.</span>
            )}
          </section>

          <section className="asd-v2-side">
            <header>
              <CheckCircle2 size={15} />
              <div>
                <small>Current plan</small>
                <strong>
                  {service.product.name === 'Custom' && service.panelEggName
                    ? `Custom � ${service.panelEggName}`
                    : service.product.name}
                </strong>
              </div>
            </header>
            <div><span>Billing cycle</span><strong>{cycle}</strong></div>
            <div><span>Recurring price</span><strong>{money(price, currency)}</strong></div>
            {service.panelEggName && <div><span>Panel egg</span><strong>{service.panelEggName}</strong></div>}
            <div><span>Updated</span><strong>{new Date(service.updatedAt).toLocaleString()}</strong></div>
          </section>
        </aside>
      </div>

      <ConfirmModal
        open={deleteOpen}
        title={`Delete ${service.name}?`}
        description="This permanently removes the service from billing and deletes its linked server from Spirit-Panel."
        confirmLabel="Delete service"
        busyLabel="Deleting�"
        tone="danger"
        actionIcon="delete"
        requireText={service.name}
        busy={busy}
        consequences={[
          'The panel server and files will be permanently deleted.',
          'The service will be removed from the client account.',
          'Unpaid invoices for this service will be cancelled with credit refunds.',
        ]}
        onCancel={() => !busy && setDeleteOpen(false)}
        onConfirm={() => void deleteService()}
      />

      {editOpen && editForm && (
        <div
          className="service-edit-modal"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) {
              setEditOpen(false);
              setEditForm(null);
            }
          }}
        >
          <section role="dialog" aria-modal="true" aria-labelledby="service-edit-title">
            <header>
              <span><SlidersHorizontal size={18} /></span>
              <div>
                <small>Server configuration</small>
                <h2 id="service-edit-title">Edit {service.name}</h2>
                <p>Changes are synchronized with Spirit-Panel before billing is updated.</p>
              </div>
              <button
                type="button"
                aria-label="Close editor"
                disabled={busy}
                onClick={() => {
                  setEditOpen(false);
                  setEditForm(null);
                }}
              >
                <X size={16} />
              </button>
            </header>

            <div className="service-edit-modal__body">
              <label className="service-edit-modal__name">
                <span>Server name <small>Shown to the client and in Spirit-Panel</small></span>
                <input
                  value={editForm.name}
                  maxLength={64}
                  onChange={(event) => setEditForm({ ...editForm, name: event.target.value })}
                />
              </label>

              <div className="service-edit-modal__section">
                <div><span>Resource limits</span><p>Set the resources assigned specifically to this server.</p></div>
                <div className="service-edit-modal__resources">
                  <label><MemoryStick size={15} /><span>Memory<small>MB � 0 = unlimited</small></span><input type="number" min={0} value={editForm.memoryMb} onChange={(event) => setEditForm({ ...editForm, memoryMb: Number(event.target.value) })} /></label>
                  <label><Cpu size={15} /><span>CPU limit<small>% � 0 = unlimited</small></span><input type="number" min={0} value={editForm.cpuPercent} onChange={(event) => setEditForm({ ...editForm, cpuPercent: Number(event.target.value) })} /></label>
                  <label><HardDrive size={15} /><span>Storage<small>MB � 0 = unlimited</small></span><input type="number" min={0} value={editForm.diskMb} onChange={(event) => setEditForm({ ...editForm, diskMb: Number(event.target.value) })} /></label>
                  <label><Archive size={15} /><span>Backups<small>slots � 0 = disabled</small></span><input type="number" min={0} value={editForm.backupLimit} onChange={(event) => setEditForm({ ...editForm, backupLimit: Number(event.target.value) })} /></label>
                  <label><Database size={15} /><span>Databases<small>slots � 0 = disabled</small></span><input type="number" min={0} value={editForm.databaseLimit} onChange={(event) => setEditForm({ ...editForm, databaseLimit: Number(event.target.value) })} /></label>
                  <label><Layers3 size={15} /><span>Allocations<small>ports · 0 = disabled</small></span><input type="number" min={0} value={editForm.allocationLimit} onChange={(event) => setEditForm({ ...editForm, allocationLimit: Number(event.target.value) })} /></label>
                </div>
                <label className="service-create-check" style={{ marginTop: '0.85rem' }}>
                  <input
                    type="checkbox"
                    checked={editForm.subdomainAccess}
                    onChange={(event) => setEditForm({ ...editForm, subdomainAccess: event.target.checked })}
                  />
                  <span>
                    <strong style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                      <Globe2 size={14} /> Allow subdomain manager
                    </strong>
                    <small>
                      {editForm.subdomainAccess
                        ? 'Client can create a hostname for this server.'
                        : 'Client cannot manage a subdomain for this server.'}
                    </small>
                  </span>
                </label>
                <label className="service-create-check" style={{ marginTop: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={editForm.fivemMarketplaceAccess}
                    onChange={(event) =>
                      setEditForm({ ...editForm, fivemMarketplaceAccess: event.target.checked })
                    }
                  />
                  <span>
                    <strong style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                      <Package size={14} /> Allow FiveM marketplace
                    </strong>
                    <small>
                      {editForm.fivemMarketplaceAccess
                        ? 'Client can one-click install marketplace resources.'
                        : 'FiveM marketplace is disabled for this server.'}
                    </small>
                  </span>
                </label>
                <label className="service-create-check" style={{ marginTop: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={editForm.minecraftPluginsAccess}
                    onChange={(event) =>
                      setEditForm({ ...editForm, minecraftPluginsAccess: event.target.checked })
                    }
                  />
                  <span>
                    <strong style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                      <Puzzle size={14} /> Allow Minecraft plugins
                    </strong>
                    <small>
                      {editForm.minecraftPluginsAccess
                        ? 'Client can one-click install Minecraft plugins.'
                        : 'Minecraft plugin install is disabled for this server.'}
                    </small>
                  </span>
                </label>
              </div>

              <div className="service-edit-modal__section">
                <div><span>Billing override</span><p>Change this client's recurring price and billing interval without altering the product. Imports start at �0 with no renewal until you set a price.</p></div>
                <div className="service-edit-modal__billing">
                  <label>
                    <span><CircleDollarSign size={14} /> Recurring price</span>
                    <input type="number" min={0} step="0.01" value={editForm.priceCents / 100} onChange={(event) => setEditForm({ ...editForm, priceCents: Math.round(Number(event.target.value) * 100) })} />
                  </label>
                  <label>
                    <span>Currency</span>
                    <ThemedSelect value={editForm.currency} options={currencyOptions} ariaLabel="Service currency" onChange={(value) => setEditForm({ ...editForm, currency: value })} />
                  </label>
                  <label>
                    <span>Billing interval</span>
                    <ThemedSelect value={editForm.cycle} options={cycleOptions} ariaLabel="Service billing interval" onChange={(value) => setEditForm({ ...editForm, cycle: value as ServiceEditForm['cycle'] })} />
                  </label>
                  <label>
                    <span>Next renewal</span>
                    <input
                      type="date"
                      value={editForm.nextDueAt}
                      onChange={(event) => setEditForm({ ...editForm, nextDueAt: event.target.value })}
                    />
                    <small>Clear the date and set price to �0 to unschedule. Saving a price above �0 without a date schedules one cycle ahead.</small>
                  </label>
                </div>
              </div>

              <div className="service-edit-modal__sync">
                <ShieldCheck size={16} />
                <div>
                  <strong>{service.panelServerId ? 'Panel synchronization enabled' : 'Applies during provisioning'}</strong>
                  <p>
                    {service.panelServerId
                      ? 'Spirit-Panel and Wings must accept the new limits before billing saves them.'
                      : 'This service is not provisioned yet. The limits will be used when its invoice is paid.'}
                  </p>
                </div>
              </div>
            </div>

            <footer>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setEditOpen(false);
                  setEditForm(null);
                }}
              >
                Cancel
              </button>
              <button type="button" disabled={busy || !editForm.name.trim()} onClick={() => void saveService()}>
                <Save size={14} /> {busy ? 'Synchronizing�' : 'Save server changes'}
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
