import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  assertPasswordOk,
  clearSessionCookie,
  getUserFromRequest,
  hashPassword,
  requireAuth,
  setSessionCookie,
  signToken,
  verifyPassword,
} from '../lib/auth.js';
import { getConfig } from '../lib/env.js';
import { getDefaultCurrency, getSetting } from '../lib/billing.js';
import { prisma } from '../lib/prisma.js';
import { getPanelConnectionConfig } from '../lib/panel-config.js';
import { getPublicSecurityConfig, isMaintenanceMode } from '../lib/security-settings.js';
import { isTurnstileEnabled, verifyTurnstileToken } from '../lib/turnstile.js';
import { createPanelUser, deletePanelUser, findPanelUserByEmail, PanelApiError, updatePanelUser } from '../services/panel.js';
import { resolvePanelUserLink } from '../lib/panel-link.js';
import { assertSafeOutboundUrl, isSafeHttpUrl, sanitizeHexColor } from '../lib/url-safety.js';
import { recordLogFireAndForget } from '../lib/system-log.js';
import { isStaffOrAdmin } from '../lib/roles.js';

const publicUserSelect = {
  id: true,
  email: true,
  username: true,
  firstName: true,
  lastName: true,
  avatarUrl: true,
  role: true,
  panelUserId: true,
  creditBalanceCents: true,
  createdAt: true,
} as const;

const authRateLimit = {
  config: {
    rateLimit: {
      max: 10,
      timeWindow: '1 minute',
    },
  },
};

async function assertTurnstile(request: { ip: string }, token?: string) {
  if (!(await isTurnstileEnabled())) return;
  if (!token?.trim()) {
    throw Object.assign(new Error('Please complete the security check.'), { statusCode: 400 });
  }
  const ok = await verifyTurnstileToken(token, request.ip);
  if (!ok) {
    throw Object.assign(new Error('Security verification failed. Please try again.'), { statusCode: 403 });
  }
}

export async function authRoutes(app: FastifyInstance) {
  app.get('/branding', async () => {
    const { companyName, paymentInstructions } = getConfig();
    const panel = await getPanelConnectionConfig();
    const security = await getPublicSecurityConfig();
    let panelBranding: Record<string, unknown> | null = null;

    try {
      const safeBase = await assertSafeOutboundUrl(panel.panelApiUrl, 'Panel API URL');
      const res = await fetch(`${safeBase}/api/auth/branding`, {
        redirect: 'manual',
        signal: AbortSignal.timeout(4_000),
      });
      if (res.ok) panelBranding = (await res.json()) as Record<string, unknown>;
    } catch {
      panelBranding = null;
    }

    const billingLogo = await getSetting('logo_url', '');
    const billingFavicon = await getSetting('favicon_url', '');
    const billingAccent = await getSetting('accent_color', '');
    const billingSecondary = await getSetting('secondary_color', '');
    const panelLogo =
      typeof panelBranding?.logoUrl === 'string' && isSafeHttpUrl(panelBranding.logoUrl)
        ? panelBranding.logoUrl
        : null;
    const panelFavicon =
      typeof panelBranding?.faviconUrl === 'string' && isSafeHttpUrl(panelBranding.faviconUrl)
        ? panelBranding.faviconUrl
        : null;

    return {
      companyName: await getSetting('company_name', companyName),
      tagline: await getSetting('brand_tagline', 'Billing'),
      paymentInstructions: await getSetting('payment_instructions', paymentInstructions),
      currency: await getDefaultCurrency(),
      supportEmail: await getSetting('support_email', ''),
      supportUrl: await getSetting('support_url', ''),
      termsUrl: await getSetting('terms_url', ''),
      privacyUrl: await getSetting('privacy_url', ''),
      invoiceFooter: await getSetting('invoice_footer', ''),
      announcementBanner: await getSetting('announcement_banner', ''),
      panelWebUrl: panel.panelWebUrl,
      accentColor: sanitizeHexColor(
        billingAccent || panelBranding?.accentColor,
        '#6366f1',
      ),
      secondaryColor: sanitizeHexColor(
        billingSecondary || panelBranding?.secondaryColor,
        '#22d3ee',
      ),
      panelName:
        typeof panelBranding?.panelName === 'string' && panelBranding.panelName.trim()
          ? panelBranding.panelName.trim().slice(0, 80)
          : 'Spirit-Panel',
      logoUrl: (billingLogo && isSafeHttpUrl(billingLogo) ? billingLogo : null) || panelLogo,
      faviconUrl:
        (billingFavicon && isSafeHttpUrl(billingFavicon) ? billingFavicon : null) || panelFavicon,
      maintenanceMode: security.maintenanceMode,
      maintenanceMessage: security.maintenanceMessage,
      registrationEnabled: security.registrationEnabled,
      ticketsEnabled: security.ticketsEnabled,
      turnstileEnabled: security.turnstileEnabled,
      turnstileSiteKey: security.turnstileSiteKey,
    };
  });

  app.post('/register', authRateLimit, async (request, reply) => {
    const body = z
      .object({
        email: z.string().email().max(254),
        username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_-]+$/),
        password: z.string().min(16).max(128),
        firstName: z.string().min(1).max(64),
        lastName: z.string().min(1).max(64),
        turnstileToken: z.string().max(2048).optional(),
      })
      .parse(request.body);

    const security = await getPublicSecurityConfig();
    if (!security.registrationEnabled) {
      return reply.status(403).send({
        error: 'New account registration is currently disabled.',
        code: 'registration_disabled',
      });
    }

    if (await isMaintenanceMode()) {
      return reply.status(503).send({
        error: security.maintenanceMessage,
        code: 'maintenance',
      });
    }

    try {
      await assertTurnstile(request, body.turnstileToken);
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode ?? 400;
      return reply.status(statusCode).send({
        error: err instanceof Error ? err.message : 'Security check failed',
      });
    }

    assertPasswordOk(body.password);

    const exists = await prisma.user.findFirst({
      where: {
        OR: [{ email: body.email.toLowerCase() }, { username: body.username }],
      },
    });
    if (exists) {
      return reply.status(409).send({ error: 'Email or username already registered' });
    }

    let panelUserId: string | null = null;
    try {
      const existingPanel = await findPanelUserByEmail(body.email);
      if (existingPanel) {
        // Never overwrite an existing panel account (password takeover).
        return reply.status(409).send({
          error:
            'This email already has a Spirit-Panel account. Use a different email, or ask an admin to link your billing account.',
        });
      }
      const created = await createPanelUser({
        email: body.email,
        username: body.username,
        password: body.password,
        firstName: body.firstName,
        lastName: body.lastName,
      });
      panelUserId = created.id;
    } catch (err) {
      if (err instanceof PanelApiError) {
        request.log.warn({ err: err.message, status: err.status }, 'panel register failed');
        const lower = err.message.toLowerCase();
        if (err.status === 409 || lower.includes('already') || lower.includes('exist')) {
          return reply.status(409).send({
            error: 'That email or username is already used on Spirit-Panel. Choose different details.',
          });
        }
        if (err.status === 422 || lower.includes('password')) {
          return reply.status(422).send({
            error: 'Password does not meet Spirit-Panel requirements (min 16 characters, not a common password).',
          });
        }
        if (err.status === 401 || err.status === 403) {
          return reply.status(502).send({
            error: 'Billing cannot reach Spirit-Panel with the configured Application API key. Check Admin → Settings.',
          });
        }
        if (err.status >= 500) {
          return reply.status(502).send({
            error:
              'Spirit-Panel failed to create the user. Confirm panel-api is up to date, then try again.',
          });
        }
        return reply.status(502).send({
          error: 'Could not create game panel account. Check Spirit-Panel linking in Admin → Settings, then try again.',
        });
      }
      throw err;
    }

    let user;
    try {
      user = await prisma.user.create({
        data: {
          email: body.email.toLowerCase(),
          username: body.username,
          firstName: body.firstName,
          lastName: body.lastName,
          passwordHash: await hashPassword(body.password),
          panelUserId,
        },
        select: { ...publicUserSelect, tokenVersion: true },
      });
    } catch (err) {
      if (panelUserId) {
        try {
          await deletePanelUser(panelUserId);
        } catch (cleanupErr) {
          request.log.warn({ err: cleanupErr }, 'failed to delete orphan panel user after register failure');
        }
      }
      throw err;
    }

    const token = signToken({
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      tokenVersion: user.tokenVersion,
    });
    setSessionCookie(reply, token, user.role);
    const { tokenVersion: _tv, ...publicUser } = user;
    recordLogFireAndForget({
      level: 'info',
      category: 'auth',
      action: 'auth.register',
      message: `${user.username} registered`,
      actorUserId: user.id,
      ip: request.ip,
      method: 'POST',
      path: '/api/auth/register',
      statusCode: 200,
    });
    return {
      user: publicUser,
      panelWebUrl: (await getPanelConnectionConfig()).panelWebUrl,
    };
  });

  app.post('/login', authRateLimit, async (request, reply) => {
    const body = z
      .object({
        identifier: z.string().min(1).max(254),
        password: z.string().min(1).max(128),
        turnstileToken: z.string().max(2048).optional(),
      })
      .parse(request.body);

    try {
      await assertTurnstile(request, body.turnstileToken);
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode ?? 400;
      return reply.status(statusCode).send({
        error: err instanceof Error ? err.message : 'Security check failed',
      });
    }

    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: body.identifier.toLowerCase() }, { username: body.identifier }],
      },
    });

    // Always run bcrypt to reduce user-enumeration via timing.
    const hash = user?.passwordHash ?? '$2b$12$t4I5APNA7d1OF/pse9PGqOqLVuxND0iZU7Ma.m9kQ3JfpR4MH2mFa';
    const passwordOk = await verifyPassword(body.password, hash);
    if (!user || !user.enabled || !passwordOk) {
      recordLogFireAndForget({
        level: 'warn',
        category: 'auth',
        action: 'auth.login_failed',
        message: `Failed login attempt for ${body.identifier}`,
        ip: request.ip,
        method: 'POST',
        path: '/api/auth/login',
        statusCode: 401,
        meta: { identifier: body.identifier.slice(0, 80) },
      });
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    if (!isStaffOrAdmin(user.role) && (await isMaintenanceMode())) {
      const security = await getPublicSecurityConfig();
      return reply.status(503).send({
        error: security.maintenanceMessage,
        code: 'maintenance',
      });
    }

    const token = signToken({
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      tokenVersion: user.tokenVersion,
    });
    setSessionCookie(reply, token, user.role);
    recordLogFireAndForget({
      level: 'info',
      category: 'auth',
      action: 'auth.login',
      message: `${user.username} signed in`,
      actorUserId: user.id,
      ip: request.ip,
      method: 'POST',
      path: '/api/auth/login',
      statusCode: 200,
      meta: { role: user.role },
    });
    return {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        avatarUrl: user.avatarUrl,
        role: user.role,
        panelUserId: user.panelUserId,
        creditBalanceCents: user.creditBalanceCents,
        createdAt: user.createdAt,
      },
      panelWebUrl: (await getPanelConnectionConfig()).panelWebUrl,
    };
  });

  app.post('/logout', async (request, reply) => {
    const session = await getUserFromRequest(request);
    if (session) {
      await prisma.user.update({
        where: { id: session.id },
        data: { tokenVersion: { increment: 1 } },
      });
      recordLogFireAndForget({
        level: 'info',
        category: 'auth',
        action: 'auth.logout',
        message: `${session.username} signed out`,
        actorUserId: session.id,
        ip: request.ip,
        method: 'POST',
        path: '/api/auth/logout',
      });
    }
    clearSessionCookie(reply);
    return { ok: true };
  });

  app.get('/me', { preHandler: requireAuth }, async (request) => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: request.user!.id },
      select: publicUserSelect,
    });
    const link = await resolvePanelUserLink(user);
    return {
      user: { ...user, panelUserId: link.panelUserId },
      panelWebUrl: (await getPanelConnectionConfig()).panelWebUrl,
      panelLinked: link.panelLinked,
      panelStatus: link.panelStatus,
    };
  });

  app.get('/profile/overview', { preHandler: requireAuth }, async (request) => {
    const userId = request.user!.id;
    const [user, services, activeServiceCount, unpaidInvoices, paidInvoices, recentServices] =
      await Promise.all([
        prisma.user.findUniqueOrThrow({
          where: { id: userId },
          select: { ...publicUserSelect, updatedAt: true },
        }),
        prisma.service.count({ where: { userId } }),
        prisma.service.count({ where: { userId, status: 'active' } }),
        prisma.invoice.count({ where: { userId, status: 'unpaid' } }),
        prisma.invoice.count({ where: { userId, status: 'paid' } }),
        prisma.service.findMany({
          where: { userId },
          take: 5,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            name: true,
            status: true,
            panelServerId: true,
            product: {
              select: {
                name: true,
                category: {
                  select: { id: true, name: true, color: true, icon: true, logoUrl: true },
                },
              },
            },
          },
        }),
      ]);

    const link = await resolvePanelUserLink(user);

    return {
      user: { ...user, panelUserId: link.panelUserId },
      panelWebUrl: (await getPanelConnectionConfig()).panelWebUrl,
      panelLinked: link.panelLinked,
      panelStatus: link.panelStatus,
      stats: {
        services,
        activeServices: activeServiceCount,
        unpaidInvoices,
        paidInvoices,
      },
      recentServices,
    };
  });

  app.patch('/profile', { preHandler: requireAuth, ...authRateLimit }, async (request, reply) => {
    const body = z
      .object({
        firstName: z.string().min(1).max(64).optional(),
        lastName: z.string().min(1).max(64).optional(),
        email: z.string().email().max(254).optional(),
        username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_-]+$/).optional(),
        avatarUrl: z
          .union([
            z.literal(''),
            z.null(),
            z.string().max(512).refine(isSafeHttpUrl, { message: 'Avatar URL must use http or https' }),
          ])
          .optional(),
        password: z.string().min(16).max(128).optional(),
        currentPassword: z.string().max(128).optional(),
      })
      .parse(request.body);

    const current = await prisma.user.findUniqueOrThrow({ where: { id: request.user!.id } });

    const sensitiveChange = Boolean(
      body.password ||
        (body.email && body.email.toLowerCase() !== current.email) ||
        (body.username && body.username !== current.username),
    );

    if (sensitiveChange) {
      if (!body.currentPassword || !(await verifyPassword(body.currentPassword, current.passwordHash))) {
        return reply.status(422).send({ error: 'Current password is required to change email, username, or password' });
      }
    }

    if (body.password) {
      assertPasswordOk(body.password);
    }

    const nextAvatar =
      body.avatarUrl === undefined
        ? undefined
        : body.avatarUrl === '' || body.avatarUrl === null
          ? null
          : body.avatarUrl;

    if (body.email && body.email.toLowerCase() !== current.email) {
      const taken = await prisma.user.findFirst({
        where: { email: body.email.toLowerCase(), NOT: { id: current.id } },
        select: { id: true },
      });
      if (taken) return reply.status(409).send({ error: 'Email or username already in use' });
    }
    if (body.username && body.username !== current.username) {
      const taken = await prisma.user.findFirst({
        where: { username: body.username, NOT: { id: current.id } },
        select: { id: true },
      });
      if (taken) return reply.status(409).send({ error: 'Email or username already in use' });
    }

    const bumpSession = Boolean(body.password || body.email || body.username);
    const previous = {
      email: current.email,
      username: current.username,
      firstName: current.firstName,
      lastName: current.lastName,
      avatarUrl: current.avatarUrl,
      passwordHash: current.passwordHash,
      tokenVersion: current.tokenVersion,
    };

    let user;
    try {
      user = await prisma.user.update({
        where: { id: current.id },
        data: {
          ...(body.email ? { email: body.email.toLowerCase() } : {}),
          ...(body.username ? { username: body.username } : {}),
          ...(body.firstName !== undefined ? { firstName: body.firstName } : {}),
          ...(body.lastName !== undefined ? { lastName: body.lastName } : {}),
          ...(nextAvatar !== undefined ? { avatarUrl: nextAvatar } : {}),
          ...(body.password ? { passwordHash: await hashPassword(body.password) } : {}),
          ...(bumpSession ? { tokenVersion: { increment: 1 } } : {}),
        },
        select: { ...publicUserSelect, tokenVersion: true, role: true },
      });
    } catch {
      return reply.status(409).send({ error: 'Email or username already in use' });
    }

    if (current.panelUserId) {
      try {
        await updatePanelUser(current.panelUserId, {
          ...(body.email ? { email: body.email.toLowerCase() } : {}),
          ...(body.username ? { username: body.username } : {}),
          ...(body.firstName !== undefined ? { firstName: body.firstName } : {}),
          ...(body.lastName !== undefined ? { lastName: body.lastName } : {}),
          ...(nextAvatar !== undefined ? { avatarUrl: nextAvatar } : {}),
          ...(body.password ? { password: body.password } : {}),
        });
      } catch (err) {
        if (err instanceof PanelApiError && err.status === 404) {
          await prisma.user.update({
            where: { id: current.id },
            data: { panelUserId: null },
          });
          user = { ...user, panelUserId: null };
        } else {
          await prisma.user.update({
            where: { id: current.id },
            data: {
              email: previous.email,
              username: previous.username,
              firstName: previous.firstName,
              lastName: previous.lastName,
              avatarUrl: previous.avatarUrl,
              passwordHash: previous.passwordHash,
              tokenVersion: previous.tokenVersion,
            },
          });
          if (err instanceof PanelApiError) {
            request.log.warn({ err: err.message }, 'panel profile sync failed');
            return reply.status(502).send({ error: 'Could not sync changes to the game panel' });
          }
          throw err;
        }
      }
    }

    if (bumpSession) {
      const token = signToken({
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        tokenVersion: user.tokenVersion,
      });
      setSessionCookie(reply, token, user.role);
    }

    const { tokenVersion: _tv, ...publicUser } = user;
    return { user: publicUser };
  });
}
