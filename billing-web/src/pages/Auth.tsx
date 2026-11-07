import { FormEvent, useState } from 'react';
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
  Server,
  ShieldCheck,
  Sparkles,
  User as UserIcon,
  UserPlus,
  Wrench,
  Zap,
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

function AuthBrand() {
  const branding = useBranding();
  return (
    <Link to="/" className="auth-v3-brand">
      {branding.logoUrl && /^https?:\/\//i.test(branding.logoUrl) ? (
        <img src={branding.logoUrl} alt="" />
      ) : (
        <span><Gamepad2 size={18} /></span>
      )}
      <div>
        <strong>{branding.companyName}</strong>
        <small>Game server hosting</small>
      </div>
    </Link>
  );
}

function AuthVisual({ mode }: { mode: 'login' | 'register' }) {
  return (
    <aside className={`auth-v3-visual is-${mode}`}>
      <div className="auth-v3-visual__grid" />
      <div className="auth-v3-visual__glow" />
      <div className="auth-v3-visual__content">
        <span className="auth-v3-visual__kicker"><Sparkles size={13} /> Powered by Spirit-Panel</span>
        <h2>{mode === 'login' ? 'Your servers are waiting.' : 'A new world is only a few steps away.'}</h2>
        <p>
          {mode === 'login'
            ? 'Sign in to manage billing, services and every server connected to your account.'
            : 'Create one account for simple billing and powerful game server control.'}
        </p>
        <ul>
          <li><span><Server size={15} /></span><div><strong>Everything in one place</strong><small>Services, invoices and server access.</small></div></li>
          <li><span><Zap size={15} /></span><div><strong>Connected provisioning</strong><small>Billing and Spirit-Panel work together.</small></div></li>
          <li><span><ShieldCheck size={15} /></span><div><strong>Protected access</strong><small>Secure sessions and account controls.</small></div></li>
        </ul>
      </div>
      <div className="auth-v3-server-card" aria-hidden>
        <header>
          <span><Gamepad2 size={15} /></span>
          <div><strong>Community Server</strong><small>Spirit-Panel</small></div>
          <em><i /> Online</em>
        </header>
        <div>
          <span><small>CPU</small><strong>34%</strong><i><b style={{ width: '34%' }} /></i></span>
          <span><small>Memory</small><strong>4.2 GB</strong><i><b style={{ width: '58%' }} /></i></span>
        </div>
      </div>
      <p className="auth-v3-visual__footer">Secure billing · Complete server control</p>
    </aside>
  );
}

function AuthShell({ mode, children }: { mode: 'login' | 'register'; children: React.ReactNode }) {
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
        <AuthBrand />
        <Link to="/" className="auth-v3__back"><ArrowLeft size={14} /> Back to website</Link>
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
                <a href={termsHref} target="_blank" rel="noopener noreferrer">Terms</a>
              )}
              {privacyHref && (
                <a href={privacyHref} target="_blank" rel="noopener noreferrer">Privacy</a>
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
        <Link className="auth-v3-status__home" to="/">Return to homepage</Link>
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
      <form className="auth-v3-card" onSubmit={onSubmit}>
        <header className="auth-v3-card__head">
          <span><LockKeyhole size={16} /></span>
          <small>Secure account access</small>
          <h1>Welcome back.</h1>
          <p>Enter your details to open your client area.</p>
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

        {error && <div className="auth-v3-error">{error}</div>}

        <label className="auth-v3-field">
          <span>Email or username</span>
          <div>
            <Mail size={15} />
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
            <LockKeyhole size={15} />
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="Enter your password"
              required
            />
            <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
              {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </label>

        {branding.turnstileEnabled && branding.turnstileSiteKey ? (
          <TurnstileWidget siteKey={branding.turnstileSiteKey} onToken={setTurnstileToken} className="auth-v3-turnstile" />
        ) : null}

        <button className="auth-v3-submit" disabled={loading} type="submit">
          {loading ? <><i /> Signing in…</> : <>Sign in securely <ArrowRight size={16} /></>}
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
    return <AccessUnavailable type="maintenance" message={branding.maintenanceMessage || 'Billing is under maintenance. New accounts cannot be created right now.'} />;
  }

  if (branding.registrationEnabled === false) {
    return <AccessUnavailable type="registration" message="New account registration is currently disabled. If you need an account, contact the hosting team." />;
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
      <form className="auth-v3-card is-register" onSubmit={onSubmit}>
        <header className="auth-v3-card__head">
          <span><UserPlus size={16} /></span>
          <small>Create your account</small>
          <h1>Start hosting.</h1>
          <p>One account for billing and Spirit-Panel access.</p>
        </header>

        {error && <div className="auth-v3-error">{error}</div>}

        <div className="auth-v3-field-grid">
          <label className="auth-v3-field">
            <span>First name</span>
            <div>
              <UserIcon size={15} />
              <input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} placeholder="First name" required />
            </div>
          </label>
          <label className="auth-v3-field">
            <span>Last name</span>
            <div>
              <UserIcon size={15} />
              <input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} placeholder="Last name" required />
            </div>
          </label>
        </div>

        <label className="auth-v3-field">
          <span>Email address</span>
          <div>
            <Mail size={15} />
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" required />
          </div>
        </label>

        <label className="auth-v3-field">
          <span>Username</span>
          <div>
            <UserIcon size={15} />
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
            <LockKeyhole size={15} />
            <input
              type={showPassword ? 'text' : 'password'}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="Minimum 16 characters"
              required
              minLength={16}
            />
            <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
              {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          <small className="auth-v3-field__hint"><CheckCircle2 size={12} /> Use at least 16 characters with a letter and number.</small>
        </label>

        {branding.turnstileEnabled && branding.turnstileSiteKey ? (
          <TurnstileWidget siteKey={branding.turnstileSiteKey} onToken={setTurnstileToken} className="auth-v3-turnstile" />
        ) : null}

        <button className="auth-v3-submit" disabled={loading} type="submit">
          {loading ? <><i /> Creating account…</> : <>Create my account <ArrowRight size={16} /></>}
        </button>

        <p className="auth-v3-terms">
          By creating an account, your details are also used to create your Spirit-Panel account.
        </p>
        <p className="auth-v3-switch">
          Already registered? <Link to={`/login${nextQuery}`}>Sign in <ArrowRight size={13} /></Link>
        </p>
      </form>
    </AuthShell>
  );
}
