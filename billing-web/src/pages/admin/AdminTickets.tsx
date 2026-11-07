import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Clock3,
  ExternalLink,
  LifeBuoy,
  MessageCircle,
  Paperclip,
  RefreshCw,
  Search,
  Send,
  Server,
  Ticket,
  Trash2,
  UserRound,
} from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { CategoryMark } from '../../lib/icons';
import { ConfirmModal } from '../../components/ConfirmModal';
import { TicketAttachments, TicketAvatar } from '../../components/TicketMedia';
import { ThemedSelect } from '../../components/ThemedSelect';
import { useAuth } from '../../context/AuthContext';

type TicketStatus = 'open' | 'answered' | 'awaiting_customer' | 'closed';
type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';

type TicketAttachment = {
  url: string;
  name: string;
  mime: string;
  size: number;
};

type TicketCategory = {
  id: string;
  name: string;
  color?: string;
  icon?: string;
};

type TicketUser = {
  id: string;
  username: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  role?: string;
  avatarUrl?: string | null;
};

type TicketService = {
  id: string;
  name: string;
  status: string;
};

type TicketSummary = {
  id: string;
  number: string;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  createdAt: string;
  updatedAt: string;
  category: TicketCategory | null;
  service: TicketService | null;
  user: TicketUser;
  _count?: { messages: number };
};

type TicketMessage = {
  id: string;
  body: string;
  attachments: TicketAttachment[];
  createdAt: string;
  author: TicketUser & { avatarUrl?: string | null };
};

type TicketDetail = TicketSummary & {
  messages: TicketMessage[];
};

type StatusFilter = 'all' | TicketStatus;

function ticketStatusLabel(status: TicketStatus) {
  return status.replaceAll('_', ' ');
}

function ticketStatusTone(status: TicketStatus) {
  if (status === 'open') return 'is-open';
  if (status === 'answered') return 'is-answered';
  if (status === 'awaiting_customer') return 'is-waiting';
  return 'is-closed';
}

function ticketPriorityLabel(priority: TicketPriority) {
  return priority;
}

function ticketPriorityTone(priority: TicketPriority) {
  if (priority === 'urgent') return 'is-urgent';
  if (priority === 'high') return 'is-high';
  if (priority === 'low') return 'is-low';
  return 'is-normal';
}

function displayName(user: TicketUser) {
  const full = [user.firstName, user.lastName].filter(Boolean).join(' ');
  return full || user.username;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || '?';
}

function formatDay(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function uploadImage(file: File) {
  const fd = new FormData();
  fd.append('file', file);
  return api<TicketAttachment>('/admin/tickets/upload', { method: 'POST', body: fd });
}

export function AdminTickets() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load(search = query) {
    setError('');
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('q', search.trim());
      const suffix = params.toString() ? `?${params.toString()}` : '';
      setTickets(await api<TicketSummary[]>(`/admin/tickets${suffix}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load tickets');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    void load('');
  }, []);

  const visible = tickets.filter((ticket) => {
    const matchesFilter = filter === 'all' || ticket.status === filter;
    const haystack = `${ticket.number} ${ticket.subject} ${ticket.user.username} ${ticket.user.email}`.toLowerCase();
    const matchesQuery = !query.trim() || haystack.includes(query.trim().toLowerCase());
    return matchesFilter && matchesQuery;
  });

  const openCount = tickets.filter((t) => t.status === 'open').length;
  const answeredCount = tickets.filter((t) => t.status === 'answered').length;
  const waitingCount = tickets.filter((t) => t.status === 'awaiting_customer').length;
  const closedCount = tickets.filter((t) => t.status === 'closed').length;

  return (
    <div className="support-v3 support-v3--admin">
      <header className="support-v3__hero">
        <div>
          <span>Operations</span>
          <h1>Support inbox</h1>
          <p>Triage client tickets, reply in-thread, and close resolved requests.</p>
        </div>
        <button type="button" className="support-v3__ghost" disabled={loading} onClick={() => void load()}>
          <RefreshCw size={14} className={loading ? 'support-v3__spin' : undefined} /> Refresh
        </button>
      </header>

      {error && <div className="ds-alert ds-alert--error">{error}</div>}

      <section className="support-v3__metrics">
        <article>
          <span className="is-sky"><Ticket size={17} /></span>
          <div><small>Total</small><strong>{tickets.length}</strong></div>
        </article>
        <article>
          <span className="is-amber"><MessageCircle size={17} /></span>
          <div><small>Open</small><strong>{openCount}</strong></div>
        </article>
        <article>
          <span className="is-mint"><LifeBuoy size={17} /></span>
          <div><small>Answered</small><strong>{answeredCount}</strong></div>
        </article>
        <article>
          <span className="is-rose"><Clock3 size={17} /></span>
          <div><small>Waiting / closed</small><strong>{waitingCount + closedCount}</strong></div>
        </article>
      </section>

      <section className="support-v3__inbox">
        <header>
          <div>
            <span>Queue</span>
            <h2>All tickets</h2>
          </div>
          <label>
            <Search size={14} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  setLoading(true);
                  void load(query);
                }
              }}
              placeholder="Search number, subject, or client…"
            />
          </label>
          <div className="support-v3__filters">
            {([
              ['all', 'All'],
              ['open', 'Open'],
              ['answered', 'Answered'],
              ['awaiting_customer', 'Awaiting client'],
              ['closed', 'Closed'],
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
        </header>

        <div className="support-v3__admin-list">
          {visible.map((ticket) => {
            const client = displayName(ticket.user);
            return (
              <button
                type="button"
                key={ticket.id}
                className={`support-v3__admin-row ${ticketStatusTone(ticket.status)}`}
                onClick={() => navigate(`/admin/tickets/${ticket.id}`)}
                style={ticket.category?.color ? { ['--ticket-accent' as string]: ticket.category.color } : undefined}
              >
                <span className="support-v3__admin-row-mark">
                  {ticket.category ? (
                    <CategoryMark
                      color={ticket.category.color}
                      icon={ticket.category.icon || 'life-buoy'}
                      size={38}
                    />
                  ) : (
                    <span className="support-v3__ticket-fallback"><Ticket size={16} /></span>
                  )}
                </span>
                <span className="support-v3__admin-row-main">
                  <small>
                    {ticket.number}
                    {ticket.category ? ` · ${ticket.category.name}` : ''}
                  </small>
                  <strong>{ticket.subject}</strong>
                  {ticket.service && (
                    <em><Server size={11} /> {ticket.service.name}</em>
                  )}
                </span>
                <span className="support-v3__admin-row-client">
                  <span className="support-v3__avatar is-sm" aria-hidden>{initials(client)}</span>
                  <span>
                    <strong>{client}</strong>
                    <em>{ticket.user.email}</em>
                  </span>
                </span>
                <span className={`support-v3__priority ${ticketPriorityTone(ticket.priority)}`}>
                  {ticketPriorityLabel(ticket.priority)}
                </span>
                <span className="support-v3__admin-row-meta">
                  <small>{ticket._count?.messages ?? 0} msgs</small>
                  <time>{formatDay(ticket.updatedAt)}</time>
                </span>
                <span className={`support-v3__status ${ticketStatusTone(ticket.status)}`}>
                  {ticketStatusLabel(ticket.status)}
                </span>
              </button>
            );
          })}

          {!loading && !visible.length && (
            <div className="support-v3__empty">
              <LifeBuoy size={28} />
              <h3>{tickets.length ? 'No matching tickets' : 'Inbox empty'}</h3>
              <p>Try another search or status filter.</p>
            </div>
          )}
          {loading && (
            <div className="support-v3__empty">
              <RefreshCw size={24} className="support-v3__spin" />
              <h3>Loading inbox…</h3>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export function AdminTicketDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reply, setReply] = useState('');
  const [replyStatus, setReplyStatus] = useState<TicketStatus | ''>('');
  const [sending, setSending] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [priorityBusy, setPriorityBusy] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<TicketAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);

  async function load() {
    if (!id) return;
    setError('');
    const data = await api<TicketDetail>(`/admin/tickets/${id}`);
    setTicket(data);
  }

  useEffect(() => {
    if (!id) return;
    void load().catch((err) => {
      setTicket(null);
      setError(err instanceof ApiError ? err.message : 'Ticket not found');
    });
  }, [id]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [ticket?.messages.length]);

  async function changeStatus(status: TicketStatus) {
    if (!id || !ticket || ticket.status === status) return;
    setStatusBusy(true);
    setError('');
    try {
      const updated = await api<TicketDetail>(`/admin/tickets/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setTicket(updated);
      setNotice(`Status set to ${ticketStatusLabel(status)}.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update status');
    } finally {
      setStatusBusy(false);
    }
  }

  async function changePriority(priority: TicketPriority) {
    if (!id || !ticket || ticket.priority === priority) return;
    setPriorityBusy(true);
    setError('');
    try {
      const updated = await api<TicketDetail>(`/admin/tickets/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ priority }),
      });
      setTicket(updated);
      setNotice(`Priority set to ${ticketPriorityLabel(priority)}.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update priority');
    } finally {
      setPriorityBusy(false);
    }
  }

  async function onUpload(files: FileList | null) {
    if (!files?.length || pendingAttachments.length >= 5) return;
    setUploading(true);
    setError('');
    try {
      const uploaded: TicketAttachment[] = [];
      for (const file of Array.from(files).slice(0, 5 - pendingAttachments.length)) {
        uploaded.push(await uploadImage(file));
      }
      setPendingAttachments((list) => [...list, ...uploaded].slice(0, 5));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not upload image');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function onReply(event: FormEvent) {
    event.preventDefault();
    if (!id || !reply.trim()) return;
    setSending(true);
    setError('');
    setNotice('');
    try {
      const payload: { body: string; attachments: TicketAttachment[]; status?: TicketStatus } = {
        body: reply.trim(),
        attachments: pendingAttachments,
      };
      if (replyStatus) payload.status = replyStatus;
      const updated = await api<TicketDetail>(`/admin/tickets/${id}/messages`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setTicket(updated);
      setReply('');
      setReplyStatus('');
      setPendingAttachments([]);
      setNotice('Reply sent.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send reply');
    } finally {
      setSending(false);
    }
  }

  async function remove() {
    if (!id) return;
    setDeleting(true);
    setError('');
    try {
      await api(`/admin/tickets/${id}`, { method: 'DELETE' });
      navigate('/admin/tickets');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete ticket');
      setDeleteOpen(false);
    } finally {
      setDeleting(false);
    }
  }

  if (error && !ticket) {
    return (
      <div className="ticket-chat">
        <Link to="/admin/tickets" className="ticket-chat__back"><ArrowLeft size={14} /> Inbox</Link>
        <div className="ds-alert ds-alert--error">{error}</div>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="ticket-chat">
        <div className="ticket-chat__empty">
          <RefreshCw size={24} className="support-v3__spin" />
          <h3>Opening ticket…</h3>
        </div>
      </div>
    );
  }

  const client = displayName(ticket.user);
  const accent = ticket.category?.color;

  return (
    <div
      className="ticket-chat ticket-chat--admin"
      style={accent ? { ['--ticket-accent' as string]: accent } : undefined}
    >
      <Link to="/admin/tickets" className="ticket-chat__back"><ArrowLeft size={14} /> Inbox</Link>

      {error && <div className="ds-alert ds-alert--error">{error}</div>}
      {notice && <div className="ds-alert ds-alert--success">{notice}</div>}

      <header className="ticket-chat__hero">
        <div className="ticket-chat__hero-glow" aria-hidden />
        <CategoryMark
          color={ticket.category?.color}
          icon={ticket.category?.icon || 'life-buoy'}
          size={58}
          className="ticket-chat__hero-mark"
        />
        <div className="ticket-chat__hero-copy">
          <span>
            {ticket.number}
            {ticket.category ? ` · ${ticket.category.name}` : ''}
          </span>
          <h1>{ticket.subject}</h1>
          <div className="ticket-chat__hero-meta">
            <span className={`support-v3__status ${ticketStatusTone(ticket.status)}`}>
              {ticketStatusLabel(ticket.status)}
            </span>
            <span className={`support-v3__priority ${ticketPriorityTone(ticket.priority)}`}>
              {ticketPriorityLabel(ticket.priority)}
            </span>
            {ticket.service && (
              <Link to={`/admin/services/${ticket.service.id}`} className="ticket-chat__pill is-link">
                <Server size={12} /> {ticket.service.name}
              </Link>
            )}
            <span className="ticket-chat__pill">
              <UserRound size={12} /> {client}
            </span>
          </div>
        </div>
      </header>

      <div className="ticket-chat__layout">
        <section className="ticket-chat__panel">
          <div className="ticket-chat__thread">
            {ticket.messages.map((msg, index) => {
              const staff = msg.author.role === 'admin' || msg.author.role === 'staff';
              const mine = msg.author.id === user?.id;
              const name = displayName(msg.author);
              const prev = ticket.messages[index - 1];
              const showDay =
                !prev ||
                new Date(prev.createdAt).toDateString() !== new Date(msg.createdAt).toDateString();

              return (
                <div key={msg.id} className="ticket-chat__block">
                  {showDay && (
                    <div className="ticket-chat__day"><span>{formatDay(msg.createdAt)}</span></div>
                  )}
                  <article className={`ticket-chat__msg ${staff ? 'is-staff' : 'is-client'}`}>
                    <TicketAvatar name={name} avatarUrl={msg.author.avatarUrl} />
                    <div className="ticket-chat__bubble">
                      <header>
                        <strong>
                          {mine ? 'You' : name}
                          {staff ? ' · Staff' : ' · Client'}
                        </strong>
                        <time>{formatTime(msg.createdAt)}</time>
                      </header>
                      <p>{msg.body}</p>
                      <TicketAttachments attachments={msg.attachments} />
                    </div>
                  </article>
                </div>
              );
            })}
            <div ref={threadEndRef} />
          </div>

          <form className="ticket-chat__composer is-staff" onSubmit={onReply}>
            <div className="ticket-chat__composer-tools">
              <label>
                <span>Status after send</span>
                <ThemedSelect
                  ariaLabel="Status on reply"
                  value={replyStatus}
                  onChange={(status) => setReplyStatus(status as TicketStatus | '')}
                  placeholder="Answered (default)"
                  options={[
                    { value: '', label: 'Answered (default)' },
                    { value: 'answered', label: 'Answered' },
                    { value: 'awaiting_customer', label: 'Awaiting customer' },
                    { value: 'closed', label: 'Closed' },
                  ]}
                />
              </label>
            </div>
            <TicketAttachments
              attachments={pendingAttachments}
              onClear={() => setPendingAttachments([])}
            />
            <div className="ticket-chat__composer-bar">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(event) => void onUpload(event.target.files)}
              />
              <button
                type="button"
                className="ticket-chat__attach"
                disabled={uploading || pendingAttachments.length >= 5}
                onClick={() => fileRef.current?.click()}
                aria-label="Add image"
              >
                <Paperclip size={16} />
              </button>
              <textarea
                rows={3}
                required
                maxLength={5000}
                value={reply}
                placeholder="Write a staff reply…"
                onChange={(event) => setReply(event.target.value)}
              />
              <button type="submit" className="ticket-chat__send" disabled={sending || !reply.trim()}>
                <Send size={15} />
                <span>{sending ? 'Sending…' : 'Reply'}</span>
              </button>
            </div>
          </form>
        </section>

        <aside className="ticket-chat__side">
          <div className="ticket-chat__side-card">
            <header><UserRound size={14} /><span>Client</span></header>
            <div className="ticket-chat__side-client">
              <TicketAvatar
                name={client}
                avatarUrl={ticket.user.avatarUrl}
                className="ticket-chat__avatar is-lg"
              />
              <div>
                <strong>{client}</strong>
                <em>@{ticket.user.username}</em>
                <a href={`mailto:${ticket.user.email}`}>{ticket.user.email}</a>
              </div>
            </div>
            <Link to={`/admin/users/${ticket.user.id}`} className="ticket-chat__side-link">
              Open client profile <ExternalLink size={12} />
            </Link>
          </div>

          <div className="ticket-chat__side-card">
            <header><Ticket size={14} /><span>Manage</span></header>
            <dl>
              <div><dt>Opened</dt><dd>{formatDay(ticket.createdAt)}</dd></div>
              <div><dt>Updated</dt><dd>{formatDay(ticket.updatedAt)}</dd></div>
              <div><dt>Messages</dt><dd>{ticket.messages.length}</dd></div>
            </dl>
            {ticket.service && (
              <Link to={`/admin/services/${ticket.service.id}`} className="ticket-chat__side-link">
                <span><Server size={12} /> {ticket.service.name}</span>
                <ExternalLink size={12} />
              </Link>
            )}
            <label className="ticket-chat__field">
              <span>Status</span>
              <ThemedSelect
                ariaLabel="Ticket status"
                value={ticket.status}
                disabled={statusBusy}
                onChange={(status) => void changeStatus(status as TicketStatus)}
                options={([
                  'open',
                  'answered',
                  'awaiting_customer',
                  'closed',
                ] as TicketStatus[]).map((status) => ({
                  value: status,
                  label: ticketStatusLabel(status),
                }))}
              />
            </label>
            <label className="ticket-chat__field">
              <span>Priority</span>
              <ThemedSelect
                ariaLabel="Ticket priority"
                value={ticket.priority}
                disabled={priorityBusy}
                onChange={(priority) => void changePriority(priority as TicketPriority)}
                options={([
                  'low',
                  'normal',
                  'high',
                  'urgent',
                ] as TicketPriority[]).map((priority) => ({
                  value: priority,
                  label: ticketPriorityLabel(priority),
                }))}
              />
            </label>
          </div>

          <button type="button" className="ticket-chat__danger" onClick={() => setDeleteOpen(true)}>
            <Trash2 size={14} /> Delete ticket
          </button>
        </aside>
      </div>

      <ConfirmModal
        open={deleteOpen}
        title={`Delete ${ticket.number}?`}
        description="This permanently removes the ticket and all of its messages."
        confirmLabel="Delete ticket"
        busyLabel="Deleting…"
        busy={deleting}
        requireText={ticket.number}
        consequences={[
          `${ticket.messages.length} message${ticket.messages.length === 1 ? '' : 's'} will be lost.`,
          'The client will no longer see this ticket.',
          'This action cannot be undone.',
        ]}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => void remove()}
      />
    </div>
  );
}
