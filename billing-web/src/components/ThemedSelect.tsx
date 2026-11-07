import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search } from 'lucide-react';

export type ThemedSelectOption = {
  value: string;
  label: string;
  group?: string;
  disabled?: boolean;
  description?: string;
};

type ThemedSelectProps = {
  value: string;
  options: ThemedSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  ariaLabel?: string;
  className?: string;
};

export function ThemedSelect({
  value,
  options,
  onChange,
  placeholder = 'Select an option',
  disabled = false,
  required = false,
  ariaLabel,
  className = '',
}: ThemedSelectProps) {
  const listboxId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const [popupStyle, setPopupStyle] = useState<CSSProperties>({});
  const selected = options.find((option) => option.value === value);
  const searchable = options.length > 7;

  const visibleOptions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return options;
    return options.filter((option) =>
      `${option.label} ${option.group ?? ''} ${option.description ?? ''}`.toLowerCase().includes(normalized),
    );
  }, [options, query]);

  function positionPopup() {
    const button = buttonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const desiredHeight = Math.min(360, Math.max(160, options.length * 38 + (searchable ? 55 : 14)));
    const roomBelow = window.innerHeight - rect.bottom - 10;
    const roomAbove = rect.top - 10;
    const openAbove = roomBelow < Math.min(desiredHeight, 220) && roomAbove > roomBelow;
    const available = Math.max(140, openAbove ? roomAbove : roomBelow);
    setPopupStyle({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8)),
      width: Math.max(rect.width, 220),
      maxHeight: Math.min(desiredHeight, available),
      ...(openAbove
        ? { bottom: window.innerHeight - rect.top + 6, top: 'auto' }
        : { top: rect.bottom + 6, bottom: 'auto' }),
    });
  }

  useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }
    positionPopup();
    const selectedIndex = Math.max(0, visibleOptions.findIndex((option) => option.value === value));
    setHighlighted(selectedIndex);
    const focusTimer = window.setTimeout(() => {
      if (searchable) searchRef.current?.focus();
      popupRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
    }, 0);
    const closeOnOutside = (event: MouseEvent) => {
      const node = event.target as Node;
      if (!buttonRef.current?.contains(node) && !popupRef.current?.contains(node)) setOpen(false);
    };
    const onResize = () => positionPopup();
    const onScroll = (event: Event) => {
      if (popupRef.current?.contains(event.target as Node)) return;
      positionPopup();
    };
    const stopMenuScrollBleed = (event: Event) => {
      if (popupRef.current?.contains(event.target as Node)) {
        event.stopPropagation();
      }
    };
    document.addEventListener('mousedown', closeOnOutside);
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, true);
    document.addEventListener('wheel', stopMenuScrollBleed, { capture: true, passive: true });
    document.addEventListener('touchmove', stopMenuScrollBleed, { capture: true, passive: true });
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('mousedown', closeOnOutside);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll, true);
      document.removeEventListener('wheel', stopMenuScrollBleed, true);
      document.removeEventListener('touchmove', stopMenuScrollBleed, true);
    };
  }, [open, searchable, value]);

  useEffect(() => {
    setHighlighted(0);
  }, [query]);

  function choose(option: ThemedSelectOption) {
    if (option.disabled) return;
    onChange(option.value);
    setOpen(false);
    buttonRef.current?.focus();
  }

  function moveHighlight(direction: 1 | -1) {
    if (!visibleOptions.length) return;
    let next = highlighted;
    do {
      next = (next + direction + visibleOptions.length) % visibleOptions.length;
    } while (visibleOptions[next]?.disabled && next !== highlighted);
    setHighlighted(next);
    popupRef.current
      ?.querySelector<HTMLElement>(`[data-option-index="${next}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }

  function onButtonKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setOpen(true);
    }
  }

  function onPopupKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveHighlight(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveHighlight(-1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const option = visibleOptions[highlighted];
      if (option) choose(option);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    }
  }

  let lastGroup: string | undefined;
  const popup = open && createPortal(
    <div
      ref={popupRef}
      className="themed-select-menu"
      style={popupStyle}
      onKeyDown={onPopupKeyDown}
      onWheel={(event) => event.stopPropagation()}
    >
      {searchable && (
        <label className="themed-select-menu__search">
          <Search size={13} />
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search options…"
            aria-label="Search options"
          />
        </label>
      )}
      <div id={listboxId} role="listbox" aria-label={ariaLabel} className="themed-select-menu__options">
        {visibleOptions.map((option, index) => {
          const showGroup = Boolean(option.group && option.group !== lastGroup);
          lastGroup = option.group;
          return (
            <div key={`${option.group ?? ''}-${option.value}`}>
              {showGroup && <div className="themed-select-menu__group">{option.group}</div>}
              <button
                type="button"
                role="option"
                aria-selected={option.value === value}
                disabled={option.disabled}
                data-option-index={index}
                className={highlighted === index ? 'is-highlighted' : ''}
                onMouseEnter={() => setHighlighted(index)}
                onClick={() => choose(option)}
              >
                <span>
                  <strong>{option.label}</strong>
                  {option.description && <small>{option.description}</small>}
                </span>
                {option.value === value && <Check size={14} />}
              </button>
            </div>
          );
        })}
        {!visibleOptions.length && <div className="themed-select-menu__empty">No matching options</div>}
      </div>
    </div>,
    document.body,
  );

  return (
    <div className={`themed-select ${open ? 'is-open' : ''} ${className}`.trim()}>
      <button
        ref={buttonRef}
        type="button"
        className="themed-select__trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-required={required}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={onButtonKeyDown}
      >
        <span className={selected ? '' : 'is-placeholder'}>{selected?.label ?? placeholder}</span>
        <ChevronDown size={14} />
      </button>
      {popup}
    </div>
  );
}
