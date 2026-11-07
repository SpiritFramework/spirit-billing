import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { getConfig } from './env.js';
import { getSetting } from './billing.js';

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

/** Normalize IPv4-mapped / IPv4-compatible IPv6 to plain IPv4 when possible. */
function normalizeIp(hostname: string): string {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const mapped = host.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (mapped) return mapped[1];
  const hexMapped = host.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (hexMapped) {
    const hi = Number.parseInt(hexMapped[1], 16);
    const lo = Number.parseInt(hexMapped[2], 16);
    return `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
  }
  return host;
}

function isPrivateOrLocalHost(hostname: string): boolean {
  const host = normalizeIp(hostname);

  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host === '0.0.0.0' ||
    host === '::' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host === 'metadata.google.internal'
  ) {
    return true;
  }

  if (isIP(host) === 4) {
    const n = ipv4ToInt(host);
    const ranges: Array<[number, number]> = [
      [ipv4ToInt('0.0.0.0'), ipv4ToInt('0.255.255.255')],
      [ipv4ToInt('10.0.0.0'), ipv4ToInt('10.255.255.255')],
      [ipv4ToInt('127.0.0.0'), ipv4ToInt('127.255.255.255')],
      [ipv4ToInt('169.254.0.0'), ipv4ToInt('169.254.255.255')],
      [ipv4ToInt('172.16.0.0'), ipv4ToInt('172.31.255.255')],
      [ipv4ToInt('192.168.0.0'), ipv4ToInt('192.168.255.255')],
    ];
    return ranges.some(([start, end]) => n >= start && n <= end);
  }

  if (isIP(host) === 6) {
    const h = host.toLowerCase();
    return (
      h === '::1' ||
      h.startsWith('fc') ||
      h.startsWith('fd') ||
      h.startsWith('fe80') ||
      h.startsWith('::ffff:')
    );
  }

  return false;
}

/** Always blocked — cloud metadata / link-local abuse targets. */
function isBlockedHost(hostname: string): boolean {
  const host = normalizeIp(hostname);
  if (host === '169.254.169.254' || host === 'metadata.google.internal') return true;
  if (isIP(host) === 4) {
    const n = ipv4ToInt(host);
    return n >= ipv4ToInt('169.254.0.0') && n <= ipv4ToInt('169.254.255.255');
  }
  return false;
}

export function parseHttpUrl(raw: string, label = 'URL'): URL {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw Object.assign(new Error(`${label} is required`), { statusCode: 422 });
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw Object.assign(new Error(`${label} must be a valid http(s) URL`), { statusCode: 422 });
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw Object.assign(new Error(`${label} must use http or https`), { statusCode: 422 });
  }
  if (parsed.username || parsed.password) {
    throw Object.assign(new Error(`${label} must not include credentials`), { statusCode: 422 });
  }
  return parsed;
}

export function isSafeHttpUrl(value: string): boolean {
  try {
    parseHttpUrl(value);
    return true;
  } catch {
    return false;
  }
}

/** External http(s) or local branding upload path. */
export function isBrandAssetUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^\/uploads\/branding\/[\w.\-]+$/.test(trimmed)) return true;
  return isSafeHttpUrl(trimmed);
}

export function sanitizeHexColor(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  return /^#[0-9a-fA-F]{6}$/.test(value.trim()) ? value.trim() : fallback;
}

/**
 * Validate outbound panel/admin URLs before server-side fetch (SSRF guard).
 * Private/loopback hosts are allowed in development; blocked in production unless
 * PANEL_ALLOW_PRIVATE_URLS=true, the admin setting is enabled, or options.allowPrivate.
 */
export async function assertSafeOutboundUrl(
  raw: string,
  label = 'URL',
  options?: { allowPrivate?: boolean },
): Promise<string> {
  const parsed = parseHttpUrl(raw, label);
  const host = parsed.hostname;

  if (isBlockedHost(host)) {
    throw Object.assign(new Error(`${label} points to a blocked host`), { statusCode: 422 });
  }

  const config = getConfig();
  const allowPrivateSetting = (await getSetting('panel_allow_private_urls', 'false')) === 'true';
  const allowPrivate =
    options?.allowPrivate === true ||
    !config.isProduction ||
    config.panelAllowPrivateUrls ||
    allowPrivateSetting;

  if (isPrivateOrLocalHost(host) && !allowPrivate) {
    throw Object.assign(
      new Error(
        `${label} cannot target private or local network addresses in production. Enable “Allow private panel URLs” in Admin → Settings → Spirit-Panel, or set PANEL_ALLOW_PRIVATE_URLS=true.`,
      ),
      { statusCode: 422 },
    );
  }

  // Resolve DNS and re-check the resolved address (DNS rebinding mitigation).
  if (isIP(host) === 0) {
    try {
      const results = await lookup(host, { all: true });
      for (const entry of results) {
        if (isBlockedHost(entry.address)) {
          throw Object.assign(new Error(`${label} resolves to a blocked host`), { statusCode: 422 });
        }
        if (isPrivateOrLocalHost(entry.address) && !allowPrivate) {
          throw Object.assign(
            new Error(`${label} resolves to a private network address`),
            { statusCode: 422 },
          );
        }
      }
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode === 422) throw err;
      throw Object.assign(new Error(`${label} hostname could not be resolved`), { statusCode: 422 });
    }
  }

  return parsed.toString().replace(/\/$/, '');
}
