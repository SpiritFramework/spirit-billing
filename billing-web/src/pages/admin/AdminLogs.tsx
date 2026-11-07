import { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CircleAlert,
  Info,
  RefreshCw,
  Search,
  Server,
  Shield,
  Trash2,
} from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { ConfirmModal } from '../../components/ConfirmModal';

type SystemLog = {
  id: string;
  level: 'info' | 'warn' | 'error';
  category: 'auth' | 'billing' | 'admin' | 'panel' | 'system';
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
};

type Filter = 'all' | 'auth' | 'billing' | 'admin' | 'panel' | 'system' | 'error';

function levelIcon(level: SystemLog['level']) {
  if (level === 'error') return <CircleAlert size={14} />;
  if (level === 'warn') return <AlertTriangle size={14} />;
  return <Info size={14} />;
}

function categoryLabel(category: SystemLog['category']) {
  if (category === 'panel') return 'Panel API';
  if (category === 'auth') return 'Auth';
  if (category === 'billing') return 'Billing';
  if (category === 'admin') return 'Admin';
  return 'System';
}

export function AdminLogs() {
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [counts, setCounts] = useState({ info: 0, warn: 0, error: 0, total: 0 });
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pruneOpen, setPruneOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function load() {
    setError('');
    try {
      const params = new URLSearchParams({ take: '120' });
      if (filter === 'error') params.set('level', 'error');
      else if (filter !== 'all') params.set('category', filter);
      if (query.trim()) params.set('q', query.trim());
      const data = await api<LogsPayload>(`/admin/logs?${params.toString()}`);
      setLogs(data.logs);
      setCounts(data.counts);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load logs');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    void load();
  }, [filter]);

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
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not prune logs');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-logs-v2">
      <header className="admin-logs-v2__header">
        <div>
          <span>Operations visibility</span>
          <h1>Logs</h1>
          <p>Track sign-ins, billing activity, admin actions, and Spirit-Panel API traffic or failures.</p>
        </div>
        <div className="admin-logs-v2__actions">
          <button type="button" disabled={loading || busy} onClick={() => void load()}>
            <RefreshCw size={14} /> Refresh
          </button>
          <button type="button" className="is-danger" disabled={loading || busy} onClick={() => setPruneOpen(true)}>
            <Trash2 size={14} /> Clear older than 30 days
          </button>
        </div>
      </header>

      {error && <div className="ds-alert ds-alert--error">{error}</div>}
      {message && <div className="ds-alert ds-alert--success">{message}</div>}

      <section className="admin-logs-metrics">
        <article>
          <span className="is-blue"><Activity size={17} /></span>
          <div><small>Total retained</small><strong>{counts.total}</strong><p>Across all categories</p></div>
        </article>
        <article>
          <span className="is-green"><Info size={17} /></span>
          <div><small>Info</small><strong>{counts.info}</strong><p>Normal activity</p></div>
        </article>
        <article>
          <span className="is-amber"><AlertTriangle size={17} /></span>
          <div><small>Warnings</small><strong>{counts.warn}</strong><p>Needs attention</p></div>
        </article>
        <article>
          <span className="is-red"><CircleAlert size={17} /></span>
          <div><small>Errors</small><strong>{counts.error}</strong><p>Failures & outages</p></div>
        </article>
      </section>

      <section className="admin-logs-toolbar">
        <div>
          <span>Event stream</span>
          <h2>Recent activity</h2>
        </div>
        <label>
          <Search size={14} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void load();
            }}
            placeholder="Search message, action, or path…"
          />
        </label>
        <div>
          {([
            ['all', 'All'],
            ['auth', 'Auth'],
            ['billing', 'Billing'],
            ['admin', 'Admin'],
            ['panel', 'Panel'],
            ['system', 'System'],
            ['error', 'Errors'],
          ] as const).map(([value, label]) => (
            <button
              type="button"
              key={value}
              className={filter === value ? 'is-active' : ''}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <div className="admin-logs-list">
        {logs.map((log) => {
          const open = expandedId === log.id;
          return (
            <button
              type="button"
              key={log.id}
              className={`admin-log-row is-${log.level}`}
              onClick={() => setExpandedId(open ? null : log.id)}
            >
              <span className={`admin-log-row__level is-${log.level}`}>{levelIcon(log.level)}</span>
              <span className="admin-log-row__main">
                <small>
                  {categoryLabel(log.category)}
                  {log.actor ? ` · @${log.actor.username}` : ''}
                  {log.target ? ` → @${log.target.username}` : ''}
                </small>
                <strong>{log.message}</strong>
                <em>
                  {log.action}
                  {log.method && log.path ? ` · ${log.method} ${log.path}` : ''}
                  {log.statusCode != null ? ` · ${log.statusCode}` : ''}
                  {log.durationMs != null ? ` · ${log.durationMs}ms` : ''}
                </em>
                {open && (
                  <div className="admin-log-row__meta">
                    <div><span>When</span><strong>{new Date(log.createdAt).toLocaleString()}</strong></div>
                    <div><span>IP</span><strong>{log.ip || '—'}</strong></div>
                    <div><span>Actor</span><strong>{log.actor ? `${log.actor.username} (${log.actor.email})` : '—'}</strong></div>
                    <div><span>Target</span><strong>{log.target ? `${log.target.username} (${log.target.email})` : '—'}</strong></div>
                    {log.meta != null && (
                      <pre>{JSON.stringify(log.meta, null, 2)}</pre>
                    )}
                  </div>
                )}
              </span>
              <span className="admin-log-row__time">
                {new Date(log.createdAt).toLocaleString(undefined, {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </button>
          );
        })}

        {loading && <div className="admin-logs-empty"><RefreshCw size={22} /><h3>Loading logs…</h3></div>}
        {!loading && !logs.length && (
          <div className="admin-logs-empty">
            <Shield size={24} />
            <h3>No matching logs</h3>
            <p>Activity appears here as people sign in, pay invoices, and as billing talks to Spirit-Panel.</p>
            <span><Server size={13} /> Try another filter or refresh after some actions.</span>
          </div>
        )}
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
