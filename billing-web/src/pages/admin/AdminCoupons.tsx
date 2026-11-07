import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  FileText,
  Gift,
  Percent,
  Plus,
  RefreshCw,
  Search,
  Tag,
  Ticket,
  Trash2,
  Users,
  WalletCards,
  X,
} from 'lucide-react';
import { api, ApiError, money } from '../../lib/api';
import { ConfirmModal } from '../../components/ConfirmModal';
import { ThemedSelect } from '../../components/ThemedSelect';

type Coupon = {
  id: string;
  code: string;
  type: 'percent' | 'fixed' | 'credit';
  value: number;
  description: string;
  maxRedemptions: number | null;
  redemptionCount: number;
  perUserLimit: number;
  minOrderCents: number;
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
  createdAt: string;
  _count?: { redemptions: number };
};

type CouponRedemption = {
  id: string;
  discountCents: number;
  creditCents: number;
  createdAt: string;
  coupon: {
    id: string;
    code: string;
    type: 'percent' | 'fixed' | 'credit';
    value: number;
    description: string;
  };
  user: {
    id: string;
    email: string;
    username: string;
    firstName: string | null;
    lastName: string | null;
  };
  invoice: {
    id: string;
    number: string;
    status: string;
    totalCents: number;
    currency: string;
  } | null;
};

type CouponForm = {
  code: string;
  type: 'percent' | 'fixed' | 'credit';
  value: string;
  description: string;
  maxRedemptions: string;
  perUserLimit: string;
  minOrderCents: string;
  startsAt: string;
  endsAt: string;
  active: boolean;
};

type StatusFilter = 'all' | 'active' | 'inactive';
type TypeFilter = 'all' | 'percent' | 'fixed' | 'credit';
type DeskView = 'campaigns' | 'history';

const emptyForm: CouponForm = {
  code: '',
  type: 'percent',
  value: '10',
  description: '',
  maxRedemptions: '',
  perUserLimit: '1',
  minOrderCents: '0',
  startsAt: '',
  endsAt: '',
  active: true,
};

function displayName(user: CouponRedemption['user']) {
  return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username;
}

function rewardLabel(coupon: Pick<Coupon, 'type' | 'value'>) {
  if (coupon.type === 'percent') return `${coupon.value}% off`;
  if (coupon.type === 'credit') return `+${money(coupon.value, 'GBP')}`;
  return money(coupon.value, 'GBP');
}

function typeLabel(type: Coupon['type']) {
  if (type === 'percent') return 'Percent';
  if (type === 'credit') return 'Credit';
  return 'Fixed';
}

function TypeIcon({ type, size = 14 }: { type: Coupon['type']; size?: number }) {
  if (type === 'percent') return <Percent size={size} />;
  if (type === 'credit') return <Gift size={size} />;
  return <CircleDollarSign size={size} />;
}

function formatShort(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: '2-digit',
  });
}

export function AdminCoupons() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [redemptions, setRedemptions] = useState<CouponRedemption[]>([]);
  const [form, setForm] = useState<CouponForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [redemptionsLoading, setRedemptionsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Coupon | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [historyQuery, setHistoryQuery] = useState('');
  const [historyCouponId, setHistoryCouponId] = useState('all');
  const view: DeskView = searchParams.get('tab') === 'history' ? 'history' : 'campaigns';
  const creating = view === 'campaigns' && searchParams.get('new') === '1';

  function setView(next: DeskView) {
    const params = new URLSearchParams(searchParams);
    if (next === 'history') {
      params.set('tab', 'history');
      params.delete('new');
    } else {
      params.delete('tab');
    }
    setSearchParams(params, { replace: true });
  }

  function setCreating(next: boolean) {
    const params = new URLSearchParams(searchParams);
    params.delete('tab');
    if (next) params.set('new', '1');
    else params.delete('new');
    setSearchParams(params, { replace: true });
  }

  async function load() {
    setLoading(true);
    setError('');
    try {
      setCoupons(await api<Coupon[]>('/admin/coupons'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load coupons');
    } finally {
      setLoading(false);
    }
  }

  async function loadRedemptions(couponId?: string) {
    setRedemptionsLoading(true);
    try {
      const qs = couponId && couponId !== 'all' ? `?couponId=${encodeURIComponent(couponId)}` : '';
      setRedemptions(await api<CouponRedemption[]>(`/admin/coupons/redemptions${qs}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load redemptions');
    } finally {
      setRedemptionsLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    void loadRedemptions(historyCouponId);
  }, [historyCouponId]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const valueNum = Number(form.value);
      const payload = {
        code: form.code.trim(),
        type: form.type,
        value: form.type === 'percent' ? Math.round(valueNum) : Math.round(valueNum * 100),
        description: form.description.trim(),
        maxRedemptions: form.maxRedemptions.trim() ? Number(form.maxRedemptions) : null,
        perUserLimit: Number(form.perUserLimit) || 1,
        minOrderCents: Math.round(Number(form.minOrderCents || '0') * 100),
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
        active: form.active,
      };
      await api('/admin/coupons', { method: 'POST', body: JSON.stringify(payload) });
      setForm(emptyForm);
      setCreating(false);
      setMessage('Coupon created.');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create coupon');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(coupon: Coupon) {
    try {
      await api(`/admin/coupons/${coupon.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !coupon.active }),
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Update failed');
    }
  }

  async function remove(coupon: Coupon) {
    setDeleting(true);
    try {
      await api(`/admin/coupons/${coupon.id}`, { method: 'DELETE' });
      await Promise.all([load(), loadRedemptions(historyCouponId)]);
      setDeleteTarget(null);
      setMessage(`${coupon.code} deleted.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Delete failed');
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  const stats = useMemo(() => {
    const active = coupons.filter((c) => c.active).length;
    const percent = coupons.filter((c) => c.type === 'percent').length;
    const fixed = coupons.filter((c) => c.type === 'fixed').length;
    const credit = coupons.filter((c) => c.type === 'credit').length;
    const redemptionsTotal = coupons.reduce((sum, c) => sum + c.redemptionCount, 0);
    return {
      total: coupons.length,
      active,
      inactive: coupons.length - active,
      percent,
      fixed,
      credit,
      redemptions: redemptionsTotal,
    };
  }, [coupons]);

  const filteredCoupons = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return coupons.filter((coupon) => {
      if (status === 'active' && !coupon.active) return false;
      if (status === 'inactive' && coupon.active) return false;
      if (typeFilter !== 'all' && coupon.type !== typeFilter) return false;
      if (!needle) return true;
      return `${coupon.code} ${coupon.description}`.toLowerCase().includes(needle);
    });
  }, [coupons, query, status, typeFilter]);

  const filtersActive = status !== 'all' || typeFilter !== 'all' || Boolean(query.trim());

  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    if (status === 'active') parts.push('Active');
    if (status === 'inactive') parts.push('Inactive');
    if (typeFilter !== 'all') parts.push(typeLabel(typeFilter));
    if (query.trim()) parts.push(`“${query.trim()}”`);
    return parts;
  }, [status, typeFilter, query]);

  function clearFilters() {
    setStatus('all');
    setTypeFilter('all');
    setQuery('');
  }

  function setChipFilter(next: { status?: StatusFilter; type?: TypeFilter }) {
    setStatus(next.status ?? 'all');
    setTypeFilter(next.type ?? 'all');
    setQuery('');
    setView('campaigns');
    setCreating(false);
  }

  const visibleRedemptions = useMemo(() => {
    const q = historyQuery.trim().toLowerCase();
    if (!q) return redemptions;
    return redemptions.filter((row) => {
      const haystack = [
        row.coupon.code,
        row.coupon.description,
        row.user.username,
        row.user.email,
        row.user.firstName,
        row.user.lastName,
        row.invoice?.number,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [historyQuery, redemptions]);

  const couponFilterOptions = useMemo(
    () => [
      { value: 'all', label: 'All coupons', description: 'Every redemption on record' },
      ...coupons.map((coupon) => ({
        value: coupon.id,
        label: coupon.code,
        description: `${rewardLabel(coupon)} · ${coupon.redemptionCount} use${coupon.redemptionCount === 1 ? '' : 's'}`,
      })),
    ],
    [coupons],
  );

  const previewValue =
    form.type === 'percent'
      ? `${form.value || '0'}% off`
      : form.type === 'credit'
        ? `+${money(Math.round(Number(form.value || 0) * 100), 'GBP')} credit`
        : `${money(Math.round(Number(form.value || 0) * 100), 'GBP')} off`;

  return (
    <div className="ops-users ops-coupons">
      <header className="ops-users__mast">
        <div className="ops-users__mast-copy">
          <span>Promotions</span>
          <h1>Coupons</h1>
          <p>Checkout discounts, credit rewards, and redemption audit.</p>
        </div>
        <div className="ops-users__mast-meta">
          <button
            type="button"
            className={`ops-users__chip${view === 'campaigns' && !filtersActive && !creating ? ' is-active' : ''}`}
            onClick={() => {
              clearFilters();
              setView('campaigns');
              setCreating(false);
            }}
            title="Show all coupons"
          >
            <span className="ops-users__chip-icon" aria-hidden>
              <Ticket size={14} />
            </span>
            <span className="ops-users__chip-copy">
              <small>Campaigns</small>
              <strong>{stats.total}</strong>
            </span>
          </button>
          <button
            type="button"
            className={`ops-users__chip is-ok${
              status === 'active' && typeFilter === 'all' && !query.trim() && view === 'campaigns'
                ? ' is-active'
                : ''
            }`}
            onClick={() => setChipFilter({ status: 'active' })}
            title="Show active coupons"
          >
            <span className="ops-users__chip-icon" aria-hidden>
              <CheckCircle2 size={14} />
            </span>
            <span className="ops-users__chip-copy">
              <small>Active</small>
              <strong>{stats.active}</strong>
            </span>
          </button>
          <button
            type="button"
            className={`ops-users__chip${view === 'history' ? ' is-active' : ''}`}
            onClick={() => {
              setView('history');
              setCreating(false);
            }}
            title="Show redemption history"
          >
            <span className="ops-users__chip-icon" aria-hidden>
              <Users size={14} />
            </span>
            <span className="ops-users__chip-copy">
              <small>Redeemed</small>
              <strong>{stats.redemptions}</strong>
            </span>
          </button>
          <button
            type="button"
            className={`ops-users__chip${
              typeFilter === 'credit' && status === 'all' && !query.trim() && view === 'campaigns'
                ? ' is-active'
                : ''
            }`}
            onClick={() => setChipFilter({ type: 'credit' })}
            title="Show credit reward coupons"
          >
            <span className="ops-users__chip-icon" aria-hidden>
              <WalletCards size={14} />
            </span>
            <span className="ops-users__chip-copy">
              <small>Credit</small>
              <strong>{stats.credit}</strong>
            </span>
          </button>
        </div>
      </header>

      {error ? <div className="ds-alert ds-alert--error">{error}</div> : null}
      {message ? <div className="ds-alert ds-alert--success">{message}</div> : null}

      <div className="ops-coupons__tabs" role="tablist" aria-label="Coupons views">
        <button
          type="button"
          role="tab"
          aria-selected={view === 'campaigns'}
          className={view === 'campaigns' ? 'is-on' : ''}
          onClick={() => setView('campaigns')}
        >
          <Ticket size={14} /> Campaigns
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'history'}
          className={view === 'history' ? 'is-on' : ''}
          onClick={() => {
            setView('history');
            setCreating(false);
          }}
        >
          <Users size={14} /> Redemptions
        </button>
      </div>

      {view === 'campaigns' && creating ? (
        <div className="ops-coupons__create">
          <form className="ops-coupons__create-main" onSubmit={(event) => void onCreate(event)}>
            <header className="ops-coupons__create-head">
              <div>
                <span>New campaign</span>
                <h2>Create coupon</h2>
                <p>Code, reward value, usage limits, and schedule.</p>
              </div>
              <div className="ops-coupons__create-actions">
                <button
                  type="button"
                  className="ops-user__btn is-ghost"
                  onClick={() => {
                    setCreating(false);
                    setForm(emptyForm);
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="ops-user__btn is-primary" disabled={saving || !form.code.trim()}>
                  <Plus size={14} />
                  {saving ? 'Creating…' : 'Create'}
                </button>
              </div>
            </header>

            <section className="ops-user__panel">
              <header>
                <span className="ops-user__panel-icon" aria-hidden>
                  <Tag size={14} />
                </span>
                <div>
                  <h2>Reward</h2>
                  <p>Code and value customers receive.</p>
                </div>
              </header>
              <div className="ops-coupons__fields">
                <label className="ops-user__field">
                  <span>
                    Code <em>Required</em>
                  </span>
                  <input
                    required
                    value={form.code}
                    maxLength={64}
                    placeholder="WELCOME10"
                    onChange={(event) =>
                      setForm({ ...form, code: event.target.value.toUpperCase().replace(/\s/g, '') })
                    }
                  />
                </label>
                <label className="ops-user__field">
                  <span>Type</span>
                  <ThemedSelect
                    ariaLabel="Reward type"
                    value={form.type}
                    onChange={(type) =>
                      setForm({
                        ...form,
                        type: type as CouponForm['type'],
                        value: type === 'percent' ? '10' : '5',
                      })
                    }
                    options={[
                      { value: 'percent', label: 'Percentage discount', description: 'Percent off the order' },
                      { value: 'fixed', label: 'Fixed discount', description: 'Fixed GBP off' },
                      { value: 'credit', label: 'Account credit', description: 'Add wallet credit' },
                    ]}
                  />
                </label>
                <label className="ops-user__field">
                  <span>
                    {form.type === 'percent'
                      ? 'Discount %'
                      : form.type === 'credit'
                        ? 'Credit (£)'
                        : 'Discount (£)'}
                  </span>
                  <input
                    required
                    type="number"
                    min={form.type === 'percent' ? 1 : 0.01}
                    max={form.type === 'percent' ? 100 : undefined}
                    step={form.type === 'percent' ? 1 : 0.01}
                    value={form.value}
                    onChange={(event) => setForm({ ...form, value: event.target.value })}
                  />
                </label>
                <label className="ops-user__field">
                  <span>Min order (£)</span>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={form.minOrderCents}
                    onChange={(event) => setForm({ ...form, minOrderCents: event.target.value })}
                  />
                  <p className="ops-user__hint">
                    {form.type === 'credit' ? '0 allows direct redemption.' : '0 means no minimum.'}
                  </p>
                </label>
                <label className="ops-user__field ops-coupons__full">
                  <span>Description</span>
                  <input
                    value={form.description}
                    maxLength={255}
                    placeholder="Summer launch promotion"
                    onChange={(event) => setForm({ ...form, description: event.target.value })}
                  />
                </label>
              </div>
            </section>

            <section className="ops-user__panel">
              <header>
                <span className="ops-user__panel-icon" aria-hidden>
                  <CalendarDays size={14} />
                </span>
                <div>
                  <h2>Usage & schedule</h2>
                  <p>Limits and when the code is valid.</p>
                </div>
              </header>
              <div className="ops-coupons__fields">
                <label className="ops-user__field">
                  <span>Max redemptions</span>
                  <input
                    type="number"
                    min={1}
                    value={form.maxRedemptions}
                    placeholder="Unlimited"
                    onChange={(event) => setForm({ ...form, maxRedemptions: event.target.value })}
                  />
                </label>
                <label className="ops-user__field">
                  <span>Per customer</span>
                  <input
                    type="number"
                    min={1}
                    value={form.perUserLimit}
                    onChange={(event) => setForm({ ...form, perUserLimit: event.target.value })}
                  />
                </label>
                <label className="ops-user__field">
                  <span>Starts at</span>
                  <input
                    type="datetime-local"
                    value={form.startsAt}
                    onChange={(event) => setForm({ ...form, startsAt: event.target.value })}
                  />
                </label>
                <label className="ops-user__field">
                  <span>Ends at</span>
                  <input
                    type="datetime-local"
                    min={form.startsAt || undefined}
                    value={form.endsAt}
                    onChange={(event) => setForm({ ...form, endsAt: event.target.value })}
                  />
                </label>
              </div>
              <button
                type="button"
                className={`ops-coupons__toggle${form.active ? ' is-on' : ''}`}
                onClick={() => setForm({ ...form, active: !form.active })}
              >
                <span aria-hidden>
                  <CheckCircle2 size={16} />
                </span>
                <div>
                  <strong>{form.active ? 'Activate immediately' : 'Create inactive'}</strong>
                  <p>Schedule windows still control when customers can redeem.</p>
                </div>
                <i>
                  <span />
                </i>
              </button>
            </section>
          </form>

          <aside className="ops-coupons__preview">
            <section className="ops-user__panel">
              <header>
                <span className="ops-user__panel-icon" aria-hidden>
                  <TypeIcon type={form.type} />
                </span>
                <div>
                  <h2>Preview</h2>
                  <p>How the reward reads at checkout.</p>
                </div>
              </header>
              <div className={`ops-coupons__preview-card is-${form.type}`}>
                <span className="ops-coupons__preview-mark" aria-hidden>
                  <TypeIcon type={form.type} size={18} />
                </span>
                <small>{form.type === 'credit' ? 'Account reward' : 'Checkout discount'}</small>
                <h3>{form.code || 'YOURCODE'}</h3>
                <strong>{previewValue}</strong>
                <p>{form.description || 'Campaign description appears here.'}</p>
                <div>
                  <span>
                    Per user <b>{form.perUserLimit || '1'}×</b>
                  </span>
                  <span>
                    Min <b>{money(Math.round(Number(form.minOrderCents || 0) * 100), 'GBP')}</b>
                  </span>
                </div>
              </div>
              <div className="ops-coupons__preview-schedule">
                <CalendarDays size={14} aria-hidden />
                <div>
                  <strong>{form.startsAt || form.endsAt ? 'Scheduled' : 'No schedule'}</strong>
                  <small>
                    {form.startsAt
                      ? `Starts ${new Date(form.startsAt).toLocaleString()}`
                      : 'Available as soon as it is active.'}
                    {form.endsAt ? ` · Ends ${new Date(form.endsAt).toLocaleString()}` : ''}
                  </small>
                </div>
              </div>
              <ul className="ops-coupons__checklist">
                {(
                  [
                    ['Code', Boolean(form.code.trim())],
                    ['Reward value', Boolean(form.value && Number(form.value) > 0)],
                    ['Per-user limit', Boolean(Number(form.perUserLimit) > 0)],
                  ] as const
                ).map(([label, done]) => (
                  <li key={label} className={done ? 'is-done' : ''}>
                    {done ? <Check size={11} /> : <i />}
                    {label}
                  </li>
                ))}
              </ul>
            </section>
          </aside>
        </div>
      ) : null}

      {view === 'campaigns' && !creating ? (
        <div className="ops-users__shell">
          <aside className="ops-users__rail" aria-label="Coupon filters">
            <div className="ops-users__rail-block">
              <span>Status</span>
              <div>
                {(
                  [
                    ['all', 'Any status', stats.total],
                    ['active', 'Active', stats.active],
                    ['inactive', 'Inactive', stats.inactive],
                  ] as const
                ).map(([value, label, count]) => (
                  <button
                    key={value}
                    type="button"
                    className={status === value ? 'is-on' : ''}
                    onClick={() => setStatus(value)}
                  >
                    {label}
                    <em>{count}</em>
                  </button>
                ))}
              </div>
            </div>
            <div className="ops-users__rail-block">
              <span>Type</span>
              <div>
                {(
                  [
                    ['all', 'Any type', stats.total],
                    ['percent', 'Percent', stats.percent],
                    ['fixed', 'Fixed', stats.fixed],
                    ['credit', 'Credit', stats.credit],
                  ] as const
                ).map(([value, label, count]) => (
                  <button
                    key={value}
                    type="button"
                    className={typeFilter === value ? 'is-on' : ''}
                    onClick={() => setTypeFilter(value)}
                  >
                    {label}
                    <em>{count}</em>
                  </button>
                ))}
              </div>
            </div>
          </aside>

          <div className="ops-users__main">
            <div className="ops-users__command ops-coupons__command">
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
                  placeholder="Filter by code or description"
                  aria-label="Search coupons"
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

              <div className="ops-services__jobs" role="group" aria-label="Coupon actions">
                <button
                  type="button"
                  className="ops-services__create"
                  onClick={() => {
                    setCreating(true);
                    setMessage('');
                  }}
                >
                  <Plus size={14} /> New
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void load()}
                >
                  <RefreshCw size={14} /> Refresh
                </button>
              </div>

              <div className="ops-users__command-meta">
                <span>
                  Showing <strong>{filteredCoupons.length}</strong> / {stats.total}
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

            <section className="ops-users__table" aria-label="Coupons">
              <div className="ops-users__head ops-coupons__head" aria-hidden>
                <span>Coupon</span>
                <span>Reward</span>
                <span>Uses</span>
                <span>Limits</span>
                <span>Status</span>
                <span />
              </div>

              {loading ? (
                <div className="ops-users__empty">
                  <RefreshCw size={22} />
                  <h3>Loading coupons…</h3>
                </div>
              ) : (
                filteredCoupons.map((coupon) => {
                  const schedule =
                    coupon.startsAt || coupon.endsAt
                      ? `${formatShort(coupon.startsAt) || 'Now'} → ${formatShort(coupon.endsAt) || '∞'}`
                      : 'No schedule';
                  return (
                    <div key={coupon.id} className="ops-coupons__row-wrap">
                      <button
                        type="button"
                        className={`ops-users__row ops-coupons__row${!coupon.active ? ' is-off' : ''}`}
                        onClick={() => {
                          setHistoryCouponId(coupon.id);
                          setView('history');
                        }}
                      >
                        <span className="ops-coupons__who">
                          <span className={`ops-coupons__mark is-${coupon.type}`} aria-hidden>
                            <TypeIcon type={coupon.type} size={15} />
                          </span>
                          <span>
                            <strong>{coupon.code}</strong>
                            <small>{typeLabel(coupon.type)}</small>
                            <em>{coupon.description || 'No description'}</em>
                          </span>
                        </span>

                        <span className="ops-coupons__reward">
                          <strong>{rewardLabel(coupon)}</strong>
                          <small>Min {money(coupon.minOrderCents, 'GBP')}</small>
                        </span>

                        <span className="ops-coupons__uses">
                          <strong>
                            {coupon.redemptionCount}
                            {coupon.maxRedemptions != null ? ` / ${coupon.maxRedemptions}` : ''}
                          </strong>
                          <small>{coupon.perUserLimit}× / user</small>
                        </span>

                        <span className="ops-coupons__schedule">
                          <CalendarDays size={12} aria-hidden />
                          {schedule}
                        </span>

                        <span className={`ops-coupons__status${coupon.active ? ' is-live' : ' is-off'}`}>
                          {coupon.active ? (
                            <>
                              <CheckCircle2 size={12} aria-hidden /> Active
                            </>
                          ) : (
                            <>Off</>
                          )}
                        </span>

                        <ChevronRight size={16} aria-hidden />
                      </button>
                      <div className="ops-coupons__row-actions">
                        <button
                          type="button"
                          onClick={() => void toggleActive(coupon)}
                          title={coupon.active ? 'Disable coupon' : 'Enable coupon'}
                        >
                          {coupon.active ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          type="button"
                          className="is-danger"
                          aria-label={`Delete ${coupon.code}`}
                          onClick={() => setDeleteTarget(coupon)}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}

              {!loading && !filteredCoupons.length ? (
                <div className="ops-users__empty">
                  <Ticket size={24} />
                  <h3>{coupons.length ? 'No matching coupons' : 'No coupons yet'}</h3>
                  <p>
                    {coupons.length
                      ? 'Try another search or clear the filters.'
                      : 'Create a promotion to discount checkout or grant credit.'}
                  </p>
                  {!coupons.length ? (
                    <button type="button" className="ops-services__create" onClick={() => setCreating(true)}>
                      <Plus size={14} /> New coupon
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
      ) : null}

      {view === 'history' ? (
        <div className="ops-users__shell ops-coupons__history-shell">
          <div className="ops-users__main">
            <div className="ops-users__command ops-coupons__command">
              <label className="ops-users__search">
                <Search size={16} aria-hidden />
                <input
                  value={historyQuery}
                  onChange={(event) => setHistoryQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      setHistoryQuery('');
                    }
                  }}
                  placeholder="Filter by user, code, or invoice"
                  aria-label="Search redemptions"
                />
                {historyQuery ? (
                  <button
                    type="button"
                    className="ops-users__search-clear"
                    onClick={() => setHistoryQuery('')}
                    aria-label="Clear search"
                  >
                    <X size={14} />
                  </button>
                ) : null}
              </label>

              <div className="ops-coupons__history-filter">
                <ThemedSelect
                  ariaLabel="Filter by coupon"
                  value={historyCouponId}
                  onChange={setHistoryCouponId}
                  options={couponFilterOptions}
                />
              </div>

              <div className="ops-services__jobs">
                <button
                  type="button"
                  disabled={redemptionsLoading}
                  onClick={() => void loadRedemptions(historyCouponId)}
                >
                  <RefreshCw size={14} /> Refresh
                </button>
              </div>

              <div className="ops-users__command-meta">
                <span>
                  Showing <strong>{visibleRedemptions.length}</strong>
                  {historyCouponId !== 'all'
                    ? ` · ${coupons.find((c) => c.id === historyCouponId)?.code || 'coupon'}`
                    : ''}
                </span>
              </div>
            </div>

            <section className="ops-users__table" aria-label="Redemptions">
              <div className="ops-users__head ops-coupons__history-head" aria-hidden>
                <span>When</span>
                <span>Coupon</span>
                <span>Customer</span>
                <span>Applied</span>
                <span>Invoice</span>
                <span />
              </div>

              {redemptionsLoading ? (
                <div className="ops-users__empty">
                  <RefreshCw size={22} />
                  <h3>Loading redemptions…</h3>
                </div>
              ) : (
                visibleRedemptions.map((row) => (
                  <button
                    type="button"
                    key={row.id}
                    className="ops-users__row ops-coupons__history-row"
                    onClick={() => {
                      if (row.invoice) navigate(`/admin/invoices/${row.invoice.id}`);
                      else navigate(`/admin/users/${row.user.id}`);
                    }}
                  >
                    <span className="ops-coupons__when">
                      <strong>
                        {new Date(row.createdAt).toLocaleDateString(undefined, {
                          day: 'numeric',
                          month: 'short',
                          year: '2-digit',
                        })}
                      </strong>
                      <small>
                        {new Date(row.createdAt).toLocaleTimeString(undefined, {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </small>
                    </span>

                    <span className="ops-coupons__who">
                      <span className={`ops-coupons__mark is-${row.coupon.type}`} aria-hidden>
                        <TypeIcon type={row.coupon.type} size={14} />
                      </span>
                      <span>
                        <strong>{row.coupon.code}</strong>
                        <small>{rewardLabel(row.coupon)}</small>
                      </span>
                    </span>

                    <span className="ops-coupons__customer">
                      <strong>{displayName(row.user)}</strong>
                      <small>
                        @{row.user.username}
                      </small>
                    </span>

                    <span className="ops-coupons__applied">
                      {row.discountCents > 0 ? (
                        <span className="is-discount">−{money(row.discountCents, row.invoice?.currency ?? 'GBP')}</span>
                      ) : null}
                      {row.creditCents > 0 ? (
                        <span className="is-credit">+{money(row.creditCents, 'GBP')}</span>
                      ) : null}
                      {row.discountCents <= 0 && row.creditCents <= 0 ? <span>Recorded</span> : null}
                    </span>

                    <span className="ops-coupons__invoice">
                      {row.invoice ? (
                        <>
                          <strong>
                            <FileText size={12} aria-hidden /> {row.invoice.number}
                          </strong>
                          <small>
                            {row.invoice.status} · {money(row.invoice.totalCents, row.invoice.currency)}
                          </small>
                        </>
                      ) : (
                        <>
                          <strong>Wallet</strong>
                          <small>No invoice</small>
                        </>
                      )}
                    </span>

                    <ChevronRight size={16} aria-hidden />
                  </button>
                ))
              )}

              {!redemptionsLoading && !visibleRedemptions.length ? (
                <div className="ops-users__empty">
                  <Users size={24} />
                  <h3>{redemptions.length ? 'No matching redemptions' : 'No redemptions yet'}</h3>
                  <p>
                    {redemptions.length
                      ? 'Try another search or coupon filter.'
                      : 'When customers use a coupon, each use appears here.'}
                  </p>
                </div>
              ) : null}
            </section>
          </div>
        </div>
      ) : null}

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title={`Delete ${deleteTarget?.code ?? 'coupon'}?`}
        description="This coupon will immediately stop working and cannot be recovered."
        confirmLabel="Delete coupon"
        busy={deleting}
        consequences={[
          `${deleteTarget?.redemptionCount ?? 0} redemption(s) have been recorded.`,
          'Deleting the coupon also removes its redemption history.',
        ]}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && void remove(deleteTarget)}
      />
    </div>
  );
}
