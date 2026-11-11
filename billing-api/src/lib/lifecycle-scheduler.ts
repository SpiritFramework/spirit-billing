import type { FastifyBaseLogger } from 'fastify';
import { getConfig } from './env.js';
import { runDueRenewals, runExpiredTrialEnforcement, runOverdueEnforcement } from './renewals.js';
import { recordLogFireAndForget } from './system-log.js';

const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;
let timer: NodeJS.Timeout | null = null;
let running = false;

function schedulerEnabled() {
  return process.env.BILLING_LIFECYCLE_SCHEDULER === 'true';
}

function intervalMs() {
  const raw = Number(process.env.BILLING_LIFECYCLE_INTERVAL_MS ?? DEFAULT_INTERVAL_MS);
  if (!Number.isFinite(raw)) return DEFAULT_INTERVAL_MS;
  return Math.min(24 * 60 * 60 * 1000, Math.max(60_000, Math.round(raw)));
}

async function tick(log?: FastifyBaseLogger) {
  if (running) return;
  running = true;
  try {
    const renewals = await runDueRenewals();
    const trials = await runExpiredTrialEnforcement();
    const overdue = await runOverdueEnforcement();
    const created = renewals.created?.length ?? 0;
    const suspended = overdue.suspended?.length ?? 0;
    const terminated = (overdue.terminated?.length ?? 0) + (trials.terminated?.length ?? 0);
    if (created || suspended || terminated) {
      recordLogFireAndForget({
        level: 'info',
        category: 'billing',
        action: 'lifecycle.scheduler',
        message: `Lifecycle tick: renewals ${created}, suspended ${suspended}, terminated ${terminated}`,
        meta: {
          renewalsCreated: created,
          renewalsSkipped: renewals.skipped?.length ?? 0,
          suspended,
          terminated,
          trialsTerminated: trials.terminated.length,
        },
      });
      log?.info(
        { created, suspended, terminated },
        'Billing lifecycle scheduler tick',
      );
    }
  } catch (err) {
    recordLogFireAndForget({
      level: 'error',
      category: 'billing',
      action: 'lifecycle.scheduler_failed',
      message: err instanceof Error ? err.message : 'Lifecycle scheduler failed',
    });
    log?.error({ err }, 'Billing lifecycle scheduler failed');
  } finally {
    running = false;
  }
}

/**
 * In-process renewal / trial wipe / overdue runner.
 * Runs when BILLING_LIFECYCLE_SCHEDULER=true. Production install and update set that.
 */
export function startLifecycleScheduler(log?: FastifyBaseLogger) {
  if (!schedulerEnabled()) {
    log?.info('Billing lifecycle scheduler is off (set BILLING_LIFECYCLE_SCHEDULER=true to enable)');
    return;
  }
  if (timer) return;

  const ms = intervalMs();
  log?.info(
    { intervalMs: ms, env: getConfig().nodeEnv },
    'Billing lifecycle scheduler enabled',
  );
  void tick(log);
  timer = setInterval(() => {
    void tick(log);
  }, ms);
  timer.unref?.();
}

export function stopLifecycleScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
