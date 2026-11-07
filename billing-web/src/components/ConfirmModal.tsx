import { useEffect, useId, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, PauseCircle, Trash2, X, XCircle } from 'lucide-react';

type ConfirmModalProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  busyLabel?: string;
  eyebrow?: string;
  tone?: 'danger' | 'warning';
  actionIcon?: 'delete' | 'suspend' | 'cancel' | 'confirm';
  busy?: boolean;
  requireText?: string;
  consequences?: string[];
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = 'Delete',
  busyLabel = 'Deleting…',
  eyebrow = 'Destructive action',
  tone = 'danger',
  actionIcon,
  busy = false,
  requireText,
  consequences = [],
  onCancel,
  onConfirm,
}: ConfirmModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [confirmation, setConfirmation] = useState('');

  useEffect(() => {
    if (!open) {
      setConfirmation('');
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timer = window.setTimeout(() => cancelRef.current?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, busy, onCancel]);

  if (!open) return null;

  const confirmationMatches = !requireText || confirmation === requireText;
  const resolvedIcon = actionIcon ?? (tone === 'warning' ? 'suspend' : 'delete');
  const ActionIcon =
    resolvedIcon === 'confirm'
      ? CheckCircle2
      : resolvedIcon === 'cancel'
        ? XCircle
        : resolvedIcon === 'suspend'
          ? PauseCircle
          : Trash2;

  return (
    <div className="confirm-modal" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onCancel();
    }}>
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className={`confirm-modal__panel is-${tone}`}
      >
        <header>
          <span>{resolvedIcon === 'delete' ? <AlertTriangle size={20} /> : <ActionIcon size={20} />}</span>
          <button type="button" aria-label="Close" disabled={busy} onClick={onCancel}><X size={16} /></button>
        </header>

        <div className="confirm-modal__content">
          <span>{eyebrow}</span>
          <h2 id={titleId}>{title}</h2>
          <p id={descriptionId}>{description}</p>

          {consequences.length > 0 && (
            <ul>
              {consequences.map((item) => <li key={item}>{item}</li>)}
            </ul>
          )}

          {requireText && (
            <label>
              <span>Type <strong>{requireText}</strong> to confirm</span>
              <input
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                disabled={busy}
                placeholder={requireText}
              />
            </label>
          )}
        </div>

        <footer>
          <button ref={cancelRef} type="button" disabled={busy} onClick={onCancel}>Cancel</button>
          <button type="button" className={`is-${tone}`} disabled={busy || !confirmationMatches} onClick={onConfirm}>
            <ActionIcon size={14} />
            {busy ? busyLabel : confirmLabel}
          </button>
        </footer>
      </section>
    </div>
  );
}
