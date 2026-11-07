import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  Cpu,
  Gamepad2,
  HardDrive,
  MemoryStick,
  Receipt,
  Server,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import { api, ApiError, money, safeExternalHref, statusBadge } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useBranding } from '../../context/BrandingContext';
import { CategoryMark } from '../../lib/icons';

type DashboardData = {
  totalServices: number;
  activeServices: number;
  pendingServices: number;
  unpaidInvoices: number;
  unpaidBalanceCents: number;
  paidInvoices: number;
  creditBalanceCents: number;
  memberSince: string;
  panelLinked: boolean;
  panelStatus?: 'linked' | 'missing' | 'unreachable';
  recentInvoices: Array<{
    id: string;
    number: string;
    status: string;
    totalCents: number;
    currency: string;
    dueAt: string;
    createdAt: string;
    service: { name: string } | null;
  }>;
  recentServices: Array<{
    id: string;
    name: string;
    status: string;
    nextDueAt: string | null;
    panelServerId: string | null;
    panelEggName?: string | null;
    memoryMb: number | null;
    diskMb: number | null;
    cpuPercent: number | null;
    priceCents: number | null;
    currency: string | null;
    cycle: string | null;
    product: {
      name: string;
      cycle: string;
      priceCents: number;
      currency: string;
      memoryMb: number;
      diskMb: number;
      cpuPercent: number;
      category?: {
        id: string;
        name: string;
        color: string;
        icon: string;
        logoUrl?: string | null;
      } | null;
    };
  }>;
};

function formatRam(mb: number) {
  if (mb <= 0) return 'Unlimited';
  if (mb >= 1024) return `${Math.round((mb / 1024) * 10) / 10} GB`;
  return `${mb} MB`;
}

function formatDisk(mb: number) {
  if (mb <= 0) return 'Unlimited';
  if (mb >= 1024) return `${Math.round((mb / 1024) * 10) / 10} GB`;
  return `${mb} MB`;
}

function planLabel(service: DashboardData['recentServices'][number]) {
  if (service.product.name === 'Custom' && service.panelEggName) {
    return `Custom · ${service.panelEggName}`;
  }
  return service.product.name;
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function DashboardPage() {
  const { user, panelWebUrl, refresh } = useAuth();
  const branding = useBranding();
  const panelHref = safeExternalHref(panelWebUrl);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loadError, setLoadError] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [redeemBusy, setRedeemBusy] = useState(false);
  const [redeemMsg, setRedeemMsg] = useState('');
  const [redeemErr, setRedeemErr] = useState('');

  async function load() {
    try {
      setData(await api<DashboardData>('/client/dashboard'));
      setLoadError('');
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Could not load your dashboard');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function redeemCoupon(e: FormEvent) {
    e.preventDefault();
    if (!couponCode.trim()) return;
    setRedeemBusy(true);
    setRedeemErr('');
    setRedeemMsg('');
    try {
      const result = await api<{ creditBonusCents: number; creditBalanceCents: number; code: string }>(
        '/client/coupons/redeem',
        {
          method: 'POST',
          body: JSON.stringify({ code: couponCode.trim() }),
        },
      );
      setCouponCode('');
      setRedeemMsg(`${money(result.creditBonusCents, branding.currency || 'GBP')} was added to your balance.`);
      await refresh();
      await load();
    } catch (err) {
      setRedeemErr(err instanceof ApiError ? err.message : 'Could not redeem coupon');
    } finally {
      setRedeemBusy(false);
    }
  }

  const firstName = user?.firstName || user?.username || 'there';
  const currency = branding.currency || 'GBP';
  const creditBalance = data?.creditBalanceCents ?? user?.creditBalanceCents ?? 0;
  const unpaid = data?.unpaidBalanceCents ?? 0;
  const panelOk = data?.panelLinked === true;
  const panelWarn = data != null && data.panelLinked !== true;

  return (
    <div className="client-home">
      {loadError && <div className="ds-alert ds-alert--error">{loadError}</div>}

      <header className="client-home__intro">
        <div className="client-home__intro-copy">
          <p>{greeting()}, {firstName}</p>
          <h1>Your hosting home</h1>
        </div>
        <div className="client-home__intro-actions">
          <Link className="ds-btn ds-btn--primary" to="/game-hosting">
            <Gamepad2 size={15} /> Browse hosting
          </Link>
          {panelHref && (data?.activeServices ?? 0) > 0 && (
            <a className="ds-btn ds-btn--ghost" href={panelHref} target="_blank" rel="noopener noreferrer">
              Open panel <ArrowUpRight size={14} />
            </a>
          )}
        </div>
      </header>

      {unpaid > 0 && (
        <Link to="/invoices" className="client-home__notice is-due">
          <span>
            <Receipt size={16} />
            You have {money(unpaid, currency)} due across {data?.unpaidInvoices ?? 0} invoice
            {(data?.unpaidInvoices ?? 0) === 1 ? '' : 's'}
          </span>
          <em>
            Pay now <ArrowRight size={14} />
          </em>
        </Link>
      )}

      {panelWarn && unpaid <= 0 && (
        <Link to="/profile" className="client-home__notice is-panel">
          <span>
            <ShieldCheck size={16} />
            {data?.panelStatus === 'unreachable'
              ? 'Spirit-Panel is unreachable right now'
              : 'Your panel link needs attention'}
          </span>
          <em>
            Review account <ArrowRight size={14} />
          </em>
        </Link>
      )}

      <div className="client-home__pulse" aria-label="Account snapshot">
        <Link to="/services" className="client-home__pulse-item">
          <small>Services</small>
          <strong>{data ? data.activeServices : '—'}</strong>
          <span>{data ? `${data.totalServices} total` : 'Loading'}</span>
        </Link>
        <Link to="/invoices" className="client-home__pulse-item">
          <small>Amount due</small>
          <strong className={unpaid > 0 ? 'is-warn' : undefined}>{money(unpaid, currency)}</strong>
          <span>{data ? `${data.unpaidInvoices} unpaid` : 'Loading'}</span>
        </Link>
        <div className="client-home__pulse-item">
          <small>Credit</small>
          <strong>{money(creditBalance, currency)}</strong>
          <span>Ready at checkout</span>
        </div>
        <div className="client-home__pulse-item">
          <small>Panel</small>
          <strong className={panelWarn ? 'is-warn' : panelOk ? 'is-ok' : undefined}>
            {data == null ? '…' : panelOk ? 'Linked' : data.panelStatus === 'unreachable' ? 'Down' : 'Not linked'}
          </strong>
          <span>
            {data?.memberSince
              ? `Member since ${new Date(data.memberSince).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`
              : 'Checking connection'}
          </span>
        </div>
      </div>

      <section className="client-home__block client-home__services">
        <div className="client-home__block-head">
          <div>
            <h2>Services</h2>
            <p>Servers and plans on your account.</p>
          </div>
          <Link to="/services">
            View all <ArrowRight size={14} />
          </Link>
        </div>

        <div className="client-home__service-list">
          {(data?.recentServices ?? []).map((service) => {
            const category = service.product.category;
            const memory = service.memoryMb ?? service.product.memoryMb;
            const disk = service.diskMb ?? service.product.diskMb;
            const cpu = service.cpuPercent ?? service.product.cpuPercent;
            const cycle = service.cycle ?? service.product.cycle;
            const price = service.priceCents ?? service.product.priceCents;
            const svcCurrency = service.currency ?? service.product.currency;
            const accent = category?.color || 'var(--accent)';
            return (
              <Link
                key={service.id}
                to={`/services/${service.id}`}
                className={`client-home__service is-${service.status}`}
                style={{ ['--service-color' as string]: accent }}
              >
                <CategoryMark
                  icon={category?.icon}
                  logoUrl={category?.logoUrl}
                  color={category?.color}
                  size={40}
                  className="client-home__service-mark"
                />
                <span className="client-home__service-main">
                  <small>{category?.name || service.panelEggName || 'Hosting'}</small>
                  <strong>{service.name}</strong>
                  <em>{planLabel(service)}</em>
                </span>
                <span className="client-home__service-specs" aria-label="Resources">
                  <span><MemoryStick size={12} /> {formatRam(memory)}</span>
                  <span><Cpu size={12} /> {cpu <= 0 ? 'Unlimited' : `${cpu}%`}</span>
                  <span><HardDrive size={12} /> {formatDisk(disk)}</span>
                </span>
                <span className="client-home__service-meta">
                  <span className={statusBadge(service.status)}>{service.status.replaceAll('_', ' ')}</span>
                  <small>
                    {service.nextDueAt
                      ? `Renews ${new Date(service.nextDueAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
                      : price > 0
                        ? `${money(price, svcCurrency)} / ${cycle}`
                        : cycle}
                  </small>
                </span>
                <ArrowRight size={15} className="client-home__service-go" />
              </Link>
            );
          })}

          {data && !data.recentServices.length && (
            <div className="client-home__empty">
              <span><Server size={22} /></span>
              <div>
                <strong>No services yet</strong>
                <p>Pick a game and launch your first server.</p>
              </div>
              <Link className="ds-btn ds-btn--primary ds-btn--sm" to="/game-hosting">
                Browse plans
              </Link>
            </div>
          )}

          {!data && (
            <div className="client-home__loading">
              {loadError ? 'Could not load services.' : 'Loading services…'}
            </div>
          )}
        </div>
      </section>

      <div className="client-home__split">
        <section className="client-home__block">
          <div className="client-home__block-head">
            <div>
              <h2>Invoices</h2>
              <p>Recent billing activity.</p>
            </div>
            <Link to="/invoices">
              View all <ArrowRight size={14} />
            </Link>
          </div>
          <div className="client-home__invoice-list">
            {(data?.recentInvoices ?? []).map((invoice) => (
              <Link key={invoice.id} to={`/invoices/${invoice.id}`} className="client-home__invoice">
                <span className="client-home__invoice-id">
                  <strong>{invoice.number}</strong>
                  <small>{invoice.service?.name || 'Hosting invoice'}</small>
                </span>
                <time dateTime={invoice.createdAt}>
                  {new Date(invoice.createdAt).toLocaleDateString(undefined, {
                    day: 'numeric',
                    month: 'short',
                  })}
                </time>
                <span className={statusBadge(invoice.status)}>{invoice.status}</span>
                <strong className="client-home__invoice-amount">
                  {money(invoice.totalCents, invoice.currency)}
                </strong>
              </Link>
            ))}
            {data && !data.recentInvoices.length && (
              <div className="client-home__empty is-compact">
                <span><Receipt size={20} /></span>
                <div>
                  <strong>No invoices yet</strong>
                  <p>Payment history will show up here.</p>
                </div>
              </div>
            )}
            {!data && (
              <div className="client-home__loading is-compact">
                {loadError ? 'Could not load invoices.' : 'Loading invoices…'}
              </div>
            )}
          </div>
        </section>

        <section className="client-home__block client-home__credit">
          <div className="client-home__block-head">
            <div>
              <h2>Account credit</h2>
              <p>Applied automatically at checkout.</p>
            </div>
          </div>
          <div className="client-home__credit-balance">
            <Wallet size={18} />
            <strong>{money(creditBalance, currency)}</strong>
          </div>
          <form className="client-home__redeem" onSubmit={(e) => void redeemCoupon(e)}>
            <label htmlFor="client-home-coupon">Redeem a credit code</label>
            <div>
              <input
                id="client-home-coupon"
                value={couponCode}
                placeholder="ENTER CODE"
                maxLength={64}
                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
              />
              <button type="submit" disabled={redeemBusy || !couponCode.trim()}>
                {redeemBusy ? '…' : 'Redeem'}
              </button>
            </div>
          </form>
          {redeemMsg && <p className="client-home__redeem-msg is-ok">{redeemMsg}</p>}
          {redeemErr && <p className="client-home__redeem-msg is-err">{redeemErr}</p>}
        </section>
      </div>
    </div>
  );
}
