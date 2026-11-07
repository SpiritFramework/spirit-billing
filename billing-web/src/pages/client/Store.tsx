import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
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
    <div
      className={`hosting-plan__features ${open ? 'is-open' : ''}`}
      ref={rootRef}
    >
      <button
        type="button"
        className="hosting-plan__features-trigger"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="hosting-plan__features-trigger-main">
          <ListChecks size={15} aria-hidden />
          <span>
            <strong>What’s included</strong>
            <small>
              {open ? 'Hide details' : `${items.length} feature${items.length === 1 ? '' : 's'}`}
            </small>
          </span>
        </span>
        <span className="hosting-plan__features-trigger-meta">
          <em>{items.length}</em>
          <ChevronDown size={16} aria-hidden className={open ? 'is-open' : undefined} />
        </span>
      </button>

      {open && (
        <div className="hosting-plan__features-panel" role="region" aria-label="Plan features">
          <ul>
            {items.map((feature, index) => {
              const Icon = featureIcon(feature);
              return (
                <li key={`${index}-${feature}`}>
                  <span className="hosting-plan__feature-icon" aria-hidden>
                    <Icon size={13} />
                  </span>
                  <span>{feature}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
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

function formatRamValue(mb: number) {
  return formatResource(mb);
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

  return (
    <div className="hosting-v2">
      <section className="hosting-hero">
        <div className="hosting-hero__glow" />
        <div className="hosting-hero__content">
          <span className="hosting-kicker"><Sparkles size={14} /> Premium game servers</span>
          <h1>Built for the games<br />you <em>actually play.</em></h1>
          <p>
            High-performance hosting, instant deployment, and a powerful game panel—without the complexity.
          </p>
          <div className="hosting-hero__actions">
            <a className="ds-btn ds-btn--primary" href="#games">
              Explore games <ArrowRight size={15} />
            </a>
            <Link className="ds-btn ds-btn--ghost" to="/cart">
              <ShoppingCart size={15} /> View cart {count > 0 && <span>({count})</span>}
            </Link>
          </div>
        </div>
        <div className="hosting-hero__visual" aria-hidden>
          <div className="hosting-orbit hosting-orbit--one" />
          <div className="hosting-orbit hosting-orbit--two" />
          <div className="hosting-hero__core"><Gamepad2 size={42} /></div>
          <span className="hosting-float hosting-float--one"><Zap size={17} /> Low latency</span>
          <span className="hosting-float hosting-float--two"><ShieldCheck size={17} /> Protected</span>
          <span className="hosting-float hosting-float--three"><Globe2 size={17} /> Always online</span>
        </div>
      </section>

      <section className="hosting-trust">
        <div><Zap size={18} /><span><strong>Instant deployment</strong><small>Your server, ready in moments</small></span></div>
        <div><ShieldCheck size={18} /><span><strong>DDoS protection</strong><small>Protection included as standard</small></span></div>
        <div><Headphones size={18} /><span><strong>Real support</strong><small>Help when you need it</small></span></div>
        <div><Layers3 size={18} /><span><strong>{totalPlans} plans</strong><small>Built around every play style</small></span></div>
      </section>

      <section className="hosting-catalog" id="games">
        <header className="hosting-section-header">
          <div>
            <span>Find your game</span>
            <h2>Choose what you want to host</h2>
            <p>Pick a game to see available configurations and pricing.</p>
          </div>
          <label className="hosting-search">
            <Search size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search games…"
              aria-label="Search games"
            />
          </label>
        </header>

        {loading ? (
          <div className="hosting-category-grid">
            {[0, 1, 2].map((item) => <div className="hosting-category-skeleton" key={item} />)}
          </div>
        ) : (
          <div className="hosting-category-grid">
            {filtered.map((category, index) => (
              <Link
                key={category.id}
                to={`/game-hosting/${category.slug || category.id}`}
                className="hosting-category"
                style={{ ['--hosting-color' as string]: category.color || '#6366f1' }}
              >
                <div className="hosting-category__art">
                  <span className="hosting-category__number">{String(index + 1).padStart(2, '0')}</span>
                  <CategoryMark
                    icon={category.icon}
                    logoUrl={category.logoUrl}
                    color={category.color}
                    size={68}
                    className="hosting-category__mark"
                  />
                  <div className="hosting-category__rings" />
                </div>
                <div className="hosting-category__body">
                  <div>
                    <span className="hosting-category__plans">
                      {category._count?.products ?? 0} plan{category._count?.products === 1 ? '' : 's'}
                    </span>
                    <h3>{category.name}</h3>
                    <p>{category.description || `Reliable ${category.name} hosting, built to perform.`}</p>
                  </div>
                  <span className="hosting-category__link">
                    View hosting plans <ChevronRight size={16} />
                  </span>
                </div>
              </Link>
            ))}

            {!filtered.length && (
              <div className="hosting-empty">
                <PackageOpen size={30} />
                <h3>{categories.length ? 'No games match your search' : 'No games available yet'}</h3>
                <p>
                  {categories.length
                    ? 'Try another game name or clear your search.'
                    : 'Hosting categories will appear here once configured.'}
                </p>
                {query && <button type="button" onClick={() => setQuery('')}>Clear search</button>}
              </div>
            )}
          </div>
        )}
      </section>

      <section className="hosting-steps">
        <header className="hosting-section-header">
          <div><span>Simple by design</span><h2>Online in three steps</h2></div>
        </header>
        <div className="hosting-steps__grid">
          <article><span>01</span><Gamepad2 size={21} /><h3>Choose a game</h3><p>Browse hosting built specifically for your game and community.</p></article>
          <article><span>02</span><Layers3 size={21} /><h3>Pick your power</h3><p>Select the RAM, storage, and CPU configuration that fits.</p></article>
          <article><span>03</span><Zap size={21} /><h3>Launch your server</h3><p>Complete payment and manage everything from Spirit-Panel.</p></article>
        </div>
      </section>
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
      <div className="hosting-plans-v2">
        <div className="hosting-plans-loading" />
        <div className="hosting-plan-grid">
          {[0, 1, 2].map((item) => <div className="hosting-plan-skeleton" key={item} />)}
        </div>
      </div>
    );
  }

  if (!category) {
    return (
      <div className="ds-stack">
        <div className="ds-alert ds-alert--error">Category not found.</div>
        <Link className="ds-btn ds-btn--ghost" to="/game-hosting">
          <ArrowLeft size={16} /> Back
        </Link>
      </div>
    );
  }

  const accent = category.color || '#6366f1';

  return (
    <div className="hosting-plans-v2" style={{ ['--hosting-color' as string]: accent }}>
      <section className="hosting-plans-hero">
        <div className="hosting-plans-hero__glow" />
        <div className="hosting-plans-hero__main">
          <Link to="/game-hosting" className="hosting-plans-back">
            <ArrowLeft size={14} /> All games
          </Link>
          <div className="hosting-plans-hero__identity">
            <CategoryMark icon={category.icon} logoUrl={category.logoUrl} color={category.color} size={72} />
            <div>
              <span>Game server hosting</span>
              <h1>{category.name}</h1>
              <p>{category.description || `High-performance ${category.name} servers, ready when you are.`}</p>
            </div>
          </div>
        </div>
        <div className="hosting-plans-hero__side">
          <div><strong>{products.length}</strong><span>Available plans</span></div>
          <div><strong>Instant</strong><span>Deployment</span></div>
          <Link to="/cart"><ShoppingCart size={16} /> Cart {count > 0 && `(${count})`}</Link>
        </div>
      </section>

      <section className="hosting-plan-section">
        <header className="hosting-section-header">
          <div>
            <span>Choose your configuration</span>
            <h2>Power for every kind of server</h2>
            <p>Every plan includes panel access, protection, and instant setup.</p>
          </div>
        </header>

        <div className={`hosting-plan-grid ${products.length === 1 ? 'hosting-plan-grid--solo' : products.length === 2 ? 'hosting-plan-grid--duo' : ''}`}>
          {products.map((product, index) => {
            const featured = products.length >= 3
              ? index === Math.floor(products.length / 2)
              : index === products.length - 1 && products.length > 1;
            const tier = index === 0 ? 'Starter' : featured ? 'Popular' : 'Performance';
            const features = product.features?.length ? product.features : DEFAULT_PLAN_FEATURES;
            return (
              <article
                key={product.id}
                className={`hosting-plan ${featured ? 'hosting-plan--featured' : ''}`}
                style={{ animationDelay: `${index * 60}ms` }}
              >
                <div className="hosting-plan__rail" aria-hidden />
                {featured && (
                  <div className="hosting-plan__badge">
                    <Sparkles size={12} /> Most popular
                  </div>
                )}

                <div className="hosting-plan__body">
                  <header className="hosting-plan__header">
                    <span className="hosting-plan__tier">{tier}</span>
                    <h3>{product.name}</h3>
                    <p>{product.description || `A balanced ${category.name} server for your community.`}</p>
                  </header>

                  <div className="hosting-plan__price">
                    <div className="hosting-plan__price-row">
                      <strong>{money(product.priceCents, product.currency)}</strong>
                      <span>/{cycleShort(product.cycle)}</span>
                    </div>
                    <small>{cyclePhrase(product.cycle)}</small>
                  </div>

                  <div className="hosting-plan__highlight">
                    <MemoryStick size={18} aria-hidden />
                    <div>
                      <strong>{formatRamValue(product.memoryMb)}</strong>
                      <span>Memory</span>
                    </div>
                  </div>

                  <ul className="hosting-plan__specs">
                    <li>
                      <Cpu size={15} aria-hidden />
                      <span>CPU limit</span>
                      <strong>{product.cpuPercent <= 0 ? 'Unlimited' : `${product.cpuPercent}%`}</strong>
                    </li>
                    <li>
                      <HardDrive size={15} aria-hidden />
                      <span>Storage</span>
                      <strong>{formatResource(product.diskMb)}</strong>
                    </li>
                    <li>
                      <Archive size={15} aria-hidden />
                      <span>Backups</span>
                      <strong>{(product.backupLimit ?? 0) > 0 ? product.backupLimit : '—'}</strong>
                    </li>
                    <li>
                      <Database size={15} aria-hidden />
                      <span>Databases</span>
                      <strong>{(product.databaseLimit ?? 0) > 0 ? product.databaseLimit : '—'}</strong>
                    </li>
                  </ul>

                  <PlanFeatures features={features} />
                </div>

                <footer className="hosting-plan__footer">
                  <button
                    className={featured ? 'ds-btn ds-btn--primary' : 'ds-btn ds-btn--ghost'}
                    type="button"
                    onClick={() => addToCart(product)}
                  >
                    {addedId === product.id
                      ? <><Check size={16} /> Added to cart</>
                      : <><ShoppingCart size={16} /> Choose plan</>}
                  </button>
                </footer>
              </article>
            );
          })}
          {!products.length && (
            <div className="hosting-empty">
              <PackageOpen size={30} />
              <h3>Plans are being prepared</h3>
              <p>There are no purchasable {category.name} plans right now. Check back shortly.</p>
              <Link to="/game-hosting"><ArrowLeft size={14} /> Browse other games</Link>
            </div>
          )}
        </div>
      </section>

      <section className="hosting-included">
        <div>
          <span><ShieldCheck size={20} /></span>
          <div><strong>Protected by default</strong><p>Every server includes network protection at no extra cost.</p></div>
        </div>
        <div>
          <span><Zap size={20} /></span>
          <div><strong>Ready in moments</strong><p>Paid orders provision automatically into your panel account.</p></div>
        </div>
        <div>
          <span><Headphones size={20} /></span>
          <div><strong>Support that listens</strong><p>Get straightforward help from people who understand game servers.</p></div>
        </div>
      </section>

      {count > 0 && (
        <div className="hosting-cart-dock">
          <div>
            <span><ShoppingCart size={17} /></span>
            <p><strong>{count} item{count === 1 ? '' : 's'} in your cart</strong><small>Ready when you are.</small></p>
          </div>
          <Link className="ds-btn ds-btn--primary ds-btn--sm" to="/cart">
            Review cart <ArrowRight size={14} />
          </Link>
        </div>
      )}
    </div>
  );
}



