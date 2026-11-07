import { FormEvent, useState, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Gamepad2,
  LockKeyhole,
  Mail,
  ShieldCheck,
  User as UserIcon,
  UserPlus,
  Wrench,
} from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useAuth, type User } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import { TurnstileWidget } from '../components/TurnstileWidget';
import { isStaffOrAdmin } from '../lib/roles';

function safeNextPath(raw: string | null) {
  if (!raw) return null;
  if (!raw.startsWith('/') || raw.startsWith('//')) return null;
  return raw;
}

function AuthBrand({ compact = false }: { compact?: boolean }) {
  const branding = useBranding();
  return (
    <Link to="/" className={`auth-v3-brand${compact ? ' is-compact' : ''}`}>
      {branding.logoUrl && /^https?:\/\//i.test(branding.logoUrl) ? (
        <img src={branding.logoUrl} alt="" />
      ) : (
        <span aria-hidden>
          <Gamepad2 size={18} />
        </span>
      )}
      <div>
        <strong>{branding.companyName}</strong>
        {!compact && <small>{branding.tagline || 'Game server hosting'}</small>}
      </div>
    </Link>
  );
}

function AuthVisual({ mode }: { mode: 'login' | 'register' }) {
  const branding = useBranding();
  const company = branding.companyName || 'Spirit Billing';

  return (
    <aside className={`auth-v3-visual is-${mode}`}>
      <div className="auth-v3-visual__atmosphere" aria-hidden>
        <div className="auth-v3-visual__orb auth-v3-visual__orb--a" />
        <div className="auth-v3-visual__orb auth-v3-visual__orb--b" />
        <div className="auth-v3-visual__mesh" />
        <div className="auth-v3-visual__scan" />
      </div>

      <div className="auth-v3-visual__content">
        <AuthBrand />
        <p className="auth-v3-visual__eyebrow">
          {mode === 'login' ? 'Client area' : 'New account'}
        </p>
        <h2>
          {mode === 'login' ? (
            <>
              Welcome back
              <span> to {company}.</span>
            </>
          ) : (
            <>
              Join {company}
              <span> and start hosting.</span>
            </>
          )}
        </h2>
        <p className="auth-v3-visual__lede">
          {mode === 'login'
            ? 'Manage invoices, services, and every game server linked to your account.'
            : 'One account for billing and Spirit-Panel — order, pay, and provision from here.'}
        </p>

        <ul className="auth-v3-visual__points">
          <li>
            <ShieldCheck size={16} aria-hidden />
            <span>Secure sessions &amp; account controls</span>
          </li>
          <li>
            <Gamepad2 size={16} aria-hidden />
            <span>Billing connected to Spirit-Panel</span>
          </li>
        </ul>
      </div>

      <p className="auth-v3-visual__footer">Spirit-Billing · SpiritFramework</p>
    </aside>
  );
}

function AuthShell({ mode, children }: { mode: 'login' | 'register'; children: ReactNode }) {
  const branding = useBranding();
  const supportHref = branding.supportUrl && /^https?:\/\//i.test(branding.supportUrl)
    ? branding.supportUrl
    : branding.supportEmail
      ? `mailto:${branding.supportEmail}`
      : undefined;
  const termsHref = branding.termsUrl && /^https?:\/\//i.test(branding.termsUrl) ? branding.termsUrl : undefined;
  const privacyHref = branding.privacyUrl && /^https?:\/\//i.test(branding.privacyUrl) ? branding.privacyUrl : undefined;

  return (
    <main className="auth-v3">
      <div className="auth-v3__top">
        <AuthBrand compact />
        <Link to="/" className="auth-v3__back">
          <ArrowLeft size={14} />
          <span>Back to website</span>
        </Link>
      </div>
      <div className="auth-v3__layout">
        <AuthVisual mode={mode} />
        <section className="auth-v3-form-wrap">
          {children}
          {(supportHref || termsHref || privacyHref) && (
            <p className="auth-v3-legal">
              {supportHref && (
                <a href={supportHref} {...(supportHref.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                  Support
                </a>
              )}
              {termsHref && (
                <a href={termsHref} target="_blank" rel="noopener noreferrer">
                  Terms
                </a>
              )}
              {privacyHref && (
                <a href={privacyHref} target="_blank" rel="noopener noreferrer">
                  Privacy
                </a>
              )}
            </p>
          )}
        </section>
      </div>
    </main>
  );
}

function AccessUnavailable({
  type,
  message,
}: {
  type: 'maintenance' | 'registration';
  message: string;
}) {
  const maintenance = type === 'maintenance';
  return (
    <AuthShell mode="register">
      <div className="auth-v3-status">
        <span className={maintenance ? 'is-maintenance' : 'is-closed'}>
          {maintenance ? <Wrench size={26} /> : <UserPlus size={26} />}
        </span>
        <small>{maintenance ? 'Scheduled maintenance' : 'Registration unavailable'}</small>
        <h1>{maintenance ? 'We’ll be back shortly.' : 'Signups are currently closed.'}</h1>
        <p>{message}</p>
        <div className="auth-v3-status__info">
          <ShieldCheck size={16} />
          <span>
            <strong>{maintenance ? 'Administrator access remains available' : 'Already have an account?'}</strong>
            <small>
              {maintenance
                ? 'Admins can sign in while client access is paused.'
                : 'Existing customers can continue to sign in normally.'}
            </small>
          </span>
        </div>
        <Link className="auth-v3-submit" to="/login">
          Sign in <ArrowRight size={16} />
        </Link>
        <Link className="auth-v3-status__home" to="/">
          Return to homepage
        </Link>
      </div>
    </AuthShell>
  );
}

export function LoginPage() {
  const { user, setUser, setPanelWebUrl, refresh } = useAuth();
  const branding = useBranding();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const nextPath = safeNextPath(searchParams.get('next'));
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (user) {
    return <Navigate to={nextPath || (isStaffOrAdmin(user.role) ? '/admin' : '/dashboard')} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (branding.turnstileEnabled && !turnstileToken) {
      setError('Please complete the security check.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await api<{ user: User; panelWebUrl?: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          identifier,
          password,
          ...(turnstileToken ? { turnstileToken } : {}),
        }),
      });
      setUser(data.user);
      if (data.panelWebUrl) setPanelWebUrl(data.panelWebUrl);
      else await refresh();
      navigate(nextPath || (isStaffOrAdmin(data.user.role) ? '/admin' : '/dashboard'));
    } catch (err) {
      setTurnstileToken('');
      setError(err instanceof ApiError ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell mode="login">
      <form className="auth-v3-card" onSubmit={onSubmit} noValidate>
        <header className="auth-v3-card__head">
          <p className="auth-v3-card__brand-mobile">
            <AuthBrand compact />
          </p>
          <small>Secure sign in</small>
          <h1>Sign in</h1>
          <p>
            Enter your {branding.companyName} account details to open the client area
            {nextPath ? ' and continue where you left off' : ''}.
          </p>
        </header>

        {branding.maintenanceMode && (
          <div className="auth-v3-notice is-maintenance">
            <Wrench size={16} />
            <span>
              <strong>Maintenance mode is active</strong>
              <small>{branding.maintenanceMessage || 'Only administrators can sign in right now.'}</small>
            </span>
          </div>
        )}

        {error && (
          <div className="auth-v3-error" role="alert">
            {error}
          </div>
        )}

        <label className="auth-v3-field">
          <span>Email or username</span>
          <div>
            <Mail size={16} aria-hidden />
            <input
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              autoComplete="username"
              placeholder="you@example.com"
              required
              autoFocus
            />
          </div>
        </label>

        <label className="auth-v3-field">
          <span>Password</span>
          <div>
            <LockKeyhole size={16} aria-hidden />
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="Your password"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </label>

        {branding.turnstileEnabled && branding.turnstileSiteKey ? (
          <TurnstileWidget siteKey={branding.turnstileSiteKey} onToken={setTurnstileToken} className="auth-v3-turnstile" />
        ) : null}

        <button className="auth-v3-submit" disabled={loading} type="submit">
          {loading ? (
            <>
              <i /> Signing in…
            </>
          ) : (
            <>
              Sign in <ArrowRight size={16} />
            </>
          )}
        </button>

        {branding.registrationEnabled !== false && (
          <p className="auth-v3-switch">
            New to {branding.companyName}?{' '}
            <Link to={`/register${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ''}`}>
              Create an account <ArrowRight size={13} />
            </Link>
          </p>
        )}
      </form>
    </AuthShell>
  );
}

export function RegisterPage() {
  const { user, setUser, setPanelWebUrl, refresh } = useAuth();
  const branding = useBranding();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const nextPath = safeNextPath(searchParams.get('next'));
  const nextQuery = nextPath ? `?next=${encodeURIComponent(nextPath)}` : '';
  const [form, setForm] = useState({
    email: '',
    username: '',
    firstName: '',
    lastName: '',
    password: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to={nextPath || '/dashboard'} replace />;

  if (branding.maintenanceMode) {
    return (
      <AccessUnavailable
        type="maintenance"
        message={branding.maintenanceMessage || 'Billing is under maintenance. New accounts cannot be created right now.'}
      />
    );
  }

  if (branding.registrationEnabled === false) {
    return (
      <AccessUnavailable
        type="registration"
        message="New account registration is currently disabled. If you need an account, contact the hosting team."
      />
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!/^[a-zA-Z0-9_-]{3,32}$/.test(form.username)) {
      setError('Username must be 3–32 characters (letters, numbers, _ or -).');
      return;
    }
    if (form.password.length < 16 || !/[A-Za-z]/.test(form.password) || !/[0-9]/.test(form.password)) {
      setError('Password must be at least 16 characters and include a letter and a number.');
      return;
    }
    if (branding.turnstileEnabled && !turnstileToken) {
      setError('Please complete the security check.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await api<{ user: User; panelWebUrl?: string }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          ...(turnstileToken ? { turnstileToken } : {}),
        }),
      });
      setUser(data.user);
      if (data.panelWebUrl) setPanelWebUrl(data.panelWebUrl);
      else await refresh();
      navigate(nextPath || '/dashboard');
    } catch (err) {
      setTurnstileToken('');
      setError(err instanceof ApiError ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell mode="register">
      <form className="auth-v3-card is-register" onSubmit={onSubmit} noValidate>
        <header className="auth-v3-card__head">
          <p className="auth-v3-card__brand-mobile">
            <AuthBrand compact />
          </p>
          <small>Create your account</small>
          <h1>Start hosting</h1>
          <p>One account for billing and Spirit-Panel access.</p>
        </header>

        {error && (
          <div className="auth-v3-error" role="alert">
            {error}
          </div>
        )}

        <div className="auth-v3-field-grid">
          <label className="auth-v3-field">
            <span>First name</span>
            <div>
              <UserIcon size={16} aria-hidden />
              <input
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                placeholder="First name"
                required
              />
            </div>
          </label>
          <label className="auth-v3-field">
            <span>Last name</span>
            <div>
              <UserIcon size={16} aria-hidden />
              <input
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                placeholder="Last name"
                required
              />
            </div>
          </label>
        </div>

        <label className="auth-v3-field">
          <span>Email address</span>
          <div>
            <Mail size={16} aria-hidden />
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="you@example.com"
              required
            />
          </div>
        </label>

        <label className="auth-v3-field">
          <span>Username</span>
          <div>
            <UserIcon size={16} aria-hidden />
            <input
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              placeholder="Choose a username"
              required
              minLength={3}
              maxLength={32}
              pattern="[A-Za-z0-9_-]+"
              title="3–32 characters: letters, numbers, underscore, or hyphen"
            />
          </div>
        </label>

        <label className="auth-v3-field">
          <span>Password</span>
          <div>
            <LockKeyhole size={16} aria-hidden />
            <input
              type={showPassword ? 'text' : 'password'}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="Minimum 16 characters"
              required
              minLength={16}
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <small className="auth-v3-field__hint">
            <CheckCircle2 size={12} /> Use at least 16 characters with a letter and number.
          </small>
        </label>

        {branding.turnstileEnabled && branding.turnstileSiteKey ? (
          <TurnstileWidget siteKey={branding.turnstileSiteKey} onToken={setTurnstileToken} className="auth-v3-turnstile" />
        ) : null}

        <button className="auth-v3-submit" disabled={loading} type="submit">
          {loading ? (
            <>
              <i /> Creating account…
            </>
          ) : (
            <>
              Create account <ArrowRight size={16} />
            </>
          )}
        </button>

        <p className="auth-v3-terms">
          By creating an account, your details are also used to create your Spirit-Panel account.
        </p>
        <p className="auth-v3-switch">
          Already registered?{' '}
          <Link to={`/login${nextQuery}`}>
            Sign in <ArrowRight size={13} />
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
