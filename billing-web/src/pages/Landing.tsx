import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Cloud,
  Cpu,
  ExternalLink,
  FileText,
  Gamepad2,
  Gauge,
  HardDrive,
  LockKeyhole,
  Network,
  Server,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import { api, isBrandAssetUrl, money, safeExternalHref } from '../lib/api';
import { useBranding } from '../context/BrandingContext';
import { useAuth } from '../context/AuthContext';
import { CategoryMark } from '../lib/icons';

type Category = {
  id: string;
  name: string;
  slug: string;
  description: string;
  color: string;
  icon: string;
  logoUrl?: string | null;
  backgroundUrl?: string | null;
  _count?: { products: number };
  startingFrom?: {
    priceCents: number;
    currency: string;
    cycle: string;
  } | null;
};

function cycleShort(cycle: string) {
  if (cycle === 'monthly') return 'mo';
  if (cycle === 'quarterly') return 'qtr';
  if (cycle === 'yearly') return 'yr';
  return cycle;
}

export function LandingPage() {
  const branding = useBranding();
  const { user } = useAuth();
  const panelHref = safeExternalHref(branding.panelWebUrl);
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    void api<Category[]>('/client/categories').then(setCategories).catch(() => setCategories([]));
  }, []);

  const registrationOpen = branding.registrationEnabled !== false;
  const browseHosting = '/game-hosting';
  const primaryCta = browseHosting;
  const primaryLabel = 'Browse plans';
  const accountCta = registrationOpen ? '/register?next=%2Fgame-hosting' : '/login?next=%2Fgame-hosting';

  return (
    <div className="landing-v3">
      <header className="landing-v3-nav">
        <div className="landing-v3-shell landing-v3-nav__inner">
          <Link to="/" className="landing-v3-brand">
            {isBrandAssetUrl(branding.logoUrl) ? (
              <img src={branding.logoUrl!} alt="" />
            ) : (
              <span className="landing-v3-brand__mark"><Gamepad2 size={18} /></span>
            )}
            <span>
              <strong>{branding.companyName}</strong>
              <small>Game server hosting</small>
            </span>
          </Link>
          <nav className="landing-v3-nav__links" aria-label="Main navigation">
            <a href="#games">Games</a>
            <a href="#platform">Platform</a>
            <a href="#how-it-works">How it works</a>
            <Link to="/game-hosting">Plans</Link>
          </nav>
          <div className="landing-v3-nav__actions">
            {user ? (
              <Link className="landing-v3-button landing-v3-button--primary is-small" to="/dashboard">
                Client area <ArrowRight size={14} />
              </Link>
            ) : (
              <>
                <Link className="landing-v3-signin" to="/login">Sign in</Link>
                {registrationOpen && (
                  <Link className="landing-v3-button landing-v3-button--primary is-small" to={accountCta}>
                    Get started <ArrowRight size={14} />
                  </Link>
                )}
              </>
            )}
          </div>
        </div>
      </header>

      {branding.maintenanceMode && (
        <div className="landing-v3-maintenance">
          <ShieldCheck size={15} />
          <span>{branding.maintenanceMessage || 'Billing is currently undergoing maintenance.'}</span>
          <Link to="/login">Admin sign in</Link>
        </div>
      )}

      <main>
        <section className="landing-v3-hero" aria-label="Game server hosting">
          <div className="landing-v3-hero__wash" aria-hidden />
          <div className="landing-v3-shell landing-v3-hero__inner">
            <div className="landing-v3-hero__copy">
              <div className="landing-v3-kicker">
                <span><Sparkles size={13} /></span>
                Hosting powered by Spirit-Panel
              </div>
              <h1>
                Your next game server, <em>ready when you are.</em>
              </h1>
              <p>
                Choose a game, pick the resources you need, and manage everything from one focused control panel.
                Simple billing, powerful server controls, no clutter.
              </p>
              <div className="landing-v3-hero__actions">
                <Link className="landing-v3-button landing-v3-button--primary" to={primaryCta}>
                  {primaryLabel} <ArrowRight size={17} />
                </Link>
                <a className="landing-v3-button landing-v3-button--secondary" href="#games">
                  Explore games <ChevronRight size={17} />
                </a>
              </div>
              <div className="landing-v3-trust">
                <span><CheckCircle2 size={14} /> Clear resource limits</span>
                <span><CheckCircle2 size={14} /> Integrated billing</span>
                <span><CheckCircle2 size={14} /> Full panel access</span>
              </div>
            </div>

            <div className="landing-v3-stage" aria-hidden>
              <div className="landing-v3-stage__halo" />
              <div className="landing-v3-panel">
                <header>
                  <span className="landing-v3-panel__logo"><Gamepad2 size={17} /></span>
                  <div>
                    <strong>Survival Server</strong>
                    <small>Spirit-Panel overview</small>
                  </div>
                  <span className="landing-v3-online"><i /> Online</span>
                </header>
                <div className="landing-v3-panel__chart">
                  <div className="landing-v3-panel__chart-head">
                    <span>Resource activity</span>
                    <strong>Last 30 minutes</strong>
                  </div>
                  <svg viewBox="0 0 440 130" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="landingChartFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--accent)" stopOpacity=".32" />
                        <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path className="fill" d="M0,110 C30,100 48,80 76,88 C108,98 126,46 160,58 C192,70 200,24 236,38 C274,53 290,35 322,42 C355,49 378,16 440,26 L440,130 L0,130 Z" />
                    <path className="line" d="M0,110 C30,100 48,80 76,88 C108,98 126,46 160,58 C192,70 200,24 236,38 C274,53 290,35 322,42 C355,49 378,16 440,26" />
                  </svg>
                </div>
                <div className="landing-v3-panel__metrics">
                  <div><span><Cpu size={14} /></span><small>CPU</small><strong>38%</strong><i><b style={{ width: '38%' }} /></i></div>
                  <div><span><Gauge size={14} /></span><small>Memory</small><strong>4.8 GB</strong><i><b style={{ width: '62%' }} /></i></div>
                  <div><span><HardDrive size={14} /></span><small>Storage</small><strong>18 GB</strong><i><b style={{ width: '46%' }} /></i></div>
                </div>
              </div>
              <div className="landing-v3-float landing-v3-float--players">
                <span><Network size={14} /></span>
                <div><strong>12 / 64</strong><small>Players online</small></div>
              </div>
              <div className="landing-v3-float landing-v3-float--ready">
                <span><Check size={14} /></span>
                <div><strong>Server ready</strong><small>Provisioning complete</small></div>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-v3-strip" aria-label="Platform benefits">
          <div className="landing-v3-shell">
            <div><span><Zap size={17} /></span><strong>Fast setup</strong><small>Automated server provisioning</small></div>
            <div><span><ShieldCheck size={17} /></span><strong>Account security</strong><small>Protected access and sessions</small></div>
            <div><span><Gauge size={17} /></span><strong>Live controls</strong><small>Resources, console and power</small></div>
            <div><span><FileText size={17} /></span><strong>Simple billing</strong><small>Invoices and service history</small></div>
          </div>
        </section>

        <section className="landing-v3-section landing-v3-games" id="games">
          <div className="landing-v3-shell">
            <header className="landing-v3-section__head">
              <div>
                <span>Choose your game</span>
                <h2>Built for the worlds you play in.</h2>
              </div>
              <p>Browse available hosting categories and choose a plan matched to your community.</p>
            </header>

            <div className="landing-v3-games__grid">
              {categories.slice(0, 6).map((category, index) => {
                const plans = category._count?.products ?? 0;
                const hasBg = Boolean(category.backgroundUrl && /^https?:\/\//i.test(category.backgroundUrl));
                return (
                <Link
                  key={category.id}
                  to={`/game-hosting/${category.slug || category.id}`}
                  className={`landing-v3-game${hasBg ? ' has-bg' : ''}`}
                  style={{
                    ['--game-color' as string]: category.color || 'var(--accent)',
                    animationDelay: `${index * 55}ms`,
                  }}
                >
                  <div className="landing-v3-game__art">
                    {hasBg ? <img src={category.backgroundUrl!} alt="" /> : null}
                    <CategoryMark
                      icon={category.icon}
                      logoUrl={category.logoUrl}
                      color={category.color}
                      size={46}
                    />
                    {plans > 0 ? (
                      <span>{plans} plan{plans === 1 ? '' : 's'}</span>
                    ) : null}
                  </div>
                  <div className="landing-v3-game__body">
                    <h3>{category.name}</h3>
                    {category.description ? <p>{category.description}</p> : null}
                    {category.startingFrom && (
                      <strong className="landing-v3-game__price">
                        From {money(category.startingFrom.priceCents, category.startingFrom.currency)}
                        <small>/{cycleShort(category.startingFrom.cycle)}</small>
                      </strong>
                    )}
                  </div>
                  <footer>View plans <ArrowRight size={14} /></footer>
                </Link>
                );
              })}
              {!categories.length && (
                <div className="landing-v3-game__empty">
                  <Cloud size={24} />
                  <strong>Plans are being prepared</strong>
                  <span>Published game categories will appear here.</span>
                </div>
              )}
            </div>
            {categories.length > 0 && (
              <div className="landing-v3-games__more">
                <Link className="landing-v3-button landing-v3-button--secondary" to="/game-hosting">
                  Browse all game hosting <ArrowRight size={15} />
                </Link>
                {!user && (
                  <p>
                    No account needed to browse.{' '}
                    <Link to={accountCta}>Create one</Link> when you&apos;re ready to buy.
                  </p>
                )}
              </div>
            )}
          </div>
        </section>

        <section className="landing-v3-section landing-v3-platform" id="platform">
          <div className="landing-v3-shell landing-v3-platform__layout">
            <div className="landing-v3-platform__copy">
              <span className="landing-v3-eyebrow">One connected platform</span>
              <h2>Billing on one side. Complete server control on the other.</h2>
              <p>
                Your client area keeps orders, invoices, credits and services organised. Spirit-Panel gives you the
                controls to run the server after it goes live.
              </p>
              <ul>
                <li><span><LockKeyhole size={15} /></span><div><strong>Secure account access</strong><small>Protected sessions and separated client/admin permissions.</small></div></li>
                <li><span><Server size={15} /></span><div><strong>Server management</strong><small>Console, files, backups, databases and network controls.</small></div></li>
                <li><span><FileText size={15} /></span><div><strong>Billing clarity</strong><small>See service status, invoice history and account credits.</small></div></li>
              </ul>
              {panelHref && (
                <a href={panelHref} target="_blank" rel="noopener noreferrer">
                  Open Spirit-Panel <ExternalLink size={14} />
                </a>
              )}
            </div>

            <div className="landing-v3-stack" aria-hidden>
              <article className="landing-v3-stack__invoice">
                <header><span><FileText size={15} /></span><div><strong>Invoice paid</strong><small>INV-2048</small></div><em>Complete</em></header>
                <div><span>High Performance Server</span><strong>£18.00</strong></div>
              </article>
              <span className="landing-v3-stack__line"><i /><Zap size={16} /><i /></span>
              <article className="landing-v3-stack__server">
                <header><span><Server size={15} /></span><div><strong>Provisioning server</strong><small>Spirit-Panel</small></div></header>
                <ol>
                  <li className="done"><i><Check size={11} /></i><span>Account linked</span></li>
                  <li className="done"><i><Check size={11} /></i><span>Resources allocated</span></li>
                  <li className="active"><i><Sparkles size={11} /></i><span>Installing game files</span></li>
                </ol>
              </article>
            </div>
          </div>
        </section>

        <section className="landing-v3-section landing-v3-process" id="how-it-works">
          <div className="landing-v3-shell">
            <header className="landing-v3-section__head is-centered">
              <div>
                <span>From plan to play</span>
                <h2>A straightforward path to your server.</h2>
              </div>
              <p>No confusing setup flow. Pick, order, activate and manage.</p>
            </header>
            <ol className="landing-v3-process__grid">
              <li>
                <em>01</em><span><Gamepad2 size={19} /></span>
                <strong>Choose a plan</strong>
                <p>Find your game and select the resource package that fits.</p>
              </li>
              <li>
                <em>02</em><span><FileText size={19} /></span>
                <strong>Review your invoice</strong>
                <p>See the full price and payment instructions before activation.</p>
              </li>
              <li>
                <em>03</em><span><Zap size={19} /></span>
                <strong>Server provisioned</strong>
                <p>Once paid, your service is created and linked to Spirit-Panel.</p>
              </li>
              <li>
                <em>04</em><span><Server size={19} /></span>
                <strong>Take control</strong>
                <p>Configure, monitor and manage your server from the panel.</p>
              </li>
            </ol>
          </div>
        </section>

        <section className="landing-v3-cta">
          <div className="landing-v3-shell">
            <div className="landing-v3-cta__card">
              <div className="landing-v3-cta__glow" />
              <span><Sparkles size={14} /> Your server starts here</span>
              <h2>Ready to build your next world?</h2>
              <p>Explore available games and choose the server that fits your players.</p>
              <div>
                <Link className="landing-v3-button landing-v3-button--light" to={primaryCta}>
                  {primaryLabel} <ArrowRight size={17} />
                </Link>
                {!user && <Link className="landing-v3-cta__login" to="/login?next=%2Fgame-hosting">Already a customer? Sign in</Link>}
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="landing-v3-footer">
        <div className="landing-v3-shell landing-v3-footer__inner">
          <div className="landing-v3-brand">
            {isBrandAssetUrl(branding.logoUrl) ? (
              <img src={branding.logoUrl!} alt="" />
            ) : (
              <span className="landing-v3-brand__mark"><Gamepad2 size={18} /></span>
            )}
            <span>
              <strong>{branding.companyName}</strong>
              <small>{branding.tagline || 'Game server hosting'}</small>
            </span>
          </div>
          <div className="landing-v3-footer__links">
            <a href="#games">Games</a>
            <a href="#platform">Platform</a>
            <Link to="/login">Sign in</Link>
            {panelHref && <a href={panelHref} target="_blank" rel="noopener noreferrer">Game panel</a>}
            {safeExternalHref(branding.supportUrl) && (
              <a href={safeExternalHref(branding.supportUrl)} target="_blank" rel="noopener noreferrer">Support</a>
            )}
            {!safeExternalHref(branding.supportUrl) && branding.supportEmail && (
              <a href={`mailto:${branding.supportEmail}`}>Support</a>
            )}
            {safeExternalHref(branding.termsUrl) && (
              <a href={safeExternalHref(branding.termsUrl)} target="_blank" rel="noopener noreferrer">Terms</a>
            )}
            {safeExternalHref(branding.privacyUrl) && (
              <a href={safeExternalHref(branding.privacyUrl)} target="_blank" rel="noopener noreferrer">Privacy</a>
            )}
          </div>
          <p>© {new Date().getFullYear()} {branding.companyName}. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
