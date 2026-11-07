import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  ImagePlus,
  LifeBuoy,
  MessageCircle,
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
  const [filter, setFilter] = useState<'all' | TicketStatus>('all');
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

  const visible = tickets.filter((ticket) => {
    const haystack = `${ticket.number} ${ticket.subject} ${ticket.category?.name ?? ''} ${ticket.service?.name ?? ''}`.toLowerCase();
    const matchesQuery = haystack.includes(query.trim().toLowerCase());
    const matchesFilter = filter === 'all' || ticket.status === filter;
    return matchesQuery && matchesFilter;
  });

  const openCount = tickets.filter((t) => t.status === 'open').length;
  const answeredCount = tickets.filter((t) => t.status === 'answered').length;
  const awaitingCount = tickets.filter((t) => t.status === 'awaiting_customer').length;

  if (disabled) {
    return (
      <div className="support-v3">
        <header className="support-v3__hero">
          <div>
            <span>Support</span>
            <h1>Help desk</h1>
            <p>Ticket support is temporarily unavailable.</p>
          </div>
        </header>
        <div className="support-v3__empty">
          <LifeBuoy size={30} />
          <h3>Tickets disabled</h3>
          <p>Please reach out through another support channel while submissions are turned off.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="support-v3">
      <header className="support-v3__hero">
        <div>
          <span>Support</span>
          <h1>Help desk</h1>
          <p>Chat with SpiritHost staff about billing, servers, and account issues.</p>
        </div>
        {!creating && (
          <button type="button" className="support-v3__cta" onClick={() => setCreating(true)}>
            <Plus size={15} /> New ticket
          </button>
        )}
      </header>

      {error && <div className="ds-alert ds-alert--error">{error}</div>}

      {creating && (
        <section className="support-v3__compose-panel">
          <header>
            <div>
              <span>New request</span>
              <h2>Open a ticket</h2>
            </div>
            <button type="button" aria-label="Cancel" onClick={() => setCreating(false)}>
              <X size={16} />
            </button>
          </header>
          <form onSubmit={onCreate}>
            <div className="support-v3__compose-grid">
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
              <span>Related service <em>Optional</em></span>
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
            <footer>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(event) => void onUpload(event.target.files)}
              />
              <button
                type="button"
                className="support-v3__ghost"
                disabled={uploading || pendingAttachments.length >= 5}
                onClick={() => fileRef.current?.click()}
              >
                <ImagePlus size={14} /> {uploading ? 'Uploading…' : 'Add screenshot'}
              </button>
              <button
                type="submit"
                className="support-v3__cta"
                disabled={submitting || !form.subject.trim() || !form.body.trim()}
              >
                <Send size={14} /> {submitting ? 'Opening…' : 'Open ticket'}
              </button>
            </footer>
          </form>
        </section>
      )}

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
          <div><small>Needs you</small><strong>{awaitingCount}</strong></div>
        </article>
      </section>

      <section className="support-v3__inbox">
        <header>
          <div>
            <span>Your tickets</span>
            <h2>Conversations</h2>
          </div>
          <label>
            <Search size={14} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search tickets…"
            />
          </label>
          <div className="support-v3__filters">
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
                className={filter === value ? 'is-active' : ''}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </header>

        <div className="support-v3__ticket-list">
          {visible.map((ticket) => (
            <button
              type="button"
              key={ticket.id}
              className={`support-v3__ticket-card ${ticketStatusTone(ticket.status)}`}
              onClick={() => navigate(`/tickets/${ticket.id}`)}
              style={ticket.category?.color ? { ['--ticket-accent' as string]: ticket.category.color } : undefined}
            >
              <span className="support-v3__ticket-rail" aria-hidden />
              <span className="support-v3__ticket-mark">
                {ticket.category ? (
                  <CategoryMark
                    color={ticket.category.color}
                    icon={ticket.category.icon || 'life-buoy'}
                    size={44}
                  />
                ) : (
                  <span className="support-v3__ticket-fallback"><Ticket size={18} /></span>
                )}
              </span>
              <span className="support-v3__ticket-body">
                <span className="support-v3__ticket-kicker">
                  <small>{ticket.number}</small>
                  {ticket.category && <em>{ticket.category.name}</em>}
                  <span className={`support-v3__priority ${ticketPriorityTone(ticket.priority)}`}>
                    {ticketPriorityLabel(ticket.priority)}
                  </span>
                </span>
                <strong>{ticket.subject}</strong>
                <span className="support-v3__ticket-card-meta">
                  {ticket.service ? (
                    <span><Server size={12} /> {ticket.service.name}</span>
                  ) : (
                    <span><MessageCircle size={12} /> {(ticket._count?.messages ?? 0)} messages</span>
                  )}
                  <time>{formatDay(ticket.updatedAt)}</time>
                </span>
              </span>
              <span className={`support-v3__status ${ticketStatusTone(ticket.status)}`}>
                {ticketStatusLabel(ticket.status)}
              </span>
            </button>
          ))}

          {!loading && !visible.length && (
            <div className="support-v3__empty is-grid">
              <LifeBuoy size={28} />
              <h3>{tickets.length ? 'No matching tickets' : 'No tickets yet'}</h3>
              <p>
                {tickets.length
                  ? 'Try another search or filter.'
                  : 'Start a conversation when you need help from our team.'}
              </p>
              {!tickets.length && !creating && (
                <button type="button" className="support-v3__cta" onClick={() => setCreating(true)}>
                  <Plus size={13} /> New ticket
                </button>
              )}
            </div>
          )}
          {loading && (
            <div className="support-v3__empty is-grid">
              <RefreshCw size={24} className="support-v3__spin" />
              <h3>Loading tickets…</h3>
            </div>
          )}
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
      <div className="ticket-chat">
        <Link to="/tickets" className="ticket-chat__back"><ArrowLeft size={14} /> All tickets</Link>
        <div className="ticket-chat__empty"><LifeBuoy size={28} /><h3>Tickets disabled</h3></div>
      </div>
    );
  }

  if (error && !ticket) {
    return (
      <div className="ticket-chat">
        <Link to="/tickets" className="ticket-chat__back"><ArrowLeft size={14} /> All tickets</Link>
        <div className="ds-alert ds-alert--error">{error}</div>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="ticket-chat">
        <div className="ticket-chat__empty">
          <RefreshCw size={24} className="support-v3__spin" />
          <h3>Opening conversation…</h3>
        </div>
      </div>
    );
  }

  const closed = ticket.status === 'closed';
  const accent = ticket.category?.color;

  return (
    <div
      className="ticket-chat"
      style={accent ? { ['--ticket-accent' as string]: accent } : undefined}
    >
      <Link to="/tickets" className="ticket-chat__back"><ArrowLeft size={14} /> All tickets</Link>

      {error && <div className="ds-alert ds-alert--error">{error}</div>}

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
              <Link to={`/services/${ticket.service.id}`} className="ticket-chat__pill is-link">
                <Server size={12} /> {ticket.service.name}
              </Link>
            )}
            <span className="ticket-chat__pill">
              <MessageCircle size={12} /> {ticket.messages.length} messages
            </span>
          </div>
        </div>
      </header>

      <div className="ticket-chat__layout">
        <section className="ticket-chat__panel">
          <div className="ticket-chat__thread">
            {ticket.messages.map((message, index) => {
              const staff = message.author.role === 'admin' || message.author.role === 'staff';
              const mine = message.author.id === user?.id;
              const name = authorName(message.author);
              const prev = ticket.messages[index - 1];
              const showDay =
                !prev ||
                new Date(prev.createdAt).toDateString() !== new Date(message.createdAt).toDateString();

              return (
                <div key={message.id} className="ticket-chat__block">
                  {showDay && (
                    <div className="ticket-chat__day"><span>{formatDay(message.createdAt)}</span></div>
                  )}
                  <article className={`ticket-chat__msg ${staff ? 'is-staff' : 'is-client'}`}>
                    <TicketAvatar name={name} avatarUrl={message.author.avatarUrl} />
                    <div className="ticket-chat__bubble">
                      <header>
                        <strong>{mine ? 'You' : name}{staff ? ' · Support' : ''}</strong>
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
            <form className="ticket-chat__composer" onSubmit={onReply}>
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
                <button type="submit" className="ticket-chat__send" disabled={sending || !reply.trim()}>
                  <Send size={15} />
                  <span>{sending ? 'Sending…' : 'Send'}</span>
                </button>
              </div>
              <div className="ticket-chat__composer-footer">
                <small>Enter to send · Shift+Enter for a new line</small>
                <button
                  type="button"
                  className="ticket-chat__close-btn"
                  onClick={() => setCloseOpen(true)}
                >
                  <CheckCircle2 size={14} /> Close ticket
                </button>
              </div>
            </form>
          ) : (
            <div className="ticket-chat__closed">
              <LifeBuoy size={18} />
              <div>
                <strong>This ticket is closed</strong>
                <p>Open a new ticket if you still need help from our team.</p>
              </div>
              <Link to="/tickets" className="support-v3__cta">New ticket</Link>
            </div>
          )}
        </section>

        <aside className="ticket-chat__side">
          <div className="ticket-chat__side-card">
            <header><Ticket size={14} /><span>Details</span></header>
            <dl>
              <div><dt>Opened</dt><dd>{formatDay(ticket.createdAt)}</dd></div>
              <div><dt>Updated</dt><dd>{formatDay(ticket.updatedAt)}</dd></div>
              <div><dt>Priority</dt><dd className="is-cap">{ticket.priority}</dd></div>
              <div><dt>Status</dt><dd className="is-cap">{ticketStatusLabel(ticket.status)}</dd></div>
            </dl>
          </div>
          {ticket.service && (
            <div className="ticket-chat__side-card">
              <header><Server size={14} /><span>Linked service</span></header>
              <strong>{ticket.service.name}</strong>
              <em className="is-cap">{ticket.service.status.replaceAll('_', ' ')}</em>
              <Link to={`/services/${ticket.service.id}`} className="ticket-chat__side-link">
                Open service
              </Link>
            </div>
          )}
          {ticket.category && (
            <div className="ticket-chat__side-card">
              <header><LifeBuoy size={14} /><span>Category</span></header>
              <div className="ticket-chat__side-cat">
                <CategoryMark
                  color={ticket.category.color}
                  icon={ticket.category.icon || 'life-buoy'}
                  size={36}
                />
                <div>
                  <strong>{ticket.category.name}</strong>
                  {ticket.category.description && <p>{ticket.category.description}</p>}
                </div>
              </div>
            </div>
          )}
          {!closed && (
            <button type="button" className="ticket-chat__close-side" onClick={() => setCloseOpen(true)}>
              <CheckCircle2 size={14} /> Close ticket
            </button>
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

