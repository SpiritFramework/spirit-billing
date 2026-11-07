import { Link, NavLink, Outlet, Navigate, useLocation } from 'react-router-dom';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Bell,
  CheckCheck,
  CreditCard,
  ExternalLink,
  FolderTree,
  Gamepad2,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Receipt,
  Settings,
  Server,
  ShoppingCart,
  ShoppingBag,
  TicketPercent,
  Trash2,
  ScrollText,
  MessageSquare,
  Tags,
  User as UserIcon,
  Users,
  Wallet,
  AlertCircle,
  CheckCircle2,
  X,
} from 'lucide-react';
import { useAuth, useLogout } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import { useCart } from '../context/CartContext';
import { money } from '../lib/api';
import { api } from '../lib/api';
import { isFullAdmin, isStaffOrAdmin } from '../lib/roles';

type Notification = {
  id: string;
  type: 'info' | 'success' | 'warning';
  title: string;
  message: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
};

function Brand() {
  const branding = useBranding();
  const logo = branding.logoUrl?.trim();
  return (
    <div className="ds-brand">
      {logo && /^https?:\/\//i.test(logo) ? (
        <img src={logo} alt="" className="ds-brand-logo" />
      ) : (
        <div className="ds-brand-mark" />
      )}
      <div className="ds-brand-text">
        <div className="ds-brand-title">{branding.companyName}</div>
        <div className="ds-brand-sub">{branding.tagline || 'Billing'}</div>
      </div>
    </div>
  );
}

function NavSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="ds-nav-section">
      <div className="ds-nav-label">{label}</div>
      <nav className="ds-nav">{children}</nav>
    </div>
  );
}

function UserChip({ name, email, avatarUrl }: { name: string; email: string; avatarUrl?: string | null }) {
  return (
    <div className="ds-user-chip">
      {avatarUrl && /^https?:\/\//i.test(avatarUrl) ? (
        <img src={avatarUrl} alt="" className="ds-user-chip__avatar" style={{ objectFit: 'cover' }} />
      ) : (
        <div className="ds-user-chip__avatar">{name.slice(0, 1).toUpperCase()}</div>
      )}
      <div className="ds-user-chip__meta">
        <div className="ds-user-chip__name">{name}</div>
        <div className="ds-user-chip__email">{email}</div>
      </div>
    </div>
  );
}

function useMobileNav() {
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNavOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('ds-nav-lock');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('ds-nav-lock');
    };
  }, [navOpen]);

  return { navOpen, setNavOpen, toggleNav: () => setNavOpen((value) => !value) };
}

function TopNavbar({
  menuOpen,
  onMenuToggle,
}: {
  menuOpen: boolean;
  onMenuToggle: () => void;
}) {
  const { user } = useAuth();
  const { count } = useCart();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{ notifications: Notification[]; unreadCount: number }>({
    notifications: [],
    unreadCount: 0,
  });
  const containerRef = useRef<HTMLDivElement>(null);

  async function loadNotifications() {
    try {
      setData(await api<{ notifications: Notification[]; unreadCount: number }>('/client/notifications'));
    } catch {
      // Session handling is centralized by the API client.
    }
  }

  useEffect(() => {
    void loadNotifications();
    const timer = window.setInterval(() => void loadNotifications(), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    function close(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  async function markRead(id: string) {
    setData((current) => {
      const wasUnread = current.notifications.some((item) => item.id === id && !item.readAt);
      return {
        notifications: current.notifications.map((item) =>
          item.id === id && !item.readAt ? { ...item, readAt: new Date().toISOString() } : item,
        ),
        unreadCount: Math.max(0, current.unreadCount - (wasUnread ? 1 : 0)),
      };
    });
    await api(`/client/notifications/${id}/read`, { method: 'POST', body: '{}' }).catch(() => undefined);
  }

  async function markAllRead() {
    setData((current) => ({
      notifications: current.notifications.map((item) => ({
        ...item,
        readAt: item.readAt || new Date().toISOString(),
      })),
      unreadCount: 0,
    }));
    await api('/client/notifications/read-all', { method: 'POST', body: '{}' }).catch(() => undefined);
  }

  async function clearAll() {
    setData({ notifications: [], unreadCount: 0 });
    await api('/client/notifications', { method: 'DELETE' }).catch(() => undefined);
  }

  return (
    <header className="ds-topbar">
      <div className="ds-topbar__lead">
        <button
          type="button"
          className="ds-topbar__menu"
          aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
          aria-expanded={menuOpen}
          aria-controls="ds-sidebar"
          onClick={onMenuToggle}
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <div className="ds-topbar__welcome">
          <span className="ds-topbar__eyebrow">Spirit Billing</span>
          <strong>{user?.firstName ? `Welcome back, ${user.firstName}` : 'Your hosting account'}</strong>
        </div>
      </div>
      <div className="ds-topbar__actions">
        <Link className="ds-topbar__icon" to="/cart" aria-label={`Cart with ${count} items`}>
          <ShoppingCart size={19} />
          {count > 0 && <span className="ds-topbar__badge">{count > 99 ? '99+' : count}</span>}
        </Link>
        <div className="ds-notifications" ref={containerRef}>
          <button
            className="ds-topbar__icon"
            type="button"
            aria-label={`${data.unreadCount} unread notifications`}
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            <Bell size={19} />
            {data.unreadCount > 0 && (
              <span className="ds-topbar__badge">
                {data.unreadCount > 99 ? '99+' : data.unreadCount}
              </span>
            )}
          </button>
          {open && (
            <div className="ds-notifications__panel" role="dialog" aria-label="Notifications">
              <div className="ds-notifications__header">
                <div className="ds-notifications__title">
                  <span className="ds-notifications__mark"><Bell size={15} /></span>
                  <div>
                    <strong>Notifications</strong>
                    <small>
                      {data.unreadCount > 0
                        ? `${data.unreadCount} unread update${data.unreadCount === 1 ? '' : 's'}`
                        : 'You are up to date'}
                    </small>
                  </div>
                </div>
                <div className="ds-notifications__actions">
                  {data.unreadCount > 0 && (
                    <button type="button" onClick={() => void markAllRead()}>
                      <CheckCheck size={14} /> Mark all read
                    </button>
                  )}
                  {data.notifications.length > 0 && (
                    <button type="button" className="is-clear" onClick={() => void clearAll()}>
                      <Trash2 size={14} /> Clear all
                    </button>
                  )}
                </div>
              </div>
              <div className="ds-notifications__list">
                {data.notifications.map((item) => (
                  <Link
                    key={item.id}
                    to={item.href || '#'}
                    className={`ds-notification is-${item.type} ${item.readAt ? '' : 'is-unread'}`}
                    onClick={() => {
                      void markRead(item.id);
                      setOpen(false);
                    }}
                  >
                    <span className={`ds-notification__icon is-${item.type}`}>
                      {item.type === 'success' ? (
                        <CheckCircle2 size={15} />
                      ) : item.type === 'warning' ? (
                        <AlertCircle size={15} />
                      ) : (
                        <Bell size={15} />
                      )}
                    </span>
                    <span className="ds-notification__body">
                      <span className="ds-notification__meta">
                        <strong>{item.title}</strong>
                        <time dateTime={item.createdAt}>
                          {new Date(item.createdAt).toLocaleString(undefined, {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </time>
                      </span>
                      <span className="ds-notification__message">{item.message}</span>
                    </span>
                    {!item.readAt && <i className="ds-notification__unread" aria-hidden />}
                  </Link>
                ))}
                {!data.notifications.length && (
                  <div className="ds-notifications__empty">
                    <span><CheckCheck size={22} /></span>
                    <strong>All caught up</strong>
                    <small>Billing, upgrades, and service updates will show up here.</small>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export function ClientLayout() {
  const { user, panelWebUrl, loading } = useAuth();
  const branding = useBranding();
  const signOut = useLogout();
  const location = useLocation();
  const { count } = useCart();
  const { navOpen, setNavOpen, toggleNav } = useMobileNav();

  const isPublicStoreRoute =
    location.pathname === '/cart' ||
    location.pathname === '/game-hosting' ||
    location.pathname.startsWith('/game-hosting/');

  if (loading) return null;
  if (!user && !isPublicStoreRoute) return <Navigate to="/login" replace />;

  if (!user) {
    const registrationOpen = branding.registrationEnabled !== false;
    return (
      <div className="public-store-shell">
        <header className="public-store-nav">
          <Link to="/" className="public-store-brand">
            {branding.logoUrl && /^https?:\/\//i.test(branding.logoUrl) ? (
              <img src={branding.logoUrl} alt="" />
            ) : (
              <span className="public-store-brand__mark"><Gamepad2 size={16} /></span>
            )}
            <strong>{branding.companyName}</strong>
          </Link>
          <nav aria-label="Store">
            <Link to="/game-hosting">Game hosting</Link>
            <Link to="/cart"><ShoppingCart size={14} /> Cart{count > 0 ? ` (${count})` : ''}</Link>
          </nav>
          <div className="public-store-nav__actions">
            <Link to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}>Sign in</Link>
            {registrationOpen && (
              <Link
                className="public-store-nav__cta"
                to={`/register?next=${encodeURIComponent(location.pathname + location.search)}`}
              >
                Create account
              </Link>
            )}
          </div>
        </header>
        <main className="public-store-main">
          <div className="ds-page">
            <Outlet />
          </div>
        </main>
      </div>
    );
  }

  const display = user.firstName || user.username;
  const panelHref = /^https?:\/\//i.test(panelWebUrl) ? panelWebUrl : undefined;
  const supportHref = branding.supportUrl && /^https?:\/\//i.test(branding.supportUrl)
    ? branding.supportUrl
    : branding.supportEmail
      ? `mailto:${branding.supportEmail}`
      : undefined;
  const banner = branding.announcementBanner?.trim();

  return (
    <div className={`ds-shell${navOpen ? ' is-nav-open' : ''}`}>
      <button
        type="button"
        className="ds-nav-scrim"
        aria-label="Close navigation"
        tabIndex={navOpen ? 0 : -1}
        onClick={() => setNavOpen(false)}
      />
      <aside id="ds-sidebar" className={`ds-sidebar${navOpen ? ' is-open' : ''}`}>
        <Brand />
        <div className="ds-sidebar-scroll">
          <NavSection label="Account">
            <NavLink to="/dashboard" end><LayoutDashboard size={15} /> Dashboard</NavLink>
            <NavLink to="/profile"><UserIcon size={15} /> Profile</NavLink>
          </NavSection>
          <NavSection label="Hosting">
            <NavLink to="/game-hosting"><Gamepad2 size={15} /> Game Hosting</NavLink>
            <NavLink to="/services"><Server size={15} /> Services</NavLink>
            <NavLink to="/invoices"><Receipt size={15} /> Invoices</NavLink>
            {(branding.ticketsEnabled !== false) && (
              <NavLink to="/tickets"><MessageSquare size={15} /> Support</NavLink>
            )}
          </NavSection>
          {isStaffOrAdmin(user.role) && (
            <NavSection label="Admin">
              <NavLink to="/admin"><Settings size={15} /> Admin panel</NavLink>
            </NavSection>
          )}
        </div>
        <div className="ds-sidebar-foot">
          <div className="ds-row" style={{ justifyContent: 'space-between', padding: '0 0.15rem 0.35rem', fontSize: '0.82rem' }}>
            <span className="ds-muted ds-row" style={{ gap: '0.35rem' }}>
              <Wallet size={13} /> Credits
            </span>
            <strong>{money(user.creditBalanceCents ?? 0, branding.currency || 'GBP')}</strong>
          </div>
          <UserChip name={display} email={user.email} avatarUrl={user.avatarUrl} />
          <div className="ds-sidebar-actions">
            {panelHref && (
              <a className="ds-btn ds-btn--ghost ds-btn--sm" href={panelHref} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={13} /> Panel
              </a>
            )}
            {supportHref && (
              <a
                className="ds-btn ds-btn--ghost ds-btn--sm"
                href={supportHref}
                {...(supportHref.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              >
                Support
              </a>
            )}
            <button className="ds-btn ds-btn--ghost ds-btn--sm" type="button" onClick={() => void signOut()}>
              <LogOut size={13} /> Sign out
            </button>
          </div>
        </div>
      </aside>
      <main className="ds-main">
        <TopNavbar menuOpen={navOpen} onMenuToggle={toggleNav} />
        {banner && (
          <div className="ds-announcement" role="status">
            <Bell size={14} />
            <span>{banner}</span>
          </div>
        )}
        <div className="ds-page">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export function AdminLayout() {
  const { user, loading } = useAuth();
  const signOut = useLogout();
  const [openTickets, setOpenTickets] = useState(0);
  const { navOpen, setNavOpen, toggleNav } = useMobileNav();

  useEffect(() => {
    if (loading || !isStaffOrAdmin(user?.role)) return;
    let cancelled = false;
    async function loadOpenCount() {
      try {
        const data = await api<{ open: number }>('/admin/tickets/summary');
        if (!cancelled) setOpenTickets(data.open);
      } catch {
        // Ignore — sidebar badge is best-effort.
      }
    }
    void loadOpenCount();
    const timer = window.setInterval(() => void loadOpenCount(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [loading, user?.role]);

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!isStaffOrAdmin(user.role)) return <Navigate to="/dashboard" replace />;
  const fullAdmin = isFullAdmin(user.role);

  return (
    <div className={`ds-shell${navOpen ? ' is-nav-open' : ''}`}>
      <button
        type="button"
        className="ds-nav-scrim"
        aria-label="Close navigation"
        tabIndex={navOpen ? 0 : -1}
        onClick={() => setNavOpen(false)}
      />
      <aside id="ds-sidebar" className={`ds-sidebar${navOpen ? ' is-open' : ''}`}>
        <Brand />
        <div className="ds-sidebar-scroll">
          <NavSection label="Overview">
            <NavLink to="/admin" end><LayoutDashboard size={15} /> Overview</NavLink>
            <NavLink to="/admin/logs"><ScrollText size={15} /> Logs</NavLink>
            {fullAdmin && <NavLink to="/admin/settings"><Settings size={15} /> Settings</NavLink>}
          </NavSection>
          {fullAdmin && (
            <NavSection label="Catalog">
              <NavLink to="/admin/categories"><FolderTree size={15} /> Categories</NavLink>
              <NavLink to="/admin/products"><Package size={15} /> Products</NavLink>
            </NavSection>
          )}
          <NavSection label="Billing">
            <NavLink to="/admin/invoices"><CreditCard size={15} /> Invoices</NavLink>
            <NavLink to="/admin/services"><Server size={15} /> Services</NavLink>
            <NavLink to="/admin/tickets">
              <MessageSquare size={15} /> Tickets
              {openTickets > 0 && (
                <span className="ds-nav-badge">{openTickets > 99 ? '99+' : openTickets}</span>
              )}
            </NavLink>
            {fullAdmin && <NavLink to="/admin/ticket-categories"><Tags size={15} /> Ticket categories</NavLink>}
            {fullAdmin && <NavLink to="/admin/coupons"><TicketPercent size={15} /> Coupons</NavLink>}
            <NavLink to="/admin/users"><Users size={15} /> Users</NavLink>
          </NavSection>
          <NavSection label="Shortcuts">
            <NavLink to="/game-hosting"><ShoppingBag size={15} /> Client area</NavLink>
          </NavSection>
        </div>
        <div className="ds-sidebar-foot">
          <UserChip name={user.firstName || user.username} email={user.email} avatarUrl={user.avatarUrl} />
          <div className="ds-sidebar-actions">
            <button className="ds-btn ds-btn--ghost ds-btn--sm" type="button" onClick={() => void signOut()}>
              <LogOut size={13} /> Sign out
            </button>
          </div>
        </div>
      </aside>
      <main className="ds-main">
        <TopNavbar menuOpen={navOpen} onMenuToggle={toggleNav} />
        <div className="ds-page">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
