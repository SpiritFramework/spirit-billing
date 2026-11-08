import { getSetting } from './billing.js';
import { decryptSecret } from './panel-config.js';
import { getSecuritySettings } from './security-settings.js';

interface TurnstileVerifyResponse {
  success: boolean;
  'error-codes'?: string[];
}

async function readTurnstileSecret(): Promise<string> {
  const stored = await getSetting('turnstile_secret_key_enc', '');
  if (!stored) return '';
  try {
    return decryptSecret(stored);
  } catch (err) {
    console.error(
      '[security] Failed to decrypt Turnstile secret — captcha verification will fail until the key is re-saved.',
      err instanceof Error ? err.message : err,
    );
    return '';
  }
}

export async function isTurnstileEnabled(): Promise<boolean> {
  const settings = await getSecuritySettings();
  return settings.turnstileEnabled && Boolean(settings.turnstileSiteKey) && settings.turnstileSecretConfigured;
}

export async function verifyTurnstileToken(token: string, remoteIp?: string): Promise<boolean> {
  const settings = await getSecuritySettings();
  if (!settings.turnstileEnabled) return true;

  const secretKey = await readTurnstileSecret();
  if (!secretKey || !token.trim()) return false;

  const body = new URLSearchParams({
    secret: secretKey,
    response: token,
  });
  if (remoteIp) body.set('remoteip', remoteIp);

  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(8_000),
  });

  if (!res.ok) return false;
  const data = (await res.json()) as TurnstileVerifyResponse;
  return Boolean(data.success);
}
