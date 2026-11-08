import { getSetting, setSetting } from './billing.js';
import { prisma } from './prisma.js';
import {
  assertUploadReadable,
  readTicketUploadMeta,
  signTicketUploadUrl,
} from './uploads.js';

const TICKETS_ENABLED = 'tickets_enabled';

export async function areTicketsEnabled(): Promise<boolean> {
  return (await getSetting(TICKETS_ENABLED, 'true')) === 'true';
}

export async function setTicketsEnabled(enabled: boolean) {
  await setSetting(TICKETS_ENABLED, enabled ? 'true' : 'false');
}

export async function assertTicketsEnabled() {
  if (!(await areTicketsEnabled())) {
    throw Object.assign(new Error('Support tickets are currently disabled'), { statusCode: 403 });
  }
}

/** Seed a General category when none exist yet. */
export async function ensureDefaultTicketCategories() {
  const count = await prisma.ticketCategory.count();
  if (count > 0) return;
  await prisma.ticketCategory.create({
    data: {
      name: 'General',
      description: 'Billing, account, and general hosting questions',
      color: '#22d3ee',
      icon: 'life-buoy',
      sortOrder: 0,
      active: true,
    },
  });
}

export async function nextTicketNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `TKT-${year}-`;
  const latest = await prisma.ticket.findFirst({
    where: { number: { startsWith: prefix } },
    orderBy: { number: 'desc' },
    select: { number: true },
  });
  const seq = latest ? Number(latest.number.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(Number.isFinite(seq) ? seq : 1).padStart(5, '0')}`;
}

export type TicketAttachment = {
  url: string;
  name: string;
  mime: string;
  size: number;
};

function normalizeAttachmentUrl(url: string): string {
  const trimmed = url.trim();
  if (trimmed.startsWith('/uploads/tickets/')) return trimmed.slice(0, 512);
  try {
    const parsed = new URL(trimmed);
    if (parsed.pathname.startsWith('/uploads/tickets/')) return parsed.pathname.slice(0, 512);
  } catch {
    /* ignore */
  }
  return '';
}

/** Sync shape check only — prefer normalizeAttachmentsForUser for writes. */
export function normalizeAttachments(raw: unknown): TicketAttachment[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => ({
      url: typeof item.url === 'string' ? normalizeAttachmentUrl(item.url) : '',
      name: typeof item.name === 'string' ? item.name.slice(0, 120) : 'image',
      mime: typeof item.mime === 'string' ? item.mime.slice(0, 64) : 'image/jpeg',
      size: typeof item.size === 'number' ? item.size : 0,
    }))
    .filter((item) => item.url.startsWith('/uploads/tickets/'))
    .slice(0, 5);
}

/** Bind attachments to files on disk and to the uploading user when meta exists. */
export async function normalizeAttachmentsForUser(
  raw: unknown,
  userId: string,
): Promise<TicketAttachment[]> {
  const candidates = normalizeAttachments(raw);
  const out: TicketAttachment[] = [];
  for (const item of candidates) {
    if (!(await assertUploadReadable(item.url))) continue;
    const name = item.url.replace('/uploads/tickets/', '').split('?')[0];
    const meta = await readTicketUploadMeta(name);
    // Reject attaching another user's upload; allow legacy files without meta.
    if (meta && meta.userId !== userId) continue;
    out.push({ ...item, url: item.url.split('?')[0] });
  }
  return out.slice(0, 5);
}

export function signTicketAttachments<T extends { attachments?: unknown }>(message: T): T {
  const raw = message.attachments;
  if (!Array.isArray(raw)) return message;
  const attachments = raw.map((item) => {
    if (!item || typeof item !== 'object') return item;
    const row = item as Record<string, unknown>;
    if (typeof row.url !== 'string') return item;
    return { ...row, url: signTicketUploadUrl(row.url) };
  });
  return { ...message, attachments };
}

export function signTicketDetail<T extends { messages?: Array<{ attachments?: unknown }> }>(ticket: T): T {
  if (!ticket.messages?.length) return ticket;
  return {
    ...ticket,
    messages: ticket.messages.map((m) => signTicketAttachments(m)),
  };
}

/** Notify every enabled admin (used for new tickets / client replies). */
export async function notifyAdmins(input: {
  type: 'info' | 'success' | 'warning';
  title: string;
  message: string;
  href: string;
}) {
  const admins = await prisma.user.findMany({
    where: { role: 'admin', enabled: true },
    select: { id: true },
  });
  if (!admins.length) return;
  await prisma.notification.createMany({
    data: admins.map((admin) => ({
      userId: admin.id,
      type: input.type,
      title: input.title,
      message: input.message,
      href: input.href,
    })),
  });
}

export const ticketListInclude = {
  category: { select: { id: true, name: true, color: true, icon: true } },
  service: { select: { id: true, name: true, status: true } },
  user: {
    select: { id: true, username: true, email: true, firstName: true, lastName: true },
  },
  _count: { select: { messages: true } },
} as const;

const ticketMessageInclude = {
  orderBy: { createdAt: 'asc' as const },
  include: {
    author: {
      select: {
        id: true,
        username: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        avatarUrl: true,
      },
    },
  },
} as const;

/** Staff/admin ticket detail — may include panel server id for ops. */
export const ticketDetailInclude = {
  category: { select: { id: true, name: true, color: true, description: true, icon: true } },
  service: {
    select: {
      id: true,
      name: true,
      status: true,
      panelServerId: true,
      product: { select: { id: true, name: true } },
    },
  },
  user: {
    select: {
      id: true,
      username: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      avatarUrl: true,
    },
  },
  messages: ticketMessageInclude,
} as const;

/** Client-facing ticket detail — no panel identifiers. */
export const clientTicketDetailInclude = {
  category: { select: { id: true, name: true, color: true, description: true, icon: true } },
  service: {
    select: {
      id: true,
      name: true,
      status: true,
      product: { select: { id: true, name: true } },
    },
  },
  user: {
    select: {
      id: true,
      username: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      avatarUrl: true,
    },
  },
  messages: ticketMessageInclude,
} as const;

export const TICKET_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const TICKET_PRIORITY_RANK: Record<TicketPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};
