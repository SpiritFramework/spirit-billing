import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { getConfig } from './env.js';
import { getSetting, setSetting } from './billing.js';
import { assertSafeOutboundUrl, parseHttpUrl } from './url-safety.js';

const KEY_SETTING = 'panel_application_api_key_enc';
const API_URL_SETTING = 'panel_api_url';
const WEB_URL_SETTING = 'panel_web_url';

const CONFIG_CACHE_TTL_MS = 30_000;
let cachedConfig: { value: PanelConnectionConfig; expiresAt: number } | null = null;

function encryptionKey(): Buffer {
  return createHash('sha256').update(getConfig().secretsEncryptionKey).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${enc.toString('base64url')}`;
}

export function decryptSecret(payload: string): string {
  if (!payload.startsWith('v1.')) {
    if (getConfig().isProduction) {
      throw new Error('Refusing plaintext secret in production');
    }
    return payload;
  }
  const [, ivB64, tagB64, dataB64] = payload.split('.');
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Invalid encrypted secret');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivB64, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

function isConfiguredKey(key: string): boolean {
  return Boolean(key && !key.includes('identifier.secret') && key.startsWith('sp_'));
}

export function maskApiKey(key: string): string {
  if (!isConfiguredKey(key)) return '';
  const bare = key.startsWith('sp_') ? key.slice(3) : key;
  if (bare.length < 12) return 'sp_••••••••';
  return `sp_${bare.slice(0, 6)}…${bare.slice(-4)}`;
}

export type PanelConnectionConfig = {
  panelApiUrl: string;
  panelWebUrl: string;
  panelApplicationApiKey: string;
  panelKeyConfigured: boolean;
  panelKeyMasked: string;
  panelAllowPrivateUrls: boolean;
};

export function invalidatePanelConnectionCache() {
  cachedConfig = null;
}

async function loadPanelConnectionConfig(): Promise<PanelConnectionConfig> {
  const env = getConfig();
  const apiUrl = (await getSetting(API_URL_SETTING, env.panelApiUrl)).replace(/\/$/, '');
  const webUrl = (await getSetting(WEB_URL_SETTING, env.panelWebUrl)).replace(/\/$/, '');
  const panelAllowPrivateUrls =
    env.panelAllowPrivateUrls || (await getSetting('panel_allow_private_urls', 'false')) === 'true';

  let key = '';
  const stored = await getSetting(KEY_SETTING, '');
  if (stored) {
    try {
      key = decryptSecret(stored);
    } catch (err) {
      console.error(
        '[security] Failed to decrypt Panel API key — panel calls may fail until the key is re-saved in Admin → Settings.',
        err instanceof Error ? err.message : err,
      );
      key = '';
    }
  }
  if (!isConfiguredKey(key)) {
    key = env.panelApplicationApiKey;
  }

  return {
    panelApiUrl: apiUrl || env.panelApiUrl,
    panelWebUrl: webUrl || env.panelWebUrl,
    panelApplicationApiKey: key,
    panelKeyConfigured: isConfiguredKey(key),
    panelKeyMasked: maskApiKey(key),
    panelAllowPrivateUrls,
  };
}

export async function getPanelConnectionConfig(): Promise<PanelConnectionConfig> {
  const now = Date.now();
  if (cachedConfig && cachedConfig.expiresAt > now) {
    return cachedConfig.value;
  }
  const value = await loadPanelConnectionConfig();
  cachedConfig = { value, expiresAt: now + CONFIG_CACHE_TTL_MS };
  return value;
}

export async function savePanelConnectionConfig(input: {
  panelApiUrl?: string;
  panelWebUrl?: string;
  panelApplicationApiKey?: string;
  panelAllowPrivateUrls?: boolean;
  clearPanelKey?: boolean;
}): Promise<PanelConnectionConfig> {
  if (input.panelAllowPrivateUrls !== undefined) {
    await setSetting('panel_allow_private_urls', input.panelAllowPrivateUrls ? 'true' : 'false');
  }

  if (input.panelApiUrl !== undefined) {
    const url = await assertSafeOutboundUrl(input.panelApiUrl, 'Panel API URL');
    await setSetting(API_URL_SETTING, url);
  }

  if (input.panelWebUrl !== undefined) {
    // Web URL is opened in the browser, not fetched with the API key — still constrain to http(s).
    const parsed = parseHttpUrl(input.panelWebUrl, 'Panel web URL');
    await setSetting(WEB_URL_SETTING, parsed.toString().replace(/\/$/, ''));
  }

  if (input.clearPanelKey) {
    await setSetting(KEY_SETTING, '');
  } else if (input.panelApplicationApiKey !== undefined) {
    const key = input.panelApplicationApiKey.trim();
    if (!key) {
      // Leave blank = keep existing key (do not clear).
    } else {
      if (!key.startsWith('sp_') || !key.includes('.')) {
        throw Object.assign(
          new Error('Application API key must look like sp_identifier.secret'),
          { statusCode: 422 },
        );
      }
      await setSetting(KEY_SETTING, encryptSecret(key));
    }
  }

  invalidatePanelConnectionCache();
  try {
    const { invalidatePanelCatalogCache } = await import('../services/panel.js');
    invalidatePanelCatalogCache();
  } catch {
    /* panel module may be loading */
  }
  return getPanelConnectionConfig();
}

export async function testPanelConnection(overrides?: {
  panelApiUrl?: string;
  panelApplicationApiKey?: string;
  panelAllowPrivateUrls?: boolean;
}): Promise<{
  ok: boolean;
  latencyMs: number;
  usersFound?: number;
  brandingName?: string | null;
  error?: string;
  panelApiUrl: string;
}> {
  const current = await getPanelConnectionConfig();
  let panelApiUrl = (overrides?.panelApiUrl?.trim() || current.panelApiUrl).replace(/\/$/, '');
  const key = overrides?.panelApplicationApiKey?.trim() || current.panelApplicationApiKey;
  const allowPrivate =
    overrides?.panelAllowPrivateUrls === true || current.panelAllowPrivateUrls;

  try {
    panelApiUrl = await assertSafeOutboundUrl(panelApiUrl, 'Panel API URL', { allowPrivate });
  } catch (err) {
    return {
      ok: false,
      latencyMs: 0,
      error: err instanceof Error ? err.message : 'Invalid panel URL',
      panelApiUrl,
    };
  }

  if (!isConfiguredKey(key)) {
    return {
      ok: false,
      latencyMs: 0,
      error: 'Application API key is not configured',
      panelApiUrl,
    };
  }

  const started = Date.now();
  try {
    const usersRes = await fetch(`${panelApiUrl}/api/application/users`, {
      redirect: 'manual',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(10_000),
    });
    const latencyMs = Date.now() - started;
    if (usersRes.status >= 300 && usersRes.status < 400) {
      return { ok: false, latencyMs, error: 'Panel returned an unexpected redirect', panelApiUrl };
    }
    if (!usersRes.ok) {
      const status = usersRes.status;
      let error = `Panel returned ${status}`;
      if (status === 401) error = 'Unauthorized (401) — Application API key is invalid or revoked';
      else if (status === 403) error = 'Forbidden (403) — key lacks required Application scopes (users.read / users.write)';
      else if (status === 404) error = 'Not found (404) — panel-api Application routes may be outdated';
      else if (status === 429) error = 'Rate limited (429) — try again shortly';
      else if (status >= 500) error = `Panel server error (${status})`;
      return { ok: false, latencyMs, error, panelApiUrl };
    }

    const users = (await usersRes.json()) as unknown[];
    let brandingName: string | null = null;
    try {
      const brandRes = await fetch(`${panelApiUrl}/api/auth/branding`, {
        redirect: 'manual',
        signal: AbortSignal.timeout(5_000),
      });
      if (brandRes.ok) {
        const brand = (await brandRes.json()) as { panelName?: string };
        brandingName = typeof brand.panelName === 'string' ? brand.panelName : null;
      }
    } catch {
      /* optional */
    }

    return {
      ok: true,
      latencyMs,
      usersFound: Array.isArray(users) ? users.length : 0,
      brandingName,
      panelApiUrl,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Connection failed';
    const timedOut = /abort|timeout/i.test(message) || (err instanceof Error && err.name === 'TimeoutError');
    return {
      ok: false,
      latencyMs: Date.now() - started,
      error: timedOut
        ? 'Timed out reaching Spirit-Panel — check the API URL, firewall, and that panel-api is running'
        : message,
      panelApiUrl,
    };
  }
}
