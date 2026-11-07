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
  const creditCoverPercent = afterDiscount
    ? Math.min(100, (creditApplied / afterDiscount) * 100)
    : 0;

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
    <div className="client-cart">
      <Link to="/game-hosting" className="client-cart__back">
        <ArrowLeft size={14} /> Continue shopping
      </Link>

      <header className="client-cart__intro">
        <div className="client-cart__intro-copy">
          <p>Checkout</p>
          <h1>Cart</h1>
          <span>Review servers, apply rewards, and finish your order.</span>
        </div>
        <div className="client-cart__intro-actions">
          {items.length > 0 ? (
            <Link className="client-home__btn client-home__btn--ghost client-home__btn--cta" to="/game-hosting">
              <span className="client-home__btn-icon" aria-hidden>
                <Plus size={15} />
              </span>
              <span>Add another</span>
            </Link>
          ) : (
            <Link className="client-home__btn client-home__btn--primary client-home__btn--cta" to="/game-hosting">
              <span className="client-home__btn-icon" aria-hidden>
                <PackageOpen size={15} />
              </span>
              <span>Browse hosting</span>
              <ArrowRight size={14} className="client-home__btn-arrow" />
            </Link>
          )}
        </div>
      </header>

      <div className="client-cart__steps" aria-label="Checkout progress">
        <span className="is-done">
          <CheckCircle2 size={14} />
          Choose hosting
        </span>
        <i aria-hidden />
        <span className="is-active">
          <ShoppingCart size={14} />
          Review cart
        </span>
        <i aria-hidden />
        <span>
          <ShieldCheck size={14} />
          Complete order
        </span>
      </div>

      {error ? <div className="ds-alert ds-alert--error">{error}</div> : null}

      {!items.length ? (
        <section className="client-cart__empty">
          <span aria-hidden>
            <ShoppingCart size={22} />
          </span>
          <strong>Your cart is empty</strong>
          <p>Pick a game and plan — it will show up here ready for checkout.</p>
          <Link className="client-home__btn client-home__btn--primary client-home__btn--cta client-home__btn--sm" to="/game-hosting">
            <span className="client-home__btn-icon" aria-hidden>
              <PackageOpen size={14} />
            </span>
            <span>Browse game hosting</span>
            <ArrowRight size={13} className="client-home__btn-arrow" />
          </Link>
        </section>
      ) : (
        <>
          <div className="client-cart__pulse" aria-label="Cart snapshot">
            <div className="client-cart__pulse-item">
              <span className="client-cart__pulse-copy">
                <small>Servers</small>
                <strong>{count}</strong>
                <span>
                  {items.length} plan{items.length === 1 ? '' : 's'} in cart
                </span>
              </span>
              <span className="client-cart__pulse-icon is-servers" aria-hidden>
                <ShoppingCart size={17} />
              </span>
            </div>
            <div className="client-cart__pulse-item">
              <span className="client-cart__pulse-copy">
                <small>Subtotal</small>
                <strong>{money(totalCents, currency)}</strong>
                <span>Before discounts</span>
              </span>
              <span className="client-cart__pulse-icon is-subtotal" aria-hidden>
                <Tag size={17} />
              </span>
            </div>
            <div className="client-cart__pulse-item">
              <span className="client-cart__pulse-copy">
                <small>Credits</small>
                <strong>{money(creditBalance, currency)}</strong>
                <span>{user ? 'Available balance' : 'Sign in to use'}</span>
              </span>
              <span className="client-cart__pulse-icon is-credits" aria-hidden>
                <WalletCards size={17} />
              </span>
            </div>
            <div className="client-cart__pulse-item">
              <span className="client-cart__pulse-copy">
                <small>Amount due</small>
                <strong className={fullyCoveredByCredit ? 'is-ok' : undefined}>
                  {money(amountDue, currency)}
                </strong>
                <span>{fullyCoveredByCredit ? 'Covered by credit' : 'Ready at checkout'}</span>
              </span>
              <span className="client-cart__pulse-icon is-due" aria-hidden>
                <CheckCircle2 size={17} />
              </span>
            </div>
          </div>

          <div className="client-cart__layout">
            <div className="client-cart__primary">
              <section className="client-cart__panel">
                <div className="client-cart__panel-head">
                  <div>
                    <h2>Your servers</h2>
                    <p>
                      {count} server{count === 1 ? '' : 's'} ready for checkout
                    </p>
                  </div>
                  <button
                    type="button"
                    className="client-cart__clear"
                    disabled={checkingOut}
                    onClick={clear}
                  >
                    <Trash2 size={13} /> Clear all
                  </button>
                </div>

                <div className="client-cart__list">
                  {items.map((item) => {
                    const features = (item.features ?? []).filter(Boolean).slice(0, 4);
                    return (
                      <article
                        key={item.id}
                        className="client-cart__item"
                        style={
                          item.categoryColor
                            ? { ['--cart-tone' as string]: item.categoryColor }
                            : undefined
                        }
                      >
                        <div className="client-cart__item-top">
                          <span className="client-cart__item-mark" aria-hidden>
                            <CategoryMark
                              icon={item.categoryIcon || 'gamepad'}
                              logoUrl={item.categoryLogoUrl}
                              color={item.categoryColor || '#6366f1'}
                              size={36}
                            />
                          </span>
                          <div className="client-cart__item-main">
                            <small>{item.categoryName || 'Game hosting'}</small>
                            <strong>{item.name}</strong>
                            <p>
                              {item.description?.trim()
                                || `${formatRam(item.memoryMb)} · ${formatCpu(item.cpuPercent)} CPU · ${formatDisk(item.diskMb)} disk`}
                            </p>
                          </div>
                          <div className="client-cart__item-price">
                            <strong>{money(item.priceCents * item.qty, item.currency)}</strong>
                            <span>
                              {money(item.priceCents, item.currency)} / {cycleLabel(item.cycle)}
                            </span>
                          </div>
                          <button
                            type="button"
                            className="client-cart__item-remove"
                            onClick={() => removeItem(item.id)}
                            aria-label={`Remove ${item.name}`}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>

                        <div className="client-cart__item-specs" aria-label="Plan resources">
                          <span>
                            <MemoryStick size={14} aria-hidden />
                            <span>
                              <em>{formatRam(item.memoryMb)}</em>
                              <small>Memory</small>
                            </span>
                          </span>
                          <span>
                            <Cpu size={14} aria-hidden />
                            <span>
                              <em>{formatCpu(item.cpuPercent)}</em>
                              <small>CPU</small>
                            </span>
                          </span>
                          <span>
                            <HardDrive size={14} aria-hidden />
                            <span>
                              <em>{formatDisk(item.diskMb)}</em>
                              <small>Disk</small>
                            </span>
                          </span>
                          {(item.backupLimit ?? 0) > 0 ? (
                            <span>
                              <Archive size={14} aria-hidden />
                              <span>
                                <em>{item.backupLimit}</em>
                                <small>Backups</small>
                              </span>
                            </span>
                          ) : null}
                          {(item.databaseLimit ?? 0) > 0 ? (
                            <span>
                              <Database size={14} aria-hidden />
                              <span>
                                <em>{item.databaseLimit}</em>
                                <small>Databases</small>
                              </span>
                            </span>
                          ) : null}
                        </div>

                        {features.length > 0 ? (
                          <ul className="client-cart__item-features">
                            {features.map((feature) => (
                              <li key={feature}>
                                <Sparkles size={12} aria-hidden />
                                {feature}
                              </li>
                            ))}
                          </ul>
                        ) : null}

                        <div className="client-cart__item-foot">
                          <label>
                            <span>
                              Server name <em>optional</em>
                            </span>
                            <input
                              value={item.serverName ?? ''}
                              placeholder={`${item.categoryName || item.name} server`}
                              maxLength={64}
                              onChange={(event) => setServerName(item.id, event.target.value)}
                            />
                          </label>
                          <div className="client-cart__qty">
                            <span>Quantity</span>
                            <div>
                              <button
                                type="button"
                                onClick={() => setQty(item.id, item.qty - 1)}
                                aria-label="Decrease quantity"
                              >
                                <Minus size={13} />
                              </button>
                              <strong>{item.qty}</strong>
                              <button
                                type="button"
                                onClick={() => setQty(item.id, item.qty + 1)}
                                disabled={item.qty >= 5}
                                aria-label="Increase quantity"
                              >
                                <Plus size={13} />
                              </button>
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>

                <Link className="client-cart__add-more" to="/game-hosting">
                  <span className="client-cart__add-more-icon" aria-hidden>
                    <Plus size={16} />
                  </span>
                  <span>
                    <strong>Add another server</strong>
                    <small>Browse more games and configurations</small>
                  </span>
                  <ArrowRight size={15} />
                </Link>
              </section>
            </div>

            <aside className="client-cart__aside">
              <section className="client-cart__side">
                <div className="client-cart__side-head">
                  <ShoppingCart size={16} />
                  <div>
                    <small>Order summary</small>
                    <strong>{money(amountDue, currency)} due</strong>
                  </div>
                </div>
                <p className="client-cart__side-note">
                  {fullyCoveredByCredit
                    ? 'Your credit balance covers this order in full.'
                    : `${count} server${count === 1 ? '' : 's'} · billed after discounts and credits.`}
                </p>
              </section>

              {user ? (
                <>
                  <section className="client-cart__side">
                    <div className="client-cart__side-head">
                      <Tag size={16} />
                      <div>
                        <small>Rewards</small>
                        <strong>Coupon code</strong>
                      </div>
                    </div>
                    <div className="client-cart__coupon">
                      <input
                        value={couponInput}
                        placeholder="ENTER CODE"
                        maxLength={64}
                        aria-label="Coupon or reward code"
                        onChange={(event) => {
                          setCouponInput(event.target.value.toUpperCase());
                          if (coupon) setCoupon(null);
                        }}
                      />
                      <button
                        type="button"
                        className="client-home__btn client-home__btn--ghost client-home__btn--sm"
                        disabled={couponBusy || !couponInput.trim()}
                        onClick={() => void applyCoupon()}
                      >
                        {couponBusy ? '…' : 'Apply'}
                      </button>
                    </div>
                    {coupon ? (
                      <div className="client-cart__coupon-applied">
                        <CheckCircle2 size={14} />
                        <span>
                          <strong>{coupon.code}</strong>
                          <small>{coupon.description || 'Reward applied'}</small>
                        </span>
                        <button type="button" onClick={() => setCoupon(null)}>
                          Remove
                        </button>
                      </div>
                    ) : null}
                  </section>

                  <section className={`client-cart__side${applyCredits ? ' is-credit' : ''}`}>
                    <label className="client-cart__credits">
                      <span className="client-cart__credits-icon" aria-hidden>
                        <WalletCards size={16} />
                      </span>
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
                      <i aria-hidden />
                    </label>
                    {creditApplied > 0 ? (
                      <div className="client-cart__credit-bar" aria-hidden>
                        <span style={{ width: `${creditCoverPercent}%` }} />
                      </div>
                    ) : null}
                  </section>
                </>
              ) : null}

              <section className="client-cart__side">
                <div className="client-cart__totals">
                  <div>
                    <span>
                      Plan subtotal ({count} server{count === 1 ? '' : 's'})
                    </span>
                    <strong>{money(totalCents, currency)}</strong>
                  </div>
                  {discountCents > 0 ? (
                    <div className="is-saving">
                      <span>Coupon discount</span>
                      <strong>−{money(discountCents, currency)}</strong>
                    </div>
                  ) : null}
                  {creditBonusCents > 0 ? (
                    <div className="is-saving">
                      <span>Credit reward added</span>
                      <strong>+{money(creditBonusCents, currency)}</strong>
                    </div>
                  ) : null}
                  {creditApplied > 0 ? (
                    <div className="is-saving">
                      <span>
                        {fullyCoveredByCredit ? 'Paid with account credit' : 'Account credit applied'}
                      </span>
                      <strong>−{money(creditApplied, currency)}</strong>
                    </div>
                  ) : null}
                  <div className={`is-total${fullyCoveredByCredit ? ' is-covered' : ''}`}>
                    <span>{fullyCoveredByCredit ? 'Nothing left to pay' : 'Amount due'}</span>
                    <strong>{money(amountDue, currency)}</strong>
                  </div>
                </div>
              </section>

              {!user ? (
                <section className="client-cart__side is-warn">
                  <div className="client-cart__side-head">
                    <ShieldCheck size={16} />
                    <div>
                      <small>Account required</small>
                      <strong>Sign in to buy</strong>
                    </div>
                  </div>
                  <p className="client-cart__side-note">
                    Your cart is saved. Sign in or create an account to complete checkout.
                  </p>
                  <div className="client-cart__guest-actions">
                    <Link className="client-home__btn client-home__btn--primary client-home__btn--cta" to={authNext}>
                      Sign in to checkout
                      <ArrowRight size={14} className="client-home__btn-arrow" />
                    </Link>
                    {registrationOpen ? (
                      <Link className="client-home__btn client-home__btn--ghost client-home__btn--sm" to={registerNext}>
                        Create an account
                      </Link>
                    ) : null}
                  </div>
                </section>
              ) : !canCheckout ? (
                <section className="client-cart__side is-warn">
                  <div className="client-cart__side-head">
                    <ShieldCheck size={16} />
                    <div>
                      <small>
                        {panelStatus === 'unreachable' ? 'Panel unreachable' : 'Panel link required'}
                      </small>
                      <strong>Checkout paused</strong>
                    </div>
                  </div>
                  <p className="client-cart__side-note">
                    {panelStatus === 'unreachable'
                      ? 'Checkout is paused until Spirit-Panel responds again.'
                      : 'Contact support before checking out.'}
                  </p>
                </section>
              ) : null}

              {user ? (
                <button
                  type="button"
                  className="client-home__btn client-home__btn--primary client-home__btn--cta client-cart__checkout"
                  disabled={checkingOut || !canCheckout}
                  onClick={openCheckoutConfirm}
                >
                  <span className="client-home__btn-icon" aria-hidden>
                    <CheckCircle2 size={15} />
                  </span>
                  <span>
                    {checkingOut
                      ? 'Processing your order…'
                      : fullyCoveredByCredit
                        ? 'Pay with credit & provision'
                        : amountDue === 0
                          ? 'Pay & provision'
                          : 'Continue to checkout'}
                  </span>
                  {!checkingOut ? <ArrowRight size={14} className="client-home__btn-arrow" /> : null}
                </button>
              ) : null}

              <section className="client-cart__side is-secure">
                <div className="client-cart__side-head">
                  <ShieldCheck size={16} />
                  <div>
                    <small>Secure checkout</small>
                    <strong>
                      {fullyCoveredByCredit
                        ? 'Credit-paid orders provision automatically'
                        : 'Fully covered orders provision automatically'}
                    </strong>
                  </div>
                </div>
              </section>
            </aside>
          </div>
        </>
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
