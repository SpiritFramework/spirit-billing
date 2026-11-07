import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock3,
  ImagePlus,
  LifeBuoy,
  MessageCircle,
  MessageSquare,
  Paperclip,
  Plus,
  RefreshCw,
  Search,
  Send,
  Server,
  Ticket,
  X,
} from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { CategoryMark } from '../../lib/icons';
import { ConfirmModal } from '../../components/ConfirmModal';
import { TicketAttachments, TicketAvatar } from '../../components/TicketMedia';
import { ThemedSelect } from '../../components/ThemedSelect';
import { useAuth } from '../../context/AuthContext';
import { useBranding } from '../../context/BrandingContext';

type TicketStatus = 'open' | 'answered' | 'awaiting_customer' | 'closed';
type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';
type TicketFilter = 'all' | TicketStatus;

type TicketAttachment = {
  url: string;
  name: string;
  mime: string;
  size: number;
};

type TicketCategory = {
  id: string;
  name: string;
  description?: string;
  color?: string;
  icon?: string;
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
  _count?: { messages: number };
};

type TicketMessage = {
  id: string;
  body: string;
  attachments: TicketAttachment[];
  createdAt: string;
  author: {
    id: string;
    username: string;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
    role?: string;
    avatarUrl?: string | null;
  };
};

type TicketDetail = TicketSummary & {
  messages: TicketMessage[];
};

function ticketStatusLabel(status: TicketStatus) {
  if (status === 'awaiting_customer') return 'Needs you';
  if (status === 'answered') return 'Answered';
  if (status === 'closed') return 'Closed';
  return 'Open';
}

function ticketStatusTone(status: TicketStatus) {
  if (status === 'open') return 'is-open';
  if (status === 'answered') return 'is-answered';
  if (status === 'awaiting_customer') return 'is-waiting';
  return 'is-closed';
}

function ticketPriorityLabel(priority: TicketPriority) {
  if (priority === 'urgent') return 'Urgent';
  if (priority === 'high') return 'High';
  if (priority === 'low') return 'Low';
  return 'Normal';
}

function ticketPriorityTone(priority: TicketPriority) {
  if (priority === 'urgent') return 'is-urgent';
  if (priority === 'high') return 'is-high';
  if (priority === 'low') return 'is-low';
  return 'is-normal';
}

function ticketStatusRank(status: TicketStatus) {
  if (status === 'awaiting_customer') return 0;
  if (status === 'open') return 1;
  if (status === 'answered') return 2;
  return 3;
}

function sortTickets(a: TicketSummary, b: TicketSummary) {
  const rank = ticketStatusRank(a.status) - ticketStatusRank(b.status);
  if (rank !== 0) return rank;
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}

function ticketRowIcon(status: TicketStatus) {
  if (status === 'awaiting_customer') return Clock3;
  if (status === 'answered') return LifeBuoy;
  if (status === 'closed') return CheckCircle2;
  return MessageCircle;
}

const PRIORITY_OPTIONS: { value: TicketPriority; label: string; description: string }[] = [
  { value: 'low', label: 'Low', description: 'Non-urgent question' },
  { value: 'normal', label: 'Normal', description: 'Standard support request' },
  { value: 'high', label: 'High', description: 'Service impacted' },
  { value: 'urgent', label: 'Urgent', description: 'Service down / billing block' },
];

function authorName(author: TicketMessage['author']) {
  const full = [author.firstName, author.lastName].filter(Boolean).join(' ');
  return full || author.username;
}

function formatDay(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function formatUpdated(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
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
  return api<TicketAttachment>('/client/tickets/upload', { method: 'POST', body: fd });
}

export function TicketsPage() {
  const branding = useBranding();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [categories, setCategories] = useState<TicketCategory[]>([]);
  const [services, setServices] = useState<TicketService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<TicketFilter>('all');
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    subject: '',
    categoryId: '',
    serviceId: '',
    priority: 'normal' as TicketPriority,
    body: '',
  });
  const [pendingAttachments, setPendingAttachments] = useState<TicketAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const disabled = branding.ticketsEnabled === false;

  async function load() {
    setError('');
    try {
      const [list, cats, svcs] = await Promise.all([
        api<TicketSummary[]>('/client/tickets'),
        api<TicketCategory[]>('/client/ticket-categories'),
        api<TicketService[]>('/client/services'),
      ]);
      setTickets(list);
      setCategories(cats);
      setServices(svcs);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load tickets');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (disabled) {
      setLoading(false);
      return;
    }
    void load();
  }, [disabled]);

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

  function resetCompose() {
    setCreating(false);
    setForm({
      subject: '',
      categoryId: '',
      serviceId: '',
      priority: 'normal',
      body: '',
    });
    setPendingAttachments([]);
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const created = await api<TicketDetail>('/client/tickets', {
        method: 'POST',
        body: JSON.stringify({
          subject: form.subject.trim(),
          body: form.body.trim(),
          categoryId: form.categoryId || null,
          serviceId: form.serviceId || null,
          priority: form.priority,
          attachments: pendingAttachments,
        }),
      });
      navigate(`/tickets/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create ticket');
    } finally {
      setSubmitting(false);
    }
  }

  const openTickets = tickets.filter((ticket) => ticket.status === 'open');
  const answeredTickets = tickets.filter((ticket) => ticket.status === 'answered');
  const awaitingTickets = tickets.filter((ticket) => ticket.status === 'awaiting_customer');
  const closedTickets = tickets.filter((ticket) => ticket.status === 'closed');
  const filterCounts: Record<TicketFilter, number> = {
    all: tickets.length,
    open: openTickets.length,
    answered: answeredTickets.length,
    awaiting_customer: awaitingTickets.length,
    closed: closedTickets.length,
  };
  const visibleTickets = tickets
    .filter((ticket) => {
      const haystack = `${ticket.number} ${ticket.subject} ${ticket.category?.name ?? ''} ${ticket.service?.name ?? ''}`.toLowerCase();
      const matchesQuery = haystack.includes(query.trim().toLowerCase());
      const matchesFilter = filter === 'all' || ticket.status === filter;
      return matchesQuery && matchesFilter;
    })
    .sort(sortTickets);
  const nextAwaiting = [...awaitingTickets].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  )[0];

  if (disabled) {
    return (
      <div className="client-tickets">
        <header className="client-tickets__intro">
          <div className="client-tickets__intro-copy">
            <p>Support</p>
            <h1>Tickets</h1>
            <span>Ticket support is temporarily unavailable.</span>
          </div>
        </header>
        <div className="client-tickets__empty">
          <span aria-hidden>
            <LifeBuoy size={20} />
          </span>
          <strong>Tickets disabled</strong>
          <p>Reach out through another support channel while submissions are turned off.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="client-tickets">
      <header className="client-tickets__intro">
        <div className="client-tickets__intro-copy">
          <p>Support</p>
          <h1>Tickets</h1>
          <span>Chat with staff about billing, servers, and account issues.</span>
        </div>
        <div className="client-tickets__intro-actions">
          {!creating ? (
            <button
              type="button"
              className="client-home__btn client-home__btn--primary client-home__btn--cta"
              onClick={() => setCreating(true)}
            >
              <span className="client-home__btn-icon" aria-hidden>
                <Plus size={15} />
              </span>
              <span>New ticket</span>
              <ArrowRight size={14} className="client-home__btn-arrow" />
            </button>
          ) : (
            <button
              type="button"
              className="client-home__btn client-home__btn--ghost client-home__btn--cta"
              onClick={resetCompose}
            >
              <span className="client-home__btn-icon" aria-hidden>
                <X size={15} />
              </span>
              <span>Cancel</span>
            </button>
          )}
        </div>
      </header>

      {error && <div className="ds-alert ds-alert--error">{error}</div>}

      {creating ? (
        <section className="client-tickets__compose">
          <div className="client-tickets__compose-head">
            <div>
              <h2>Open a ticket</h2>
              <p>Tell us what&apos;s going on and we&apos;ll pick it up from there.</p>
            </div>
            <button type="button" className="client-tickets__compose-close" onClick={resetCompose} aria-label="Cancel">
              <X size={16} />
            </button>
          </div>
          <form className="client-tickets__compose-form" onSubmit={onCreate}>
            <div className="client-tickets__compose-grid">
              <label>
                <span>Subject</span>
                <input
                  value={form.subject}
                  required
                  minLength={3}
                  maxLength={160}
                  placeholder="Short summary of the issue"
                  onChange={(event) => setForm({ ...form, subject: event.target.value })}
                />
              </label>
              <label>
                <span>Category</span>
                <ThemedSelect
                  ariaLabel="Ticket category"
                  value={form.categoryId}
                  onChange={(categoryId) => setForm({ ...form, categoryId })}
                  placeholder="Choose a category"
                  options={categories.map((cat) => ({
                    value: cat.id,
                    label: cat.name,
                    description: cat.description,
                  }))}
                />
              </label>
              <label>
                <span>Priority</span>
                <ThemedSelect
                  ariaLabel="Ticket priority"
                  value={form.priority}
                  onChange={(priority) => setForm({ ...form, priority: priority as TicketPriority })}
                  options={PRIORITY_OPTIONS.map((option) => ({
                    value: option.value,
                    label: option.label,
                    description: option.description,
                  }))}
                />
              </label>
              <label className="is-full">
                <span>
                  Related service <em>Optional</em>
                </span>
                <ThemedSelect
                  ariaLabel="Related service"
                  value={form.serviceId}
                  onChange={(serviceId) => setForm({ ...form, serviceId })}
                  placeholder="No service linked"
                  options={[
                    { value: '', label: 'No service linked' },
                    ...services.map((svc) => ({ value: svc.id, label: svc.name })),
                  ]}
                />
              </label>
              <label className="is-full">
                <span>Message</span>
                <textarea
                  rows={5}
                  required
                  minLength={3}
                  maxLength={5000}
                  value={form.body}
                  placeholder="Describe what happened, what you expected, and any error text…"
                  onChange={(event) => setForm({ ...form, body: event.target.value })}
                />
              </label>
            </div>
            <TicketAttachments
              attachments={pendingAttachments}
              onClear={() => setPendingAttachments([])}
            />
            <div className="client-tickets__compose-actions">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(event) => void onUpload(event.target.files)}
              />
              <button
                type="button"
                className="client-home__btn client-home__btn--ghost client-home__btn--sm"
                disabled={uploading || pendingAttachments.length >= 5}
                onClick={() => fileRef.current?.click()}
              >
                <ImagePlus size={14} />
                {uploading ? 'Uploading…' : 'Add screenshot'}
              </button>
              <button
                type="submit"
                className="client-home__btn client-home__btn--primary client-home__btn--sm"
                disabled={submitting || !form.subject.trim() || !form.body.trim()}
              >
                <Send size={14} />
                {submitting ? 'Opening…' : 'Open ticket'}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <div className="client-tickets__pulse" aria-label="Ticket snapshot">
        <button
          type="button"
          className={`client-tickets__pulse-item${filter === 'all' ? ' is-active' : ''}`}
          onClick={() => setFilter('all')}
        >
          <span className="client-tickets__pulse-copy">
            <small>Total</small>
            <strong>{loading ? '—' : tickets.length}</strong>
            <span>All conversations</span>
          </span>
          <span className="client-tickets__pulse-icon is-total" aria-hidden>
            <Ticket size={17} />
          </span>
        </button>
        <button
          type="button"
          className={`client-tickets__pulse-item${filter === 'open' ? ' is-active' : ''}`}
          onClick={() => setFilter('open')}
        >
          <span className="client-tickets__pulse-copy">
            <small>Open</small>
            <strong className={openTickets.length > 0 ? 'is-warn' : undefined}>
              {loading ? '—' : openTickets.length}
            </strong>
            <span>Waiting on staff</span>
          </span>
          <span className="client-tickets__pulse-icon is-open" aria-hidden>
            <MessageCircle size={17} />
          </span>
        </button>
        <button
          type="button"
          className={`client-tickets__pulse-item${filter === 'answered' ? ' is-active' : ''}`}
          onClick={() => setFilter('answered')}
        >
          <span className="client-tickets__pulse-copy">
            <small>Answered</small>
            <strong className="is-ok">{loading ? '—' : answeredTickets.length}</strong>
            <span>Staff replied</span>
          </span>
          <span className="client-tickets__pulse-icon is-answered" aria-hidden>
            <LifeBuoy size={17} />
          </span>
        </button>
        <button
          type="button"
          className={`client-tickets__pulse-item${filter === 'awaiting_customer' ? ' is-active' : ''}`}
          onClick={() => setFilter('awaiting_customer')}
        >
          <span className="client-tickets__pulse-copy">
            <small>Needs you</small>
            <strong className={awaitingTickets.length > 0 ? 'is-alert' : undefined}>
              {loading ? '—' : awaitingTickets.length}
            </strong>
            <span>Your reply needed</span>
          </span>
          <span className="client-tickets__pulse-icon is-waiting" aria-hidden>
            <Clock3 size={17} />
          </span>
        </button>
      </div>

      <section className="client-tickets__panel">
        <div className="client-tickets__panel-head">
          <div className="client-tickets__panel-copy">
            <h2>Conversations</h2>
            <p>
              {loading
                ? 'Loading tickets…'
                : query.trim() || filter !== 'all'
                  ? `${visibleTickets.length} match${visibleTickets.length === 1 ? '' : 'es'}`
                  : `${tickets.length} ticket${tickets.length === 1 ? '' : 's'}`}
            </p>
          </div>
          <label className="client-tickets__search">
            <Search size={15} aria-hidden />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search number, subject, or service…"
              aria-label="Search tickets"
            />
          </label>
        </div>

        <div className="client-tickets__filters" role="group" aria-label="Filter by status">
          {([
            ['all', 'All'],
            ['open', 'Open'],
            ['answered', 'Answered'],
            ['awaiting_customer', 'Needs you'],
            ['closed', 'Closed'],
          ] as const).map(([value, label]) => (
            <button
              type="button"
              key={value}
              className={filter === value ? 'is-active' : undefined}
              onClick={() => setFilter(value)}
            >
              {label}
              <em>{loading ? '—' : filterCounts[value]}</em>
            </button>
          ))}
        </div>

        {!loading && awaitingTickets.length > 0 && filter === 'all' && !query.trim() ? (
          <div className="client-tickets__attention">
            <span className="client-tickets__attention-copy">
              <Clock3 size={15} aria-hidden />
              <span>
                <strong>
                  {awaitingTickets.length} ticket{awaitingTickets.length === 1 ? '' : 's'} need
                  {awaitingTickets.length === 1 ? 's' : ''} your reply
                </strong>
                <small>
                  {nextAwaiting
                    ? `${nextAwaiting.number} · updated ${formatUpdated(nextAwaiting.updatedAt)}`
                    : 'Staff is waiting on your response'}
                </small>
              </span>
            </span>
            <div className="client-tickets__attention-actions">
              <button
                type="button"
                className="client-home__btn client-home__btn--ghost client-home__btn--sm"
                onClick={() => setFilter('awaiting_customer')}
              >
                Show needing reply
              </button>
              {nextAwaiting ? (
                <Link
                  className="client-home__btn client-home__btn--primary client-home__btn--sm"
                  to={`/tickets/${nextAwaiting.id}`}
                >
                  Reply now
                  <ArrowRight size={13} />
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="client-tickets__list">
          {visibleTickets.map((ticket) => {
            const statusTone = ticketStatusTone(ticket.status);
            const RowIcon = ticketRowIcon(ticket.status);
            const messageCount = ticket._count?.messages ?? 0;
            return (
              <Link
                key={ticket.id}
                to={`/tickets/${ticket.id}`}
                className={`client-tickets__row ${statusTone}`}
                style={
                  ticket.category?.color
                    ? { ['--ticket-tone' as string]: ticket.category.color }
                    : undefined
                }
              >
                <span className="client-tickets__row-mark" aria-hidden>
                  {ticket.category ? (
                    <CategoryMark
                      color={ticket.category.color}
                      icon={ticket.category.icon || 'life-buoy'}
                      size={28}
                    />
                  ) : (
                    <RowIcon size={16} />
                  )}
                </span>
                <span className="client-tickets__row-body">
                  <span className="client-tickets__row-main">
                    <span className="client-tickets__row-title">
                      <strong>{ticket.subject}</strong>
                    </span>
                    <span className="client-tickets__row-meta">
                      <span className={`client-tickets__status ${statusTone}`}>
                        {ticketStatusLabel(ticket.status)}
                      </span>
                      <span className="client-tickets__row-meta-item">{ticket.number}</span>
                      {ticket.category ? (
                        <span className="client-tickets__row-meta-item">{ticket.category.name}</span>
                      ) : null}
                      {ticket.service ? (
                        <span className="client-tickets__row-meta-item">
                          <Server size={11} aria-hidden />
                          {ticket.service.name}
                        </span>
                      ) : (
                        <span className="client-tickets__row-meta-item">
                          <MessageSquare size={11} aria-hidden />
                          {messageCount} message{messageCount === 1 ? '' : 's'}
                        </span>
                      )}
                      <span className={`client-tickets__priority ${ticketPriorityTone(ticket.priority)}`}>
                        {ticketPriorityLabel(ticket.priority)}
                      </span>
                    </span>
                  </span>
                  <span className="client-tickets__row-rail">
                    <span className="client-tickets__row-date">
                      <small>Updated</small>
                      <strong>{formatUpdated(ticket.updatedAt)}</strong>
                    </span>
                    <span className="client-tickets__row-go" aria-hidden>
                      <ArrowRight size={14} strokeWidth={2} />
                    </span>
                  </span>
                </span>
              </Link>
            );
          })}

          {!loading && !visibleTickets.length ? (
            <div className="client-tickets__empty">
              <span aria-hidden>
                <LifeBuoy size={20} />
              </span>
              <strong>{tickets.length ? 'No matching tickets' : 'No tickets yet'}</strong>
              <p>
                {tickets.length
                  ? 'Try another search or status filter.'
                  : 'Open a ticket when you need help from our team.'}
              </p>
              {tickets.length ? (
                <button
                  type="button"
                  className="client-home__btn client-home__btn--ghost client-home__btn--sm"
                  onClick={() => {
                    setQuery('');
                    setFilter('all');
                  }}
                >
                  Clear filters
                </button>
              ) : (
                <button
                  type="button"
                  className="client-home__btn client-home__btn--primary client-home__btn--cta client-home__btn--sm"
                  onClick={() => setCreating(true)}
                >
                  <span className="client-home__btn-icon" aria-hidden>
                    <Plus size={13} />
                  </span>
                  <span>New ticket</span>
                </button>
              )}
            </div>
          ) : null}

          {loading ? (
            <div className="client-tickets__empty">
              <span aria-hidden>
                <RefreshCw size={18} className="client-tickets__spin" />
              </span>
              <strong>Loading tickets…</strong>
              <p>Fetching your support conversations.</p>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

export function TicketDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const branding = useBranding();
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [error, setError] = useState('');
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<TicketAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const disabled = branding.ticketsEnabled === false;

  async function load() {
    if (!id) return;
    setError('');
    const data = await api<TicketDetail>(`/client/tickets/${id}`);
    setTicket(data);
  }

  useEffect(() => {
    if (disabled || !id) return;
    void load().catch((err) => {
      setTicket(null);
      setError(err instanceof ApiError ? err.message : 'Ticket not found');
    });
  }, [id, disabled]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [ticket?.messages.length]);

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

  async function sendReply() {
    if (!id || !reply.trim()) return;
    setSending(true);
    setError('');
    try {
      const updated = await api<TicketDetail>(`/client/tickets/${id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ body: reply.trim(), attachments: pendingAttachments }),
      });
      setTicket(updated);
      setReply('');
      setPendingAttachments([]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send reply');
    } finally {
      setSending(false);
    }
  }

  async function onReply(event: FormEvent) {
    event.preventDefault();
    await sendReply();
  }

  async function closeTicket() {
    if (!id) return;
    setClosing(true);
    setError('');
    try {
      const updated = await api<TicketDetail>(`/client/tickets/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'closed' }),
      });
      setTicket(updated);
      setCloseOpen(false);
      setReply('');
      setPendingAttachments([]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not close ticket');
    } finally {
      setClosing(false);
    }
  }

  if (disabled) {
    return (
      <div className="client-ticket-detail">
        <Link to="/tickets" className="client-ticket-detail__back">
          <ArrowLeft size={14} /> All tickets
        </Link>
        <div className="client-ticket-detail__empty">
          <span aria-hidden>
            <LifeBuoy size={20} />
          </span>
          <strong>Tickets disabled</strong>
          <p>Support tickets are temporarily unavailable.</p>
        </div>
      </div>
    );
  }

  if (error && !ticket) {
    return (
      <div className="client-ticket-detail">
        <Link to="/tickets" className="client-ticket-detail__back">
          <ArrowLeft size={14} /> All tickets
        </Link>
        <div className="ds-alert ds-alert--error">{error}</div>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="client-ticket-detail">
        <div className="client-ticket-detail__loading">Opening conversation…</div>
      </div>
    );
  }

  const closed = ticket.status === 'closed';
  const statusTone = ticketStatusTone(ticket.status);
  const statusLabel = ticketStatusLabel(ticket.status);
  const priorityLabel = ticketPriorityLabel(ticket.priority);
  const priorityTone = ticketPriorityTone(ticket.priority);
  const openedLabel = formatUpdated(ticket.createdAt);
  const updatedLabel = formatUpdated(ticket.updatedAt);
  const StatusIcon = ticketRowIcon(ticket.status);
  const waitingOnYou = ticket.status === 'awaiting_customer';
  const accent = ticket.category?.color;

  return (
    <div
      className={`client-ticket-detail ${statusTone}`}
      style={accent ? { ['--ticket-tone' as string]: accent } : undefined}
    >
      <Link to="/tickets" className="client-ticket-detail__back">
        <ArrowLeft size={14} /> All tickets
      </Link>

      {error ? <div className="ds-alert ds-alert--error">{error}</div> : null}

      <header className="client-ticket-detail__intro">
        <div className="client-ticket-detail__intro-main">
          <span className={`client-ticket-detail__mark ${statusTone}`} aria-hidden>
            {ticket.category ? (
              <CategoryMark
                color={ticket.category.color}
                icon={ticket.category.icon || 'life-buoy'}
                size={28}
              />
            ) : (
              <StatusIcon size={20} />
            )}
          </span>
          <div className="client-ticket-detail__intro-copy">
            <p>Support ticket</p>
            <h1>{ticket.subject}</h1>
            <span className="client-ticket-detail__intro-meta">
              <span className={`client-ticket-detail__status ${statusTone}`}>{statusLabel}</span>
              <span className="client-ticket-detail__chip">{ticket.number}</span>
              {ticket.category ? (
                <span className="client-ticket-detail__chip">{ticket.category.name}</span>
              ) : null}
              <span className={`client-ticket-detail__priority ${priorityTone}`}>{priorityLabel}</span>
            </span>
          </div>
        </div>
        <div className="client-ticket-detail__intro-actions">
          {!closed ? (
            <>
              <button
                type="button"
                className="client-home__btn client-home__btn--primary client-home__btn--cta"
                onClick={() => composerRef.current?.focus()}
              >
                <span className="client-home__btn-icon" aria-hidden>
                  <Send size={15} />
                </span>
                <span>Reply</span>
                <ArrowRight size={14} className="client-home__btn-arrow" />
              </button>
              <button
                type="button"
                className="client-home__btn client-home__btn--ghost client-home__btn--cta"
                onClick={() => setCloseOpen(true)}
              >
                <span className="client-home__btn-icon" aria-hidden>
                  <CheckCircle2 size={15} />
                </span>
                <span>Close ticket</span>
              </button>
            </>
          ) : (
            <Link className="client-home__btn client-home__btn--primary client-home__btn--cta" to="/tickets">
              <span className="client-home__btn-icon" aria-hidden>
                <Plus size={15} />
              </span>
              <span>New ticket</span>
              <ArrowRight size={14} className="client-home__btn-arrow" />
            </Link>
          )}
        </div>
      </header>

      <div className="client-ticket-detail__pulse" aria-label="Ticket snapshot">
        <div className="client-ticket-detail__pulse-item">
          <span className="client-ticket-detail__pulse-copy">
            <small>Status</small>
            <strong className={waitingOnYou ? 'is-alert' : ticket.status === 'answered' ? 'is-ok' : ticket.status === 'open' ? 'is-warn' : undefined}>
              {statusLabel}
            </strong>
            <span>{waitingOnYou ? 'Your reply needed' : closed ? 'Conversation ended' : 'In progress'}</span>
          </span>
          <span className={`client-ticket-detail__pulse-icon ${statusTone}`} aria-hidden>
            <StatusIcon size={17} />
          </span>
        </div>
        <div className="client-ticket-detail__pulse-item">
          <span className="client-ticket-detail__pulse-copy">
            <small>Priority</small>
            <strong className={ticket.priority === 'urgent' || ticket.priority === 'high' ? 'is-warn' : undefined}>
              {priorityLabel}
            </strong>
            <span>Request urgency</span>
          </span>
          <span className={`client-ticket-detail__pulse-icon is-priority ${priorityTone}`} aria-hidden>
            <Ticket size={17} />
          </span>
        </div>
        <div className="client-ticket-detail__pulse-item">
          <span className="client-ticket-detail__pulse-copy">
            <small>Messages</small>
            <strong>{ticket.messages.length}</strong>
            <span>In this thread</span>
          </span>
          <span className="client-ticket-detail__pulse-icon is-messages" aria-hidden>
            <MessageSquare size={17} />
          </span>
        </div>
        <div className="client-ticket-detail__pulse-item">
          <span className="client-ticket-detail__pulse-copy">
            <small>Updated</small>
            <strong>{updatedLabel}</strong>
            <span>Opened {openedLabel}</span>
          </span>
          <span className="client-ticket-detail__pulse-icon is-date" aria-hidden>
            <Clock3 size={17} />
          </span>
        </div>
      </div>

      {waitingOnYou ? (
        <div className="client-ticket-detail__attention">
          <span className="client-ticket-detail__attention-copy">
            <Clock3 size={15} aria-hidden />
            <span>
              <strong>Support is waiting on your reply</strong>
              <small>Add any details they asked for so we can keep helping.</small>
            </span>
          </span>
          <button
            type="button"
            className="client-home__btn client-home__btn--primary client-home__btn--sm"
            onClick={() => composerRef.current?.focus()}
          >
            Write reply
            <ArrowRight size={13} />
          </button>
        </div>
      ) : null}

      <div className="client-ticket-detail__layout">
        <div className="client-ticket-detail__primary">
          <section className="client-ticket-detail__panel">
            <div className="client-ticket-detail__panel-head">
              <div>
                <h2>Conversation</h2>
                <p>
                  {ticket.messages.length} message{ticket.messages.length === 1 ? '' : 's'} with support
                </p>
              </div>
            </div>

            <div className="client-ticket-detail__thread">
              {ticket.messages.map((message, index) => {
                const staff = message.author.role === 'admin' || message.author.role === 'staff';
                const mine = message.author.id === user?.id;
                const name = authorName(message.author);
                const prev = ticket.messages[index - 1];
                const showDay =
                  !prev ||
                  new Date(prev.createdAt).toDateString() !== new Date(message.createdAt).toDateString();

                return (
                  <div key={message.id} className="client-ticket-detail__block">
                    {showDay ? (
                      <div className="client-ticket-detail__day">
                        <span>{formatDay(message.createdAt)}</span>
                      </div>
                    ) : null}
                    <article
                      className={`client-ticket-detail__msg ${staff ? 'is-staff' : 'is-client'}${mine ? ' is-mine' : ''}`}
                    >
                      <TicketAvatar
                        name={name}
                        avatarUrl={message.author.avatarUrl}
                        className="client-ticket-detail__avatar"
                      />
                      <div className="client-ticket-detail__bubble">
                        <header>
                          <strong>
                            {mine ? 'You' : name}
                            {!mine && staff ? ' · Support' : ''}
                          </strong>
                          <time>{formatTime(message.createdAt)}</time>
                        </header>
                        <p>{message.body}</p>
                        <TicketAttachments attachments={message.attachments} />
                      </div>
                    </article>
                  </div>
                );
              })}
              <div ref={threadEndRef} />
            </div>

            {!closed ? (
              <form className="client-ticket-detail__composer" onSubmit={onReply}>
                <TicketAttachments
                  attachments={pendingAttachments}
                  onClear={() => setPendingAttachments([])}
                />
                <div className="client-ticket-detail__composer-bar">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(event) => void onUpload(event.target.files)}
                  />
                  <button
                    type="button"
                    className="client-ticket-detail__attach"
                    disabled={uploading || pendingAttachments.length >= 5}
                    onClick={() => fileRef.current?.click()}
                    aria-label="Add image"
                  >
                    <Paperclip size={16} />
                  </button>
                  <textarea
                    ref={composerRef}
                    rows={2}
                    required
                    maxLength={5000}
                    value={reply}
                    placeholder="Write your reply to support…"
                    onChange={(event) => setReply(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        void sendReply();
                      }
                    }}
                  />
                  <button
                    type="submit"
                    className="client-ticket-detail__send"
                    disabled={sending || !reply.trim()}
                  >
                    <Send size={15} />
                    <span>{sending ? 'Sending…' : 'Send'}</span>
                  </button>
                </div>
                <div className="client-ticket-detail__composer-footer">
                  <small>Enter to send · Shift+Enter for a new line</small>
                  <button type="button" className="client-ticket-detail__close-link" onClick={() => setCloseOpen(true)}>
                    <CheckCircle2 size={14} /> Close ticket
                  </button>
                </div>
              </form>
            ) : (
              <div className="client-ticket-detail__closed">
                <span aria-hidden>
                  <LifeBuoy size={18} />
                </span>
                <div>
                  <strong>This ticket is closed</strong>
                  <p>Open a new ticket if you still need help from our team.</p>
                </div>
                <Link className="client-home__btn client-home__btn--primary client-home__btn--sm" to="/tickets">
                  New ticket
                  <ArrowRight size={13} />
                </Link>
              </div>
            )}
          </section>
        </div>

        <aside className="client-ticket-detail__aside">
          <section className="client-ticket-detail__side">
            <div className="client-ticket-detail__side-head">
              <span className={`client-ticket-detail__status ${statusTone}`}>{statusLabel}</span>
              <div>
                <small>Ticket</small>
                <strong>{ticket.number}</strong>
              </div>
            </div>
            <dl className="client-ticket-detail__facts">
              <div>
                <dt>Opened</dt>
                <dd>{openedLabel}</dd>
              </div>
              <div>
                <dt>Updated</dt>
                <dd>{updatedLabel}</dd>
              </div>
              <div>
                <dt>Priority</dt>
                <dd>
                  <span className={`client-ticket-detail__priority ${priorityTone}`}>{priorityLabel}</span>
                </dd>
              </div>
              <div>
                <dt>Messages</dt>
                <dd>{ticket.messages.length}</dd>
              </div>
            </dl>
          </section>

          {ticket.category ? (
            <section className="client-ticket-detail__side">
              <div className="client-ticket-detail__side-head">
                <LifeBuoy size={16} />
                <div>
                  <small>Category</small>
                  <strong>{ticket.category.name}</strong>
                </div>
              </div>
              {ticket.category.description ? (
                <p className="client-ticket-detail__side-note">{ticket.category.description}</p>
              ) : (
                <p className="client-ticket-detail__side-note">Routed to the matching support queue.</p>
              )}
              <div className="client-ticket-detail__side-cat">
                <CategoryMark
                  color={ticket.category.color}
                  icon={ticket.category.icon || 'life-buoy'}
                  size={36}
                />
                <span>{ticket.category.name}</span>
              </div>
            </section>
          ) : null}

          {ticket.service ? (
            <section className="client-ticket-detail__side">
              <div className="client-ticket-detail__side-head">
                <Server size={16} />
                <div>
                  <small>Linked service</small>
                  <strong>{ticket.service.name}</strong>
                </div>
              </div>
              <p className="client-ticket-detail__side-note">
                Status: {ticket.service.status.replaceAll('_', ' ')}
              </p>
              <Link
                className="client-home__btn client-home__btn--ghost client-home__btn--sm"
                to={`/services/${ticket.service.id}`}
              >
                Open service
                <ArrowRight size={13} />
              </Link>
            </section>
          ) : null}

          {!closed ? (
            <section className="client-ticket-detail__side is-danger">
              <div className="client-ticket-detail__side-head">
                <CheckCircle2 size={16} />
                <div>
                  <small>Resolve</small>
                  <strong>Close this ticket</strong>
                </div>
              </div>
              <p className="client-ticket-detail__side-note">
                Mark it resolved when you no longer need help on this request.
              </p>
              <button
                type="button"
                className="client-ticket-detail__danger-btn"
                onClick={() => setCloseOpen(true)}
              >
                Close ticket
              </button>
            </section>
          ) : (
            <section className="client-ticket-detail__side is-success">
              <div className="client-ticket-detail__side-head">
                <CheckCircle2 size={16} />
                <div>
                  <small>Complete</small>
                  <strong>Ticket closed</strong>
                </div>
              </div>
              <p className="client-ticket-detail__side-note">
                This conversation is finished. Open a new ticket anytime.
              </p>
              <Link className="client-home__btn client-home__btn--ghost client-home__btn--sm" to="/tickets">
                Back to tickets
                <ArrowRight size={13} />
              </Link>
            </section>
          )}
        </aside>
      </div>

      <ConfirmModal
        open={closeOpen}
        title={`Close ${ticket.number}?`}
        description="Mark this ticket as resolved. You won’t be able to reply unless support reopens it."
        confirmLabel="Close ticket"
        busyLabel="Closing…"
        busy={closing}
        tone="warning"
        actionIcon="confirm"
        eyebrow="Close conversation"
        consequences={[
          'The ticket will move to Closed.',
          'You can open a new ticket if you need more help.',
        ]}
        onCancel={() => setCloseOpen(false)}
        onConfirm={() => void closeTicket()}
      />
    </div>
  );
}

