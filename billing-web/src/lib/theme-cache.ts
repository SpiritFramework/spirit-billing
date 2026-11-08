/** Persist last applied theme so refresh doesn't flash default branding. */

export const THEME_DOM_CACHE_KEY = 'spirit-billing-theme-dom';
export const BRANDING_CACHE_KEY = 'spirit-billing-branding';

export const ATTR_KEYS = [
  'data-theme',
  'data-density',
  'data-sidebar',
  'data-navbar',
  'data-radius',
  'data-auth-bg',
  'data-client-bg',
  'data-admin-bg',
  'data-client-nav',
  'data-admin-nav',
] as const;

const ATTR_KEY_SET = new Set<string>(ATTR_KEYS);
const CSS_VAR_RE = /^--[a-z0-9-]+$/i;
const UNSAFE_VALUE_RE = /url\s*\(|expression\s*\(|javascript:|<|>/i;

export type ThemeDomCache = {
  attrs: Partial<Record<(typeof ATTR_KEYS)[number], string>>;
  vars: Record<string, string>;
  title?: string;
};

function isSafeCssValue(value: string): boolean {
  return Boolean(value) && value.length <= 200 && !UNSAFE_VALUE_RE.test(value);
}

function isSafeAttrValue(value: string): boolean {
  return Boolean(value) && value.length <= 64 && !UNSAFE_VALUE_RE.test(value) && !/[\s"'`=]/.test(value);
}

export function sanitizeThemeDomCache(raw: unknown): ThemeDomCache | null {
  if (!raw || typeof raw !== 'object') return null;
  const cache = raw as ThemeDomCache;
  const attrs: ThemeDomCache['attrs'] = {};
  if (cache.attrs && typeof cache.attrs === 'object') {
    for (const [key, value] of Object.entries(cache.attrs)) {
      if (!ATTR_KEY_SET.has(key)) continue;
      if (typeof value !== 'string' || !isSafeAttrValue(value)) continue;
      attrs[key as (typeof ATTR_KEYS)[number]] = value;
    }
  }
  const vars: Record<string, string> = {};
  if (cache.vars && typeof cache.vars === 'object') {
    for (const [key, value] of Object.entries(cache.vars)) {
      if (!CSS_VAR_RE.test(key)) continue;
      if (typeof value !== 'string' || !isSafeCssValue(value)) continue;
      vars[key] = value;
    }
  }
  const title =
    typeof cache.title === 'string' && cache.title.trim() && cache.title.length <= 120 && !/[<>]/.test(cache.title)
      ? cache.title.trim()
      : undefined;
  return { attrs, vars, title };
}

export function persistThemeDomCache() {
  try {
    const root = document.documentElement;
    const attrs: ThemeDomCache['attrs'] = {};
    for (const key of ATTR_KEYS) {
      const value = root.getAttribute(key);
      if (value && isSafeAttrValue(value)) attrs[key] = value;
    }
    const vars: Record<string, string> = {};
    for (let i = 0; i < root.style.length; i += 1) {
      const name = root.style.item(i);
      if (!CSS_VAR_RE.test(name)) continue;
      const value = root.style.getPropertyValue(name).trim();
      if (value && isSafeCssValue(value)) vars[name] = value;
    }
    const payload: ThemeDomCache = {
      attrs,
      vars,
      title: document.title || undefined,
    };
    localStorage.setItem(THEME_DOM_CACHE_KEY, JSON.stringify(payload));
  } catch {
    /* private mode / quota */
  }
}

export function applyThemeDomCache(raw?: string | null) {
  try {
    const source = raw ?? localStorage.getItem(THEME_DOM_CACHE_KEY);
    if (!source) return false;
    const cache = sanitizeThemeDomCache(JSON.parse(source));
    if (!cache) return false;
    const root = document.documentElement;
    for (const [key, value] of Object.entries(cache.attrs)) {
      if (typeof value === 'string' && value) root.setAttribute(key, value);
    }
    for (const [key, value] of Object.entries(cache.vars)) {
      if (typeof value === 'string' && value) root.style.setProperty(key, value);
    }
    if (cache.title) document.title = cache.title;
    return true;
  } catch {
    return false;
  }
}

export function persistBrandingCache(branding: unknown) {
  try {
    localStorage.setItem(BRANDING_CACHE_KEY, JSON.stringify(branding));
  } catch {
    /* ignore */
  }
}

export function readBrandingCache<T>(): T | null {
  try {
    const raw = localStorage.getItem(BRANDING_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as T;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}
