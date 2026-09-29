/**
 * Adds demo personnel, movements and incidents for Maitri Station.
 * Safe to run more than once: it skips anything already present.
 *
 *   npx tsx --env-file=.env scripts/seed-platform-demo.ts
 */
import { prisma } from '../src/lib/prisma';

const DAY = 86_400_000;

async function main() {
  const station = await prisma.station.findUnique({ where: { identifier: 'MAITRI' } });
  if (!station) throw new Error('Station MAITRI not found. Seed the base data first.');

  const expedition = await prisma.expedition.findFirst({
    where: { stationId: station.id },
    orderBy: { startDate: 'asc' },
  });

  if ((await prisma.personnel.count({ where: { stationId: station.id } })) === 0) {
    const people: Array<{ name: string; role: string; status: 'AT_STATION' | 'IN_TRANSIT' | 'ON_EXPEDITION' }> = [
      { name: 'Anil Menon', role: 'Station leader', status: 'AT_STATION' },
      { name: 'Priya Nair', role: 'Medical officer', status: 'AT_STATION' },
      { name: 'Kavya Reddy', role: 'Radio operator', status: 'AT_STATION' },
      { name: 'Meera Das', role: 'Cook', status: 'AT_STATION' },
      { name: 'Divya Sharma', role: 'Meteorologist', status: 'IN_TRANSIT' },
      { name: 'Rohan Iyer', role: 'Field engineer', status: 'ON_EXPEDITION' },
      { name: 'Sanjay Kulkarni', role: 'Glaciologist', status: 'ON_EXPEDITION' },
      { name: 'Arjun Pillai', role: 'Mechanic', status: 'ON_EXPEDITION' },
      { name: 'Vikram Rao', role: 'Geologist', status: 'ON_EXPEDITION' },
      { name: 'Neha Joshi', role: 'Geologist', status: 'ON_EXPEDITION' },
    ];

    for (const [index, p] of people.entries()) {
      const onTrip = p.status === 'ON_EXPEDITION' && expedition !== null;
      const created = await prisma.personnel.create({
        data: {
          stationId: station.id,
          name: p.name,
          role: p.role,
          status: onTrip || p.status !== 'ON_EXPEDITION' ? p.status : 'AT_STATION',
          expeditionId: onTrip ? expedition!.id : null,
        },
      });

      if (p.status !== 'AT_STATION' && (onTrip || p.status === 'IN_TRANSIT')) {
        await prisma.personnelMovement.create({
          data: {
            personnelId: created.id,
            fromStatus: 'AT_STATION',
            toStatus: p.status,
            note: p.status === 'IN_TRANSIT' ? 'Travelling between station and airstrip' : 'Departed with survey team',
            occurredAt: new Date(Date.now() - (index + 1) * 6 * 3_600_000),
          },
        });
      }
    }
    console.log('Added demo personnel and movements');
  } else {
    console.log('Personnel already present, skipped');
  }

  if ((await prisma.incident.count({ where: { stationId: station.id } })) === 0) {
    await prisma.incident.create({
      data: {
        stationId: station.id,
        title: 'Whiteout conditions on traverse route',
        description: 'Visibility under 20 m. Traverse party holding position.',
        location: 'Route B, 40 km south',
        severity: 'HIGH',
        status: 'RESPONDING',
        reportedAt: new Date(Date.now() - 3 * 3_600_000),
      },
    });
    await prisma.incident.create({
      data: {
        stationId: station.id,
        title: 'Generator 2 overheating',
        description: 'Switched to Generator 1. Coolant line replaced.',
        location: 'Power house',
        severity: 'MEDIUM',
        status: 'RESOLVED',
        reportedAt: new Date(Date.now() - 2 * DAY),
        resolvedAt: new Date(Date.now() - 2 * DAY + 5 * 3_600_000),
      },
    });
    console.log('Added demo incidents');
  } else {
    console.log('Incidents already present, skipped');
  }
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
