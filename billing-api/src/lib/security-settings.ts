import { getSetting, setSetting } from './billing.js';
import { decryptSecret, encryptSecret } from './panel-config.js';

const MAINTENANCE_ENABLED = 'maintenance_mode';
const MAINTENANCE_MESSAGE = 'maintenance_message';
const REGISTRATION_ENABLED = 'registration_enabled';
const TICKETS_ENABLED = 'tickets_enabled';
const TURNSTILE_ENABLED = 'turnstile_enabled';
const TURNSTILE_SITE_KEY = 'turnstile_site_key';
const TURNSTILE_SECRET_ENC = 'turnstile_secret_key_enc';

const DEFAULT_MAINTENANCE_MESSAGE =
  'Billing is temporarily down for maintenance. Please check back soon.';

export type SecuritySettings = {
  maintenanceMode: boolean;
  maintenanceMessage: string;
  registrationEnabled: boolean;
  ticketsEnabled: boolean;
  turnstileEnabled: boolean;
  turnstileSiteKey: string;
  turnstileSecretConfigured: boolean;
  turnstileSecretMasked: string;
};

function maskSecret(secret: string): string {
  const trimmed = secret.trim();
  if (!trimmed) return '';
  if (trimmed.length < 8) return '••••••••';
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
}

async function readTurnstileSecret(): Promise<string> {
  const stored = await getSetting(TURNSTILE_SECRET_ENC, '');
  if (!stored) return '';
  try {
    return decryptSecret(stored);
  } catch {
    return '';
  }
}

export async function getSecuritySettings(): Promise<SecuritySettings> {
  const secret = await readTurnstileSecret();
  const maintenanceMode = (await getSetting(MAINTENANCE_ENABLED, 'false')) === 'true';
  const registrationEnabled = (await getSetting(REGISTRATION_ENABLED, 'true')) === 'true';
  const ticketsEnabled = (await getSetting(TICKETS_ENABLED, 'true')) === 'true';
  const turnstileEnabled = (await getSetting(TURNSTILE_ENABLED, 'false')) === 'true';
  const turnstileSiteKey = (await getSetting(TURNSTILE_SITE_KEY, '')).trim();

  return {
    maintenanceMode,
    maintenanceMessage:
      (await getSetting(MAINTENANCE_MESSAGE, DEFAULT_MAINTENANCE_MESSAGE)).trim() ||
      DEFAULT_MAINTENANCE_MESSAGE,
    registrationEnabled,
    ticketsEnabled,
    turnstileEnabled,
    turnstileSiteKey,
    turnstileSecretConfigured: Boolean(secret),
    turnstileSecretMasked: maskSecret(secret),
  };
}

export async function getPublicSecurityConfig() {
  const settings = await getSecuritySettings();
  const turnstileActive =
    settings.turnstileEnabled && Boolean(settings.turnstileSiteKey) && settings.turnstileSecretConfigured;

  return {
    maintenanceMode: settings.maintenanceMode,
    maintenanceMessage: settings.maintenanceMessage,
    registrationEnabled: settings.registrationEnabled,
    ticketsEnabled: settings.ticketsEnabled,
    turnstileEnabled: turnstileActive,
    turnstileSiteKey: turnstileActive ? settings.turnstileSiteKey : '',
  };
}

export async function isMaintenanceMode(): Promise<boolean> {
  return (await getSetting(MAINTENANCE_ENABLED, 'false')) === 'true';
}

export async function saveSecuritySettings(input: {
  maintenanceMode?: boolean;
  maintenanceMessage?: string;
  registrationEnabled?: boolean;
  ticketsEnabled?: boolean;
  turnstileEnabled?: boolean;
  turnstileSiteKey?: string;
  turnstileSecretKey?: string;
}): Promise<SecuritySettings> {
  if (input.maintenanceMode !== undefined) {
    await setSetting(MAINTENANCE_ENABLED, input.maintenanceMode ? 'true' : 'false');
  }

  if (input.maintenanceMessage !== undefined) {
    const message = input.maintenanceMessage.trim().slice(0, 500);
    await setSetting(MAINTENANCE_MESSAGE, message || DEFAULT_MAINTENANCE_MESSAGE);
  }

  if (input.registrationEnabled !== undefined) {
    await setSetting(REGISTRATION_ENABLED, input.registrationEnabled ? 'true' : 'false');
  }

  if (input.ticketsEnabled !== undefined) {
    await setSetting(TICKETS_ENABLED, input.ticketsEnabled ? 'true' : 'false');
  }

  if (input.turnstileSiteKey !== undefined) {
    await setSetting(TURNSTILE_SITE_KEY, input.turnstileSiteKey.trim().slice(0, 200));
  }

  if (input.turnstileSecretKey !== undefined) {
    const secret = input.turnstileSecretKey.trim();
    if (!secret) {
      await setSetting(TURNSTILE_SECRET_ENC, '');
    } else {
      await setSetting(TURNSTILE_SECRET_ENC, encryptSecret(secret));
    }
  }

  const afterKeys = await getSecuritySettings();
  const wantEnabled = input.turnstileEnabled ?? afterKeys.turnstileEnabled;
  if (wantEnabled && (!afterKeys.turnstileSiteKey || !afterKeys.turnstileSecretConfigured)) {
    throw Object.assign(
      new Error('Turnstile requires both a site key and a secret key before it can be enabled.'),
      { statusCode: 422 },
    );
  }

  if (input.turnstileEnabled !== undefined) {
    await setSetting(TURNSTILE_ENABLED, input.turnstileEnabled ? 'true' : 'false');
  }

  return getSecuritySettings();
}
