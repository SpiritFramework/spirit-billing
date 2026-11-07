export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler | null = null;

/** AuthProvider registers this so 401 responses clear the in-memory session. */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  onUnauthorized = handler;
}

/** Only allow http(s) URLs for target=_blank / external links. */
export function safeExternalHref(url: string | null | undefined): string | undefined {
  const value = url?.trim();
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.toString();
  } catch {
    /* ignore */
  }
  return undefined;
}

/** External http(s) or local branding upload path suitable for <img src>. */
export function isBrandAssetUrl(url: string | null | undefined): boolean {
  const value = url?.trim();
  if (!value) return false;
  if (/^\/uploads\/branding\/[\w.\-]+$/.test(value)) return true;
  return /^https?:\/\//i.test(value);
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? 'GET').toUpperCase();
  const needsBody = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
  const hasBody = init?.body !== undefined && init?.body !== null;
  const headers = new Headers(init?.headers);

  let requestBody = init?.body;
  if (needsBody && !hasBody) {
    requestBody = '{}';
  }
  const isFormData = typeof FormData !== 'undefined' && requestBody instanceof FormData;
  if ((needsBody || hasBody) && !isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: 'include',
    headers,
    body: requestBody,
  });

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    // Session probe is expected to 401 when logged out — don't treat as forced logout noise.
    if (
      res.status === 401 &&
      path !== '/auth/me' &&
      !path.startsWith('/auth/login') &&
      !path.startsWith('/auth/register')
    ) {
      onUnauthorized?.();
    }
    const msg =
      data && typeof data === 'object' && data !== null && 'error' in data
        ? String((data as { error: unknown }).error)
        : `Request failed (${res.status})`;
    throw new ApiError(msg, res.status);
  }

  return data as T;
}

export function money(cents: number, currency = 'GBP'): string {
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

export function statusBadge(status: string): string {
  if (status === 'paid' || status === 'active') return 'ds-badge ds-badge--success';
  if (status === 'unpaid' || status === 'pending_payment') return 'ds-badge ds-badge--warning';
  if (status === 'cancelled' || status === 'suspended') return 'ds-badge ds-badge--danger';
  return 'ds-badge';
}
