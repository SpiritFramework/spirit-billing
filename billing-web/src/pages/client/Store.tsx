import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
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
import { useBranding } from '../../context/BrandingContext';
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
        onClick={() => setOpen((value) => !value)}
      >
        <span>
          <ListChecks size={14} aria-hidden />
          <strong>What&apos;s included</strong>
        </span>
        <em>
          {items.length}
          <ChevronDown size={15} aria-hidden className={open ? 'is-open' : undefined} />
        </em>
      </button>
      {open ? (
        <ul className="client-gh-plan__features-list" aria-label="Plan features">
          {items.map((feature, index) => {
            const Icon = featureIcon(feature);
            return (
              <li key={`${index}-${feature}`}>
                <span aria-hidden>
                  <Icon size={13} />
                </span>
                <span>{feature}</span>
              </li>
            );
          })}
        </ul>
      ) : null}
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
  const branding = useBranding();
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
  const featured = useMemo(
    () =>
      [...categories]
        .sort((a, b) => (b._count?.products ?? 0) - (a._count?.products ?? 0))
        .slice(0, Math.min(3, categories.length)),
    [categories],
  );
  const heroGames = featured.slice(0, 3);
  const brand = branding.companyName || 'SpiritHost';
  const gridMode =
    filtered.length === 1 ? 'is-solo' : filtered.length === 2 ? 'is-duo' : 'is-multi';
  const showSearch = categories.length > 1 || Boolean(query.trim());

  return (
    <div className={`client-gh${count > 0 ? ' has-dock' : ''}`}>
      <section className="client-gh__hero">
        <div className="client-gh__hero-stage" aria-hidden>
          <span className="client-gh__hero-orb is-a" />
          <span className="client-gh__hero-orb is-b" />
          <span className="client-gh__hero-grid" />
          {heroGames.length > 0 ? (
            <div className={`client-gh__hero-games is-${heroGames.length}`}>
              {heroGames.map((category, index) => (
                <span
                  key={category.id}
                  className={`client-gh__hero-game is-${index + 1}`}
                  style={{ ['--gh-color' as string]: category.color || 'var(--accent)' }}
                >
                  <CategoryMark
                    icon={category.icon}
                    logoUrl={category.logoUrl}
                    color={category.color}
                    size={index === 0 ? 64 : 48}
                  />
                </span>
              ))}
            </div>
          ) : (
            <div className="client-gh__hero-mark">
              <Gamepad2 size={54} strokeWidth={1.5} />
            </div>
          )}
        </div>
        <div className="client-gh__hero-copy">
          <p>{brand}</p>
          <h1>Game Hosting</h1>
          <span>
            Pick a game, choose your power, and launch a server built for the community you run.
          </span>
          <div className="client-gh__hero-actions">
            {categories.length === 1 ? (
              <Link
                className="client-home__btn client-home__btn--primary client-home__btn--cta"
                to={`/game-hosting/${categories[0].slug || categories[0].id}`}
              >
                <span className="client-home__btn-icon" aria-hidden>
                  <Gamepad2 size={15} />
                </span>
                <span>View {categories[0].name} plans</span>
                <ArrowRight size={14} className="client-home__btn-arrow" />
              </Link>
            ) : (
              <a className="client-home__btn client-home__btn--primary client-home__btn--cta" href="#games">
                <span className="client-home__btn-icon" aria-hidden>
                  <Gamepad2 size={15} />
                </span>
                <span>Browse games</span>
                <ArrowRight size={14} className="client-home__btn-arrow" />
              </a>
            )}
            <Link className="client-home__btn client-home__btn--ghost client-home__btn--cta" to="/cart">
              <span className="client-home__btn-icon" aria-hidden>
                <ShoppingCart size={15} />
              </span>
              <span>View cart{count > 0 ? ` (${count})` : ''}</span>
            </Link>
          </div>
        </div>
      </section>

      <div className="client-gh__trust" aria-label="Why SpiritHost hosting">
        <div>
          <Zap size={16} aria-hidden />
          <div>
            <strong>Instant deploy</strong>
            <small>Online minutes after payment</small>
          </div>
        </div>
        <div>
          <ShieldCheck size={16} aria-hidden />
          <div>
            <strong>DDoS covered</strong>
            <small>Protection included</small>
          </div>
        </div>
        <div>
          <Layers3 size={16} aria-hidden />
          <div>
            <strong>Spirit-Panel</strong>
            <small>Full control out of the box</small>
          </div>
        </div>
        <div>
          <Headphones size={16} aria-hidden />
          <div>
            <strong>Real support</strong>
            <small>People who know game servers</small>
          </div>
        </div>
      </div>

      {!loading && featured.length > 2 && !query.trim() ? (
        <section className="client-gh__featured">
          <div className="client-gh__section-head">
            <div>
              <p>Start here</p>
              <h2>Popular games</h2>
            </div>
          </div>
          <div className="client-gh__featured-rail">
            {featured.map((category) => (
              <Link
                key={category.id}
                to={`/game-hosting/${category.slug || category.id}`}
                className="client-gh__featured-card"
                style={{ ['--gh-color' as string]: category.color || 'var(--accent)' }}
              >
                <CategoryMark
                  icon={category.icon}
                  logoUrl={category.logoUrl}
                  color={category.color}
                  size={52}
                />
                <div>
                  <strong>{category.name}</strong>
                  <small>
                    {category._count?.products ?? 0} plan
                    {(category._count?.products ?? 0) === 1 ? '' : 's'}
                  </small>
                </div>
                <span aria-hidden>
                  <ArrowRight size={16} />
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="client-gh__catalog" id="games">
        <div className="client-gh__catalog-head">
          <div>
            <p>Catalog</p>
            <h2>{filtered.length === 1 ? 'Your game' : 'Choose your game'}</h2>
            <span>
              {loading
                ? 'Loading games…'
                : query.trim()
                  ? `${filtered.length} match${filtered.length === 1 ? '' : 'es'}`
                  : `${categories.length} game${categories.length === 1 ? '' : 's'} · ${totalPlans} plan${totalPlans === 1 ? '' : 's'}`}
            </span>
          </div>
          {showSearch ? (
            <label className="client-gh__search">
              <Search size={15} aria-hidden />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search Minecraft, Rust, FiveM…"
                aria-label="Search games"
              />
            </label>
          ) : null}
        </div>

        {loading ? (
          <div className="client-gh__game-grid is-multi">
            {[0, 1, 2].map((item) => (
              <div className="client-gh__game-skeleton" key={item} />
            ))}
          </div>
        ) : (
          <div className={`client-gh__game-grid ${gridMode}`}>
            {filtered.map((category, index) => {
              const planCount = category._count?.products ?? 0;
              const solo = filtered.length === 1;
              const from = category.startingFrom;
              return (
                <Link
                  key={category.id}
                  to={`/game-hosting/${category.slug || category.id}`}
                  className={`client-gh__game${solo ? ' is-spotlight' : ''}`}
                  style={{
                    ['--gh-color' as string]: category.color || 'var(--accent)',
                    animationDelay: `${Math.min(index, 8) * 45}ms`,
                  }}
                >
                  <span className="client-gh__game-glow" aria-hidden />
                  <span className="client-gh__game-shine" aria-hidden />
                  <div className="client-gh__game-art">
                    <span className="client-gh__game-index" aria-hidden>
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="client-gh__game-plate">
                      <CategoryMark
                        icon={category.icon}
                        logoUrl={category.logoUrl}
                        color={category.color}
                        size={solo ? 92 : 78}
                        className="client-gh__game-mark"
                      />
                    </span>
                    <em className="client-gh__game-plans">
                      {planCount} plan{planCount === 1 ? '' : 's'}
                    </em>
                  </div>
                  <div className="client-gh__game-body">
                    <h3>{category.name}</h3>
                    <p>
                      {category.description ||
                        `High-performance ${category.name} hosting with Spirit-Panel access.`}
                    </p>
                    <div className="client-gh__game-foot">
                      {from ? (
                        <span className="client-gh__game-price">
                          <small>From</small>
                          <strong>
                            {money(from.priceCents, from.currency)}
                            <em>/{cycleShort(from.cycle)}</em>
                          </strong>
                        </span>
                      ) : (
                        <span className="client-gh__game-price">
                          <small>Plans</small>
                          <strong>Coming soon</strong>
                        </span>
                      )}
                      <span className="client-gh__game-cta">
                        {solo ? 'Choose a plan' : 'View plans'}
                        <ArrowRight size={14} />
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}

            {!filtered.length ? (
              <div className="client-gh__empty">
                <span aria-hidden>
                  <PackageOpen size={22} />
                </span>
                <strong>{categories.length ? 'No games match your search' : 'No games available yet'}</strong>
                <p>
                  {categories.length
                    ? 'Try another game name or clear your search.'
                    : 'Hosting categories will appear here once configured.'}
                </p>
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
            ) : null}
          </div>
        )}
      </section>

      <section className="client-gh__path">
        <div className="client-gh__section-head">
          <div>
            <p>How it works</p>
            <h2>Online in three steps</h2>
          </div>
        </div>
        <div className="client-gh__path-grid">
          <article>
            <span>01</span>
            <Gamepad2 size={20} aria-hidden />
            <h3>Choose a game</h3>
            <p>Browse hosting tuned for the title your community actually plays.</p>
          </article>
          <article>
            <span>02</span>
            <MemoryStick size={20} aria-hidden />
            <h3>Pick your power</h3>
            <p>Match RAM, CPU, and storage to your player count and mods.</p>
          </article>
          <article>
            <span>03</span>
            <Rocket size={20} aria-hidden />
            <h3>Launch & manage</h3>
            <p>Pay once, provision automatically, and run everything in Spirit-Panel.</p>
          </article>
        </div>
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
