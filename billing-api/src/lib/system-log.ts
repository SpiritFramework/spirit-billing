import type { SystemLogCategory, SystemLogLevel } from '@prisma/client';
import { prisma } from './prisma.js';

const SENSITIVE_KEY =
  /password|passwd|secret|token|authorization|api[_-]?key|cookie|credit.?card|cvv/i;

export type RecordLogInput = {
  level?: SystemLogLevel;
  category: SystemLogCategory;
  action: string;
  message: string;
  actorUserId?: string | null;
  targetUserId?: string | null;
  ip?: string | null;
  method?: string | null;
  path?: string | null;
  statusCode?: number | null;
  durationMs?: number | null;
  meta?: unknown;
};

function truncate(value: string, max: number) {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function sanitizeMeta(value: unknown, depth = 0): unknown {
  if (value == null) return value;
  if (depth > 4) return '[truncated]';
  if (typeof value === 'string') return truncate(value, 400);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeMeta(item, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>).slice(0, 30)) {
      out[key] = SENSITIVE_KEY.test(key) ? '[redacted]' : sanitizeMeta(entry, depth + 1);
    }
    return out;
  }
  return String(value);
}

/** Persist a system log entry. Never throws to callers. */
export async function recordLog(input: RecordLogInput): Promise<void> {
  try {
    await prisma.systemLog.create({
      data: {
        level: input.level ?? 'info',
        category: input.category,
        action: truncate(input.action, 80),
        message: truncate(input.message, 500),
        actorUserId: input.actorUserId || null,
        targetUserId: input.targetUserId || null,
        ip: input.ip ? truncate(input.ip, 64) : null,
        method: input.method ? truncate(input.method, 12) : null,
        path: input.path ? truncate(input.path, 255) : null,
        statusCode: input.statusCode ?? null,
        durationMs: input.durationMs ?? null,
        meta: input.meta === undefined ? undefined : (sanitizeMeta(input.meta) as object | undefined),
      },
    });
  } catch {
    // Logging must never break billing flows.
  }
}

export function recordLogFireAndForget(input: RecordLogInput) {
  void recordLog(input);
}

export async function pruneSystemLogs(keepDays = 30) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - Math.max(1, keepDays));
  const result = await prisma.systemLog.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return { deleted: result.count, cutoff };
}
