import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import { createReadStream, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ZodError } from 'zod/v3';
import { getConfig } from './lib/env.js';
import { recordLogFireAndForget, remapLegacyLogCategories } from './lib/system-log.js';
import { ensureDefaultTicketCategories } from './lib/tickets.js';
import { getUserFromRequest, hasSessionCookie, verifyCsrf } from './lib/auth.js';
import { isStaffOrAdmin } from './lib/roles.js';
import {
  ensureUploadsRoot,
  getUploadsRoot,
  readTicketUploadMeta,
  verifyTicketUploadSignature,
} from './lib/uploads.js';
import { repairInvalidProductFeatures } from './lib/product-features.js';
import { authRoutes } from './routes/auth.js';
import { clientRoutes } from './routes/client.js';
import { adminRoutes } from './routes/admin.js';
import { supportAdminRoutes, supportClientRoutes } from './routes/support.js';

const config = getConfig();
ensureUploadsRoot();
const app = Fastify({
  logger: true,
  // Honour X-Forwarded-For when behind nginx/Caddy so rate limits bind to real clients.
  trustProxy: config.isProduction,
});

await app.register(helmet, {
  global: true,
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  hsts: config.isProduction && config.billingUrl.startsWith('https:')
    ? { maxAge: 15552000, includeSubDomains: true }
    : false,
});

await app.register(cors, {
  origin: config.corsOrigins,
  credentials: true,
});

await app.register(cookie);
await app.register(multipart, {
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
  },
});

async function serveUploadFile(
  folder: 'tickets' | 'branding',
  name: string,
  reply: import('fastify').FastifyReply,
) {
  if (!/^[\w.\-]+$/.test(name)) {
    return reply.status(404).send({ error: 'Not found' });
  }
  const absolute = join(getUploadsRoot(), folder, name);
  if (!existsSync(absolute)) {
    return reply.status(404).send({ error: 'Not found' });
  }
  const ext = name.split('.').pop()?.toLowerCase();
  const type =
    ext === 'png' ? 'image/png'
      : ext === 'webp' ? 'image/webp'
        : ext === 'gif' ? 'image/gif'
          : 'image/jpeg';
  reply.header('Cache-Control', 'public, max-age=86400');
  reply.header('Cross-Origin-Resource-Policy', 'cross-origin');
  return reply.type(type).send(createReadStream(absolute));
}

/** Ticket images require a valid signature or an authenticated staff/owner session. */
app.get('/uploads/tickets/:name', async (request, reply) => {
  const { name } = request.params as { name: string };
  const query = request.query as { exp?: string; sig?: string };
  if (verifyTicketUploadSignature(name, query.exp, query.sig)) {
    reply.header('Cache-Control', 'private, max-age=300');
    return serveUploadFile('tickets', name, reply);
  }

  const user = await getUserFromRequest(request);
  if (!user) return reply.status(401).send({ error: 'Unauthorized' });
  if (isStaffOrAdmin(user.role)) {
    reply.header('Cache-Control', 'private, max-age=300');
    return serveUploadFile('tickets', name, reply);
  }
  const meta = await readTicketUploadMeta(name);
  if (meta?.userId === user.id) {
    reply.header('Cache-Control', 'private, max-age=300');
    return serveUploadFile('tickets', name, reply);
  }
  return reply.status(403).send({ error: 'Forbidden' });
});

app.get('/uploads/branding/:name', async (request, reply) => {
  const { name } = request.params as { name: string };
  return serveUploadFile('branding', name, reply);
});

app.addContentTypeParser('application/json', { parseAs: 'string' }, (_request, body, done) => {
  const text = typeof body === 'string' ? body : body.toString('utf8');
  if (!text || text.length === 0) {
    done(null, {});
    return;
  }
  try {
    done(null, JSON.parse(text));
  } catch (err) {
    done(err as Error, undefined);
  }
});

await app.register(rateLimit, {
  global: true,
  max: 200,
  timeWindow: '1 minute',
});

app.addHook('onRequest', async (request, reply) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return;
  const origin = request.headers.origin;
  const path = request.url.split('?')[0] || '';
  const cookieAuth = hasSessionCookie(request);
  // Cookie-authenticated browser mutations must present an allowed Origin.
  if (cookieAuth) {
    if (!origin || !config.corsOrigins.includes(origin)) {
      return reply.status(403).send({ error: 'Origin not allowed' });
    }
    // CSRF double-submit for session cookie mutations (login/register bootstrap without CSRF).
    const csrfExempt = path === '/api/auth/login' || path === '/api/auth/register';
    if (!csrfExempt && !verifyCsrf(request)) {
      return reply.status(403).send({ error: 'CSRF validation failed' });
    }
    return;
  }
  if (origin && !config.corsOrigins.includes(origin)) {
    return reply.status(403).send({ error: 'Origin not allowed' });
  }
});

app.setErrorHandler((err, request, reply) => {
  if (err instanceof ZodError) {
    const first = err.issues[0];
    const field = first?.path?.length ? first.path.join('.') : '';
    const msg = first
      ? field
        ? `${field}: ${first.message}`
        : first.message
      : 'Validation failed';
    app.log.warn({ issues: err.flatten() }, 'validation failed');
    return reply.status(422).send({ error: msg });
  }
  const status = (err as { statusCode?: number }).statusCode ?? 500;
  const message = err instanceof Error ? err.message : 'Internal server error';
  app.log.error(err);
  if (status >= 500) {
    const prismaCode = (err as { code?: string }).code;
    if (prismaCode) {
      app.log.error({ prismaCode, meta: (err as { meta?: unknown }).meta }, 'prisma error');
    }
    const actorId = (request as { user?: { id?: string } }).user?.id;
    recordLogFireAndForget({
      level: 'error',
      category: 'system',
      action: 'api.error',
      message: truncateLogMessage(message),
      actorUserId: actorId,
      ip: request.ip,
      method: request.method,
      path: request.url.split('?')[0],
      statusCode: status,
    });
  }
  return reply.status(status).send({
    error: status >= 500 ? 'Internal server error' : message,
  });
});

function truncateLogMessage(value: string) {
  return value.length > 500 ? `${value.slice(0, 499)}…` : value;
}

app.get('/health', async () => ({ ok: true }));
app.get('/api/health', async () => ({ ok: true }));

await app.register(authRoutes, { prefix: '/api/auth' });
await app.register(clientRoutes, { prefix: '/api/client' });
await app.register(supportClientRoutes, { prefix: '/api/client' });
await app.register(adminRoutes, { prefix: '/api/admin' });
await app.register(supportAdminRoutes, { prefix: '/api/admin' });

try {
  await ensureDefaultTicketCategories();
} catch (err) {
  app.log.warn({ err }, 'Could not ensure default ticket categories');
}

try {
  const fixed = await repairInvalidProductFeatures();
  if (fixed) app.log.info({ fixed }, 'Repaired empty product features values');
} catch (err) {
  app.log.warn({ err }, 'Could not repair product features');
}

try {
  await remapLegacyLogCategories();
} catch (err) {
  app.log.warn({ err }, 'Could not remap legacy log categories');
}

await app.listen({ port: config.port, host: config.host });
app.log.info(`Spirit Billing API on http://${config.host}:${config.port}`);
app.log.info(`Uploads directory ${getUploadsRoot()}`);
