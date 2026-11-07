import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import 'dotenv/config';

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.ADMIN_EMAIL ?? 'admin@spirithost.local').toLowerCase();
  const username = process.env.ADMIN_USERNAME ?? 'admin';
  const password = process.env.ADMIN_PASSWORD;
  const firstName = process.env.ADMIN_FIRST_NAME ?? 'Spirit';
  const lastName = process.env.ADMIN_LAST_NAME ?? 'Admin';

  if (!password) {
    console.warn(
      'Skipping admin user seed: set ADMIN_PASSWORD (min 16 chars, letter + number) to create the first admin.',
    );
  } else if (password.length < 16 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    throw new Error('ADMIN_PASSWORD must be at least 16 characters and include a letter and a number');
  } else {
    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { username }, { role: 'admin' }] },
    });

    if (!existing) {
      await prisma.user.create({
        data: {
          email,
          username,
          firstName,
          lastName,
          role: 'admin',
          passwordHash: await bcrypt.hash(password, 12),
        },
      });
      console.log(`Created billing admin: ${email} / ${username}`);
    } else {
      console.log('Admin user already exists, skipping');
    }
  }

  await prisma.setting.upsert({
    where: { key: 'company_name' },
    create: { key: 'company_name', value: process.env.COMPANY_NAME ?? 'Spirit Host' },
    update: {},
  });
  await prisma.setting.upsert({
    where: { key: 'payment_instructions' },
    create: {
      key: 'payment_instructions',
      value:
        process.env.PAYMENT_INSTRUCTIONS ??
        'Pay by bank transfer and include your invoice number as the reference.\nWe will activate your service once payment is confirmed.',
    },
    update: {},
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
