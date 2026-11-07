/** Persist last applied theme so refresh doesn't flash default branding. */

export const THEME_DOM_CACHE_KEY = 'spirit-billing-theme-dom';
export const BRANDING_CACHE_KEY = 'spirit-billing-branding';

const ATTR_KEYS = [
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

export type ThemeDomCache = {
  attrs: Partial<Record<(typeof ATTR_KEYS)[number], string>>;
  vars: Record<string, string>;
  title?: string;
};

export function persistThemeDomCache() {
  try {
    const root = document.documentElement;
    const attrs: ThemeDomCache['attrs'] = {};
    for (const key of ATTR_KEYS) {
      const value = root.getAttribute(key);
      if (value) attrs[key] = value;
    }
    const vars: Record<string, string> = {};
    for (let i = 0; i < root.style.length; i += 1) {
      const name = root.style.item(i);
      if (!name.startsWith('--')) continue;
      const value = root.style.getPropertyValue(name).trim();
      if (value) vars[name] = value;
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
    const cache = JSON.parse(source) as ThemeDomCache;
    if (!cache || typeof cache !== 'object') return false;
    const root = document.documentElement;
    if (cache.attrs) {
      for (const [key, value] of Object.entries(cache.attrs)) {
        if (typeof value === 'string' && value) root.setAttribute(key, value);
      }
    }
    if (cache.vars) {
      for (const [key, value] of Object.entries(cache.vars)) {
        if (typeof value === 'string' && value) root.style.setProperty(key, value);
      }
    }
    if (typeof cache.title === 'string' && cache.title.trim()) {
      document.title = cache.title;
    }
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
