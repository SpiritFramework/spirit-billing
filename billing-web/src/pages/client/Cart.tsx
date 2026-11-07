import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Archive,
  CheckCircle2,
  Cpu,
  Database,
  HardDrive,
  MemoryStick,
  Minus,
  PackageOpen,
  Plus,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Tag,
  Trash2,
  WalletCards,
} from 'lucide-react';
import { api, ApiError, money } from '../../lib/api';
import { CategoryMark } from '../../lib/icons';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import { useBranding } from '../../context/BrandingContext';
import { ConfirmModal } from '../../components/ConfirmModal';

type CouponPreview = {
  code: string;
  type: string;
  value: number;
  description: string;
  discountCents: number;
  creditBonusCents: number;
};

function cycleLabel(cycle: string) {
  if (cycle === 'monthly') return 'month';
  if (cycle === 'quarterly') return 'quarter';
  if (cycle === 'yearly') return 'year';
  return cycle;
}

function formatRam(mb: number) {
  if (mb <= 0) return 'Unlimited';
  if (mb >= 1024 && mb % 1024 === 0) return `${mb / 1024} GB`;
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb.toLocaleString()} MB`;
}

function formatDisk(mb: number) {
  if (mb <= 0) return 'Unlimited';
  if (mb >= 1024 && mb % 1024 === 0) return `${mb / 1024} GB`;
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb.toLocaleString()} MB`;
}

function formatCpu(pct: number) {
  if (pct <= 0) return 'Unlimited';
  return `${pct}%`;
}

export function CartPage() {
  const { items, count, totalCents, currency, setQty, setServerName, removeItem, clear } = useCart();
  const { user, panelLinked, panelStatus, refresh } = useAuth();
  const branding = useBranding();
  const navigate = useNavigate();
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkoutConfirmOpen, setCheckoutConfirmOpen] = useState(false);
  const [error, setError] = useState('');
  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState<CouponPreview | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);
  const [applyCredits, setApplyCredits] = useState(true);

  const creditBalance = user?.creditBalanceCents ?? 0;
  const discountCents = coupon?.discountCents ?? 0;
  const creditBonusCents = coupon?.creditBonusCents ?? 0;
  const canCheckout = Boolean(user) && panelLinked === true;
  const registrationOpen = branding.registrationEnabled !== false;
  const authNext = `/login?next=${encodeURIComponent('/cart')}`;
  const registerNext = `/register?next=${encodeURIComponent('/cart')}`;

  useEffect(() => {
    setCoupon(null);
  }, [totalCents, items.length]);
  const afterDiscount = Math.max(0, totalCents - discountCents);
  const availableCredits = creditBalance + creditBonusCents;
  const creditApplied = user && applyCredits ? Math.min(availableCredits, afterDiscount) : 0;
  const amountDue = Math.max(0, afterDiscount - creditApplied);
  const fullyCoveredByCredit = Boolean(user) && amountDue === 0 && creditApplied > 0;

  async function applyCoupon() {
    if (!user) {
      setError('Sign in to apply a coupon before checkout.');
      return;
    }
    if (!couponInput.trim() || !items.length) return;
    setCouponBusy(true);
    setError('');
    try {
      const preview = await api<CouponPreview>('/client/coupons/validate', {
        method: 'POST',
        body: JSON.stringify({ code: couponInput.trim(), subtotalCents: totalCents }),
      });
      setCoupon(preview);
      setCouponInput(preview.code);
    } catch (err) {
      setCoupon(null);
      setError(err instanceof ApiError ? err.message : 'Invalid coupon');
    } finally {
      setCouponBusy(false);
    }
  }

  function openCheckoutConfirm() {
    if (!items.length) return;
    if (!user) {
      navigate(authNext);
      return;
    }
    if (!canCheckout) {
      setError(
        panelStatus === 'unreachable'
          ? 'Spirit-Panel is unreachable right now. Try again shortly.'
          : 'Your account is not linked to Spirit-Panel yet. Ask an admin to relink your panel account before checkout.',
      );
      return;
    }
    setError('');
    setCheckoutConfirmOpen(true);
  }

  async function checkout() {
    if (!items.length || !canCheckout) return;

    setCheckingOut(true);
    setError('');
    try {
      const payload = {
        items: items.flatMap((item) =>
          Array.from({ length: item.qty }, (_, index) => ({
            productId: item.id,
            name:
              item.qty > 1
                ? `${(item.serverName || item.name).trim()} ${index + 1}`.slice(0, 64)
                : item.serverName?.trim() || undefined,
          })),
        ),
        couponCode: coupon?.code || undefined,
        applyCredits,
      };
      const result = await api<{
        invoices: Array<{ id: string; number: string; totalCents: number }>;
        provisionedInvoiceIds: string[];
        provisionErrors: Array<{ invoiceId: string; error: string }>;
      }>('/client/orders/checkout', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setCheckoutConfirmOpen(false);
      if (result.provisionErrors?.length) {
        setError(result.provisionErrors.map((e) => e.error).join(' · '));
        await refresh();
        return;
      }
      clear();
      await refresh();
      if (result.invoices.length === 1) {
        navigate(`/invoices/${result.invoices[0].id}`);
      } else {
        navigate('/invoices');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Checkout failed');
    } finally {
      setCheckingOut(false);
    }
  }

  const checkoutConsequences =
    amountDue === 0
      ? [
          creditApplied > 0
            ? `${money(creditApplied, currency)} will be deducted from your credit balance.`
            : 'This order is fully covered by discounts/coupons.',
          `${count} server${count === 1 ? '' : 's'} will be provisioned in Spirit-Panel.`,
          'Your cart will be cleared after checkout.',
        ]
      : [
          ...(creditApplied > 0
            ? [`${money(creditApplied, currency)} will be applied from your credit balance.`]
            : []),
          `${count} unpaid invoice${count === 1 ? '' : 's'} will be created (${money(amountDue, currency)} remaining).`,
          'Servers provision after the invoice is paid.',
        ];

  return (
    <div className="cart-v2">
      <header className="cart-v2__header">
        <div>
          <Link to="/game-hosting"><ArrowLeft size={14} /> Continue shopping</Link>
          <h1>Your cart</h1>
          <p>Review your servers, apply rewards, and finish your order.</p>
        </div>
        {items.length > 0 && (
          <span className="cart-v2__count"><ShoppingCart size={15} /> {count} server{count === 1 ? '' : 's'}</span>
        )}
      </header>

      <div className="cart-progress" aria-label="Checkout progress">
        <span className="is-done"><CheckCircle2 size={15} /><em>1</em><strong>Choose hosting</strong></span>
        <i />
        <span className="is-active"><ShoppingCart size={15} /><em>2</em><strong>Review cart</strong></span>
        <i />
        <span><ShieldCheck size={15} /><em>3</em><strong>Complete order</strong></span>
      </div>

      {error && <div className="ds-alert ds-alert--error">{error}</div>}

      {!items.length ? (
        <section className="cart-v2-empty">
          <div className="cart-v2-empty__art">
            <span><ShoppingCart size={35} /></span>
            <i className="cart-v2-empty__orbit-one" />
            <i className="cart-v2-empty__orbit-two" />
          </div>
          <span className="cart-v2-empty__kicker">Nothing here yet</span>
          <h2>Your next server starts here.</h2>
          <p>Explore game hosting, pick the right configuration, and it will be waiting for you here.</p>
          <Link className="ds-btn ds-btn--primary" to="/game-hosting">
            <PackageOpen size={16} /> Browse game hosting
          </Link>
        </section>
      ) : (
        <div className="cart-v2-layout">
          <main className="cart-v2-items">
            <div className="cart-v2-items__header">
              <div><span>Order items</span><h2>Your servers</h2></div>
              <button type="button" disabled={checkingOut} onClick={clear}><Trash2 size={13} /> Clear all</button>
            </div>

            {items.map((item) => {
              const features = (item.features ?? []).filter(Boolean).slice(0, 4);
              return (
                <article
                  key={item.id}
                  className="cart-v2-item"
                  style={item.categoryColor ? { ['--cart-accent' as string]: item.categoryColor } : undefined}
                >
                  <div className="cart-v2-item__top">
                    <CategoryMark
                      icon={item.categoryIcon || 'gamepad'}
                      logoUrl={item.categoryLogoUrl}
                      color={item.categoryColor || '#6366f1'}
                      size={52}
                      className="cart-v2-item__mark"
                    />
                    <div className="cart-v2-item__identity">
                      <small>{item.categoryName || 'Game hosting'}</small>
                      <h3>{item.name}</h3>
                      <p>
                        {item.description?.trim()
                          || `${formatRam(item.memoryMb)} · ${formatCpu(item.cpuPercent)} CPU · ${formatDisk(item.diskMb)} disk · billed each ${cycleLabel(item.cycle)}`}
                      </p>
                    </div>
                    <div className="cart-v2-item__price">
                      <strong>{money(item.priceCents * item.qty, item.currency)}</strong>
                      <span>{money(item.priceCents, item.currency)} / {cycleLabel(item.cycle)}</span>
                    </div>
                    <button
                      type="button"
                      className="cart-v2-item__remove"
                      onClick={() => removeItem(item.id)}
                      aria-label={`Remove ${item.name}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>

                  <div className="cart-v2-item__specs">
                    <span><MemoryStick size={14} /><small>Memory</small><strong>{formatRam(item.memoryMb)}</strong></span>
                    <span><Cpu size={14} /><small>CPU limit</small><strong>{formatCpu(item.cpuPercent)}</strong></span>
                    <span><HardDrive size={14} /><small>Disk</small><strong>{formatDisk(item.diskMb)}</strong></span>
                    {(item.backupLimit ?? 0) > 0 && (
                      <span><Archive size={14} /><small>Backups</small><strong>{item.backupLimit}</strong></span>
                    )}
                    {(item.databaseLimit ?? 0) > 0 && (
                      <span><Database size={14} /><small>Databases</small><strong>{item.databaseLimit}</strong></span>
                    )}
                  </div>

                  {features.length > 0 && (
                    <ul className="cart-v2-item__features">
                      {features.map((feature) => (
                        <li key={feature}><Sparkles size={12} /> {feature}</li>
                      ))}
                    </ul>
                  )}

                  <div className="cart-v2-item__footer">
                    <label>
                      <span>Server name <small>optional</small></span>
                      <input
                        value={item.serverName ?? ''}
                        placeholder={`${item.categoryName || item.name} server`}
                        maxLength={64}
                        onChange={(event) => setServerName(item.id, event.target.value)}
                      />
                    </label>
                    <div className="cart-v2-qty">
                      <span>Quantity</span>
                      <div>
                        <button type="button" onClick={() => setQty(item.id, item.qty - 1)} aria-label="Decrease quantity">
                          <Minus size={13} />
                        </button>
                        <strong>{item.qty}</strong>
                        <button type="button" onClick={() => setQty(item.id, item.qty + 1)} disabled={item.qty >= 5} aria-label="Increase quantity">
                          <Plus size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}

            <Link className="cart-v2-add-more" to="/game-hosting">
              <Plus size={16} /><span><strong>Add another server</strong><small>Browse more games and configurations</small></span>
              <ArrowRight size={15} />
            </Link>
          </main>

          <aside className="cart-v2-summary">
            <header>
              <span>Checkout</span>
              <h2>Order summary</h2>
            </header>

            {user && (
              <>
                <section className="cart-v2-coupon">
                  <label htmlFor="cart-coupon"><Tag size={14} /> Coupon or reward code</label>
                  <div>
                    <input
                      id="cart-coupon"
                      value={couponInput}
                      placeholder="ENTER CODE"
                      maxLength={64}
                      onChange={(event) => {
                        setCouponInput(event.target.value.toUpperCase());
                        if (coupon) setCoupon(null);
                      }}
                    />
                    <button type="button" disabled={couponBusy || !couponInput.trim()} onClick={() => void applyCoupon()}>
                      {couponBusy ? '…' : 'Apply'}
                    </button>
                  </div>
                  {coupon && (
                    <div className="cart-v2-coupon__applied">
                      <CheckCircle2 size={14} />
                      <span><strong>{coupon.code}</strong><small>{coupon.description || 'Reward applied'}</small></span>
                      <button type="button" onClick={() => setCoupon(null)}>Remove</button>
                    </div>
                  )}
                </section>

                <label className={`cart-v2-credits ${applyCredits ? 'is-active' : ''}`}>
                  <span className="cart-v2-credits__icon"><WalletCards size={17} /></span>
                  <span>
                    <strong>Use account credit</strong>
                    <small>
                      {money(creditBalance, currency)} available
                      {creditBonusCents > 0 ? ` + ${money(creditBonusCents, currency)} bonus` : ''}
                    </small>
                  </span>
                  <input
                    type="checkbox"
                    checked={applyCredits}
                    disabled={availableCredits <= 0}
                    onChange={(event) => setApplyCredits(event.target.checked)}
                  />
                  <i />
                </label>
              </>
            )}

            <div className="cart-v2-breakdown">
              <div>
                <span>Plan subtotal ({count} server{count === 1 ? '' : 's'})</span>
                <strong>{money(totalCents, currency)}</strong>
              </div>
              {discountCents > 0 && (
                <div className="is-saving">
                  <span>Coupon discount</span>
                  <strong>−{money(discountCents, currency)}</strong>
                </div>
              )}
              {creditBonusCents > 0 && (
                <div className="is-saving">
                  <span>Credit reward added</span>
                  <strong>+{money(creditBonusCents, currency)}</strong>
                </div>
              )}
              {creditApplied > 0 && (
                <div className="is-saving">
                  <span>{fullyCoveredByCredit ? 'Paid with account credit' : 'Account credit applied'}</span>
                  <strong>−{money(creditApplied, currency)}</strong>
                </div>
              )}
            </div>

            <div className={`cart-v2-total ${fullyCoveredByCredit ? 'is-covered' : ''}`}>
              <span>
                <strong>{fullyCoveredByCredit ? 'Nothing left to pay' : 'Amount due'}</strong>
                <small>
                  {fullyCoveredByCredit
                    ? 'Your credit balance covers this order in full.'
                    : creditApplied > 0
                      ? `${money(creditApplied, currency)} credit applied · ${money(amountDue, currency)} remaining`
                      : 'Taxes included where applicable'}
                </small>
              </span>
              <strong>{money(amountDue, currency)}</strong>
            </div>

            {!user ? (
              <div className="cart-v2-warning">
                <ShieldCheck size={16} />
                <span>
                  <strong>Account required to buy</strong>
                  <small>Browse freely — sign in or create an account to complete checkout. Your cart is saved.</small>
                </span>
              </div>
            ) : !canCheckout ? (
              <div className="cart-v2-warning">
                <ShieldCheck size={16} />
                <span>
                  <strong>{panelStatus === 'unreachable' ? 'Panel unreachable' : 'Panel link required'}</strong>
                  <small>
                    {panelStatus === 'unreachable'
                      ? 'Checkout is paused until Spirit-Panel responds again.'
                      : 'Contact support before checking out.'}
                  </small>
                </span>
              </div>
            ) : null}

            {!user ? (
              <div className="cart-v2-guest-actions">
                <Link className="cart-v2-checkout" to={authNext}>
                  Sign in to checkout <ArrowRight size={16} />
                </Link>
                {registrationOpen && (
                  <Link className="ds-btn ds-btn--ghost" to={registerNext} style={{ width: '100%', justifyContent: 'center' }}>
                    Create an account
                  </Link>
                )}
              </div>
            ) : (
              <button
                className="cart-v2-checkout"
                type="button"
                disabled={checkingOut || !canCheckout}
                onClick={openCheckoutConfirm}
              >
                {checkingOut
                  ? 'Processing your order…'
                  : fullyCoveredByCredit
                    ? 'Pay with credit & provision'
                    : amountDue === 0
                      ? 'Pay & provision'
                      : 'Continue to checkout'}
                {!checkingOut && <ArrowRight size={16} />}
              </button>
            )}

            <div className="cart-v2-secure">
              <ShieldCheck size={14} />
              <span>
                <strong>Secure checkout</strong>
                <small>
                  {fullyCoveredByCredit
                    ? 'Credit-paid orders provision automatically after confirm.'
                    : 'Fully covered orders provision automatically.'}
                </small>
              </span>
            </div>
          </aside>
        </div>
      )}

      <ConfirmModal
        open={checkoutConfirmOpen}
        title={
          amountDue === 0
            ? `Pay & provision ${count} server${count === 1 ? '' : 's'}?`
            : `Create ${count} invoice${count === 1 ? '' : 's'}?`
        }
        description={
          amountDue === 0
            ? fullyCoveredByCredit
              ? `This uses ${money(creditApplied, currency)} from your credit balance and provisions ${count} server${count === 1 ? '' : 's'} now.`
              : `This completes checkout with credits/coupons and provisions ${count} server${count === 1 ? '' : 's'} now.`
            : `This creates ${count} invoice${count === 1 ? '' : 's'} with ${money(amountDue, currency)} still due after discounts/credits.`
        }
        confirmLabel={amountDue === 0 ? 'Confirm pay & provision' : 'Confirm checkout'}
        busyLabel={amountDue === 0 ? 'Provisioning…' : 'Creating invoices…'}
        eyebrow="Purchase confirmation"
        tone="warning"
        actionIcon="confirm"
        busy={checkingOut}
        consequences={checkoutConsequences}
        onCancel={() => !checkingOut && setCheckoutConfirmOpen(false)}
        onConfirm={() => void checkout()}
      />
    </div>
  );
}
