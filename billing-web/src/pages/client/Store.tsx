import { useEffect, useId, useMemo, useRef, useState, type ComponentType } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Cpu,
  Gamepad2,
  Globe2,
  HardDrive,
  Headphones,
  Layers3,
  ListChecks,
  MemoryStick,
  PackageOpen,
  Rocket,
  Search,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Zap,
  Archive,
  Database,
  type LucideProps,
} from 'lucide-react';
import { api, money } from '../../lib/api';
import { CategoryMark } from '../../lib/icons';
import { useCart, type CartProduct } from '../../context/CartContext';

type FeatureIcon = ComponentType<LucideProps>;

const DEFAULT_PLAN_FEATURES = [
  'Instant server deployment',
  'DDoS protection included',
  'Full Spirit-Panel access',
];

function featureIcon(feature: string): FeatureIcon {
  const text = feature.toLowerCase();
  if (/(ddos|protect|protection|secure|security)/.test(text)) return ShieldCheck;
  if (/(panel|control|dashboard|spirit)/.test(text)) return Layers3;
  if (/(instant|deploy|setup|provision|launch)/.test(text)) return Rocket;
  if (/(support|help|ticket)/.test(text)) return Headphones;
  if (/(backup)/.test(text)) return Archive;
  if (/(database|mysql|mariadb|mongo)/.test(text)) return Database;
  if (/(ssd|nvme|disk|storage|space)/.test(text)) return HardDrive;
  if (/(cpu|processor|core)/.test(text)) return Cpu;
  if (/(ram|memory)/.test(text)) return MemoryStick;
  if (/(fast|performance|speed|low latency|latency)/.test(text)) return Zap;
  if (/(online|uptime|global|world)/.test(text)) return Globe2;
  return CheckCircle2;
}

function PlanFeatures({ features }: { features: string[] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const items = features.map((label) => label.trim()).filter(Boolean);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (!items.length) return null;

  return (
    <div className={`client-gh-plan__features${open ? ' is-open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="client-gh-plan__features-trigger"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <span>
          <ListChecks size={14} aria-hidden />
          <strong>What&apos;s included</strong>
        </span>
        <em>
          <b>{items.length}</b>
          <ChevronDown size={15} aria-hidden />
        </em>
      </button>
      <div
        id={panelId}
        className="client-gh-plan__features-panel"
        role="region"
        aria-label="Plan features"
        aria-hidden={!open}
      >
        <div className="client-gh-plan__features-panel-inner">
          <ul className="client-gh-plan__features-list">
            {items.map((feature, index) => {
              const Icon = featureIcon(feature);
              return (
                <li key={`${index}-${feature}`} style={{ ['--i' as string]: index }}>
                  <span aria-hidden>
                    <Icon size={13} />
                  </span>
                  <span>{feature}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}

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

type Product = {
  id: string;
  name: string;
  description: string;
  features?: string[];
  priceCents: number;
  currency: string;
  cycle: string;
  memoryMb: number;
  diskMb: number;
  cpuPercent: number;
  backupLimit?: number;
  databaseLimit?: number;
};

function cycleShort(cycle: string) {
  if (cycle === 'monthly') return 'mo';
  if (cycle === 'quarterly') return 'qtr';
  if (cycle === 'yearly') return 'yr';
  return cycle;
}

function cyclePhrase(cycle: string) {
  if (cycle === 'monthly') return 'Billed monthly';
  if (cycle === 'quarterly') return 'Billed every 3 months';
  if (cycle === 'yearly') return 'Billed yearly';
  return `Billed ${cycle}`;
}

function formatResource(mb: number, unlimitedLabel = 'Unlimited') {
  if (mb <= 0) return unlimitedLabel;
  if (mb >= 1024 && mb % 1024 === 0) return `${mb / 1024} GB`;
  return `${mb.toLocaleString()} MB`;
}

function CartDock({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <div className="client-gh__dock">
      <div className="client-gh__dock-copy">
        <span aria-hidden>
          <ShoppingCart size={16} />
        </span>
        <div>
          <strong>
            {count} item{count === 1 ? '' : 's'} in your cart
          </strong>
          <small>Review and check out whenever you&apos;re ready.</small>
        </div>
      </div>
      <Link className="client-home__btn client-home__btn--primary client-home__btn--sm" to="/cart">
        Review cart
        <ArrowRight size={13} />
      </Link>
    </div>
  );
}

export function GameHostingPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const { count } = useCart();

  useEffect(() => {
    void api<Category[]>('/client/categories')
      .then(setCategories)
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return categories;
    return categories.filter((category) =>
      `${category.name} ${category.description}`.toLowerCase().includes(term),
    );
  }, [categories, query]);

  const totalPlans = categories.reduce((sum, category) => sum + (category._count?.products ?? 0), 0);
  const showSearch = categories.length > 1 || Boolean(query.trim());

  return (
    <div className={`client-home client-gh client-host${count > 0 ? ' has-dock' : ''}`}>
      <section
        className="client-host__hero"
        style={{
          ['--hero-a' as string]: categories[0]?.color || 'var(--accent)',
          ['--hero-b' as string]: categories[1]?.color || categories[0]?.color || 'var(--accent)',
        }}
      >
        <div className="client-host__hero-bg" aria-hidden>
          <span className="client-host__hero-bg-grid" />
          <span className="client-host__hero-bg-orb client-host__hero-bg-orb--a" />
          <span className="client-host__hero-bg-orb client-host__hero-bg-orb--b" />
          <svg className="client-host__hero-bg-rings" viewBox="0 0 640 320" preserveAspectRatio="xMaxYMid slice">
            <g fill="none" stroke="currentColor" strokeWidth="1.2">
              <circle cx="470" cy="160" r="46" opacity="0.28" />
              <circle cx="470" cy="160" r="86" opacity="0.2" />
              <circle cx="470" cy="160" r="132" opacity="0.14" />
              <circle cx="470" cy="160" r="178" opacity="0.1" />
              <path d="M292 160h356" opacity="0.16" />
              <path d="M470 2v316" opacity="0.16" />
              <path d="M350 52l240 216" opacity="0.12" />
              <path d="M350 268l240-216" opacity="0.12" />
            </g>
            <g fill="currentColor">
              <circle cx="470" cy="160" r="4.5" opacity="0.55" />
              <circle cx="556" cy="102" r="3" opacity="0.4" />
              <circle cx="392" cy="214" r="2.5" opacity="0.35" />
              <circle cx="538" cy="232" r="2.2" opacity="0.3" />
            </g>
          </svg>
        </div>
        <div className="client-host__hero-body">
          <h1>Game hosting</h1>
          <p>
            {loading
              ? 'Loading games…'
              : categories.length
                ? 'Choose a game, then a plan built for it.'
                : 'Games appear here once they are published.'}
          </p>
          <div className="client-host__hero-actions">
            {categories.length ? (
              <a className="client-home__btn client-home__btn--primary client-home__btn--cta" href="#games">
                <span>Browse games</span>
                <span className="client-home__btn-icon" aria-hidden>
                  <ArrowRight size={16} className="client-home__btn-arrow" />
                </span>
              </a>
            ) : null}
            <div className="client-host__hero-stats" aria-label="Catalog totals">
              <span>
                <Gamepad2 size={15} aria-hidden />
                <strong>{loading ? '—' : categories.length}</strong>
                <small>{categories.length === 1 ? 'Game' : 'Games'}</small>
              </span>
              <span>
                <Layers3 size={15} aria-hidden />
                <strong>{loading ? '—' : totalPlans}</strong>
                <small>{totalPlans === 1 ? 'Plan' : 'Plans'}</small>
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="client-host__catalog" id="games" aria-labelledby="popular-games">
        <header className="client-host__block-head">
          <div>
            <p>Start here</p>
            <h2 id="popular-games">Popular games</h2>
          </div>
          <div className="client-host__block-tools">
            {showSearch ? (
              <label className="client-gh__search client-host__catalog-search">
                <Search size={15} aria-hidden />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search games"
                  aria-label="Search games"
                />
              </label>
            ) : null}
            {!loading ? (
              <span>
                {filtered.length} game{filtered.length === 1 ? '' : 's'}
              </span>
            ) : null}
          </div>
        </header>
        {loading ? (
          <div className="client-host__grid">
            {[0, 1].map((item) => (
              <div className="client-host__card is-loading" key={item} />
            ))}
          </div>
        ) : filtered.length ? (
          <div className="client-host__grid">
            {filtered.map((category) => {
              const planCount = category._count?.products ?? 0;
              const from = category.startingFrom;
              return (
                <Link
                  key={category.id}
                  to={`/game-hosting/${category.slug || category.id}`}
                  className="client-host__card"
                  style={{ ['--gh-color' as string]: category.color || 'var(--accent)' }}
                >
                  <span className={`client-host__card-art${category.backgroundUrl ? ' has-bg' : ''}`} aria-hidden>
                    {category.backgroundUrl && /^https?:\/\//i.test(category.backgroundUrl) ? (
                      <img className="client-host__card-bg" src={category.backgroundUrl} alt="" />
                    ) : null}
                    <span className="client-host__plate">
                      <CategoryMark
                        icon={category.icon}
                        logoUrl={category.logoUrl}
                        color={category.color}
                        size={74}
                      />
                    </span>
                  </span>
                  <span className="client-host__card-body">
                    <span className="client-host__title">
                      <strong>{category.name}</strong>
                      {planCount > 0 ? (
                        <em>
                          {planCount} plan{planCount === 1 ? '' : 's'}
                        </em>
                      ) : null}
                    </span>
                    {category.description?.trim() ? (
                      <p>{category.description}</p>
                    ) : planCount === 0 ? (
                      <p>Plans will be published here.</p>
                    ) : null}
                    <span className="client-host__card-foot">
                      {from ? (
                        <span className="client-host__price">
                          <small>From</small>
                          <strong>
                            {money(from.priceCents, from.currency)}
                            <small>/{cycleShort(from.cycle)}</small>
                          </strong>
                        </span>
                      ) : (
                        <span className="client-host__price">
                          <small>Plans</small>
                          <strong>Soon</strong>
                        </span>
                      )}
                      <span className="client-host__cta">
                        View plans
                        <ArrowRight size={14} />
                      </span>
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="client-home__empty">
            <span aria-hidden>
              <PackageOpen size={22} />
            </span>
            <div>
              <strong>{categories.length ? 'No games match that search' : 'No games yet'}</strong>
              <p>
                {categories.length
                  ? 'Try another name, or clear the search.'
                  : 'Hosting categories will appear here once they are published.'}
              </p>
            </div>
            {query ? (
              <button
                type="button"
                className="client-home__btn client-home__btn--ghost client-home__btn--sm"
                onClick={() => setQuery('')}
              >
                Clear search
              </button>
            ) : null}
          </div>
        )}
      </section>

      <section className="client-host__steps" aria-labelledby="online-steps">
        <header className="client-host__block-head">
          <div>
            <p>Get started</p>
            <h2 id="online-steps">Online in three steps</h2>
          </div>
        </header>
        <ol>
          <li>
            <span>
              <em>01</em>
              <Gamepad2 size={16} aria-hidden />
            </span>
            <strong>Choose a game</strong>
            <p>Open a game from the catalog and see the plans built for it.</p>
          </li>
          <li>
            <span>
              <em>02</em>
              <Layers3 size={16} aria-hidden />
            </span>
            <strong>Pick a plan</strong>
            <p>Compare memory, storage, and price, then add it to your cart.</p>
          </li>
          <li>
            <span>
              <em>03</em>
              <Rocket size={16} aria-hidden />
            </span>
            <strong>You&apos;re online</strong>
            <p>Check out, then manage the server from Spirit-Panel.</p>
          </li>
        </ol>
      </section>

      <CartDock count={count} />
    </div>
  );
}


export function CategoryPlansPage() {
  const { categoryId } = useParams();
  const { addItem, count } = useCart();
  const [category, setCategory] = useState<Category | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [addedId, setAddedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!categoryId) return;
    setLoading(true);
    void api<{ category: Category; products: Product[] }>(`/client/categories/${categoryId}`)
      .then((data) => {
        setCategory(data.category);
        setProducts(data.products);
      })
      .catch(() => {
        setCategory(null);
        setProducts([]);
      })
      .finally(() => setLoading(false));
  }, [categoryId]);

  function addToCart(product: Product) {
    const payload: CartProduct = {
      id: product.id,
      name: product.name,
      description: product.description,
      features: product.features,
      priceCents: product.priceCents,
      currency: product.currency,
      cycle: product.cycle,
      memoryMb: product.memoryMb,
      diskMb: product.diskMb,
      cpuPercent: product.cpuPercent,
      backupLimit: product.backupLimit,
      databaseLimit: product.databaseLimit,
      categoryName: category?.name,
      categoryColor: category?.color,
      categoryIcon: category?.icon,
      categoryLogoUrl: category?.logoUrl,
    };
    addItem(payload);
    setAddedId(product.id);
    window.setTimeout(() => setAddedId((id) => (id === product.id ? null : id)), 1600);
  }

  if (loading) {
    return (
      <div className="client-gh-plans">
        <div className="client-gh-plans__loading">Loading plans…</div>
        <div className="client-gh-plans__grid">
          {[0, 1, 2].map((item) => (
            <div className="client-gh-plan-skeleton" key={item} />
          ))}
        </div>
      </div>
    );
  }

  if (!category) {
    return (
      <div className="client-gh-plans">
        <Link to="/game-hosting" className="client-gh-plans__back">
          <ArrowLeft size={14} /> All games
        </Link>
        <div className="ds-alert ds-alert--error">Category not found.</div>
      </div>
    );
  }

  const accent = category.color || 'var(--accent)';
  const lowest = products.reduce<Product | null>(
    (best, product) => (!best || product.priceCents < best.priceCents ? product : best),
    null,
  );

  return (
    <div
      className={`client-gh-plans${count > 0 ? ' has-dock' : ''}`}
      style={{ ['--gh-color' as string]: accent }}
    >
      <Link to="/game-hosting" className="client-gh-plans__back">
        <ArrowLeft size={14} /> All games
      </Link>

      <header className="client-gh-plans__intro">
        <div className="client-gh-plans__intro-main">
          <span className="client-gh-plans__mark" aria-hidden>
            <CategoryMark
              icon={category.icon}
              logoUrl={category.logoUrl}
              color={category.color}
              size={36}
            />
          </span>
          <div className="client-gh-plans__intro-copy">
            <p>Game server hosting</p>
            <h1>{category.name}</h1>
            <span>
              {category.description ||
                `High-performance ${category.name} servers with Spirit-Panel, protection, and instant setup.`}
            </span>
          </div>
        </div>
        <div className="client-gh-plans__intro-actions">
          <Link className="client-home__btn client-home__btn--ghost client-home__btn--cta" to="/cart">
            <span className="client-home__btn-icon" aria-hidden>
              <ShoppingCart size={15} />
            </span>
            <span>Cart{count > 0 ? ` (${count})` : ''}</span>
          </Link>
        </div>
      </header>

      <div className="client-gh-plans__pulse" aria-label="Plan snapshot">
        <div className="client-gh-plans__pulse-item">
          <span className="client-gh-plans__pulse-copy">
            <small>Plans</small>
            <strong>{products.length}</strong>
            <span>Ready to launch</span>
          </span>
          <span className="client-gh-plans__pulse-icon" aria-hidden>
            <Layers3 size={17} />
          </span>
        </div>
        <div className="client-gh-plans__pulse-item">
          <span className="client-gh-plans__pulse-copy">
            <small>From</small>
            <strong>
              {lowest ? money(lowest.priceCents, lowest.currency) : '—'}
            </strong>
            <span>{lowest ? `/${cycleShort(lowest.cycle)}` : 'No plans yet'}</span>
          </span>
          <span className="client-gh-plans__pulse-icon is-price" aria-hidden>
            <Sparkles size={17} />
          </span>
        </div>
        <div className="client-gh-plans__pulse-item">
          <span className="client-gh-plans__pulse-copy">
            <small>Deploy</small>
            <strong>Instant</strong>
            <span>After payment clears</span>
          </span>
          <span className="client-gh-plans__pulse-icon is-deploy" aria-hidden>
            <Zap size={17} />
          </span>
        </div>
        <div className="client-gh-plans__pulse-item">
          <span className="client-gh-plans__pulse-copy">
            <small>Includes</small>
            <strong>Panel + DDoS</strong>
            <span>Standard on every plan</span>
          </span>
          <span className="client-gh-plans__pulse-icon is-secure" aria-hidden>
            <ShieldCheck size={17} />
          </span>
        </div>
      </div>

      <section className="client-gh-plans__section">
        <div className="client-gh-plans__section-head">
          <div>
            <p>Configurations</p>
            <h2>Pick the power that fits</h2>
            <span>Every plan includes Spirit-Panel access, protection, and automatic provisioning.</span>
          </div>
        </div>

        <div
          className={`client-gh-plans__grid${
            products.length === 1 ? ' is-solo' : products.length === 2 ? ' is-duo' : ''
          }`}
        >
          {products.map((product, index) => {
            const featured =
              products.length >= 3
                ? index === Math.floor(products.length / 2)
                : index === products.length - 1 && products.length > 1;
            const tier = index === 0 ? 'Starter' : featured ? 'Popular' : 'Performance';
            const features = product.features?.length ? product.features : DEFAULT_PLAN_FEATURES;
            return (
              <article
                key={product.id}
                className={`client-gh-plan${featured ? ' is-featured' : ''}`}
                style={{ animationDelay: `${index * 55}ms` }}
              >
                {featured ? (
                  <div className="client-gh-plan__badge">
                    <Sparkles size={12} /> Most popular
                  </div>
                ) : null}
                <header className="client-gh-plan__head">
                  <span>{tier}</span>
                  <h3>{product.name}</h3>
                  <p>
                    {product.description ||
                      `A solid ${category.name} setup for friends, communities, and events.`}
                  </p>
                </header>

                <div className="client-gh-plan__price">
                  <strong>{money(product.priceCents, product.currency)}</strong>
                  <span>/{cycleShort(product.cycle)}</span>
                  <small>{cyclePhrase(product.cycle)}</small>
                </div>

                <div className="client-gh-plan__ram">
                  <MemoryStick size={18} aria-hidden />
                  <div>
                    <strong>{formatResource(product.memoryMb)}</strong>
                    <small>Memory</small>
                  </div>
                </div>

                <ul className="client-gh-plan__specs">
                  <li>
                    <Cpu size={14} aria-hidden />
                    <span>CPU</span>
                    <strong>
                      {product.cpuPercent <= 0 ? 'Unlimited' : `${product.cpuPercent}%`}
                    </strong>
                  </li>
                  <li>
                    <HardDrive size={14} aria-hidden />
                    <span>Storage</span>
                    <strong>{formatResource(product.diskMb)}</strong>
                  </li>
                  <li>
                    <Archive size={14} aria-hidden />
                    <span>Backups</span>
                    <strong>{(product.backupLimit ?? 0) > 0 ? product.backupLimit : '—'}</strong>
                  </li>
                  <li>
                    <Database size={14} aria-hidden />
                    <span>Databases</span>
                    <strong>
                      {(product.databaseLimit ?? 0) > 0 ? product.databaseLimit : '—'}
                    </strong>
                  </li>
                </ul>

                <PlanFeatures features={features} />

                <footer className="client-gh-plan__footer">
                  <button
                    type="button"
                    className={`client-home__btn ${
                      featured
                        ? 'client-home__btn--primary'
                        : 'client-home__btn--ghost'
                    } client-home__btn--cta`}
                    onClick={() => addToCart(product)}
                  >
                    {addedId === product.id ? (
                      <>
                        <Check size={15} />
                        Added to cart
                      </>
                    ) : (
                      <>
                        <ShoppingCart size={15} />
                        Choose plan
                      </>
                    )}
                  </button>
                </footer>
              </article>
            );
          })}

          {!products.length ? (
            <div className="client-gh__empty">
              <span aria-hidden>
                <PackageOpen size={22} />
              </span>
              <strong>Plans are being prepared</strong>
              <p>There are no purchasable {category.name} plans right now. Check back shortly.</p>
              <Link className="client-home__btn client-home__btn--ghost client-home__btn--sm" to="/game-hosting">
                <ArrowLeft size={13} /> Browse other games
              </Link>
            </div>
          ) : null}
        </div>
      </section>

      <section className="client-gh-plans__included">
        <article>
          <ShieldCheck size={18} aria-hidden />
          <div>
            <strong>Protected by default</strong>
            <p>Network protection is included on every server.</p>
          </div>
        </article>
        <article>
          <Zap size={18} aria-hidden />
          <div>
            <strong>Ready in moments</strong>
            <p>Paid orders provision straight into Spirit-Panel.</p>
          </div>
        </article>
        <article>
          <Headphones size={18} aria-hidden />
          <div>
            <strong>Support that listens</strong>
            <p>Talk to people who actually run game servers.</p>
          </div>
        </article>
      </section>

      <CartDock count={count} />
    </div>
  );
}
