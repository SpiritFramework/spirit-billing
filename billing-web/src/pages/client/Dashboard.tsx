import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  Cpu,
  Gamepad2,
  HardDrive,
  MemoryStick,
  PanelsTopLeft,
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
          <Link className="client-home__btn client-home__btn--primary client-home__btn--cta" to="/game-hosting">
            <span className="client-home__btn-icon" aria-hidden>
              <Gamepad2 size={15} />
            </span>
            <span>Browse hosting</span>
            <ArrowRight size={14} className="client-home__btn-arrow" />
          </Link>
          {panelHref && (data?.activeServices ?? 0) > 0 && (
            <a
              className="client-home__btn client-home__btn--ghost client-home__btn--cta"
              href={panelHref}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="client-home__btn-icon" aria-hidden>
                <PanelsTopLeft size={14} />
              </span>
              <span>Open panel</span>
              <ArrowUpRight size={14} className="client-home__btn-arrow" />
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
          <span className="client-home__pulse-copy">
            <small>Services</small>
            <strong>{data ? data.activeServices : '—'}</strong>
            <span>{data ? `${data.totalServices} total` : 'Loading'}</span>
          </span>
          <span className="client-home__pulse-icon is-services" aria-hidden>
            <Server size={18} />
          </span>
        </Link>
        <Link to="/invoices" className="client-home__pulse-item">
          <span className="client-home__pulse-copy">
            <small>Amount due</small>
            <strong className={unpaid > 0 ? 'is-warn' : undefined}>{money(unpaid, currency)}</strong>
            <span>{data ? `${data.unpaidInvoices} unpaid` : 'Loading'}</span>
          </span>
          <span className="client-home__pulse-icon is-due" aria-hidden>
            <Receipt size={18} />
          </span>
        </Link>
        <div className="client-home__pulse-item">
          <span className="client-home__pulse-copy">
            <small>Credit</small>
            <strong>{money(creditBalance, currency)}</strong>
            <span>Ready at checkout</span>
          </span>
          <span className="client-home__pulse-icon is-credit" aria-hidden>
            <Wallet size={18} />
          </span>
        </div>
        <div className="client-home__pulse-item">
          <span className="client-home__pulse-copy">
            <small>Panel</small>
            <strong className={panelWarn ? 'is-warn' : panelOk ? 'is-ok' : undefined}>
              {data == null ? '…' : panelOk ? 'Linked' : data.panelStatus === 'unreachable' ? 'Down' : 'Not linked'}
            </strong>
            <span>
              {data?.memberSince
                ? `Member since ${new Date(data.memberSince).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`
                : 'Checking connection'}
            </span>
          </span>
          <span className={`client-home__pulse-icon is-panel${panelWarn ? ' is-warn' : panelOk ? ' is-ok' : ''}`} aria-hidden>
            <ShieldCheck size={18} />
          </span>
        </div>
      </div>

      <section className="client-home__block client-home__services">
        <div className="client-home__block-head">
          <div>
            <h2>Services</h2>
            <p>Servers and plans on your account.</p>
          </div>
          <Link className="client-home__btn client-home__btn--text" to="/services">
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
                  size={42}
                  className="client-home__service-mark"
                />
                <span className="client-home__service-body">
                  <span className="client-home__service-main">
                    <span className="client-home__service-title">
                      <strong>{service.name}</strong>
                    </span>
                    <span className="client-home__service-meta">
                      <span className={`client-home__service-meta-item is-status ${statusBadge(service.status)}`}>
                        <span className="client-home__service-status-dot" aria-hidden />
                        {service.status.replaceAll('_', ' ')}
                      </span>
                      <span className="client-home__service-meta-item">
                        {category?.name || service.panelEggName || 'Hosting'}
                      </span>
                      <span className="client-home__service-meta-item">
                        {planLabel(service)}
                      </span>
                      {service.nextDueAt ? (
                        <span className="client-home__service-meta-item is-renew">
                          Renews{' '}
                          {new Date(service.nextDueAt).toLocaleDateString(undefined, {
                            day: 'numeric',
                            month: 'short',
                          })}
                        </span>
                      ) : null}
                    </span>
                  </span>

                  <span className="client-home__service-rail">
                    <span className="client-home__service-specs" aria-label="Resources">
                      <span>
                        <MemoryStick size={13} strokeWidth={1.75} aria-hidden />
                        <span>
                          <em>{formatRam(memory)}</em>
                          <small>RAM</small>
                        </span>
                      </span>
                      <span>
                        <Cpu size={13} strokeWidth={1.75} aria-hidden />
                        <span>
                          <em>{cpu <= 0 ? '∞' : `${cpu}%`}</em>
                          <small>CPU</small>
                        </span>
                      </span>
                      <span>
                        <HardDrive size={13} strokeWidth={1.75} aria-hidden />
                        <span>
                          <em>{formatDisk(disk)}</em>
                          <small>Disk</small>
                        </span>
                      </span>
                    </span>
                    <span className="client-home__service-aside">
                      <strong>
                        {price > 0 ? money(price, svcCurrency) : 'Included'}
                      </strong>
                      <small>{cycle}</small>
                    </span>
                    <span className="client-home__service-go" aria-hidden>
                      <ArrowRight size={14} strokeWidth={2} />
                    </span>
                  </span>
                </span>
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
              <Link className="client-home__btn client-home__btn--primary client-home__btn--cta client-home__btn--sm" to="/game-hosting">
                <span className="client-home__btn-icon" aria-hidden>
                  <Gamepad2 size={14} />
                </span>
                <span>Browse plans</span>
                <ArrowRight size={13} className="client-home__btn-arrow" />
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
            <Link className="client-home__btn client-home__btn--text" to="/invoices">
              View all <ArrowRight size={14} />
            </Link>
          </div>
          <div className="client-home__invoice-list">
            {(data?.recentInvoices ?? []).map((invoice) => (
              <Link
                key={invoice.id}
                to={`/invoices/${invoice.id}`}
                className={`client-home__invoice is-${invoice.status}`}
              >
                <span className="client-home__invoice-mark" aria-hidden>
                  <Receipt size={16} />
                </span>
                <span className="client-home__invoice-id">
                  <span className="client-home__invoice-title">
                    <strong>{invoice.number}</strong>
                    <span className={statusBadge(invoice.status)}>{invoice.status.replaceAll('_', ' ')}</span>
                  </span>
                  <small>
                    {invoice.service?.name || 'Hosting invoice'}
                    <span aria-hidden>·</span>
                    <time dateTime={invoice.createdAt}>
                      {new Date(invoice.createdAt).toLocaleDateString(undefined, {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </time>
                  </small>
                </span>
                <strong className="client-home__invoice-amount">
                  {money(invoice.totalCents, invoice.currency)}
                </strong>
                <ArrowRight size={14} className="client-home__invoice-go" aria-hidden />
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
          <div className="client-home__credit-top">
            <div>
              <h2>Account credit</h2>
              <p>Applied automatically at checkout.</p>
            </div>
            <span className="client-home__credit-chip" aria-hidden>
              <Wallet size={16} />
            </span>
          </div>
          <div className="client-home__credit-balance">
            <strong>{money(creditBalance, currency)}</strong>
            <small>Available balance</small>
          </div>
          <form className="client-home__redeem" onSubmit={(e) => void redeemCoupon(e)}>
            <label htmlFor="client-home-coupon">Redeem a credit code</label>
            <div className="client-home__redeem-row">
              <input
                id="client-home-coupon"
                value={couponCode}
                placeholder="ENTER CODE"
                maxLength={64}
                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
              />
              <button
                className="client-home__btn client-home__btn--primary client-home__btn--sm"
                type="submit"
                disabled={redeemBusy || !couponCode.trim()}
              >
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
