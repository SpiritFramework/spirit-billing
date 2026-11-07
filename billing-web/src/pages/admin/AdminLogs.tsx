import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  CircleAlert,
  Clock3,
  Copy,
  CreditCard,
  Cpu,
  Info,
  KeyRound,
  LifeBuoy,
  Network,
  RefreshCw,
  ScrollText,
  Search,
  Server,
  Shield,
  Terminal,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { ConfirmModal } from '../../components/ConfirmModal';

type LogLevel = 'info' | 'warn' | 'error';
type LogCategory = 'auth' | 'billing' | 'support' | 'provision' | 'admin' | 'panel' | 'system';
type LevelFilter = 'all' | LogLevel;
type CategoryFilter = 'all' | LogCategory;

type SystemLog = {
  id: string;
  level: LogLevel;
  category: LogCategory;
  action: string;
  message: string;
  method: string | null;
  path: string | null;
  statusCode: number | null;
  durationMs: number | null;
  ip: string | null;
  meta: unknown;
  createdAt: string;
  actor: { id: string; username: string; email: string; role: string } | null;
  target: { id: string; username: string; email: string } | null;
};

type LogsPayload = {
  logs: SystemLog[];
  counts: { info: number; warn: number; error: number; total: number };
  categories?: Record<LogCategory, number>;
};

const CATEGORY_META: Record<
  LogCategory,
  { label: string; hint: string; icon: typeof Shield }
> = {
  auth: { label: 'Auth', hint: 'Sign-in, register, logout', icon: KeyRound },
  billing: { label: 'Billing', hint: 'Orders, invoices, renewals', icon: CreditCard },
  support: { label: 'Support', hint: 'Tickets and replies', icon: LifeBuoy },
  provision: { label: 'Provision', hint: 'Server create / sync', icon: Cpu },
  admin: { label: 'Admin', hint: 'Staff tooling actions', icon: Shield },
  panel: { label: 'Panel', hint: 'Spirit-Panel API traffic', icon: Server },
  system: { label: 'System', hint: 'Unhandled API failures', icon: Terminal },
};

const CATEGORY_ORDER: LogCategory[] = [
  'auth',
  'billing',
  'support',
  'provision',
  'admin',
  'panel',
  'system',
];

function levelIcon(level: LogLevel) {
  if (level === 'error') return <CircleAlert size={14} />;
  if (level === 'warn') return <AlertTriangle size={14} />;
  return <Info size={14} />;
}

function formatRelative(value: string) {
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: '2-digit',
  });
}

function formatAbsolute(value: string) {
  return new Date(value).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function AdminLogs() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [counts, setCounts] = useState({ info: 0, warn: 0, error: 0, total: 0 });
  const [categories, setCategories] = useState<Record<LogCategory, number>>({
    auth: 0,
    billing: 0,
    support: 0,
    provision: 0,
    admin: 0,
    panel: 0,
    system: 0,
  });
  const [level, setLevel] = useState<LevelFilter>('all');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pruneOpen, setPruneOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const selectedId = searchParams.get('id');
  const selected = useMemo(
    () => logs.find((log) => log.id === selectedId) ?? null,
    [logs, selectedId],
  );

  function selectLog(log: SystemLog | null) {
    if (!log) {
      setSearchParams({}, { replace: true });
      return;
    }
    setSearchParams({ id: log.id }, { replace: true });
  }

  async function load(search = appliedQuery, nextLevel = level, nextCategory = category) {
    setError('');
    try {
      const params = new URLSearchParams({ take: '150' });
      if (nextLevel !== 'all') params.set('level', nextLevel);
      if (nextCategory !== 'all') params.set('category', nextCategory);
      if (search.trim()) params.set('q', search.trim());
      const data = await api<LogsPayload>(`/admin/logs?${params.toString()}`);
      setLogs(data.logs);
      setCounts(data.counts);
      if (data.categories) setCategories(data.categories);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load logs');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    void load(appliedQuery, level, category);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on filter/query apply only
  }, [level, category, appliedQuery]);

  async function prune() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await api<{ deleted: number }>('/admin/logs', {
        method: 'DELETE',
        body: JSON.stringify({ olderThanDays: 30 }),
      });
      setMessage(`Removed ${result.deleted} log${result.deleted === 1 ? '' : 's'} older than 30 days.`);
      setPruneOpen(false);
      setLoading(true);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not prune logs');
    } finally {
      setBusy(false);
    }
  }

  async function copySelected() {
    if (!selected) return;
    const payload = {
      id: selected.id,
      level: selected.level,
      category: selected.category,
      action: selected.action,
      message: selected.message,
      method: selected.method,
      path: selected.path,
      statusCode: selected.statusCode,
      durationMs: selected.durationMs,
      ip: selected.ip,
      createdAt: selected.createdAt,
      actor: selected.actor,
      target: selected.target,
      meta: selected.meta,
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError('Could not copy event to clipboard');
    }
  }

  const filtersActive = level !== 'all' || category !== 'all' || Boolean(appliedQuery.trim());

  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    if (level !== 'all') parts.push(level);
    if (category !== 'all') parts.push(CATEGORY_META[category].label);
    if (appliedQuery.trim()) parts.push(`“${appliedQuery.trim()}”`);
    return parts;
  }, [level, category, appliedQuery]);

  function clearFilters() {
    setLevel('all');
    setCategory('all');
    setQuery('');
    setAppliedQuery('');
  }

  function applySearch() {
    setAppliedQuery(query.trim());
  }

  const CategoryIcon = selected ? CATEGORY_META[selected.category].icon : ScrollText;

  return (
    <div className="ops-users ops-logs">
      <header className="ops-users__mast">
        <div className="ops-users__mast-copy">
          <span>Operations</span>
          <h1>Logs</h1>
          <p>Sign-ins, billing events, admin actions, and Spirit-Panel traffic.</p>
        </div>
        <div className="ops-users__mast-meta">
          <button
            type="button"
            className={`ops-users__chip${!filtersActive && !selected ? ' is-active' : ''}`}
            onClick={() => {
              clearFilters();
              selectLog(null);
            }}
            title="Show all retained logs"
          >
            <span className="ops-users__chip-icon" aria-hidden>
              <Activity size={14} />
            </span>
            <span className="ops-users__chip-copy">
              <small>Retained</small>
              <strong>{counts.total}</strong>
            </span>
          </button>
          <button
            type="button"
            className={`ops-users__chip${level === 'info' && category === 'all' && !appliedQuery ? ' is-active' : ''}`}
            onClick={() => {
              setLevel('info');
              setCategory('all');
              setQuery('');
              setAppliedQuery('');
              selectLog(null);
            }}
            title="Show info events"
          >
            <span className="ops-users__chip-icon" aria-hidden>
              <Info size={14} />
            </span>
            <span className="ops-users__chip-copy">
              <small>Info</small>
              <strong>{counts.info}</strong>
            </span>
          </button>
          <button
            type="button"
            className={`ops-users__chip${counts.warn ? ' is-warn' : ''}${
              level === 'warn' && category === 'all' && !appliedQuery ? ' is-active' : ''
            }`}
            onClick={() => {
              setLevel('warn');
              setCategory('all');
              setQuery('');
              setAppliedQuery('');
              selectLog(null);
            }}
            title="Show warnings"
          >
            <span className="ops-users__chip-icon" aria-hidden>
              <AlertTriangle size={14} />
            </span>
            <span className="ops-users__chip-copy">
              <small>Warnings</small>
              <strong>{counts.warn}</strong>
            </span>
          </button>
          <button
            type="button"
            className={`ops-users__chip${counts.error ? ' is-warn' : ''}${
              level === 'error' && category === 'all' && !appliedQuery ? ' is-active' : ''
            }`}
            onClick={() => {
              setLevel('error');
              setCategory('all');
              setQuery('');
              setAppliedQuery('');
              selectLog(null);
            }}
            title="Show errors"
          >
            <span className="ops-users__chip-icon" aria-hidden>
              <CircleAlert size={14} />
            </span>
            <span className="ops-users__chip-copy">
              <small>Errors</small>
              <strong>{counts.error}</strong>
            </span>
          </button>
        </div>
      </header>

      {error ? <div className="ds-alert ds-alert--error">{error}</div> : null}
      {message ? <div className="ds-alert ds-alert--success">{message}</div> : null}

      <div className={`ops-users__shell${selected ? ' ops-logs__shell--detail' : ''}`}>
        <aside className="ops-users__rail" aria-label="Log filters">
          <div className="ops-users__rail-block">
            <span>Level</span>
            <div>
              {(
                [
                  ['all', 'Any level', counts.total],
                  ['info', 'Info', counts.info],
                  ['warn', 'Warnings', counts.warn],
                  ['error', 'Errors', counts.error],
                ] as const
              ).map(([value, label, count]) => (
                <button
                  key={value}
                  type="button"
                  className={level === value ? 'is-on' : ''}
                  onClick={() => {
                    setLevel(value);
                    selectLog(null);
                  }}
                >
                  {label}
                  <em>{count}</em>
                </button>
              ))}
            </div>
          </div>

          <div className="ops-users__rail-block">
            <span>Category</span>
            <div>
              <button
                type="button"
                className={category === 'all' ? 'is-on' : ''}
                onClick={() => {
                  setCategory('all');
                  selectLog(null);
                }}
              >
                Any category
                <em>{counts.total}</em>
              </button>
              {CATEGORY_ORDER.map((value) => {
                const meta = CATEGORY_META[value];
                const Icon = meta.icon;
                return (
                  <button
                    key={value}
                    type="button"
                    title={meta.hint}
                    className={`ops-logs__cat-btn${category === value ? ' is-on' : ''}`}
                    onClick={() => {
                      setCategory(value);
                      selectLog(null);
                    }}
                  >
                    <span>
                      <Icon size={12} aria-hidden />
                      {meta.label}
                    </span>
                    <em>{categories[value]}</em>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        <div className="ops-users__main">
          <div className="ops-users__command ops-logs__command">
            <label className="ops-users__search">
              <Search size={16} aria-hidden />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    setQuery('');
                    setAppliedQuery('');
                  }
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    applySearch();
                  }
                }}
                placeholder="Search message, action, or path"
                aria-label="Search logs"
              />
              {query ? (
                <button
                  type="button"
                  className="ops-users__search-clear"
                  onClick={() => {
                    setQuery('');
                    setAppliedQuery('');
                  }}
                  aria-label="Clear search"
                >
                  <X size={14} />
                </button>
              ) : null}
            </label>

            <div className="ops-services__jobs" role="group" aria-label="Log actions">
              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  setLoading(true);
                  void load(query.trim() || appliedQuery);
                }}
              >
                <RefreshCw size={14} /> Refresh
              </button>
              <button
                type="button"
                className="ops-logs__prune"
                disabled={loading || busy}
                onClick={() => setPruneOpen(true)}
              >
                <Trash2 size={14} /> Prune 30d
              </button>
            </div>

            <div className="ops-users__command-meta">
              <span>
                Showing <strong>{logs.length}</strong>
                {counts.total ? (
                  <>
                    {' '}
                    of <strong>{counts.total}</strong> retained
                  </>
                ) : null}
              </span>
              {filtersActive ? (
                <>
                  <span className="ops-users__filter-summary">{filterSummary.join(' · ')}</span>
                  <button type="button" className="ops-users__clear" onClick={clearFilters}>
                    Clear
                  </button>
                </>
              ) : null}
            </div>
          </div>

          <div className={`ops-logs__workspace${selected ? ' is-split' : ''}`}>
            <section className="ops-users__table ops-logs__table" aria-label="System logs">
              <div className="ops-users__head ops-logs__head" aria-hidden>
                <span>Event</span>
                <span>Actor</span>
                <span>Request</span>
                <span>When</span>
                <span />
              </div>

              {loading ? (
                <div className="ops-users__empty">
                  <RefreshCw size={22} />
                  <h3>Loading logs…</h3>
                </div>
              ) : (
                logs.map((log) => {
                  const MetaIcon = CATEGORY_META[log.category].icon;
                  return (
                    <button
                      type="button"
                      key={log.id}
                      className={`ops-users__row ops-logs__row is-${log.level}${
                        selectedId === log.id ? ' is-selected' : ''
                      }`}
                      onClick={() => selectLog(selectedId === log.id ? null : log)}
                    >
                      <span className="ops-logs__event">
                        <span className={`ops-logs__level is-${log.level}`} aria-hidden>
                          {levelIcon(log.level)}
                        </span>
                        <span>
                          <strong>{log.message}</strong>
                          <small>
                            <MetaIcon size={11} aria-hidden />
                            {CATEGORY_META[log.category].label}
                            <em>·</em>
                            {log.action}
                          </small>
                        </span>
                      </span>

                      <span className="ops-logs__actor">
                        {log.actor ? (
                          <>
                            <strong>@{log.actor.username}</strong>
                            <small>{log.target ? `→ @${log.target.username}` : log.actor.role}</small>
                          </>
                        ) : (
                          <em>System</em>
                        )}
                      </span>

                      <span className="ops-logs__request">
                        {log.method && log.path ? (
                          <>
                            <strong>
                              {log.method}
                              {log.statusCode != null ? ` ${log.statusCode}` : ''}
                            </strong>
                            <small>{log.path}</small>
                          </>
                        ) : log.statusCode != null ? (
                          <strong>{log.statusCode}</strong>
                        ) : (
                          <em>—</em>
                        )}
                      </span>

                      <span className="ops-logs__when" title={formatAbsolute(log.createdAt)}>
                        <Clock3 size={12} aria-hidden />
                        {formatRelative(log.createdAt)}
                      </span>

                      <span className="ops-logs__open">{selectedId === log.id ? 'Close' : 'Open'}</span>
                    </button>
                  );
                })
              )}

              {!loading && !logs.length ? (
                <div className="ops-users__empty">
                  <ScrollText size={24} />
                  <h3>{filtersActive ? 'No matching logs' : 'No logs yet'}</h3>
                  <p>
                    {filtersActive
                      ? 'Try another level, category, or search.'
                      : 'Activity appears here as people sign in, pay invoices, and as billing talks to Spirit-Panel.'}
                  </p>
                  {filtersActive ? (
                    <button type="button" className="ops-users__clear" onClick={clearFilters}>
                      Clear filters
                    </button>
                  ) : null}
                </div>
              ) : null}
            </section>

            {selected ? (
              <aside className="ops-logs__detail" aria-label="Log detail">
                <section className="ops-user__panel">
                  <header>
                    <span className={`ops-user__panel-icon ops-logs__detail-level is-${selected.level}`} aria-hidden>
                      {levelIcon(selected.level)}
                    </span>
                    <div>
                      <h2>Event</h2>
                      <p>{CATEGORY_META[selected.category].label} · {selected.action}</p>
                    </div>
                    <div className="ops-logs__detail-actions">
                      <button type="button" className="ops-user__btn is-ghost" onClick={() => void copySelected()}>
                        <Copy size={14} />
                        {copied ? 'Copied' : 'Copy'}
                      </button>
                      <button type="button" className="ops-user__btn is-ghost" onClick={() => selectLog(null)}>
                        <X size={14} />
                      </button>
                    </div>
                  </header>

                  <div className="ops-logs__detail-hero">
                    <span className={`ops-logs__level is-${selected.level}`} aria-hidden>
                      <CategoryIcon size={16} />
                    </span>
                    <div>
                      <small className={`ops-logs__pill is-${selected.level}`}>{selected.level}</small>
                      <h3>{selected.message}</h3>
                      <p title={formatAbsolute(selected.createdAt)}>{formatAbsolute(selected.createdAt)}</p>
                    </div>
                  </div>

                  <dl className="ops-logs__facts">
                    <div>
                      <dt>Action</dt>
                      <dd>
                        <code>{selected.action}</code>
                      </dd>
                    </div>
                    <div>
                      <dt>Category</dt>
                      <dd>{CATEGORY_META[selected.category].label}</dd>
                    </div>
                    <div>
                      <dt>When</dt>
                      <dd>{formatRelative(selected.createdAt)}</dd>
                    </div>
                    <div>
                      <dt>IP</dt>
                      <dd>{selected.ip || '—'}</dd>
                    </div>
                    {selected.method || selected.path ? (
                      <div className="ops-logs__facts-wide">
                        <dt>Request</dt>
                        <dd>
                          <code>
                            {[selected.method, selected.path].filter(Boolean).join(' ')}
                            {selected.statusCode != null ? ` · ${selected.statusCode}` : ''}
                            {selected.durationMs != null ? ` · ${selected.durationMs}ms` : ''}
                          </code>
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                </section>

                <section className="ops-user__panel">
                  <header>
                    <span className="ops-user__panel-icon" aria-hidden>
                      <UserRound size={14} />
                    </span>
                    <div>
                      <h2>People</h2>
                      <p>Who triggered this and who it affected.</p>
                    </div>
                  </header>
                  <div className="ops-logs__people">
                    <div>
                      <span>Actor</span>
                      {selected.actor ? (
                        <Link to={`/admin/users/${selected.actor.id}`}>
                          <strong>@{selected.actor.username}</strong>
                          <small>{selected.actor.email}</small>
                          <em>{selected.actor.role}</em>
                        </Link>
                      ) : (
                        <em>System / anonymous</em>
                      )}
                    </div>
                    <div>
                      <span>Target</span>
                      {selected.target ? (
                        <Link to={`/admin/users/${selected.target.id}`}>
                          <strong>@{selected.target.username}</strong>
                          <small>{selected.target.email}</small>
                        </Link>
                      ) : (
                        <em>None</em>
                      )}
                    </div>
                  </div>
                </section>

                <section className="ops-user__panel">
                  <header>
                    <span className="ops-user__panel-icon" aria-hidden>
                      <Network size={14} />
                    </span>
                    <div>
                      <h2>Metadata</h2>
                      <p>Sanitized payload attached to the event.</p>
                    </div>
                  </header>
                  {selected.meta != null ? (
                    <pre className="ops-logs__meta">{JSON.stringify(selected.meta, null, 2)}</pre>
                  ) : (
                    <p className="ops-logs__meta-empty">No extra metadata on this event.</p>
                  )}
                </section>
              </aside>
            ) : null}
          </div>
        </div>
      </div>

      <ConfirmModal
        open={pruneOpen}
        title="Clear older logs?"
        description="This permanently deletes system logs older than 30 days. Recent activity is kept."
        confirmLabel="Clear older logs"
        busyLabel="Clearing…"
        tone="danger"
        actionIcon="delete"
        busy={busy}
        consequences={[
          'Logs older than 30 days will be permanently removed.',
          'This cannot be undone.',
        ]}
        onCancel={() => !busy && setPruneOpen(false)}
        onConfirm={() => void prune()}
      />
    </div>
  );
}
