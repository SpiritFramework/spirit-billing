import { PrismaClient, type InvoiceStatus } from '@prisma/client';
import 'dotenv/config';

const prisma = new PrismaClient();

function daysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

function daysFromNow(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

async function nextInvoiceNumber(prefix = 'INV') {
  const year = new Date().getFullYear();
  const latest = await prisma.invoice.findFirst({
    where: { number: { startsWith: `${prefix}-${year}-` } },
    orderBy: { number: 'desc' },
    select: { number: true },
  });
  const lastSeq = latest?.number ? Number(latest.number.split('-').pop()) : 0;
  const seq = Number.isFinite(lastSeq) ? lastSeq + 1 : 1;
  return `${prefix}-${year}-${String(seq).padStart(5, '0')}`;
}

async function createInvoice(input: {
  userId: string;
  serviceId?: string | null;
  status: InvoiceStatus;
  subtotalCents: number;
  discountCents?: number;
  creditAppliedCents?: number;
  currency: string;
  description: string;
  couponCode?: string | null;
  dueAt: Date;
  paidAt?: Date | null;
  createdAt: Date;
  paidById?: string | null;
}) {
  const discountCents = input.discountCents ?? 0;
  const creditAppliedCents = input.creditAppliedCents ?? 0;
  const totalCents = Math.max(0, input.subtotalCents - discountCents - creditAppliedCents);
  const number = await nextInvoiceNumber();

  return prisma.invoice.create({
    data: {
      number,
      userId: input.userId,
      serviceId: input.serviceId ?? null,
      status: input.status,
      currency: input.currency,
      subtotalCents: input.subtotalCents,
      discountCents,
      creditAppliedCents,
      totalCents,
      description: input.description,
      couponCode: input.couponCode ?? null,
      dueAt: input.dueAt,
      paidAt: input.paidAt ?? null,
      paidById: input.paidById ?? null,
      createdAt: input.createdAt,
    },
  });
}

async function main() {
  const emailArg = process.argv.find((arg) => arg.startsWith('--email='))?.slice('--email='.length);
  const user = emailArg
    ? await prisma.user.findFirst({ where: { email: emailArg.toLowerCase() } })
    : (await prisma.user.findFirst({ where: { role: 'client' }, orderBy: { createdAt: 'asc' } })) ??
      (await prisma.user.findFirst({ where: { role: 'admin' }, orderBy: { createdAt: 'asc' } }));

  if (!user) {
    throw new Error(
      emailArg
        ? `No user found for ${emailArg}.`
        : 'No users found. Create an account first, then re-run this script.',
    );
  }

  const service =
    (await prisma.service.findFirst({
      where: { userId: user.id },
      include: { product: true },
      orderBy: { createdAt: 'desc' },
    })) ??
    (await prisma.service.findFirst({
      include: { product: true },
      orderBy: { createdAt: 'desc' },
    }));

  const product =
    service?.product ??
    (await prisma.product.findFirst({ where: { active: true }, orderBy: { sortOrder: 'asc' } }));

  if (!product) {
    throw new Error('No products found. Create a hosting plan first.');
  }

  const currency = service?.currency ?? product.currency ?? 'GBP';
  const planPrice = service?.priceCents ?? product.priceCents;
  const serviceId = service?.id ?? null;

  // Avoid duplicating if this demo set already exists
  const existingDemo = await prisma.invoice.count({
    where: {
      userId: user.id,
      OR: [
        { description: { contains: 'Demo seed' } },
        { description: { in: ['Initial setup', 'Monthly renewal', 'Upcoming renewal', 'Resource upgrade', 'Cancelled addon — reserved IP'] } },
      ],
    },
  });
  if (existingDemo > 0) {
    console.log(`Demo invoices already exist for ${user.email} (${existingDemo}). Skipping.`);
    return;
  }

  const specs = [
    {
      status: 'paid' as const,
      subtotalCents: planPrice,
      description: 'Initial setup',
      createdAt: daysAgo(75),
      dueAt: daysAgo(68),
      paidAt: daysAgo(70),
      paidById: user.id,
    },
    {
      status: 'paid' as const,
      subtotalCents: planPrice,
      discountCents: Math.round(planPrice * 0.1),
      couponCode: 'WELCOME10',
      description: 'Monthly renewal',
      createdAt: daysAgo(45),
      dueAt: daysAgo(38),
      paidAt: daysAgo(40),
      paidById: user.id,
    },
    {
      status: 'paid' as const,
      subtotalCents: planPrice,
      creditAppliedCents: Math.min(250, planPrice),
      description: 'Monthly renewal',
      createdAt: daysAgo(18),
      dueAt: daysAgo(11),
      paidAt: daysAgo(14),
      paidById: user.id,
    },
    {
      status: 'unpaid' as const,
      subtotalCents: planPrice,
      description: 'Upcoming renewal',
      createdAt: daysAgo(2),
      dueAt: daysFromNow(5),
      paidAt: null,
    },
    {
      status: 'unpaid' as const,
      subtotalCents: Math.round(planPrice * 1.5),
      description: 'Resource upgrade',
      createdAt: daysAgo(1),
      dueAt: daysFromNow(2),
      paidAt: null,
    },
    {
      status: 'cancelled' as const,
      subtotalCents: 999,
      description: 'Cancelled addon — reserved IP',
      createdAt: daysAgo(30),
      dueAt: daysAgo(23),
      paidAt: null,
    },
  ];

  const created = [];
  for (const spec of specs) {
    const invoice = await createInvoice({
      userId: user.id,
      serviceId,
      currency,
      ...spec,
    });
    created.push(invoice);
  }

  console.log(`Seeded ${created.length} demo invoices for ${user.email} (${user.username})`);
  for (const invoice of created) {
    console.log(`  ${invoice.number}  ${invoice.status.padEnd(9)}  ${(invoice.totalCents / 100).toFixed(2)} ${invoice.currency}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
