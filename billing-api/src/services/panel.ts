import { getPanelConnectionConfig } from '../lib/panel-config.js';
import { assertSafeOutboundUrl } from '../lib/url-safety.js';
import { recordLogFireAndForget } from '../lib/system-log.js';

export class PanelApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

function panelPathLabel(path: string) {
  return path.split('?')[0] || path;
}

function shouldLogPanelSuccess(method: string, path: string) {
  const normalized = method.toUpperCase();
  if (normalized !== 'GET') return true;
  // Skip noisy catalog polling successes; failures are still logged.
  return !(
    path.startsWith('/eggs') ||
    path.startsWith('/nodes') ||
    path.startsWith('/servers') ||
    path.startsWith('/users?')
  );
}

async function panelFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method || 'GET').toUpperCase();
  const started = Date.now();
  const { panelApiUrl, panelApplicationApiKey, panelKeyConfigured } = await getPanelConnectionConfig();
  if (!panelKeyConfigured) {
    const err = new PanelApiError(
      'Spirit-Panel Application API key is not configured. Set it in Admin → Settings.',
      503,
    );
    recordLogFireAndForget({
      level: 'error',
      category: 'panel',
      action: 'panel.request',
      message: err.message,
      method,
      path: panelPathLabel(path),
      statusCode: 503,
      durationMs: Date.now() - started,
    });
    throw err;
  }

  let safeBase: string;
  try {
    safeBase = await assertSafeOutboundUrl(panelApiUrl, 'Panel API URL');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid panel URL';
    recordLogFireAndForget({
      level: 'error',
      category: 'panel',
      action: 'panel.request',
      message,
      method,
      path: panelPathLabel(path),
      statusCode: 422,
      durationMs: Date.now() - started,
    });
    throw new PanelApiError(message, 422);
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${panelApplicationApiKey}`,
    ...(init?.headers as Record<string, string> | undefined),
  };
  // Fastify rejects empty bodies when Content-Type is application/json.
  if (init?.body != null) {
    headers['Content-Type'] = headers['Content-Type'] ?? 'application/json';
  }

  let res: Response;
  try {
    res = await fetch(`${safeBase}/api/application${path}`, {
      ...init,
      redirect: 'manual',
      headers,
      signal: init?.signal ?? AbortSignal.timeout(20_000),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Panel request failed';
    const timedOut =
      (err instanceof Error && err.name === 'TimeoutError') ||
      /abort|timeout/i.test(message);
    const status = timedOut ? 504 : 502;
    const finalMessage = timedOut ? 'Spirit-Panel request timed out' : 'Could not reach Spirit-Panel';
    recordLogFireAndForget({
      level: 'error',
      category: 'panel',
      action: 'panel.request',
      message: finalMessage,
      method,
      path: panelPathLabel(path),
      statusCode: status,
      durationMs: Date.now() - started,
      meta: { detail: message },
    });
    throw new PanelApiError(finalMessage, status);
  }

  if (res.status >= 300 && res.status < 400) {
    recordLogFireAndForget({
      level: 'error',
      category: 'panel',
      action: 'panel.request',
      message: 'Panel API returned an unexpected redirect',
      method,
      path: panelPathLabel(path),
      statusCode: res.status,
      durationMs: Date.now() - started,
    });
    throw new PanelApiError('Panel API returned an unexpected redirect', 502);
  }

  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  const durationMs = Date.now() - started;

  if (!res.ok) {
    const msg =
      body && typeof body === 'object' && body !== null && 'error' in body
        ? String((body as { error: unknown }).error)
        : `Panel API error (${res.status})`;
    const finalMessage =
      res.status === 404 && (path.startsWith('/eggs') || path.startsWith('/nodes'))
        ? 'Panel is missing /api/application/eggs or /nodes. Deploy the Spirit-Panel Application API updates, or paste egg/node IDs manually.'
        : msg;
    recordLogFireAndForget({
      level: res.status >= 500 ? 'error' : 'warn',
      category: 'panel',
      action: 'panel.request',
      message: finalMessage,
      method,
      path: panelPathLabel(path),
      statusCode: res.status,
      durationMs,
      meta: typeof body === 'object' ? body : { body: String(body).slice(0, 200) },
    });
    throw new PanelApiError(finalMessage, res.status, body);
  }

  if (shouldLogPanelSuccess(method, path)) {
    recordLogFireAndForget({
      level: 'info',
      category: 'panel',
      action: 'panel.request',
      message: `Panel ${method} ${panelPathLabel(path)} OK`,
      method,
      path: panelPathLabel(path),
      statusCode: res.status,
      durationMs,
    });
  }

  return body as T;
}

export type PanelUser = {
  id: string;
  uuid: string;
  email: string;
  username: string;
  firstName?: string | null;
  lastName?: string | null;
};

export type PanelServer = {
  id: string;
  uuid: string;
  name: string;
  externalId?: string | null;
  ownerId?: string;
  eggId?: string;
  memory?: number;
  disk?: number;
  cpu?: number;
  backupLimit?: number;
  databaseLimit?: number;
  allocationLimit?: number;
  suspended?: boolean;
  owner?: { email?: string | null } | null;
};

export type PanelNode = {
  id: string;
  name: string;
  fqdn: string;
  maintenanceMode: boolean;
  memory?: number;
  disk?: number;
  location?: { id?: string; short: string; long: string };
  _count?: { servers?: number; allocations?: number };
};

export type PanelEgg = {
  id: string;
  name: string;
  description?: string;
  nest?: { id: string; name: string };
};

export async function findPanelUserByEmail(email: string): Promise<PanelUser | null> {
  const users = await panelFetch<PanelUser[]>(
    `/users?email=${encodeURIComponent(email.trim().toLowerCase())}`,
  );
  return users[0] ?? null;
}

export async function createPanelUser(input: {
  email: string;
  username: string;
  password: string;
  firstName?: string;
  lastName?: string;
}): Promise<PanelUser> {
  return panelFetch<PanelUser>('/users', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function getPanelUser(
  panelUserId: string,
  opts?: { timeoutMs?: number },
): Promise<PanelUser> {
  return panelFetch<PanelUser>(`/users/${panelUserId}`, {
    signal: AbortSignal.timeout(opts?.timeoutMs ?? 8_000),
  });
}

export async function updatePanelUser(
  panelUserId: string,
  input: {
    email?: string;
    username?: string;
    firstName?: string | null;
    lastName?: string | null;
    avatarUrl?: string | null;
    password?: string;
  },
): Promise<PanelUser> {
  return panelFetch<PanelUser>(`/users/${panelUserId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function deletePanelUser(panelUserId: string): Promise<void> {
  await panelFetch<{ deleted: true }>(`/users/${panelUserId}`, {
    method: 'DELETE',
  });
}

export async function listPanelNodes(): Promise<PanelNode[]> {
  return panelFetch<PanelNode[]>('/nodes');
}

export async function listPanelEggs(): Promise<PanelEgg[]> {
  return panelFetch<PanelEgg[]>('/eggs');
}

export async function listPanelServers(): Promise<PanelServer[]> {
  return panelFetch<PanelServer[]>('/servers');
}

export async function createPanelServer(input: {
  ownerId: string;
  nodeId: string;
  eggId: string;
  name: string;
  externalId?: string;
  memory?: number;
  disk?: number;
  cpu?: number;
  backupLimit?: number;
  databaseLimit?: number;
  allocationLimit?: number;
  subdomainAccess?: boolean;
  fivemMarketplaceAccess?: boolean;
  minecraftPluginsAccess?: boolean;
}): Promise<PanelServer> {
  return panelFetch<PanelServer>('/servers', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function findPanelServerByExternalId(externalId: string): Promise<PanelServer | null> {
  const servers = await panelFetch<PanelServer[]>(
    `/servers?externalId=${encodeURIComponent(externalId)}`,
  );
  return servers[0] ?? null;
}

export async function updatePanelServer(
  serverId: string,
  input: {
    name?: string;
    memory?: number;
    disk?: number;
    cpu?: number;
    backupLimit?: number;
    databaseLimit?: number;
    allocationLimit?: number;
    subdomainAccess?: boolean;
    fivemMarketplaceAccess?: boolean;
    minecraftPluginsAccess?: boolean;
  },
): Promise<PanelServer> {
  return panelFetch<PanelServer>(`/servers/${serverId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function deletePanelServer(serverId: string): Promise<void> {
  await panelFetch<{ deleted: true }>(`/servers/${serverId}`, {
    method: 'DELETE',
  });
}

export async function suspendPanelServer(serverId: string): Promise<void> {
  await panelFetch(`/servers/${serverId}/suspend`, { method: 'POST' });
}

export async function unsuspendPanelServer(serverId: string): Promise<void> {
  await panelFetch(`/servers/${serverId}/unsuspend`, { method: 'POST' });
}
