import { useEffect, useState } from 'react';
import { ExternalLink, X } from 'lucide-react';

export type TicketAttachment = {
  url: string;
  name: string;
  mime: string;
  size: number;
};

/** Only same-origin ticket uploads (signed query allowed). */
function attachmentSrc(url: string) {
  const trimmed = url.trim();
  try {
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      const parsed = new URL(trimmed);
      if (typeof window !== 'undefined' && parsed.origin !== window.location.origin) return '';
      if (!parsed.pathname.startsWith('/uploads/tickets/')) return '';
      return `${parsed.pathname}${parsed.search}`;
    }
  } catch {
    return '';
  }
  if (!trimmed.startsWith('/uploads/tickets/')) return '';
  if (trimmed.includes('\\') || /\s/.test(trimmed)) return '';
  return trimmed.split('#')[0];
}

export function TicketAvatar({
  name,
  avatarUrl,
  className = 'ticket-chat__avatar',
}: {
  name: string;
  avatarUrl?: string | null;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  const url = avatarUrl?.trim();
  const ok = Boolean(url && /^https?:\/\//i.test(url) && !broken);
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || '?';

  if (ok) {
    return (
      <img
        src={url!}
        alt=""
        className={`${className} is-photo`}
        onError={() => setBroken(true)}
      />
    );
  }

  return (
    <div className={className} aria-hidden>
      {initials}
    </div>
  );
}

export function TicketAttachments({
  attachments,
  onClear,
}: {
  attachments: TicketAttachment[];
  onClear?: () => void;
}) {
  const [active, setActive] = useState<TicketAttachment | null>(null);

  useEffect(() => {
    if (!active) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActive(null);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [active]);

  if (!attachments.length) return null;

  return (
    <>
      <div className="ticket-attach">
        {attachments.map((attachment) => {
          const src = attachmentSrc(attachment.url);
          if (!src) return null;
          return (
            <button
              key={attachment.url}
              type="button"
              className="ticket-attach__thumb"
              title={attachment.name}
              onClick={() => setActive(attachment)}
            >
              <img src={src} alt={attachment.name} loading="lazy" />
            </button>
          );
        })}
        {onClear && (
          <button type="button" className="ticket-attach__clear" onClick={onClear}>
            Clear
          </button>
        )}
      </div>

      {active && (
        <div
          className="ticket-attach__lightbox"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setActive(null);
          }}
        >
          <div className="ticket-attach__lightbox-panel" role="dialog" aria-label={active.name}>
            <header>
              <strong>{active.name}</strong>
              <div>
                <a href={attachmentSrc(active.url)} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={14} /> Open
                </a>
                <button type="button" aria-label="Close preview" onClick={() => setActive(null)}>
                  <X size={16} />
                </button>
              </div>
            </header>
            <img src={attachmentSrc(active.url)} alt={active.name} />
          </div>
        </div>
      )}
    </>
  );
}
