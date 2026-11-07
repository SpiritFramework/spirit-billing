import { FormEvent, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  CircleDollarSign,
  Cpu,
  Database,
  Globe2,
  HardDrive,
  Layers3,
  MemoryStick,
  Package,
  Puzzle,
  Save,
  Server,
} from 'lucide-react';
import { api, ApiError, money } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { isFullAdmin } from '../../lib/roles';
import { ThemedSelect } from '../../components/ThemedSelect';

type PanelEgg = { id: string; name: string; nest?: { id: string; name: string } };
type PanelNode = {
  id: string;
  name: string;
  fqdn: string;
  maintenanceMode: boolean;
};
type Category = { id: string; name: string; panelEggId?: string | null; active?: boolean };
type UserOption = {
  id: string;
  email: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  panelUserId: string | null;
};

type PanelCatalog = {
  eggs: PanelEgg[];
  nodes: PanelNode[];
  eggsError: string | null;
  nodesError: string | null;
  panelKeyConfigured: boolean;
};

const currencyOptions = ['GBP', 'USD', 'EUR', 'CAD', 'AUD'].map((value) => ({ value, label: value }));
const cycleOptions = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
];

function displayUser(user: UserOption) {
  const full = [user.firstName, user.lastName].filter(Boolean).join(' ');
  return full || user.username;
}

export function AdminServiceCreate() {
  const navigate = useNavigate();
  const { user } = useAuth();
  if (!isFullAdmin(user?.role)) return <Navigate to="/admin/services" replace />;
  const [users, setUsers] = useState<UserOption[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [catalog, setCatalog] = useState<PanelCatalog | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    userId: '',
    name: '',
    categoryId: '',
    panelEggId: '',
    panelNodeId: '',
    memoryMb: 4096,
    diskMb: 20480,
    cpuPercent: 200,
    backupLimit: 1,
    databaseLimit: 1,
    allocationLimit: 0,
    subdomainAccess: false,
    fivemMarketplaceAccess: false,
    minecraftPluginsAccess: false,
    priceCents: 1500,
    currency: 'GBP',
    cycle: 'monthly' as 'monthly' | 'quarterly' | 'yearly',
    billNow: false,
    nextDueAt: '',
  });

  useEffect(() => {
    void Promise.all([
      api<UserOption[]>('/admin/users'),
      api<Category[]>('/admin/categories'),
      api<PanelCatalog>('/admin/panel/catalog'),
    ])
      .then(([userList, cats, panel]) => {
        setUsers(userList.filter((u) => u.panelUserId));
        setCategories(cats.filter((c) => c.active !== false));
        setCatalog(panel);
        setForm((prev) => ({
          ...prev,
          panelEggId: prev.panelEggId || panel.eggs[0]?.id || '',
          panelNodeId:
            prev.panelNodeId ||
            panel.nodes.find((n) => !n.maintenanceMode)?.id ||
            panel.nodes[0]?.id ||
            '',
        }));
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load form data'))
      .finally(() => setLoading(false));
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await api<{ service: { id: string } }>('/admin/services/custom', {
        method: 'POST',
        body: JSON.stringify({
          userId: form.userId,
          name: form.name.trim(),
          categoryId: form.categoryId || null,
          panelEggId: form.panelEggId,
          panelNodeId: form.panelNodeId,
          memoryMb: form.memoryMb,
          diskMb: form.diskMb,
          cpuPercent: form.cpuPercent,
          backupLimit: form.backupLimit,
          databaseLimit: form.databaseLimit,
          allocationLimit: form.allocationLimit,
          subdomainAccess: form.subdomainAccess,
          fivemMarketplaceAccess: form.fivemMarketplaceAccess,
          minecraftPluginsAccess: form.minecraftPluginsAccess,
          priceCents: form.priceCents,
          currency: form.currency,
          cycle: form.cycle,
          billNow: form.billNow,
          nextDueAt: form.nextDueAt || null,
          provision: true,
        }),
      });
      navigate(`/admin/services/${result.service.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create custom server');
      setBusy(false);
    }
  }

  const userOptions = users.map((user) => ({
    value: user.id,
    label: `${displayUser(user)} (@${user.username})`,
    description: user.email,
  }));
  const eggOptions = (catalog?.eggs || []).map((egg) => ({
    value: egg.id,
    label: egg.name,
    description: egg.nest?.name,
  }));
  const nodeOptions = (catalog?.nodes || []).map((node) => ({
    value: node.id,
    label: node.name,
    description: node.maintenanceMode ? `${node.fqdn} · maintenance` : node.fqdn,
  }));
  const categoryOptions = [
    { value: '', label: 'No category' },
    ...categories.map((category) => ({
      value: category.id,
      label: category.name,
      description: category.panelEggId ? 'Egg linked' : undefined,
    })),
  ];

  const canSubmit =
    Boolean(form.userId && form.name.trim() && form.panelEggId && form.panelNodeId) && !busy;
  const checklist = [
    Boolean(form.userId),
    Boolean(form.name.trim()),
    Boolean(form.panelEggId && form.panelNodeId),
    form.priceCents >= 0,
  ].filter(Boolean).length;

  if (loading) {
    return (
      <div className="service-create-v2">
        <div className="service-create-loading">
          <Server size={22} />
          <span>Loading custom server builder…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="service-create-v2">
      <Link to="/admin/services" className="service-create-v2__back">
        <ArrowLeft size={14} /> All services
      </Link>

      <header className="service-create-v2__header">
        <div>
          <span>Custom infrastructure</span>
          <h1>New custom server</h1>
          <p>Provision a one-off Spirit-Panel server with custom specs and pricing — no catalog plan required.</p>
        </div>
        <div>
          <Link to="/admin/services">Cancel</Link>
          <button type="submit" form="service-create-form" disabled={!canSubmit}>
            <Save size={14} /> {busy ? 'Creating…' : 'Create server'}
          </button>
        </div>
      </header>

      {error && <div className="ds-alert ds-alert--error">{error}</div>}
      {catalog && !catalog.panelKeyConfigured && (
        <div className="ds-alert ds-alert--error">Configure the Spirit-Panel API key in Settings first.</div>
      )}
      {catalog?.eggsError && <div className="ds-alert ds-alert--info">{catalog.eggsError}</div>}
      {catalog?.nodesError && <div className="ds-alert ds-alert--info">{catalog.nodesError}</div>}

      <div className="service-create-layout">
        <form id="service-create-form" className="service-create-form" onSubmit={(event) => void onSubmit(event)}>
          <section>
            <header>
              <span>01</span>
              <div>
                <h2>Client & identity</h2>
                <p>Assign the server to a panel-linked client.</p>
              </div>
            </header>
            <div className="service-create-fields">
              <label className="is-wide">
                <span>Client <small>Required · panel linked only</small></span>
                <ThemedSelect
                  value={form.userId}
                  options={userOptions}
                  ariaLabel="Client"
                  placeholder={users.length ? 'Select a linked client…' : 'No panel-linked clients'}
                  onChange={(userId) => setForm({ ...form, userId })}
                />
              </label>
              <label className="is-wide">
                <span>Server name <small>Required</small></span>
                <input
                  value={form.name}
                  maxLength={64}
                  required
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  placeholder="e.g. Custom Minecraft 8GB"
                />
              </label>
              <label className="is-full">
                <span>Category <small>Optional</small></span>
                <ThemedSelect
                  value={form.categoryId}
                  options={categoryOptions}
                  ariaLabel="Category"
                  onChange={(categoryId) => {
                    const category = categories.find((item) => item.id === categoryId);
                    setForm({
                      ...form,
                      categoryId,
                      ...(category?.panelEggId ? { panelEggId: category.panelEggId } : {}),
                    });
                  }}
                />
              </label>
            </div>
          </section>

          <section>
            <header>
              <span>02</span>
              <div>
                <h2>Panel placement</h2>
                <p>Egg and node used when creating the Spirit-Panel server.</p>
              </div>
            </header>
            <div className="service-create-fields">
              <label className="is-wide">
                <span>Egg</span>
                <ThemedSelect
                  value={form.panelEggId}
                  options={eggOptions}
                  ariaLabel="Panel egg"
                  onChange={(panelEggId) => setForm({ ...form, panelEggId })}
                />
              </label>
              <label className="is-wide">
                <span>Node</span>
                <ThemedSelect
                  value={form.panelNodeId}
                  options={nodeOptions}
                  ariaLabel="Panel node"
                  onChange={(panelNodeId) => setForm({ ...form, panelNodeId })}
                />
              </label>
            </div>
          </section>

          <section>
            <header>
              <span>03</span>
              <div>
                <h2>Resources</h2>
                <p>Custom limits for this server only.</p>
              </div>
            </header>
            <div className="service-create-resources">
              <label>
                <MemoryStick size={15} />
                <span>Memory <small>MB · 0 = unlimited</small></span>
                <input
                  type="number"
                  min={0}
                  value={form.memoryMb}
                  onChange={(event) => setForm({ ...form, memoryMb: Number(event.target.value) })}
                />
              </label>
              <label>
                <Cpu size={15} />
                <span>CPU <small>% · 0 = unlimited</small></span>
                <input
                  type="number"
                  min={0}
                  value={form.cpuPercent}
                  onChange={(event) => setForm({ ...form, cpuPercent: Number(event.target.value) })}
                />
              </label>
              <label>
                <HardDrive size={15} />
                <span>Disk <small>MB · 0 = unlimited</small></span>
                <input
                  type="number"
                  min={0}
                  value={form.diskMb}
                  onChange={(event) => setForm({ ...form, diskMb: Number(event.target.value) })}
                />
              </label>
              <label>
                <Archive size={15} />
                <span>Backups <small>slots · 0 = disabled</small></span>
                <input
                  type="number"
                  min={0}
                  value={form.backupLimit}
                  onChange={(event) => setForm({ ...form, backupLimit: Number(event.target.value) })}
                />
              </label>
              <label>
                <Database size={15} />
                <span>Databases <small>slots · 0 = disabled</small></span>
                <input
                  type="number"
                  min={0}
                  value={form.databaseLimit}
                  onChange={(event) => setForm({ ...form, databaseLimit: Number(event.target.value) })}
                />
              </label>
              <label>
                <Layers3 size={15} />
                <span>Allocations <small>ports · 0 = disabled</small></span>
                <input
                  type="number"
                  min={0}
                  value={form.allocationLimit}
                  onChange={(event) => setForm({ ...form, allocationLimit: Number(event.target.value) })}
                />
              </label>
            </div>
            <label className="service-create-check is-full" style={{ marginTop: '0.75rem' }}>
              <input
                type="checkbox"
                checked={form.subdomainAccess}
                onChange={(event) => setForm({ ...form, subdomainAccess: event.target.checked })}
              />
              <span>
                <strong style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Globe2 size={14} /> Allow subdomain manager
                </strong>
                <small>
                  {form.subdomainAccess
                    ? 'Client can create a hostname for this server (requires Cloudflare DNS in Spirit-Panel).'
                    : 'Client cannot manage a subdomain for this server.'}
                </small>
              </span>
            </label>
            <label className="service-create-check is-full" style={{ marginTop: '0.5rem' }}>
              <input
                type="checkbox"
                checked={form.fivemMarketplaceAccess}
                onChange={(event) => setForm({ ...form, fivemMarketplaceAccess: event.target.checked })}
              />
              <span>
                <strong style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Package size={14} /> Allow FiveM marketplace
                </strong>
                <small>
                  {form.fivemMarketplaceAccess
                    ? 'Client can one-click install marketplace resources on this server.'
                    : 'FiveM marketplace is disabled for this server.'}
                </small>
              </span>
            </label>
            <label className="service-create-check is-full" style={{ marginTop: '0.5rem' }}>
              <input
                type="checkbox"
                checked={form.minecraftPluginsAccess}
                onChange={(event) => setForm({ ...form, minecraftPluginsAccess: event.target.checked })}
              />
              <span>
                <strong style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Puzzle size={14} /> Allow Minecraft plugins
                </strong>
                <small>
                  {form.minecraftPluginsAccess
                    ? 'Client can one-click install plugins on this server.'
                    : 'Minecraft plugin install is disabled for this server.'}
                </small>
              </span>
            </label>
          </section>

          <section>
            <header>
              <span>04</span>
              <div>
                <h2>Billing</h2>
                <p>Recurring price for renewals. Leave next renewal blank to auto-schedule when price is above £0.</p>
              </div>
            </header>
            <div className="service-create-fields service-create-fields--billing">
              <label>
                <span>
                  <CircleDollarSign size={12} /> Recurring price
                </span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.priceCents / 100}
                  onChange={(event) =>
                    setForm({ ...form, priceCents: Math.round(Number(event.target.value) * 100) })
                  }
                />
              </label>
              <label>
                <span>Currency</span>
                <ThemedSelect
                  value={form.currency}
                  options={currencyOptions}
                  ariaLabel="Currency"
                  onChange={(currency) => setForm({ ...form, currency })}
                />
              </label>
              <label>
                <span>Cycle</span>
                <ThemedSelect
                  value={form.cycle}
                  options={cycleOptions}
                  ariaLabel="Billing cycle"
                  onChange={(cycle) => setForm({ ...form, cycle: cycle as typeof form.cycle })}
                />
              </label>
              <label>
                <span>Next renewal <small>Optional</small></span>
                <input
                  type="date"
                  value={form.nextDueAt}
                  onChange={(event) => setForm({ ...form, nextDueAt: event.target.value })}
                />
              </label>
              <label className="service-create-check is-full">
                <input
                  type="checkbox"
                  checked={form.billNow}
                  onChange={(event) => setForm({ ...form, billNow: event.target.checked })}
                />
                <span>
                  {form.billNow
                    ? `Bill now — create an unpaid ${money(form.priceCents, form.currency)} invoice; service stays pending until paid`
                    : `Activate free now — provision immediately with no invoice (still charges ${money(form.priceCents, form.currency)} on renewals)`}
                </span>
              </label>
            </div>
          </section>
        </form>

        <aside className="service-create-side">
          <section>
            <header>
              <span>Launch checklist</span>
              <strong>{checklist}/4</strong>
            </header>
            <div className={form.userId ? 'is-done' : ''}>{form.userId ? '✓' : ''} Client selected</div>
            <div className={form.name.trim() ? 'is-done' : ''}>{form.name.trim() ? '✓' : ''} Server named</div>
            <div className={form.panelEggId && form.panelNodeId ? 'is-done' : ''}>
              {form.panelEggId && form.panelNodeId ? '✓' : ''} Egg and node set
            </div>
            <div className={form.priceCents >= 0 ? 'is-done' : ''}>{form.priceCents >= 0 ? '✓' : ''} Pricing configured</div>
          </section>
          <section>
            <header>
              <span>Preview</span>
            </header>
            <strong>{form.name.trim() || 'Untitled server'}</strong>
            <p>
              {form.memoryMb <= 0 ? 'Unlimited RAM' : `${Math.round(form.memoryMb / 1024)} GB`}
              {' · '}
              {form.cpuPercent <= 0 ? 'Unlimited CPU' : `${form.cpuPercent}% CPU`}
              {' · '}
              {form.diskMb <= 0 ? 'Unlimited disk' : `${Math.round(form.diskMb / 1024)} GB disk`}
            </p>
            <p>
              {money(form.priceCents, form.currency)} / {form.cycle}
              {form.billNow ? ' · invoice on create' : ' · active on create'}
            </p>
            <button type="submit" form="service-create-form" disabled={!canSubmit}>
              {busy ? 'Creating…' : 'Create custom server'} <ArrowRight size={14} />
            </button>
          </section>
        </aside>
      </div>
    </div>
  );
}
