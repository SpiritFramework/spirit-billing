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
import { api, ApiError, isBrandAssetUrl } from '../lib/api';
import { useAuth, type User } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import { TurnstileWidget } from '../components/TurnstileWidget';
import { isStaffOrAdmin } from '../lib/roles';

function safeNextPath(raw: string | null) {
  if (!raw) return null;
  let value = raw.trim();
  try {
    value = decodeURIComponent(value);
  } catch {
    return null;
  }
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\') || /\s/.test(value)) {
    return null;
  }
  if (value.includes('://') || value.toLowerCase().includes('%2f%2f')) return null;
  return value;
}

function AuthShell({
  mode,
  children,
}: {
  mode: 'login' | 'register' | 'status';
  children: ReactNode;
}) {
  const branding = useBranding();
  const company = branding.companyName || 'Spirit Host';
  const supportHref = branding.supportUrl && /^https?:\/\//i.test(branding.supportUrl)
    ? branding.supportUrl
    : branding.supportEmail
      ? `mailto:${branding.supportEmail}`
      : undefined;
  const termsHref = branding.termsUrl && /^https?:\/\//i.test(branding.termsUrl) ? branding.termsUrl : undefined;
  const privacyHref = branding.privacyUrl && /^https?:\/\//i.test(branding.privacyUrl) ? branding.privacyUrl : undefined;

  const headline =
    mode === 'login'
      ? 'Sign in to your client area'
      : mode === 'register'
        ? 'Open your hosting account'
        : 'Client area';

  const lede =
    mode === 'login'
      ? 'Invoices, services, and panel-linked game servers in one place.'
      : mode === 'register'
        ? 'One account for billing and Spirit-Panel access.'
        : branding.tagline || 'Game server hosting';

  const authBg = branding.authAtmosphere || 'stage';

  return (
    <main className={`auth-stage is-${mode}`} data-auth-bg={authBg}>
      <div className="auth-stage__sky" aria-hidden>
        <div className="auth-stage__canvas" />
        <div className="auth-stage__wash" />
        <div className="auth-stage__grid" />
        <div className="auth-stage__haze" />
        <div className="auth-stage__horizon">
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="auth-stage__beam" />
        <div className="auth-stage__overlay" />
      </div>

      <header className="auth-stage__nav">
        <Link to="/" className="auth-stage__back">
          <ArrowLeft size={15} />
          Website
        </Link>
        {(supportHref || termsHref || privacyHref) && (
          <nav className="auth-stage__links" aria-label="Legal">
            {supportHref && (
              <a
                href={supportHref}
                {...(supportHref.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              >
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
          </nav>
        )}
      </header>

      <div className="auth-stage__frame">
        <section className="auth-stage__hero">
          <div className="auth-stage__mark">
            {isBrandAssetUrl(branding.logoUrl) ? (
              <img src={branding.logoUrl!} alt="" />
            ) : (
              <span aria-hidden>
                <Gamepad2 size={28} strokeWidth={1.6} />
              </span>
            )}
          </div>
          <p className="auth-stage__brand">
            <span>{company}</span>
            <sup aria-hidden>™</sup>
          </p>
          <h1>{headline}</h1>
          <p className="auth-stage__lede">{lede}</p>
        </section>

        <section className="auth-stage__panel">{children}</section>
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
    <AuthShell mode="status">
      <div className="auth-stage-status">
        <span className={maintenance ? 'is-maintenance' : 'is-closed'}>
          {maintenance ? <Wrench size={22} /> : <UserPlus size={22} />}
        </span>
        <h2>{maintenance ? 'We’ll be back shortly' : 'Signups are closed'}</h2>
        <p>{message}</p>
        <div className="auth-stage-status__note">
          <ShieldCheck size={15} />
          <span>
            {maintenance
              ? 'Administrators can still sign in while client access is paused.'
              : 'Existing customers can continue to sign in normally.'}
          </span>
        </div>
        <Link className="auth-stage-submit" to="/login">
          Sign in <ArrowRight size={16} />
        </Link>
        <Link className="auth-stage-home" to="/">
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
      <form className="auth-stage-form" onSubmit={onSubmit} noValidate>
        {branding.maintenanceMode && (
          <div className="auth-stage-notice">
            <Wrench size={15} />
            <span>
              <strong>Maintenance mode</strong>
              <small>{branding.maintenanceMessage || 'Only administrators can sign in right now.'}</small>
            </span>
          </div>
        )}

        {error && (
          <div className="auth-stage-error" role="alert">
            {error}
          </div>
        )}

        <label className="auth-stage-field">
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

        <label className="auth-stage-field">
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
          <TurnstileWidget siteKey={branding.turnstileSiteKey} onToken={setTurnstileToken} className="auth-stage-turnstile" />
        ) : null}

        <button className="auth-stage-submit" disabled={loading} type="submit">
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
          <p className="auth-stage-switch">
            New here?{' '}
            <Link to={`/register${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ''}`}>
              Create an account
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
      <form className="auth-stage-form is-register" onSubmit={onSubmit} noValidate>
        {error && (
          <div className="auth-stage-error" role="alert">
            {error}
          </div>
        )}

        <div className="auth-stage-field-grid">
          <label className="auth-stage-field">
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
          <label className="auth-stage-field">
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

        <label className="auth-stage-field">
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

        <label className="auth-stage-field">
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

        <label className="auth-stage-field">
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
          <small className="auth-stage-hint">
            <CheckCircle2 size={12} /> At least 16 characters with a letter and number.
          </small>
        </label>

        {branding.turnstileEnabled && branding.turnstileSiteKey ? (
          <TurnstileWidget siteKey={branding.turnstileSiteKey} onToken={setTurnstileToken} className="auth-stage-turnstile" />
        ) : null}

        <button className="auth-stage-submit" disabled={loading} type="submit">
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

        <p className="auth-stage-terms">
          Creating an account also sets up your Spirit-Panel login with the same details.
        </p>
        <p className="auth-stage-switch">
          Already registered? <Link to={`/login${nextQuery}`}>Sign in</Link>
        </p>
      </form>
    </AuthShell>
  );
}
