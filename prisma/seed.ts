import { prisma } from '../src/lib/prisma';
import { seedDatabase } from '../src/lib/seed';

async function main() {
  try {
    await seedDatabase(prisma);
  } catch (e) {
    console.error('Seed failed:', e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
