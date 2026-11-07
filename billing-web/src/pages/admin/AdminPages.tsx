import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  BarChart3,
  CircleDollarSign,
  FileText,
  Package,
  Plus,
  Server,
  Settings,
  ShieldCheck,
  TrendingUp,
  UserPlus,
  Users,
} from 'lucide-react';
import { api, ApiError, money, statusBadge } from '../../lib/api';

export function AdminOverview() {
  type OverviewStats = {
    users: number;
    linkedUsers: number;
    services: { total: number; active: number; pending: number; suspended: number };
    invoices: { unpaid: number; unpaidCents: number };
    products: { total: number; active: number };
    revenuePaidCents: number;
    revenueByMonth: Array<{ label: string; revenueCents: number }>;
    recentInvoices: Array<{
      id: string;
      number: string;
      status: string;
      totalCents: number;
      currency: string;
      createdAt: string;
      user: { username: string; email: string };
      service: { name: string } | null;
    }>;
    recentServices: Array<{
      id: string;
      name: string;
      status: string;
      createdAt: string;
      panelServerId: string | null;
      user: { username: string };
      product: { name: string };
    }>;
  };

  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    void api<OverviewStats>('/admin/stats')
      .then(setStats)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load overview'));
  }, []);

  const maxRevenue = Math.max(...(stats?.revenueByMonth.map((month) => month.revenueCents) ?? [0]), 1);
  const activeRate = stats?.services.total
    ? Math.round((stats.services.active / stats.services.total) * 100)
    : 0;
  const linkRate = stats?.users ? Math.round((stats.linkedUsers / stats.users) * 100) : 0;

  return (
    <div className="admin-home">
      <section className="admin-home-hero">
        <div className="admin-home-hero__copy">
          <span><Activity size={13} /> Operations centre</span>
          <h1>Billing at a glance.</h1>
          <p>Monitor revenue, customer accounts, invoices, and server provisioning from one place.</p>
          <div>
            <Link to="/admin/products/new"><Plus size={14} /> Create product</Link>
            <Link to="/admin/users"><Users size={14} /> Manage users</Link>
          </div>
        </div>
        <div className="admin-home-hero__revenue">
          <span>Total paid revenue</span>
          <strong>{stats ? money(stats.revenuePaidCents) : '—'}</strong>
          <small><TrendingUp size={12} /> All successfully paid invoices</small>
          <i />
        </div>
        <div className="admin-home-hero__status">
          <span><i /> Platform operational</span>
          <small>{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</small>
        </div>
      </section>

      {error && <div className="ds-alert ds-alert--error">{error}</div>}

      <section className="admin-home-metrics">
        <article>
          <span className="is-blue"><Users size={17} /></span>
          <div><small>Client accounts</small><strong>{stats?.users ?? '—'}</strong><p>{stats?.linkedUsers ?? '—'} linked to panel</p></div>
          <em>{linkRate}%</em>
        </article>
        <article>
          <span className="is-green"><Server size={17} /></span>
          <div><small>Active services</small><strong>{stats?.services.active ?? '—'}</strong><p>{stats?.services.total ?? '—'} services total</p></div>
          <em>{activeRate}%</em>
        </article>
        <article className={stats?.invoices.unpaid ? 'has-warning' : ''}>
          <span className="is-amber"><FileText size={17} /></span>
          <div><small>Unpaid invoices</small><strong>{stats?.invoices.unpaid ?? '—'}</strong><p>{stats ? money(stats.invoices.unpaidCents) : '—'} outstanding</p></div>
          <Link to="/admin/invoices"><ArrowRight size={14} /></Link>
        </article>
        <article>
          <span className="is-purple"><Package size={17} /></span>
          <div><small>Store products</small><strong>{stats?.products.active ?? '—'}</strong><p>{stats?.products.total ?? '—'} configured plans</p></div>
          <Link to="/admin/products"><ArrowRight size={14} /></Link>
        </article>
      </section>

      <div className="admin-home-layout">
        <main>
          <section className="admin-home-card admin-home-revenue">
            <header>
              <div><span>Performance</span><h2>Revenue trend</h2><p>Paid invoice value over the last six months.</p></div>
              <span><BarChart3 size={14} /> GBP</span>
            </header>
            <div className="admin-home-chart">
              {stats?.revenueByMonth.map((month) => (
                <div key={month.label}>
                  <span>{month.revenueCents > 0 ? money(month.revenueCents) : '£0'}</span>
                  <i style={{ height: `${Math.max(4, (month.revenueCents / maxRevenue) * 100)}%` }} />
                  <small>{month.label}</small>
                </div>
              )) ?? Array.from({ length: 6 }, (_, index) => <div key={index}><i style={{ height: '4%' }} /><small>—</small></div>)}
            </div>
          </section>

          <section className="admin-home-card admin-home-invoices">
            <header>
              <div><span>Latest billing</span><h2>Recent invoices</h2></div>
              <Link to="/admin/invoices">View all <ArrowRight size={13} /></Link>
            </header>
            <div>
              {stats?.recentInvoices.map((invoice) => (
                <article key={invoice.id}>
                  <span className="admin-home-invoices__icon"><FileText size={14} /></span>
                  <div><strong>{invoice.number}</strong><small>{invoice.user.username} · {invoice.service?.name ?? 'No service'}</small></div>
                  <span className={statusBadge(invoice.status)}>{invoice.status}</span>
                  <div className="admin-home-invoices__amount"><strong>{money(invoice.totalCents, invoice.currency)}</strong><small>{new Date(invoice.createdAt).toLocaleDateString()}</small></div>
                </article>
              ))}
              {stats && !stats.recentInvoices.length && <div className="admin-home-empty">No invoices have been created yet.</div>}
            </div>
          </section>
        </main>

        <aside>
          <section className="admin-home-card admin-home-health">
            <header><div><span>Infrastructure</span><h2>Service health</h2></div><ShieldCheck size={17} /></header>
            <div className="admin-home-health__score">
              <div style={{ ['--health' as string]: `${activeRate * 3.6}deg` }}><strong>{activeRate}%</strong><small>active</small></div>
              <span><strong>{stats?.services.total ?? '—'} total services</strong><small>Current provisioning state</small></span>
            </div>
            <div className="admin-home-health__rows">
              <span><i className="is-active" /> Active <strong>{stats?.services.active ?? '—'}</strong></span>
              <span><i className="is-pending" /> Pending <strong>{stats?.services.pending ?? '—'}</strong></span>
              <span><i className="is-suspended" /> Suspended <strong>{stats?.services.suspended ?? '—'}</strong></span>
            </div>
            <Link to="/admin/services">Manage services <ArrowRight size={13} /></Link>
          </section>

          <section className="admin-home-card admin-home-actions">
            <header><div><span>Shortcuts</span><h2>Quick actions</h2></div></header>
            <div>
              <Link to="/admin/products/new"><span><Plus size={14} /></span><div><strong>New product</strong><small>Add a hosting plan</small></div><ArrowRight size={12} /></Link>
              <Link to="/admin/coupons"><span><CircleDollarSign size={14} /></span><div><strong>Create coupon</strong><small>Launch a promotion</small></div><ArrowRight size={12} /></Link>
              <Link to="/admin/users"><span><UserPlus size={14} /></span><div><strong>Customer accounts</strong><small>Access and credits</small></div><ArrowRight size={12} /></Link>
              <Link to="/admin/settings"><span><Settings size={14} /></span><div><strong>Billing settings</strong><small>Brand and panel link</small></div><ArrowRight size={12} /></Link>
            </div>
          </section>

          <section className="admin-home-card admin-home-services">
            <header><div><span>Provisioning</span><h2>Newest services</h2></div><Link to="/admin/services"><ArrowRight size={13} /></Link></header>
            <div>
              {stats?.recentServices.slice(0, 4).map((service) => (
                <article key={service.id}>
                  <span><Server size={13} /></span>
                  <div><strong>{service.name}</strong><small>{service.user.username} · {service.product.name}</small></div>
                  <i className={`is-${service.status}`} title={service.status} />
                </article>
              ))}
              {stats && !stats.recentServices.length && <div className="admin-home-empty">No services yet.</div>}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

