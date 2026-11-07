import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireFullAdmin, requireStaffAccess } from '../lib/auth.js';
import { prisma } from '../lib/prisma.js';
import { recordLogFireAndForget } from '../lib/system-log.js';
import {
  assertTicketsEnabled,
  normalizeAttachments,
  nextTicketNumber,
  notifyAdmins,
  ticketDetailInclude,
  ticketListInclude,
  TICKET_PRIORITIES,
  TICKET_PRIORITY_RANK,
} from '../lib/tickets.js';
import { saveTicketImage } from '../lib/uploads.js';

const mutationLimit = {
  config: {
    rateLimit: {
      max: 30,
      timeWindow: '1 minute',
    },
  },
};

const attachmentSchema = z.object({
  url: z.string().min(1).max(512),
  name: z.string().min(1).max(120),
  mime: z.string().min(1).max(64),
  size: z.number().int().min(0).max(5_000_000),
});

const prioritySchema = z.enum(TICKET_PRIORITIES);
const iconSchema = z.string().trim().min(1).max(32);

function guessMime(filename: string, mimetype: string) {
  const mime = (mimetype || '').toLowerCase().trim();
  if (mime && mime !== 'application/octet-stream') return mime;
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  return mime || 'application/octet-stream';
}

async function parseUpload(request: { file: () => Promise<any> }) {
  const file = await request.file();
  if (!file) {
    throw Object.assign(new Error('No image uploaded'), { statusCode: 422 });
  }
  const buffer = await file.toBuffer();
  const filename = file.filename || 'image.jpg';
  return saveTicketImage({
    buffer,
    filename,
    mimetype: guessMime(filename, file.mimetype || ''),
  });
}

export async function supportClientRoutes(app: FastifyInstance) {
  app.get('/ticket-categories', { preHandler: requireAuth }, async () => {
    await assertTicketsEnabled();
    return prisma.ticketCategory.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, description: true, color: true, icon: true },
    });
  });

  app.get('/tickets', { preHandler: requireAuth }, async (request) => {
    await assertTicketsEnabled();
    return prisma.ticket.findMany({
      where: { userId: request.user!.id },
      orderBy: { updatedAt: 'desc' },
      include: ticketListInclude,
    });
  });

  app.get('/tickets/:id', { preHandler: requireAuth }, async (request, reply) => {
    await assertTicketsEnabled();
    const { id } = request.params as { id: string };
    const ticket = await prisma.ticket.findFirst({
      where: { id, userId: request.user!.id },
      include: ticketDetailInclude,
    });
    if (!ticket) return reply.status(404).send({ error: 'Ticket not found' });
    return ticket;
  });

  app.post('/tickets/upload', { preHandler: requireAuth, ...mutationLimit }, async (request, reply) => {
    await assertTicketsEnabled();
    try {
      return await parseUpload(request as any);
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode ?? 422;
      return reply.status(status).send({ error: err instanceof Error ? err.message : 'Upload failed' });
    }
  });

  app.post('/tickets', { preHandler: requireAuth, ...mutationLimit }, async (request, reply) => {
    await assertTicketsEnabled();
    const body = z
      .object({
        subject: z.string().trim().min(3).max(160),
        body: z.string().trim().min(3).max(5000),
        categoryId: z.string().min(1).nullable().optional(),
        serviceId: z.string().min(1).nullable().optional(),
        priority: prioritySchema.default('normal'),
        attachments: z.array(attachmentSchema).max(5).default([]),
      })
      .parse(request.body);

    if (body.categoryId) {
      const category = await prisma.ticketCategory.findFirst({
        where: { id: body.categoryId, active: true },
      });
      if (!category) return reply.status(422).send({ error: 'Category not found' });
    }
    if (body.serviceId) {
      const service = await prisma.service.findFirst({
        where: { id: body.serviceId, userId: request.user!.id },
      });
      if (!service) return reply.status(422).send({ error: 'Service not found on your account' });
    }

    let number = await nextTicketNumber();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const ticket = await prisma.$transaction(async (tx) => {
          const created = await tx.ticket.create({
            data: {
              number,
              userId: request.user!.id,
              categoryId: body.categoryId || null,
              serviceId: body.serviceId || null,
              subject: body.subject,
              priority: body.priority,
              status: 'open',
            },
          });
          await tx.ticketMessage.create({
            data: {
              ticketId: created.id,
              authorUserId: request.user!.id,
              body: body.body,
              attachments: normalizeAttachments(body.attachments),
            },
          });
          return created;
        });

        recordLogFireAndForget({
          level: 'info',
          category: 'billing',
          action: 'ticket.created',
          message: `${request.user!.username} opened ticket ${ticket.number}`,
          actorUserId: request.user!.id,
          ip: request.ip,
          method: 'POST',
          path: '/api/client/tickets',
          meta: { ticketId: ticket.id, number: ticket.number },
        });

        await notifyAdmins({
          type: 'info',
          title: `New ticket ${ticket.number}`,
          message: `${request.user!.username} opened “${ticket.subject}”.`,
          href: `/admin/tickets/${ticket.id}`,
        });

        return prisma.ticket.findUniqueOrThrow({
          where: { id: ticket.id },
          include: ticketDetailInclude,
        });
      } catch (err) {
        if ((err as { code?: string }).code !== 'P2002') throw err;
        number = await nextTicketNumber();
      }
    }
    return reply.status(500).send({ error: 'Could not create ticket' });
  });

  app.post('/tickets/:id/messages', { preHandler: requireAuth, ...mutationLimit }, async (request, reply) => {
    await assertTicketsEnabled();
    const { id } = request.params as { id: string };
    const body = z
      .object({
        body: z.string().trim().min(1).max(5000),
        attachments: z.array(attachmentSchema).max(5).default([]),
      })
      .parse(request.body);

    const ticket = await prisma.ticket.findFirst({
      where: { id, userId: request.user!.id },
    });
    if (!ticket) return reply.status(404).send({ error: 'Ticket not found' });
    if (ticket.status === 'closed') {
      return reply.status(422).send({ error: 'This ticket is closed' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.ticketMessage.create({
        data: {
          ticketId: ticket.id,
          authorUserId: request.user!.id,
          body: body.body,
          attachments: normalizeAttachments(body.attachments),
        },
      });
      await tx.ticket.update({
        where: { id: ticket.id },
        data: { status: 'open', updatedAt: new Date() },
      });
    });

    await notifyAdmins({
      type: 'info',
      title: `Ticket ${ticket.number} reply`,
      message: `${request.user!.username} replied to “${ticket.subject}”.`,
      href: `/admin/tickets/${ticket.id}`,
    });

    return prisma.ticket.findUniqueOrThrow({
      where: { id: ticket.id },
      include: ticketDetailInclude,
    });
  });

  app.patch('/tickets/:id', { preHandler: requireAuth, ...mutationLimit }, async (request, reply) => {
    await assertTicketsEnabled();
    const { id } = request.params as { id: string };
    const body = z
      .object({
        status: z.literal('closed'),
      })
      .parse(request.body);

    const ticket = await prisma.ticket.findFirst({
      where: { id, userId: request.user!.id },
    });
    if (!ticket) return reply.status(404).send({ error: 'Ticket not found' });
    if (ticket.status === 'closed') {
      return reply.status(422).send({ error: 'This ticket is already closed' });
    }

    const updated = await prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        status: body.status,
        closedAt: new Date(),
      },
      include: ticketDetailInclude,
    });

    recordLogFireAndForget({
      level: 'info',
      category: 'billing',
      action: 'ticket.closed',
      message: `Client closed ticket ${ticket.number}`,
      actorUserId: request.user!.id,
      targetUserId: request.user!.id,
      ip: request.ip,
      meta: { ticketId: ticket.id, number: ticket.number },
    });

    return updated;
  });
}

export async function supportAdminRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireStaffAccess);

  app.get('/ticket-categories', async () =>
    prisma.ticketCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { tickets: true } } },
    }),
  );

  app.post('/ticket-categories', { preHandler: requireFullAdmin, ...mutationLimit }, async (request) => {
    const body = z
      .object({
        name: z.string().trim().min(1).max(64),
        description: z.string().max(255).default(''),
        color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#22d3ee'),
        icon: iconSchema.default('life-buoy'),
        sortOrder: z.number().int().default(0),
        active: z.boolean().default(true),
      })
      .parse(request.body);
    return prisma.ticketCategory.create({ data: body });
  });

  app.patch('/ticket-categories/:id', { preHandler: requireFullAdmin, ...mutationLimit }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = z
      .object({
        name: z.string().trim().min(1).max(64).optional(),
        description: z.string().max(255).optional(),
        color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
        icon: iconSchema.optional(),
        sortOrder: z.number().int().optional(),
        active: z.boolean().optional(),
      })
      .parse(request.body);
    try {
      return await prisma.ticketCategory.update({ where: { id }, data: body });
    } catch {
      return reply.status(404).send({ error: 'Not found' });
    }
  });

  app.delete('/ticket-categories/:id', { preHandler: requireFullAdmin, ...mutationLimit }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await prisma.ticketCategory.delete({ where: { id } });
      return { deleted: true };
    } catch {
      return reply.status(404).send({ error: 'Not found' });
    }
  });

  app.get('/tickets', async (request) => {
    const query = z
      .object({
        status: z.enum(['open', 'answered', 'awaiting_customer', 'closed']).optional(),
        priority: prioritySchema.optional(),
        q: z.string().max(120).optional(),
      })
      .parse(request.query ?? {});

    const tickets = await prisma.ticket.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.priority ? { priority: query.priority } : {}),
        ...(query.q?.trim()
          ? {
              OR: [
                { number: { contains: query.q.trim() } },
                { subject: { contains: query.q.trim() } },
                { user: { email: { contains: query.q.trim() } } },
                { user: { username: { contains: query.q.trim() } } },
              ],
            }
          : {}),
      },
      orderBy: { updatedAt: 'desc' },
      include: ticketListInclude,
      take: 200,
    });

    return [...tickets].sort((a, b) => {
      const byPriority = TICKET_PRIORITY_RANK[a.priority] - TICKET_PRIORITY_RANK[b.priority];
      if (byPriority !== 0) return byPriority;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  });

  app.get('/tickets/summary', async () => {
    const open = await prisma.ticket.count({ where: { status: 'open' } });
    return { open };
  });

  app.get('/tickets/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: ticketDetailInclude,
    });
    if (!ticket) return reply.status(404).send({ error: 'Not found' });
    return ticket;
  });

  app.post('/tickets/upload', { ...mutationLimit }, async (request, reply) => {
    try {
      return await parseUpload(request as any);
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode ?? 422;
      return reply.status(status).send({ error: err instanceof Error ? err.message : 'Upload failed' });
    }
  });

  app.post('/tickets/:id/messages', { ...mutationLimit }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = z
      .object({
        body: z.string().trim().min(1).max(5000),
        attachments: z.array(attachmentSchema).max(5).default([]),
        status: z.enum(['open', 'answered', 'awaiting_customer', 'closed']).optional(),
      })
      .parse(request.body);

    const ticket = await prisma.ticket.findUnique({ where: { id } });
    if (!ticket) return reply.status(404).send({ error: 'Not found' });

    const nextStatus = body.status ?? (ticket.status === 'closed' ? 'closed' : 'answered');

    await prisma.$transaction(async (tx) => {
      await tx.ticketMessage.create({
        data: {
          ticketId: ticket.id,
          authorUserId: request.user!.id,
          body: body.body,
          attachments: normalizeAttachments(body.attachments),
        },
      });
      await tx.ticket.update({
        where: { id: ticket.id },
        data: {
          status: nextStatus,
          closedAt: nextStatus === 'closed' ? new Date() : null,
        },
      });
      await tx.notification.create({
        data: {
          userId: ticket.userId,
          type: 'info',
          title: `Ticket ${ticket.number} updated`,
          message: nextStatus === 'closed'
            ? `Your ticket “${ticket.subject}” was closed.`
            : `Staff replied to “${ticket.subject}”.`,
          href: `/tickets/${ticket.id}`,
        },
      });
    });

    recordLogFireAndForget({
      level: 'info',
      category: 'admin',
      action: 'ticket.reply',
      message: `Admin replied to ${ticket.number}`,
      actorUserId: request.user!.id,
      targetUserId: ticket.userId,
      ip: request.ip,
      meta: { ticketId: ticket.id, status: nextStatus },
    });

    return prisma.ticket.findUniqueOrThrow({
      where: { id: ticket.id },
      include: ticketDetailInclude,
    });
  });

  app.patch('/tickets/:id', { ...mutationLimit }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = z
      .object({
        status: z.enum(['open', 'answered', 'awaiting_customer', 'closed']).optional(),
        priority: prioritySchema.optional(),
        categoryId: z.string().min(1).nullable().optional(),
        serviceId: z.string().min(1).nullable().optional(),
      })
      .parse(request.body);

    const ticket = await prisma.ticket.findUnique({ where: { id } });
    if (!ticket) return reply.status(404).send({ error: 'Not found' });

    const updated = await prisma.ticket.update({
      where: { id },
      data: {
        ...(body.status
          ? {
              status: body.status,
              closedAt: body.status === 'closed' ? new Date() : null,
            }
          : {}),
        ...(body.priority !== undefined ? { priority: body.priority } : {}),
        ...(body.categoryId !== undefined ? { categoryId: body.categoryId } : {}),
        ...(body.serviceId !== undefined ? { serviceId: body.serviceId } : {}),
      },
      include: ticketDetailInclude,
    });

    if (body.status && body.status !== ticket.status) {
      await prisma.notification.create({
        data: {
          userId: ticket.userId,
          type: 'info',
          title: `Ticket ${ticket.number}`,
          message: `Status changed to ${body.status.replaceAll('_', ' ')}.`,
          href: `/tickets/${ticket.id}`,
        },
      });
    }

    if (body.priority && body.priority !== ticket.priority) {
      await prisma.notification.create({
        data: {
          userId: ticket.userId,
          type: 'info',
          title: `Ticket ${ticket.number}`,
          message: `Priority changed to ${body.priority}.`,
          href: `/tickets/${ticket.id}`,
        },
      });
    }

    return updated;
  });

  app.delete('/tickets/:id', { preHandler: requireFullAdmin, ...mutationLimit }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const ticket = await prisma.ticket.findUnique({ where: { id } });
    if (!ticket) return reply.status(404).send({ error: 'Not found' });
    await prisma.ticket.delete({ where: { id } });
    recordLogFireAndForget({
      level: 'warn',
      category: 'admin',
      action: 'ticket.deleted',
      message: `Deleted ticket ${ticket.number}`,
      actorUserId: request.user!.id,
      targetUserId: ticket.userId,
      ip: request.ip,
      meta: { ticketId: ticket.id, number: ticket.number },
    });
    return { deleted: true };
  });
}
