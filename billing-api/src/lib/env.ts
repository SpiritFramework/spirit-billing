import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '../../.env');

function loadDotEnv() {
  config({ path: envPath, override: process.env.NODE_ENV !== 'production' });
}

loadDotEnv();

export interface AppConfig {
  nodeEnv: string;
  isProduction: boolean;
  port: number;
  host: string;
  databaseUrl: string;
  jwtSecret: string;
  secretsEncryptionKey: string;
  billingUrl: string;
  corsOrigins: string[];
  panelApiUrl: string;
  panelWebUrl: string;
  panelApplicationApiKey: string;
  panelAllowPrivateUrls: boolean;
  invoicePrefix: string;
  defaultCurrency: string;
  companyName: string;
  paymentInstructions: string;
}

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function loadConfig(): AppConfig {
  loadDotEnv();
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const isProduction = nodeEnv === 'production';
  const billingUrl = process.env.BILLING_URL ?? 'http://localhost:5174';

  const jwtSecret = requireEnv('JWT_SECRET', isProduction ? undefined : 'dev-billing-secret-change-me');
  if (isProduction && (jwtSecret.length < 32 || jwtSecret.includes('change-me'))) {
    throw new Error('JWT_SECRET must be a strong secret in production');
  }

  const secretsEncryptionKey = process.env.SECRETS_ENCRYPTION_KEY || jwtSecret;
  if (isProduction) {
    if (!process.env.SECRETS_ENCRYPTION_KEY) {
      throw new Error('SECRETS_ENCRYPTION_KEY must be set separately from JWT_SECRET in production');
    }
    if (secretsEncryptionKey === jwtSecret) {
      throw new Error('SECRETS_ENCRYPTION_KEY must differ from JWT_SECRET in production');
    }
    if (secretsEncryptionKey.length < 32 || secretsEncryptionKey.includes('change-me')) {
      throw new Error('SECRETS_ENCRYPTION_KEY must be a strong secret in production');
    }
  } else if (secretsEncryptionKey.length < 32 || secretsEncryptionKey.includes('change-me')) {
    // allow weak keys only outside production when falling back to jwtSecret
  }

  return {
    nodeEnv,
    isProduction,
    port: Number(process.env.PORT ?? 3001),
    host: process.env.HOST ?? (isProduction ? '127.0.0.1' : '0.0.0.0'),
    databaseUrl: requireEnv('DATABASE_URL'),
    jwtSecret,
    secretsEncryptionKey,
    billingUrl: billingUrl.replace(/\/$/, ''),
    corsOrigins: (process.env.CORS_ORIGINS ?? billingUrl)
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    panelApiUrl: (process.env.PANEL_API_URL ?? 'http://localhost:3000').replace(/\/$/, ''),
    panelWebUrl: (process.env.PANEL_WEB_URL ?? 'http://localhost:5173').replace(/\/$/, ''),
    panelApplicationApiKey: process.env.PANEL_APPLICATION_API_KEY ?? '',
    panelAllowPrivateUrls: process.env.PANEL_ALLOW_PRIVATE_URLS === 'true',
    invoicePrefix: process.env.INVOICE_PREFIX ?? 'INV',
    defaultCurrency: process.env.DEFAULT_CURRENCY ?? 'GBP',
    companyName: process.env.COMPANY_NAME ?? 'Spirit Host',
    paymentInstructions:
      process.env.PAYMENT_INSTRUCTIONS ??
      'Pay by bank transfer and include your invoice number as the reference.',
  };
}

let cached: AppConfig | null = null;

export function getConfig(): AppConfig {
  // Reload env in development so .env edits apply without a full process restart confusion
  if (!cached || process.env.NODE_ENV !== 'production') {
    cached = loadConfig();
  }
  return cached;
}
