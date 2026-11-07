import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

const prisma = new PrismaClient();

const MINECRAFT_LOGO =
  'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png/minecraft.png';

async function main() {
  const existingCategories = await prisma.category.findMany({
    include: { products: true },
    orderBy: { sortOrder: 'asc' },
  });
  const donorProduct = existingCategories.flatMap((c) => c.products)[0];

  const panelEggId =
    process.env.MINECRAFT_PANEL_EGG_ID || donorProduct?.panelEggId || 'minecraft-egg';
  const panelNodeId =
    process.env.MINECRAFT_PANEL_NODE_ID || donorProduct?.panelNodeId || null;

  const category = await prisma.category.upsert({
    where: { slug: 'minecraft' },
    create: {
      name: 'Minecraft',
      slug: 'minecraft',
      description:
        'Vanilla, Paper, and modded Minecraft servers with one-click plugins and full Spirit-Panel control.',
      color: '#22c55e',
      icon: 'pickaxe',
      logoUrl: MINECRAFT_LOGO,
      sortOrder: 1,
      active: true,
      panelEggId: process.env.MINECRAFT_PANEL_EGG_ID || null,
    },
    update: {
      name: 'Minecraft',
      description:
        'Vanilla, Paper, and modded Minecraft servers with one-click plugins and full Spirit-Panel control.',
      color: '#22c55e',
      icon: 'pickaxe',
      logoUrl: MINECRAFT_LOGO,
      active: true,
      sortOrder: 1,
    },
  });

  await prisma.category.updateMany({
    where: { slug: 'fivem' },
    data: { sortOrder: 0 },
  });

  let plan = await prisma.product.findFirst({
    where: { categoryId: category.id, name: 'Grassroots' },
  });

  if (!plan) {
    plan = await prisma.product.create({
      data: {
        categoryId: category.id,
        name: 'Grassroots',
        description:
          'A solid starter Minecraft plan for friends and small communities. Ideal for vanilla or light plugin servers.',
        features: JSON.stringify([
          'Instant server deployment',
          'DDoS protection included',
          'Full Spirit-Panel access',
          'One-click Modrinth plugins',
          'Automatic backups available',
        ]),
        priceCents: 600,
        currency: 'GBP',
        cycle: 'monthly',
        active: true,
        sortOrder: 0,
        panelEggId,
        panelNodeId,
        memoryMb: 2048,
        diskMb: 15360,
        cpuPercent: 150,
        backupLimit: 2,
        databaseLimit: 2,
        allocationLimit: 1,
        subdomainAccess: true,
        fivemMarketplaceAccess: false,
        minecraftPluginsAccess: true,
      },
    });
    console.log(`Created Minecraft plan: ${plan.name} (${plan.id})`);
  } else {
    plan = await prisma.product.update({
      where: { id: plan.id },
      data: {
        description:
          'A solid starter Minecraft plan for friends and small communities. Ideal for vanilla or light plugin servers.',
        features: JSON.stringify([
          'Instant server deployment',
          'DDoS protection included',
          'Full Spirit-Panel access',
          'One-click Modrinth plugins',
          'Automatic backups available',
        ]),
        priceCents: 600,
        currency: 'GBP',
        cycle: 'monthly',
        active: true,
        memoryMb: 2048,
        diskMb: 15360,
        cpuPercent: 150,
        backupLimit: 2,
        databaseLimit: 2,
        allocationLimit: 1,
        subdomainAccess: true,
        minecraftPluginsAccess: true,
        panelEggId: plan.panelEggId || panelEggId,
        panelNodeId: plan.panelNodeId || panelNodeId,
      },
    });
    console.log(`Updated existing Minecraft plan: ${plan.name} (${plan.id})`);
  }

  const refreshed = await prisma.category.findUnique({
    where: { id: category.id },
    include: { products: { select: { id: true, name: true, priceCents: true, memoryMb: true, active: true } } },
  });

  console.log(JSON.stringify(refreshed, null, 2));
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
