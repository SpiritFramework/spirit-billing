import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { getConfig } from './env.js';
import { prisma } from './prisma.js';
import { isFullAdmin, isStaffOrAdmin, type BillingRole } from './roles.js';

export type SessionUser = {
  id: string;
  email: string;
  username: string;
  role: BillingRole;
  tokenVersion: number;
};

type JwtPayload = {
  sub: string;
  email: string;
  role: BillingRole;
  tv: number;
};

const COOKIE = 'spirit_billing_session';

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** Matches Spirit-Panel weak-password blocking (passwords under 16 are rejected as weak). */
const WEAK_PASSWORDS = new Set([
  'admin123!',
  'demo123!',
  'password',
  'password123',
  'changeme',
  'spirit123!',
]);

export function assertPasswordOk(password: string): void {
  if (password.length < 16) {
    throw Object.assign(new Error('Password must be at least 16 characters'), { statusCode: 422 });
  }
  if (password.length > 128) {
    throw Object.assign(new Error('Password is too long'), { statusCode: 422 });
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    throw Object.assign(new Error('Password must include at least one letter and one number'), {
      statusCode: 422,
    });
  }
  const normalized = password.trim().toLowerCase();
  if (WEAK_PASSWORDS.has(normalized)) {
    throw Object.assign(
      new Error('Password is too common or too weak. Choose a longer, unique password.'),
      { statusCode: 422 },
    );
  }
}

export function sessionTtlSeconds(role: BillingRole): number {
  // Staff share the shorter privileged session window with admins.
  return isStaffOrAdmin(role) ? 60 * 60 * 24 : 60 * 60 * 24 * 7;
}

export function signToken(user: SessionUser): string {
  const { jwtSecret } = getConfig();
  const expiresIn = isStaffOrAdmin(user.role) ? '24h' : '7d';
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      tv: user.tokenVersion,
    } satisfies JwtPayload,
    jwtSecret,
    { algorithm: 'HS256', expiresIn },
  );
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, getConfig().jwtSecret, { algorithms: ['HS256'] }) as JwtPayload;
}

export function setSessionCookie(reply: FastifyReply, token: string, role: BillingRole): void {
  const { isProduction } = getConfig();
  reply.setCookie(COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    maxAge: sessionTtlSeconds(role),
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  const { isProduction } = getConfig();
  reply.clearCookie(COOKIE, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
  });
}

export async function getUserFromRequest(request: FastifyRequest): Promise<SessionUser | null> {
  const token = (request.cookies as Record<string, string | undefined>)?.[COOKIE];
  if (!token) return null;
  try {
    const payload = verifyToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        enabled: true,
        tokenVersion: true,
      },
    });
    if (!user || !user.enabled) return null;
    if ((payload.tv ?? 0) !== user.tokenVersion) return null;
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      tokenVersion: user.tokenVersion,
    };
  } catch {
    return null;
  }
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const user = await getUserFromRequest(request);
  if (!user) return reply.status(401).send({ error: 'Unauthorized' });

  // During maintenance, keep admin/staff access and block client sessions.
  if (!isStaffOrAdmin(user.role)) {
    const { isMaintenanceMode } = await import('./security-settings.js');
    if (await isMaintenanceMode()) {
      return reply.status(503).send({
        error: 'Billing is under maintenance. Please try again later.',
        code: 'maintenance',
      });
    }
  }

  request.user = user;
}

/** Admin UI + light ops (admin or staff). */
export async function requireStaffAccess(request: FastifyRequest, reply: FastifyReply) {
  await requireAuth(request, reply);
  if (reply.sent) return;
  if (!isStaffOrAdmin(request.user?.role)) return reply.status(403).send({ error: 'Forbidden' });
}

/** Full administrator only (settings, money, deletes, role changes). */
export async function requireFullAdmin(request: FastifyRequest, reply: FastifyReply) {
  await requireAuth(request, reply);
  if (reply.sent) return;
  if (!isFullAdmin(request.user?.role)) return reply.status(403).send({ error: 'Forbidden' });
}

/** @deprecated Prefer requireStaffAccess or requireFullAdmin. Kept as staff+admin for compatibility. */
export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  return requireStaffAccess(request, reply);
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: SessionUser;
  }
}
