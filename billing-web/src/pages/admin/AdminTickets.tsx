import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Copy,
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
  X,
} from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { CategoryMark } from '../../lib/icons';
import { ConfirmModal } from '../../components/ConfirmModal';
import { TicketAttachments, TicketAvatar } from '../../components/TicketMedia';
import { ThemedSelect } from '../../components/ThemedSelect';
import { useAuth } from '../../context/AuthContext';
type TicketStatus = 'open' | 'answered' | 'awaiting_customer' | 'closed';
type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';
type StatusFilter = 'all' | TicketStatus;
type PriorityFilter = 'all' | TicketPriority;
type AttentionFilter = 'all' | 'hot';

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

function ticketStatusLabel(status: TicketStatus) {
  return status.replaceAll('_', ' ');
}

function ticketPriorityLabel(priority: TicketPriority) {
  return priority;
}

function displayName(user: TicketUser) {
  const full = [user.firstName, user.lastName].filter(Boolean).join(' ');
  return full || user.username;
}

function formatUpdated(value: string) {
  const date = new Date(value);
  const now = Date.now();
  const diff = now - date.getTime();
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

function statusTone(status: TicketStatus) {
  if (status === 'open') return 'is-open';
  if (status === 'answered') return 'is-answered';
  if (status === 'awaiting_customer') return 'is-waiting';
  return 'is-closed';
}

function priorityTone(priority: TicketPriority) {
  if (priority === 'urgent') return 'is-urgent';
  if (priority === 'high') return 'is-high';
  if (priority === 'low') return 'is-low';
  return 'is-normal';
}


type TicketAttachment = {
  url: string;
  name: string;
  mime: string;
  size: number;
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

function ticketStatusTone(status: TicketStatus) {
  if (status === 'open') return 'is-open';
  if (status === 'answered') return 'is-answered';
  if (status === 'awaiting_customer') return 'is-waiting';
  return 'is-closed';
}

function ticketPriorityTone(priority: TicketPriority) {
  if (priority === 'urgent') return 'is-urgent';
  if (priority === 'high') return 'is-high';
  if (priority === 'low') return 'is-low';
  return 'is-normal';
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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');
  const [attentionFilter, setAttentionFilter] = useState<AttentionFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
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

  const categories = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number; color?: string }>();
    for (const ticket of tickets) {
      const category = ticket.category;
      if (!category) continue;
      const existing = map.get(category.id);
      if (existing) existing.count += 1;
      else map.set(category.id, { id: category.id, name: category.name, count: 1, color: category.color });
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [tickets]);

  const stats = useMemo(
    () => ({
      total: tickets.length,
      open: tickets.filter((t) => t.status === 'open').length,
      answered: tickets.filter((t) => t.status === 'answered').length,
      waiting: tickets.filter((t) => t.status === 'awaiting_customer').length,
      closed: tickets.filter((t) => t.status === 'closed').length,
      urgent: tickets.filter((t) => t.priority === 'urgent').length,
      high: tickets.filter((t) => t.priority === 'high').length,
      normal: tickets.filter((t) => t.priority === 'normal').length,
      low: tickets.filter((t) => t.priority === 'low').length,
      needsAttention: tickets.filter((t) => t.status === 'open' || t.priority === 'urgent' || t.priority === 'high')
        .length,
    }),
    [tickets],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tickets.filter((ticket) => {
      if (statusFilter !== 'all' && ticket.status !== statusFilter) return false;
      if (priorityFilter !== 'all' && ticket.priority !== priorityFilter) return false;
      if (attentionFilter === 'hot') {
        const hot =
          ticket.status === 'open' || ticket.priority === 'urgent' || ticket.priority === 'high';
        if (!hot) return false;
      }
      if (categoryFilter !== 'all' && ticket.category?.id !== categoryFilter) return false;
      if (!q) return true;
      const hay = [
        ticket.number,
        ticket.subject,
        ticket.user.username,
        ticket.user.email,
        ticket.user.firstName,
        ticket.user.lastName,
        ticket.category?.name,
        ticket.service?.name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [tickets, query, statusFilter, priorityFilter, attentionFilter, categoryFilter]);

  const filtersActive =
    statusFilter !== 'all' ||
    priorityFilter !== 'all' ||
    attentionFilter !== 'all' ||
    categoryFilter !== 'all' ||
    Boolean(query.trim());

  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    if (attentionFilter === 'hot') parts.push('Needs attention');
    if (statusFilter !== 'all') parts.push(ticketStatusLabel(statusFilter));
    if (priorityFilter !== 'all') parts.push(ticketPriorityLabel(priorityFilter));
    if (categoryFilter !== 'all') {
      parts.push(categories.find((c) => c.id === categoryFilter)?.name || 'Category');
    }
    if (query.trim()) parts.push(`“${query.trim()}”`);
    return parts;
  }, [attentionFilter, statusFilter, priorityFilter, categoryFilter, query, categories]);

  function clearFilters() {
    setStatusFilter('all');
    setPriorityFilter('all');
    setAttentionFilter('all');
    setCategoryFilter('all');
    setQuery('');
  }

  function setChipFilter(next: {
    status?: StatusFilter;
    priority?: PriorityFilter;
    attention?: AttentionFilter;
  }) {
    setStatusFilter(next.status ?? 'all');
    setPriorityFilter(next.priority ?? 'all');
    setAttentionFilter(next.attention ?? 'all');
    setCategoryFilter('all');
    setQuery('');
  }

  return (
    <div className="ops-users ops-tickets">
      <header className="ops-users__mast">
        <div className="ops-users__mast-copy">
          <span>Inbox</span>
          <h1>Tickets</h1>
          <p>Triage client support, reply in-thread, and close resolved requests.</p>
        </div>
        <div className="ops-users__mast-meta">
          <button
            type="button"
            className={`ops-users__chip${!filtersActive ? ' is-active' : ''}`}
            onClick={clearFilters}
            title="Show all tickets"
          >
            <span className="ops-users__chip-icon" aria-hidden>
              <Ticket size={14} />
            </span>
            <span className="ops-users__chip-copy">
              <small>Inbox</small>
              <strong>{stats.total}</strong>
            </span>
          </button>
          <button
            type="button"
            className={`ops-users__chip${stats.open ? ' is-warn' : ''}${
              statusFilter === 'open' &&
              priorityFilter === 'all' &&
              attentionFilter === 'all' &&
              categoryFilter === 'all' &&
              !query.trim()
                ? ' is-active'
                : ''
            }`}
            onClick={() => setChipFilter({ status: 'open' })}
            title="Show open tickets"
          >
            <span className="ops-users__chip-icon" aria-hidden>
              <MessageCircle size={14} />
            </span>
            <span className="ops-users__chip-copy">
              <small>Open</small>
              <strong>{stats.open}</strong>
            </span>
          </button>
          <button
            type="button"
            className={`ops-users__chip${stats.needsAttention ? ' is-warn' : ''}${
              attentionFilter === 'hot' &&
              statusFilter === 'all' &&
              priorityFilter === 'all' &&
              categoryFilter === 'all' &&
              !query.trim()
                ? ' is-active'
                : ''
            }`}
            onClick={() => setChipFilter({ attention: 'hot' })}
            title="Show tickets that need attention"
          >
            <span className="ops-users__chip-icon" aria-hidden>
              <AlertTriangle size={14} />
            </span>
            <span className="ops-users__chip-copy">
              <small>Hot</small>
              <strong>{stats.needsAttention}</strong>
            </span>
          </button>
          <button
            type="button"
            className={`ops-users__chip is-ok${
              statusFilter === 'answered' &&
              priorityFilter === 'all' &&
              attentionFilter === 'all' &&
              categoryFilter === 'all' &&
              !query.trim()
                ? ' is-active'
                : ''
            }`}
            onClick={() => setChipFilter({ status: 'answered' })}
            title="Show answered tickets"
          >
            <span className="ops-users__chip-icon" aria-hidden>
              <CheckCircle2 size={14} />
            </span>
            <span className="ops-users__chip-copy">
              <small>Answered</small>
              <strong>{stats.answered}</strong>
            </span>
          </button>
        </div>
      </header>

      {error ? <div className="ds-alert ds-alert--error">{error}</div> : null}

      <div className="ops-users__shell">
        <aside className="ops-users__rail" aria-label="Ticket filters">
          <div className="ops-users__rail-block">
            <span>Status</span>
            <div>
              {(
                [
                  ['all', 'Any status', stats.total],
                  ['open', 'Open', stats.open],
                  ['answered', 'Answered', stats.answered],
                  ['awaiting_customer', 'Awaiting client', stats.waiting],
                  ['closed', 'Closed', stats.closed],
                ] as const
              ).map(([value, label, count]) => (
                <button
                  key={value}
                  type="button"
                  className={statusFilter === value ? 'is-on' : ''}
                  onClick={() => {
                    setStatusFilter(value);
                    setAttentionFilter('all');
                  }}
                >
                  {label}
                  <em>{count}</em>
                </button>
              ))}
            </div>
          </div>

          <div className="ops-users__rail-block">
            <span>Priority</span>
            <div>
              {(
                [
                  ['all', 'Any priority', stats.total],
                  ['urgent', 'Urgent', stats.urgent],
                  ['high', 'High', stats.high],
                  ['normal', 'Normal', stats.normal],
                  ['low', 'Low', stats.low],
                ] as const
              ).map(([value, label, count]) => (
                <button
                  key={value}
                  type="button"
                  className={priorityFilter === value ? 'is-on' : ''}
                  onClick={() => {
                    setPriorityFilter(value);
                    setAttentionFilter('all');
                  }}
                >
                  {label}
                  <em>{count}</em>
                </button>
              ))}
            </div>
          </div>

          {categories.length ? (
            <div className="ops-users__rail-block">
              <span>Category</span>
              <div>
                <button
                  type="button"
                  className={categoryFilter === 'all' ? 'is-on' : ''}
                  onClick={() => setCategoryFilter('all')}
                >
                  All categories
                  <em>{stats.total}</em>
                </button>
                {categories.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    className={categoryFilter === category.id ? 'is-on' : ''}
                    onClick={() => setCategoryFilter(category.id)}
                  >
                    {category.name}
                    <em>{category.count}</em>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </aside>

        <div className="ops-users__main">
          <div className="ops-users__command ops-tickets__command">
            <label className="ops-users__search">
              <Search size={16} aria-hidden />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    setQuery('');
                  }
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    setLoading(true);
                    void load(query);
                  }
                }}
                placeholder="Filter by number, subject, client, or service"
                aria-label="Search tickets"
              />
              {query ? (
                <button
                  type="button"
                  className="ops-users__search-clear"
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                >
                  <X size={14} />
                </button>
              ) : null}
            </label>

            <div className="ops-services__jobs" role="group" aria-label="Inbox actions">
              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  setLoading(true);
                  void load();
                }}
              >
                <RefreshCw size={14} /> Refresh
              </button>
            </div>

            <div className="ops-users__command-meta">
              <span>
                Showing <strong>{filtered.length}</strong> / {stats.total}
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

          <section className="ops-users__table" aria-label="Tickets">
            <div className="ops-users__head ops-tickets__head" aria-hidden>
              <span>Ticket</span>
              <span>Client</span>
              <span>Priority</span>
              <span>Status</span>
              <span className="is-end">Msgs</span>
              <span className="is-end">Updated</span>
              <span />
            </div>

            {filtered.map((ticket) => {
              const client = displayName(ticket.user);
              const messages = ticket._count?.messages ?? 0;
              return (
                <button
                  type="button"
                  key={ticket.id}
                  className={`ops-users__row ops-tickets__row ${statusTone(ticket.status)}${
                    ticket.priority === 'urgent' || ticket.priority === 'high' ? ' is-hot' : ''
                  }`}
                  onClick={() => navigate(`/admin/tickets/${ticket.id}`)}
                >
                  <span className="ops-tickets__who">
                    {ticket.category ? (
                      <CategoryMark
                        color={ticket.category.color || '#38bdf8'}
                        icon={ticket.category.icon || 'life-buoy'}
                        size={30}
                        className="ops-services__mark"
                      />
                    ) : (
                      <span className="ops-tickets__mark-fallback" aria-hidden>
                        <Ticket size={15} />
                      </span>
                    )}
                    <span>
                      <strong>{ticket.number}</strong>
                      <small>{ticket.subject}</small>
                      <em>
                        {ticket.category?.name || 'Uncategorized'}
                        {ticket.service ? ` · ${ticket.service.name}` : ''}
                      </em>
                    </span>
                  </span>

                  <span className="ops-tickets__client">
                    <TicketAvatar
                      name={client}
                      avatarUrl={ticket.user.avatarUrl}
                      className="ops-tickets__avatar"
                    />
                    <span>
                      <strong>{client}</strong>
                      <small>@{ticket.user.username}</small>
                    </span>
                  </span>

                  <span className={`ops-tickets__priority ${priorityTone(ticket.priority)}`}>
                    {ticketPriorityLabel(ticket.priority)}
                  </span>

                  <span className="ops-tickets__status">
                    <em className={statusTone(ticket.status)}>{ticketStatusLabel(ticket.status)}</em>
                  </span>

                  <span className="ops-tickets__msgs is-end">
                    <MessageCircle size={12} aria-hidden />
                    {messages}
                  </span>

                  <span className="ops-tickets__updated is-end">{formatUpdated(ticket.updatedAt)}</span>

                  <ChevronRight size={15} aria-hidden />
                </button>
              );
            })}

            {!loading && !filtered.length ? (
              <div className="ops-users__empty">
                <LifeBuoy size={20} aria-hidden />
                <strong>{tickets.length ? 'No matching tickets' : 'Inbox empty'}</strong>
                <span>
                  {tickets.length
                    ? 'Try another search or filter.'
                    : 'New client tickets appear here as soon as they are opened.'}
                </span>
                {filtersActive ? (
                  <button type="button" className="ops-users__clear" onClick={clearFilters}>
                    Clear filters
                  </button>
                ) : null}
              </div>
            ) : null}

            {loading ? (
              <div className="ops-users__empty">
                <RefreshCw size={20} aria-hidden />
                <strong>Loading inbox…</strong>
              </div>
            ) : null}
          </section>
        </div>
      </div>
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
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);

  async function load() {
    if (!id) return;
    setError('');
    try {
      setTicket(await api<TicketDetail>(`/admin/tickets/${id}`));
    } catch (err) {
      setTicket(null);
      setError(err instanceof ApiError ? err.message : 'Ticket not found');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    void load();
  }, [id]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [ticket?.messages.length]);

  async function changeStatus(status: TicketStatus) {
    if (!id || !ticket || ticket.status === status) return;
    setStatusBusy(true);
    setError('');
    setNotice('');
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
    setNotice('');
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

  async function copyNumber() {
    if (!ticket) return;
    try {
      await navigator.clipboard.writeText(ticket.number);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError('Could not copy ticket number');
    }
  }

  if (error && !ticket) {
    return (
      <div className="ops-user ops-tkt">
        <Link to="/admin/tickets" className="ops-user__back">
          <ArrowLeft size={14} /> Inbox
        </Link>
        <div className="ops-user__alert is-error">{error}</div>
      </div>
    );
  }

  if (loading || !ticket) {
    return (
      <div className="ops-user ops-tkt">
        <div className="ops-user__loading">
          <RefreshCw size={18} aria-hidden />
          Opening ticket…
        </div>
      </div>
    );
  }

  const client = displayName(ticket.user);
  const needsReply = ticket.status === 'open';
  const isHot = ticket.priority === 'urgent' || ticket.priority === 'high';
  const waitingOnClient = ticket.status === 'awaiting_customer';

  return (
    <div className="ops-user ops-tkt">
      <Link to="/admin/tickets" className="ops-user__back">
        <ArrowLeft size={14} /> Inbox
      </Link>

      {error ? <div className="ops-user__alert is-error">{error}</div> : null}
      {notice ? <div className="ops-user__alert is-info">{notice}</div> : null}

      <header className="ops-user__mast">
        <div className="ops-user__identity">
          <span
            className={`ops-svc__mark-wrap${
              needsReply || isHot
                ? ' is-warn'
                : ticket.status === 'answered'
                  ? ' is-ok'
                  : ticket.status === 'closed'
                    ? ' is-muted'
                    : ''
            }`}
          >
            {ticket.category ? (
              <CategoryMark
                color={ticket.category.color || '#38bdf8'}
                icon={ticket.category.icon || 'life-buoy'}
                size={52}
                className="ops-svc__mark"
              />
            ) : (
              <span className="ops-tkt__mark-fallback" aria-hidden>
                <Ticket size={22} />
              </span>
            )}
          </span>
          <div className="ops-user__identity-copy">
            <span>{ticket.number}</span>
            <h1>{ticket.subject}</h1>
            <p>
              {ticket.category?.name || 'Uncategorized'}
              {ticket.service ? ` · ${ticket.service.name}` : ''}
              <span aria-hidden="true"> · </span>
              {client}
            </p>
            <div className="ops-user__badges">
              <span className={`ops-tkt__pill ${ticketStatusTone(ticket.status)}`}>
                {ticketStatusLabel(ticket.status)}
              </span>
              <span className={`ops-tkt__pill ${ticketPriorityTone(ticket.priority)}`}>
                {ticketPriorityLabel(ticket.priority)}
              </span>
            </div>
          </div>
        </div>

        <div className="ops-user__actions">
          {ticket.status === 'closed' ? (
            <span className="ops-tkt__resolved">
              <CheckCircle2 size={14} aria-hidden /> Closed
            </span>
          ) : null}
          <button type="button" className="ops-user__btn is-ghost" onClick={() => void copyNumber()}>
            <Copy size={14} /> {copied ? 'Copied' : 'Copy #'}
          </button>
          <button type="button" className="ops-user__btn is-ghost" onClick={() => void load()}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </header>

      {needsReply || isHot || waitingOnClient ? (
        <div className="ops-svc__attention" role="status">
          <div
            className={`ops-svc__attention-item ops-tkt__attention ${
              needsReply || isHot ? 'is-warn' : 'is-ok'
            }`}
          >
            {needsReply || isHot ? (
              <AlertTriangle size={15} aria-hidden />
            ) : (
              <CheckCircle2 size={15} aria-hidden />
            )}
            <div>
              <strong>
                {needsReply
                  ? 'Client waiting on reply'
                  : isHot
                    ? `${ticketPriorityLabel(ticket.priority)} priority`
                    : 'Awaiting client'}
              </strong>
              <span>
                {needsReply
                  ? 'Open ticket — reply in-thread or set status when done.'
                  : isHot
                    ? 'Treat this as elevated priority while triaging.'
                    : 'Ball is with the client. Follow up if they go quiet.'}
              </span>
            </div>
            {needsReply ? (
              <div className="ops-tkt__attention-actions">
                <button
                  type="button"
                  className="ops-user__btn is-ok"
                  disabled={statusBusy}
                  onClick={() => void changeStatus('answered')}
                >
                  <CheckCircle2 size={14} /> Mark answered
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <section className="ops-user__metrics" aria-label="Ticket metrics">
        <div className={`ops-users__chip ops-user__metric${needsReply ? ' is-warn' : ticket.status === 'answered' ? ' is-ok' : ''}`}>
          <span className="ops-user__metric-icon" aria-hidden>
            <Ticket size={15} />
          </span>
          <div>
            <small>Status</small>
            <strong>{ticketStatusLabel(ticket.status)}</strong>
          </div>
        </div>
        <div className={`ops-users__chip ops-user__metric${isHot ? ' is-warn' : ''}`}>
          <span className="ops-user__metric-icon" aria-hidden>
            <AlertTriangle size={15} />
          </span>
          <div>
            <small>Priority</small>
            <strong>{ticketPriorityLabel(ticket.priority)}</strong>
          </div>
        </div>
        <div className="ops-users__chip ops-user__metric">
          <span className="ops-user__metric-icon" aria-hidden>
            <MessageCircle size={15} />
          </span>
          <div>
            <small>Messages</small>
            <strong>{ticket.messages.length}</strong>
          </div>
        </div>
        <div className="ops-users__chip ops-user__metric">
          <span className="ops-user__metric-icon" aria-hidden>
            <CalendarDays size={15} />
          </span>
          <div>
            <small>Updated</small>
            <strong className="ops-svc__metric-stack">
              <span>{formatUpdated(ticket.updatedAt)}</span>
              <em>{formatDay(ticket.createdAt)}</em>
            </strong>
          </div>
        </div>
      </section>

      <div className="ops-inv__desk ops-tkt__desk">
        <div className="ops-inv__main">
          <section className="ops-user__panel ops-tkt__chat">
            <header className="ops-tkt__chat-head">
              <span className="ops-user__panel-icon" aria-hidden>
                <MessageCircle size={15} />
              </span>
              <div>
                <span>Conversation</span>
                <h2>Thread</h2>
              </div>
              <em className="ops-tkt__chat-count">
                {ticket.messages.length} message{ticket.messages.length === 1 ? '' : 's'}
              </em>
            </header>

            <div className="ops-tkt__thread" aria-label="Ticket messages">
              {ticket.messages.map((msg, index) => {
                const staff = msg.author.role === 'admin' || msg.author.role === 'staff';
                const mine = msg.author.id === user?.id;
                const name = displayName(msg.author);
                const prev = ticket.messages[index - 1];
                const showDay =
                  !prev ||
                  new Date(prev.createdAt).toDateString() !== new Date(msg.createdAt).toDateString();

                return (
                  <div key={msg.id} className="ops-tkt__block">
                    {showDay ? (
                      <div className="ops-tkt__day">
                        <span>{formatDay(msg.createdAt)}</span>
                      </div>
                    ) : null}
                    <article className={`ops-tkt__msg ${staff ? 'is-staff' : 'is-client'}`}>
                      <TicketAvatar
                        name={name}
                        avatarUrl={msg.author.avatarUrl}
                        className="ops-tkt__avatar"
                      />
                      <div className="ops-tkt__bubble">
                        <header>
                          <strong>
                            {mine ? 'You' : name}
                            <em>{staff ? 'Staff' : 'Client'}</em>
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
              {!ticket.messages.length ? (
                <div className="ops-tkt__empty">
                  <LifeBuoy size={18} aria-hidden />
                  <strong>No messages yet</strong>
                  <span>Send the first staff reply below.</span>
                </div>
              ) : null}
              <div ref={threadEndRef} />
            </div>

            <form className="ops-tkt__composer" onSubmit={onReply}>
              <div className="ops-tkt__composer-top">
                <label className="ops-tkt__field ops-tkt__field--inline">
                  <span>After send</span>
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
                <TicketAttachments
                  attachments={pendingAttachments}
                  onClear={() => setPendingAttachments([])}
                />
              </div>

              <div className="ops-tkt__composer-bar">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(event) => void onUpload(event.target.files)}
                />
                <button
                  type="button"
                  className="ops-user__icon-btn"
                  disabled={uploading || pendingAttachments.length >= 5}
                  onClick={() => fileRef.current?.click()}
                  aria-label="Add image"
                  title="Attach image"
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
                <button
                  type="submit"
                  className="ops-user__btn is-primary"
                  disabled={sending || !reply.trim()}
                >
                  <Send size={14} />
                  {sending ? 'Sending…' : 'Reply'}
                </button>
              </div>
            </form>
          </section>
        </div>

        <aside className="ops-inv__aside">
          <section className="ops-user__panel">
            <header>
              <span className="ops-user__panel-icon" aria-hidden>
                <UserRound size={15} />
              </span>
              <div>
                <span>Account</span>
                <h2>Client</h2>
              </div>
            </header>
            <Link
              to={`/admin/users/${ticket.user.id}`}
              className="ops-inv__person is-link"
              title={`Open ${client}`}
            >
              <TicketAvatar
                name={client}
                avatarUrl={ticket.user.avatarUrl}
                className="ops-tkt__avatar is-lg"
              />
              <div>
                <strong>{client}</strong>
                <small>@{ticket.user.username}</small>
              </div>
              <ChevronRight size={15} aria-hidden />
            </Link>
          </section>

          <section className="ops-user__panel">
            <header>
              <span className="ops-user__panel-icon" aria-hidden>
                <Server size={15} />
              </span>
              <div>
                <span>Fleet</span>
                <h2>{ticket.service ? 'Service' : 'Unlinked'}</h2>
              </div>
            </header>
            {ticket.service ? (
              <Link
                to={`/admin/services/${ticket.service.id}`}
                className="ops-inv__person is-link"
                title={`Open ${ticket.service.name}`}
              >
                <span className="ops-tkt__service-mark" aria-hidden>
                  <Server size={14} />
                </span>
                <div>
                  <strong>{ticket.service.name}</strong>
                  <small>{ticket.service.status.replaceAll('_', ' ')}</small>
                </div>
                <ChevronRight size={15} aria-hidden />
              </Link>
            ) : (
              <div className="ops-inv__empty">
                <strong>No linked service</strong>
                <span>General support request with no fleet server.</span>
              </div>
            )}
          </section>

          <section className="ops-user__panel">
            <header>
              <span className="ops-user__panel-icon" aria-hidden>
                <Ticket size={15} />
              </span>
              <div>
                <span>Triage</span>
                <h2>Manage</h2>
              </div>
            </header>
            <dl className="ops-user__facts">
              <div>
                <dt>Opened</dt>
                <dd>{formatDay(ticket.createdAt)}</dd>
              </div>
              <div>
                <dt>Updated</dt>
                <dd>{formatUpdated(ticket.updatedAt)}</dd>
              </div>
              <div>
                <dt>Category</dt>
                <dd>{ticket.category?.name || 'Uncategorized'}</dd>
              </div>
            </dl>
            <label className="ops-tkt__field">
              <span>Status</span>
              <ThemedSelect
                ariaLabel="Ticket status"
                value={ticket.status}
                disabled={statusBusy}
                onChange={(status) => void changeStatus(status as TicketStatus)}
                options={(
                  ['open', 'answered', 'awaiting_customer', 'closed'] as TicketStatus[]
                ).map((status) => ({
                  value: status,
                  label: ticketStatusLabel(status),
                }))}
              />
            </label>
            <label className="ops-tkt__field">
              <span>Priority</span>
              <ThemedSelect
                ariaLabel="Ticket priority"
                value={ticket.priority}
                disabled={priorityBusy}
                onChange={(priority) => void changePriority(priority as TicketPriority)}
                options={(['low', 'normal', 'high', 'urgent'] as TicketPriority[]).map((priority) => ({
                  value: priority,
                  label: ticketPriorityLabel(priority),
                }))}
              />
            </label>
          </section>

          <section className="ops-user__panel ops-user__panel--danger">
            <header>
              <span className="ops-user__panel-icon" aria-hidden>
                <Trash2 size={15} />
              </span>
              <div>
                <span>Danger</span>
                <h2>Delete ticket</h2>
              </div>
            </header>
            <p className="ops-tkt__danger-copy">
              {`Permanently removes this ticket and all ${ticket.messages.length} message${
                ticket.messages.length === 1 ? '' : 's'
              }.`}
            </p>
            <button
              type="button"
              className="ops-user__btn is-danger"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 size={14} /> Delete ticket
            </button>
          </section>
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
