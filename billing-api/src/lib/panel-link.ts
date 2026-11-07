import { prisma } from './prisma.js';
import { findPanelUserByEmail, getPanelUser, PanelApiError } from '../services/panel.js';

export type PanelLinkStatus = 'linked' | 'missing' | 'unreachable';

export type PanelLinkResult = {
  panelUserId: string | null;
  panelLinked: boolean;
  panelStatus: PanelLinkStatus;
};

function isTimeoutOrNetwork(err: unknown): boolean {
  if (err instanceof PanelApiError) {
    return err.status === 502 || err.status === 503 || err.status === 504;
  }
  if (!(err instanceof Error)) return false;
  const name = err.name.toLowerCase();
  const message = err.message.toLowerCase();
  return (
    name.includes('abort') ||
    name.includes('timeout') ||
    message.includes('aborted') ||
    message.includes('timeout') ||
    message.includes('fetch failed') ||
    message.includes('network')
  );
}

/**
 * Confirm a stored panel user ID still exists. Clears stale IDs when the panel
 * account was deleted outside billing. Falls back to email lookup so missing
 * GET /users/:id routes do not wipe valid links.
 */
export async function resolvePanelUserLink(user: {
  id: string;
  email: string;
  panelUserId: string | null;
}): Promise<PanelLinkResult> {
  if (!user.panelUserId) {
    return { panelUserId: null, panelLinked: false, panelStatus: 'missing' };
  }

  try {
    await getPanelUser(user.panelUserId);
    return { panelUserId: user.panelUserId, panelLinked: true, panelStatus: 'linked' };
  } catch (err) {
    if (isTimeoutOrNetwork(err) || (err instanceof PanelApiError && err.status !== 404)) {
      return { panelUserId: user.panelUserId, panelLinked: false, panelStatus: 'unreachable' };
    }
    if (!(err instanceof PanelApiError) && !(err instanceof Error)) {
      return { panelUserId: user.panelUserId, panelLinked: false, panelStatus: 'unreachable' };
    }
  }

  try {
    const byEmail = await findPanelUserByEmail(user.email);
    if (byEmail) {
      if (byEmail.id !== user.panelUserId) {
        await prisma.user.update({
          where: { id: user.id },
          data: { panelUserId: byEmail.id },
        });
      }
      return { panelUserId: byEmail.id, panelLinked: true, panelStatus: 'linked' };
    }
  } catch (err) {
    if (isTimeoutOrNetwork(err) || !(err instanceof PanelApiError && err.status === 404)) {
      return { panelUserId: user.panelUserId, panelLinked: false, panelStatus: 'unreachable' };
    }
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { panelUserId: null },
  });
  return { panelUserId: null, panelLinked: false, panelStatus: 'missing' };
}
