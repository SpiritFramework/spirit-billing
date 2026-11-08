import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_SLUG = 'SpiritFramework/spirit-billing';
const REPO_URL = `https://github.com/${REPO_SLUG}`;
const RELEASES_URL = `${REPO_URL}/releases`;
const CHANGELOG_URL = `${REPO_URL}/blob/main/docs/CHANGELOG.md`;
const INSTALL_DOCS_URL = `${REPO_URL}/blob/main/deploy/INSTALL.md`;
const INSTALLER_URL =
  'https://raw.githubusercontent.com/SpiritFramework/spirit-billing/main/scripts/spirit.sh';
const PANEL_URL = 'https://github.com/SpiritFramework/SpiritPanel';

const startedAt = Date.now();

function packageJsonPath() {
  return join(dirname(fileURLToPath(import.meta.url)), '../../package.json');
}

function spiritShPath() {
  return join(dirname(fileURLToPath(import.meta.url)), '../../../scripts/spirit.sh');
}

export function getBillingVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(packageJsonPath(), 'utf8')) as { version?: string };
    return typeof pkg.version === 'string' && pkg.version.trim() ? pkg.version.trim() : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export function getInstallerVersion(): string {
  try {
    const raw = readFileSync(spiritShPath(), 'utf8');
    const match = raw.match(/^SCRIPT_VERSION="([^"]+)"/m);
    return match?.[1] || 'unknown';
  } catch {
    return 'unknown';
  }
}

function normalizeTag(tag: string): string {
  return tag.trim().replace(/^v/i, '');
}

/** Compare semver-ish strings (v-prefix optional). Returns 1 if a>b, -1 if a<b, 0 if equal/unknown. */
export function compareSemver(a: string, b: string): number {
  const pa = normalizeTag(a).split('.').map((part) => Number.parseInt(part, 10));
  const pb = normalizeTag(b).split('.').map((part) => Number.parseInt(part, 10));
  if (pa.some((n) => Number.isNaN(n)) || pb.some((n) => Number.isNaN(n))) return 0;
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const left = pa[i] ?? 0;
    const right = pb[i] ?? 0;
    if (left > right) return 1;
    if (left < right) return -1;
  }
  return 0;
}

export type LatestReleaseInfo = {
  tag: string;
  name: string | null;
  url: string;
  publishedAt: string | null;
} | null;

export async function fetchLatestRelease(): Promise<LatestReleaseInfo> {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO_SLUG}/releases/latest`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': `spirit-billing/${getBillingVersion()}`,
      },
      signal: AbortSignal.timeout(6_000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      tag_name?: string;
      name?: string | null;
      html_url?: string;
      published_at?: string | null;
      draft?: boolean;
      prerelease?: boolean;
    };
    if (!body.tag_name || body.draft || body.prerelease) return null;
    return {
      tag: body.tag_name,
      name: body.name || null,
      url: body.html_url || `${RELEASES_URL}/tag/${body.tag_name}`,
      publishedAt: body.published_at || null,
    };
  } catch {
    return null;
  }
}

function formatUptime(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export async function getAboutPayload() {
  const version = getBillingVersion();
  const installerVersion = getInstallerVersion();
  const latest = await fetchLatestRelease();
  const updateAvailable = latest ? compareSemver(latest.tag, version) > 0 : false;
  const updateMenu =
    'curl -fsSL https://raw.githubusercontent.com/SpiritFramework/spirit-billing/main/scripts/spirit.sh -o /tmp/spirit-billing.sh && sudo bash /tmp/spirit-billing.sh';

  return {
    product: 'Spirit-Billing',
    tagline: 'Client billing & storefront for Spirit Host',
    blurb:
      'Branded storefront, invoices, credits, support, and admin ops — with Spirit-Panel provisioning when invoices are paid.',
    version,
    installerVersion,
    updateAvailable,
    latestRelease: latest,
    runtime: {
      node: process.version,
      platform: `${process.platform}/${process.arch}`,
      env: process.env.NODE_ENV === 'production' ? 'production' : 'development',
      uptime: formatUptime(Date.now() - startedAt),
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    },
    stack: [
      { id: 'web', label: 'billing-web', detail: 'React + Vite' },
      { id: 'api', label: 'billing-api', detail: 'Fastify + Prisma' },
      { id: 'db', label: 'Database', detail: 'MariaDB / MySQL' },
      { id: 'panel', label: 'Spirit-Panel', detail: 'Application API' },
    ],
    capabilities: [
      {
        id: 'storefront',
        label: 'Storefront',
        detail: 'Plans, cart, coupons, guest browse',
      },
      {
        id: 'client',
        label: 'Client area',
        detail: 'Services, invoices, credits, tickets',
      },
      {
        id: 'admin',
        label: 'Admin ops',
        detail: 'Users, fleet, ledger, catalog, logs',
      },
      {
        id: 'provision',
        label: 'Provisioning',
        detail: 'Panel users & servers on pay',
      },
      {
        id: 'brand',
        label: 'Branding',
        detail: 'Themes, atmospheres, assets',
      },
      {
        id: 'security',
        label: 'Access',
        detail: 'Maintenance, signup, Turnstile',
      },
    ],
    links: {
      repo: REPO_URL,
      releases: RELEASES_URL,
      changelog: CHANGELOG_URL,
      installDocs: INSTALL_DOCS_URL,
      installer: INSTALLER_URL,
      panel: PANEL_URL,
    },
    channels: [
      {
        id: 'menu',
        label: 'Installer menu',
        hint: 'Download script, then choose Update',
        command: updateMenu,
      },
      {
        id: 'dev',
        label: 'Update · dev channel',
        hint: 'Tracks main (latest commits)',
        command: `${updateMenu} update --channel dev -y`,
      },
      {
        id: 'release',
        label: 'Update · release channel',
        hint: 'Latest GitHub Release tag',
        command: `${updateMenu} update --channel release -y`,
      },
    ],
    updateHint: updateMenu,
    license: 'See repository LICENSE',
    builtBy: 'SpiritFramework',
  };
}
