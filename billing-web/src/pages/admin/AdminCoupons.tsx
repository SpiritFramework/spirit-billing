import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  FileText,
  Gift,
  Percent,
  Plus,
  Search,
  Tag,
  Ticket,
  Trash2,
  Users,
  WalletCards,
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

export function AdminCoupons() {
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
  const [status, setStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [historyQuery, setHistoryQuery] = useState('');
  const [historyCouponId, setHistoryCouponId] = useState('all');

  async function load() {
    setLoading(true);
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
        value:
          form.type === 'percent'
            ? Math.round(valueNum)
            : Math.round(valueNum * 100),
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
      alert(err instanceof ApiError ? err.message : 'Update failed');
    }
  }

  async function remove(coupon: Coupon) {
    setDeleting(true);
    try {
      await api(`/admin/coupons/${coupon.id}`, { method: 'DELETE' });
      await Promise.all([load(), loadRedemptions(historyCouponId)]);
      setDeleteTarget(null);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  }

  const visibleCoupons = coupons.filter((coupon) => {
    const matchesQuery = `${coupon.code} ${coupon.description}`.toLowerCase().includes(query.trim().toLowerCase());
    const matchesStatus = status === 'all' || (status === 'active' ? coupon.active : !coupon.active);
    return matchesQuery && matchesStatus;
  });
  const activeCount = coupons.filter((coupon) => coupon.active).length;
  const redemptionCount = coupons.reduce((total, coupon) => total + coupon.redemptionCount, 0);
  const creditCouponCount = coupons.filter((coupon) => coupon.type === 'credit').length;
  const previewValue =
    form.type === 'percent'
      ? `${form.value || '0'}% off`
      : form.type === 'credit'
        ? `+${money(Math.round(Number(form.value || 0) * 100), 'GBP')} credit`
        : `${money(Math.round(Number(form.value || 0) * 100), 'GBP')} off`;

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

  return (
    <div className="coupon-v2">
      <header className="coupon-v2__header">
        <div><span>Promotions & rewards</span><h1>Coupons</h1><p>Create checkout discounts and credit rewards, with usage and schedule controls.</p></div>
        <span className="coupon-v2__summary"><Ticket size={16} /><span><strong>{activeCount} live campaigns</strong><small>{redemptionCount} total redemptions</small></span></span>
      </header>

      {error && <div className="ds-alert ds-alert--error">{error}</div>}
      {message && <div className="ds-alert ds-alert--success">{message}</div>}

      <section className="coupon-v2-metrics">
        <div><span><Tag size={16} /></span><p>Total coupons<small>All campaigns</small></p><strong>{coupons.length}</strong></div>
        <div><span><CheckCircle2 size={16} /></span><p>Currently active<small>{coupons.length - activeCount} inactive</small></p><strong>{activeCount}</strong></div>
        <div><span><Users size={16} /></span><p>Redemptions<small>Across all coupons</small></p><strong>{redemptionCount}</strong></div>
        <div><span><WalletCards size={16} /></span><p>Credit rewards<small>Balance-granting coupons</small></p><strong>{creditCouponCount}</strong></div>
      </section>

      <div className="coupon-v2-builder">
        <form onSubmit={(event) => void onCreate(event)}>
          <header><span><Plus size={15} /></span><div><h2>Create coupon</h2><p>Configure a new promotion or account credit reward.</p></div></header>

          <section>
            <div className="coupon-v2-section-title"><span>01</span><div><strong>Reward details</strong><small>Code and value customers receive</small></div></div>
            <div className="coupon-v2-fields coupon-v2-fields--2">
              <label><span>Coupon code</span><input required value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase().replace(/\s/g, '') })} placeholder="WELCOME10" maxLength={64} /></label>
              <label><span>Reward type</span><ThemedSelect ariaLabel="Reward type" value={form.type} onChange={(type) => setForm({ ...form, type: type as CouponForm['type'], value: type === 'percent' ? '10' : '5' })} options={[{ value: 'percent', label: 'Percentage discount', description: 'Take a percentage off the order' }, { value: 'fixed', label: 'Fixed discount', description: 'Take a fixed GBP amount off' }, { value: 'credit', label: 'Account credit', description: 'Add credit to the customer balance' }]} /></label>
              <label><span>{form.type === 'percent' ? 'Discount percentage' : form.type === 'credit' ? 'Credit amount (£)' : 'Discount amount (£)'}</span><input required type="number" min={form.type === 'percent' ? 1 : 0.01} max={form.type === 'percent' ? 100 : undefined} step={form.type === 'percent' ? 1 : 0.01} value={form.value} onChange={(event) => setForm({ ...form, value: event.target.value })} /></label>
              <label><span>Minimum order (£)</span><input type="number" min={0} step={0.01} value={form.minOrderCents} onChange={(event) => setForm({ ...form, minOrderCents: event.target.value })} /><small>{form.type === 'credit' ? 'Use 0 to allow direct redemption.' : 'Use 0 for no minimum spend.'}</small></label>
              <label className="is-wide"><span>Internal description</span><input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Summer launch promotion" maxLength={500} /></label>
            </div>
          </section>

          <section>
            <div className="coupon-v2-section-title"><span>02</span><div><strong>Usage controls</strong><small>Control availability and redemption limits</small></div></div>
            <div className="coupon-v2-fields coupon-v2-fields--2">
              <label><span>Maximum redemptions</span><input type="number" min={1} value={form.maxRedemptions} onChange={(event) => setForm({ ...form, maxRedemptions: event.target.value })} placeholder="Unlimited" /><small>Leave blank for unlimited uses.</small></label>
              <label><span>Uses per customer</span><input type="number" min={1} value={form.perUserLimit} onChange={(event) => setForm({ ...form, perUserLimit: event.target.value })} /></label>
              <label><span>Starts at</span><input type="datetime-local" value={form.startsAt} onChange={(event) => setForm({ ...form, startsAt: event.target.value })} /></label>
              <label><span>Ends at</span><input type="datetime-local" min={form.startsAt || undefined} value={form.endsAt} onChange={(event) => setForm({ ...form, endsAt: event.target.value })} /></label>
            </div>
            <label className={`coupon-v2-toggle ${form.active ? 'is-active' : ''}`}>
              <span><CheckCircle2 size={15} /></span><span><strong>Activate immediately</strong><small>The schedule above still controls when customers can use it.</small></span>
              <input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /><i />
            </label>
          </section>

          <footer><button type="submit" disabled={saving}>{saving ? 'Creating coupon…' : 'Create coupon'}<Plus size={14} /></button></footer>
        </form>

        <aside>
          <header><span>Live preview</span><small>Checkout reward</small></header>
          <div className={`coupon-v2-preview coupon-v2-preview--${form.type}`}>
            <span className="coupon-v2-preview__icon">{form.type === 'percent' ? <Percent size={20} /> : form.type === 'credit' ? <Gift size={20} /> : <CircleDollarSign size={20} />}</span>
            <small>{form.type === 'credit' ? 'Account reward' : 'Checkout discount'}</small>
            <h2>{form.code || 'YOURCODE'}</h2>
            <strong>{previewValue}</strong>
            <p>{form.description || 'Your promotion description will appear here.'}</p>
            <div><span>Per user <strong>{form.perUserLimit || '1'}×</strong></span><span>Min order <strong>{money(Math.round(Number(form.minOrderCents || 0) * 100), 'GBP')}</strong></span></div>
          </div>
          <div className="coupon-v2-tip"><CalendarDays size={14} /><span><strong>{form.startsAt || form.endsAt ? 'Scheduled campaign' : 'No schedule limits'}</strong><small>{form.startsAt ? `Starts ${new Date(form.startsAt).toLocaleString()}` : 'Available as soon as it is active.'}</small></span></div>
        </aside>
      </div>

      <section className="coupon-v2-history">
        <header>
          <div>
            <span>Usage audit</span>
            <h2>Redemption history</h2>
            <p>See who redeemed each code, what they received, and which invoice it applied to.</p>
          </div>
          <div className="coupon-v2-search">
            <Search size={14} />
            <input
              value={historyQuery}
              onChange={(event) => setHistoryQuery(event.target.value)}
              placeholder="Search user, code, or invoice…"
            />
          </div>
          <div className="coupon-v2-history__filter">
            <ThemedSelect
              ariaLabel="Filter by coupon"
              value={historyCouponId}
              onChange={setHistoryCouponId}
              options={couponFilterOptions}
            />
          </div>
        </header>

        <div className="coupon-v2-history__table-wrap">
          <table className="coupon-v2-history__table">
            <thead>
              <tr>
                <th>When</th>
                <th>Coupon</th>
                <th>Customer</th>
                <th>Applied as</th>
                <th>Invoice</th>
              </tr>
            </thead>
            <tbody>
              {visibleRedemptions.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>{new Date(row.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</strong>
                    <small>{new Date(row.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</small>
                  </td>
                  <td>
                    <span className={`coupon-v2-history__code is-${row.coupon.type}`}>
                      {row.coupon.type === 'percent' ? <Percent size={12} /> : row.coupon.type === 'credit' ? <Gift size={12} /> : <CircleDollarSign size={12} />}
                      {row.coupon.code}
                    </span>
                    <small>{rewardLabel(row.coupon)}</small>
                  </td>
                  <td>
                    <Link to={`/admin/users/${row.user.id}`}>{displayName(row.user)}</Link>
                    <small>@{row.user.username} · {row.user.email}</small>
                  </td>
                  <td>
                    {row.discountCents > 0 && (
                      <span className="coupon-v2-history__applied is-discount">
                        −{money(row.discountCents, row.invoice?.currency ?? 'GBP')} discount
                      </span>
                    )}
                    {row.creditCents > 0 && (
                      <span className="coupon-v2-history__applied is-credit">
                        +{money(row.creditCents, 'GBP')} credit
                      </span>
                    )}
                    {row.discountCents <= 0 && row.creditCents <= 0 && <span className="coupon-v2-history__applied">Recorded</span>}
                  </td>
                  <td>
                    {row.invoice ? (
                      <>
                        <Link to={`/admin/invoices/${row.invoice.id}`}>
                          <FileText size={12} /> {row.invoice.number}
                        </Link>
                        <small>{row.invoice.status} · {money(row.invoice.totalCents, row.invoice.currency)}</small>
                      </>
                    ) : (
                      <>
                        <strong>Wallet credit</strong>
                        <small>Redeemed without an invoice</small>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!redemptionsLoading && !visibleRedemptions.length && (
            <div className="coupon-v2-empty">
              <Users size={24} />
              <h3>{redemptions.length ? 'No matching redemptions' : 'No redemptions yet'}</h3>
              <p>{redemptions.length ? 'Try another search or coupon filter.' : 'When customers use a coupon, each use will appear here.'}</p>
            </div>
          )}
          {redemptionsLoading && (
            <div className="coupon-v2-empty">
              <Users size={24} />
              <h3>Loading redemptions…</h3>
            </div>
          )}
        </div>
      </section>

      <section className="coupon-v2-catalogue">
        <header><div><span>Campaign library</span><h2>All coupons</h2></div><div className="coupon-v2-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search coupons…" /></div><div className="coupon-v2-filters">{(['all', 'active', 'inactive'] as const).map((option) => <button key={option} type="button" className={status === option ? 'is-active' : ''} onClick={() => setStatus(option)}>{option[0].toUpperCase() + option.slice(1)}</button>)}</div></header>
        <div className="coupon-v2-grid">
          {visibleCoupons.map((coupon) => (
            <article key={coupon.id} className={`coupon-v2-card coupon-v2-card--${coupon.type} ${!coupon.active ? 'is-inactive' : ''}`}>
              <header><span>{coupon.type === 'percent' ? <Percent size={16} /> : coupon.type === 'credit' ? <Gift size={16} /> : <CircleDollarSign size={16} />}</span><div><small>{coupon.type === 'credit' ? 'Credit reward' : `${coupon.type} discount`}</small><h3>{coupon.code}</h3></div><i className={coupon.active ? 'is-active' : ''}>{coupon.active ? 'Active' : 'Off'}</i></header>
              <p>{coupon.description || 'No campaign description.'}</p>
              <div className="coupon-v2-card__value"><span>Reward value</span><strong>{rewardLabel(coupon)}</strong></div>
              <div className="coupon-v2-card__stats"><span><small>Redemptions</small><strong>{coupon.redemptionCount}{coupon.maxRedemptions != null ? ` / ${coupon.maxRedemptions}` : ''}</strong></span><span><small>Per customer</small><strong>{coupon.perUserLimit}×</strong></span><span><small>Minimum</small><strong>{money(coupon.minOrderCents, 'GBP')}</strong></span></div>
              {(coupon.startsAt || coupon.endsAt) && <div className="coupon-v2-card__schedule"><CalendarDays size={12} />{coupon.startsAt ? new Date(coupon.startsAt).toLocaleDateString() : 'Now'} — {coupon.endsAt ? new Date(coupon.endsAt).toLocaleDateString() : 'No end'}</div>}
              <footer>
                <button type="button" onClick={() => setHistoryCouponId(coupon.id)}>View uses</button>
                <button type="button" onClick={() => void toggleActive(coupon)}>{coupon.active ? 'Disable' : 'Enable'}</button>
                <button type="button" aria-label={`Delete ${coupon.code}`} onClick={() => setDeleteTarget(coupon)}><Trash2 size={13} /></button>
              </footer>
            </article>
          ))}
          {!loading && !visibleCoupons.length && <div className="coupon-v2-empty"><Ticket size={24} /><h3>{coupons.length ? 'No matching coupons' : 'No coupons yet'}</h3><p>{coupons.length ? 'Try another search or status.' : <>Create a promotion above, or grant credit from <Link to="/admin/users">Users</Link>.</>}</p></div>}
          {loading && <div className="coupon-v2-empty"><Ticket size={24} /><h3>Loading coupons…</h3></div>}
        </div>
      </section>
      <ConfirmModal
        open={Boolean(deleteTarget)}
        title={`Delete ${deleteTarget?.code ?? 'coupon'}?`}
        description="This coupon will immediately stop working and cannot be recovered."
        confirmLabel="Delete coupon"
        busy={deleting}
        consequences={[`${deleteTarget?.redemptionCount ?? 0} redemption(s) have been recorded.`, 'Deleting the coupon also removes its redemption history.']}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && void remove(deleteTarget)}
      />
    </div>
  );
}
