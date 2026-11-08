import bcrypt from 'bcryptjs';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { getConfig } from './env.js';
import { prisma } from './prisma.js';
import {
  billingRoleCan,
  isFullAdmin,
  isStaffOrAdmin,
  type BillingRole,
  type BillingStaffCapability,
} from './roles.js';

export type SessionUser = {
  id: string;
  email: string;
  username: string;
  role: BillingRole;
  tokenVersion: number;
  sessionId?: string;
};

/** Slim access JWT — role/email always reloaded from DB. */
type JwtPayload = {
  sub: string;
  tv: number;
  sid: string;
};

const LEGACY_ACCESS_COOKIE = 'spirit_billing_session';
const ACCESS_COOKIE_HOST = '__Host-spirit_billing_session';
const REFRESH_COOKIE = 'spirit_billing_refresh';
const REFRESH_COOKIE_HOST = '__Host-spirit_billing_refresh';
const CSRF_COOKIE = 'spirit_billing_csrf';

const REFRESH_TTL_MS = 1000 * 60 * 60 * 24 * 14;
const ACCESS_TTL_STAFF_SEC = 60 * 15;
const ACCESS_TTL_CLIENT_SEC = 60 * 30;

const loginFailures = new Map<string, { count: number; lockedUntil: number }>();
const LOGIN_MAX_FAILURES = 8;
const LOGIN_LOCK_MS = 15 * 60 * 1000;

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

export function cookiesUseSecure(): boolean {
  return getConfig().billingUrl.startsWith('https:');
}

function accessCookieName(): string {
  return cookiesUseSecure() ? ACCESS_COOKIE_HOST : LEGACY_ACCESS_COOKIE;
}

function refreshCookieName(): string {
  return cookiesUseSecure() ? REFRESH_COOKIE_HOST : REFRESH_COOKIE;
}

export function sessionTtlSeconds(role: BillingRole): number {
  return isStaffOrAdmin(role) ? ACCESS_TTL_STAFF_SEC : ACCESS_TTL_CLIENT_SEC;
}

function sameSiteForRole(role: BillingRole): 'strict' | 'lax' {
  return isStaffOrAdmin(role) ? 'strict' : 'lax';
}

function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function signToken(user: SessionUser): string {
  const { jwtSecret } = getConfig();
  if (!user.sessionId) {
    throw new Error('sessionId required to sign access token');
  }
  return jwt.sign(
    {
      sub: user.id,
      tv: user.tokenVersion,
      sid: user.sessionId,
    } satisfies JwtPayload,
    jwtSecret,
    { algorithm: 'HS256', expiresIn: sessionTtlSeconds(user.role) },
  );
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, getConfig().jwtSecret, { algorithms: ['HS256'] }) as JwtPayload;
}

function setCsrfCookie(reply: FastifyReply) {
  const token = randomBytes(32).toString('base64url');
  reply.setCookie(CSRF_COOKIE, token, {
    path: '/',
    httpOnly: false,
    sameSite: 'lax',
    secure: cookiesUseSecure(),
    maxAge: 60 * 60 * 24 * 14,
  });
  return token;
}

export function setSessionCookie(reply: FastifyReply, token: string, role: BillingRole): void {
  reply.setCookie(accessCookieName(), token, {
    path: '/',
    httpOnly: true,
    sameSite: sameSiteForRole(role),
    secure: cookiesUseSecure(),
    maxAge: sessionTtlSeconds(role),
  });
  if (cookiesUseSecure()) {
    reply.clearCookie(LEGACY_ACCESS_COOKIE, { path: '/' });
  }
  setCsrfCookie(reply);
}

function setRefreshCookie(reply: FastifyReply, rawToken: string, role: BillingRole): void {
  reply.setCookie(refreshCookieName(), rawToken, {
    path: '/',
    httpOnly: true,
    sameSite: sameSiteForRole(role),
    secure: cookiesUseSecure(),
    maxAge: Math.floor(REFRESH_TTL_MS / 1000),
  });
  if (cookiesUseSecure()) {
    reply.clearCookie(REFRESH_COOKIE, { path: '/' });
  }
}

export function clearSessionCookie(reply: FastifyReply): void {
  const secure = cookiesUseSecure();
  for (const name of [ACCESS_COOKIE_HOST, LEGACY_ACCESS_COOKIE, REFRESH_COOKIE_HOST, REFRESH_COOKIE, CSRF_COOKIE]) {
    reply.clearCookie(name, {
      path: '/',
      httpOnly: name !== CSRF_COOKIE,
      sameSite: 'lax',
      secure,
    });
  }
}

function readCookie(request: FastifyRequest, names: string[]): string | undefined {
  const cookies = request.cookies as Record<string, string | undefined> | undefined;
  if (!cookies) return undefined;
  for (const name of names) {
    if (cookies[name]) return cookies[name];
  }
  return undefined;
}

export function hasSessionCookie(request: FastifyRequest): boolean {
  return Boolean(
    readCookie(request, [ACCESS_COOKIE_HOST, LEGACY_ACCESS_COOKIE, REFRESH_COOKIE_HOST, REFRESH_COOKIE]),
  );
}

export function readCsrfCookie(request: FastifyRequest): string | undefined {
  return readCookie(request, [CSRF_COOKIE]);
}

export function verifyCsrf(request: FastifyRequest): boolean {
  const cookie = readCsrfCookie(request);
  const header = String(request.headers['x-csrf-token'] || '').trim();
  if (!cookie || !header) return false;
  try {
    const a = Buffer.from(cookie);
    const b = Buffer.from(header);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function createUserSession(
  reply: FastifyReply,
  user: {
    id: string;
    email: string;
    username: string;
    role: BillingRole;
    tokenVersion: number;
  },
  meta?: { ip?: string; userAgent?: string },
): Promise<SessionUser> {
  const rawRefresh = randomBytes(48).toString('base64url');
  const tokenHash = hashRefreshToken(rawRefresh);
  const session = await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      ip: meta?.ip?.slice(0, 64) || null,
      userAgent: meta?.userAgent?.slice(0, 512) || null,
    },
  });
  const sessionUser: SessionUser = {
    id: user.id,
    email: user.email,
    username: user.username,
    role: user.role,
    tokenVersion: user.tokenVersion,
    sessionId: session.id,
  };
  setSessionCookie(reply, signToken(sessionUser), user.role);
  setRefreshCookie(reply, rawRefresh, user.role);
  return sessionUser;
}

export async function revokeSessionById(sessionId: string) {
  await prisma.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllUserSessions(userId: string) {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Revoke the refresh cookie session without rotating a replacement. */
export async function revokeRefreshFromRequest(request: FastifyRequest) {
  const raw = readCookie(request, [REFRESH_COOKIE_HOST, REFRESH_COOKIE]);
  if (!raw) return;
  const tokenHash = hashRefreshToken(raw);
  await prisma.session.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function rotateRefreshSession(
  reply: FastifyReply,
  request: FastifyRequest,
): Promise<SessionUser | null> {
  const raw = readCookie(request, [REFRESH_COOKIE_HOST, REFRESH_COOKIE]);
  if (!raw) return null;
  const tokenHash = hashRefreshToken(raw);
  const existing = await prisma.session.findUnique({
    where: { tokenHash },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          username: true,
          role: true,
          enabled: true,
          tokenVersion: true,
        },
      },
    },
  });
  if (!existing || existing.revokedAt || existing.expiresAt.getTime() < Date.now()) {
    return null;
  }
  if (!existing.user.enabled) return null;

  await prisma.session.update({
    where: { id: existing.id },
    data: { revokedAt: new Date() },
  });

  return createUserSession(
    reply,
    {
      id: existing.user.id,
      email: existing.user.email,
      username: existing.user.username,
      role: existing.user.role,
      tokenVersion: existing.user.tokenVersion,
    },
    { ip: request.ip, userAgent: request.headers['user-agent'] },
  );
}

export async function getUserFromRequest(request: FastifyRequest): Promise<SessionUser | null> {
  const token = readCookie(request, [ACCESS_COOKIE_HOST, LEGACY_ACCESS_COOKIE]);
  if (!token) return null;
  try {
    const payload = verifyToken(token);
    if (!payload.sid) return null;
    const [user, session] = await Promise.all([
      prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          email: true,
          username: true,
          role: true,
          enabled: true,
          tokenVersion: true,
        },
      }),
      prisma.session.findUnique({
        where: { id: payload.sid },
        select: { id: true, userId: true, revokedAt: true, expiresAt: true },
      }),
    ]);
    if (!user || !user.enabled) return null;
    if ((payload.tv ?? 0) !== user.tokenVersion) return null;
    if (!session || session.userId !== user.id || session.revokedAt) return null;
    if (session.expiresAt.getTime() < Date.now()) return null;
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      tokenVersion: user.tokenVersion,
      sessionId: session.id,
    };
  } catch {
    return null;
  }
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const user = await getUserFromRequest(request);
  if (!user) return reply.status(401).send({ error: 'Unauthorized' });

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

export async function requireStaffAccess(request: FastifyRequest, reply: FastifyReply) {
  await requireAuth(request, reply);
  if (reply.sent) return;
  if (!isStaffOrAdmin(request.user?.role)) return reply.status(403).send({ error: 'Forbidden' });
}

export async function requireFullAdmin(request: FastifyRequest, reply: FastifyReply) {
  await requireAuth(request, reply);
  if (reply.sent) return;
  if (!isFullAdmin(request.user?.role)) return reply.status(403).send({ error: 'Forbidden' });
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  return requireStaffAccess(request, reply);
}

export function requireCapability(capability: BillingStaffCapability) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await requireStaffAccess(request, reply);
    if (reply.sent) return;
    if (!billingRoleCan(request.user?.role, capability)) {
      return reply.status(403).send({ error: 'Forbidden' });
    }
  };
}

export async function assertStepUpPassword(userId: string, currentPassword: string | undefined) {
  if (!currentPassword || typeof currentPassword !== 'string') {
    throw Object.assign(new Error('Current password is required to confirm this action'), {
      statusCode: 422,
      code: 'step_up_required',
    });
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });
  if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
    throw Object.assign(new Error('Current password is incorrect'), { statusCode: 403 });
  }
}

export function loginFailureKey(identifier: string, ip: string) {
  return `${identifier.trim().toLowerCase()}|${ip}`;
}

export function assertNotLockedOut(identifier: string, ip: string) {
  const entry = loginFailures.get(loginFailureKey(identifier, ip));
  if (entry && entry.lockedUntil > Date.now()) {
    throw Object.assign(
      new Error('Too many failed sign-in attempts. Try again in a few minutes.'),
      { statusCode: 429, code: 'login_locked' },
    );
  }
}

export function recordLoginFailure(identifier: string, ip: string) {
  const key = loginFailureKey(identifier, ip);
  const prev = loginFailures.get(key);
  const count = (prev?.count ?? 0) + 1;
  const lockedUntil = count >= LOGIN_MAX_FAILURES ? Date.now() + LOGIN_LOCK_MS : 0;
  loginFailures.set(key, { count, lockedUntil });
}

export function clearLoginFailures(identifier: string, ip: string) {
  loginFailures.delete(loginFailureKey(identifier, ip));
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: SessionUser;
  }
}
