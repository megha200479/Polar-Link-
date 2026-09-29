import { describe, it, expect } from 'vitest';
import {
  calculateShortageProjection,
  ShortageSupplyInput,
  ShortageExpeditionInput,
  ShortageShipmentInput,
} from '@/lib/services/shortageEngine';

describe('Milestone 3: Shortage Calculation Engine & Fixtures', () => {
  const baseNow = new Date('2026-10-01T00:00:00.000Z');

  it('matches the Baseline Acceptance Fixture precisely', () => {
    // Fixture: Stock = 120 food packs, Baseline consumption = 10 packs/day, Next delivery = 16 days, No incoming shipment
    const supply: ShortageSupplyInput = {
      id: 'food-001',
      name: 'Food Packs',
      unit: 'packs',
      onHandQuantity: 120,
      configuredDailyConsumption: 10,
    };

    const result = calculateShortageProjection(supply, [], [], {
      now: baseNow,
      targetHorizonDays: 16,
      safetyBufferDays: 7,
    });

    expect(result.coverageDays).toBe(12); // 120 / 10 = 12 days
    expect(result.baselineShortageDays).toBe(4); // 16 - 12 = 4 days
    expect(result.baselineDemandGap).toBe(40); // 160 demand - 120 on hand = 40 packs
    expect(result.coverageStatus).toBe('CRITICAL');
    expect(result.coverageDisplay).toBe('12.0 days');
    expect(result.baseDemandUntilHorizon).toBe(160);
    expect(result.totalGrossDemand).toBe(160);
  });

  it('matches the Expedition Demand Fixture precisely (+50 packs)', () => {
    // Adds 5 people for 10 overlapping days at 1 pack/person/day = +50 packs
    const supply: ShortageSupplyInput = {
      id: 'food-001',
      name: 'Food Packs',
      unit: 'packs',
      onHandQuantity: 120,
      configuredDailyConsumption: 10,
      perPersonDailyExpeditionConsumption: 1,
    };

    const expeditions: ShortageExpeditionInput[] = [
      {
        id: 'exp-01',
        name: 'Queen Maud Traverse',
        additionalPeople: 5,
        startDate: new Date('2026-10-03T00:00:00Z'),
        endDate: new Date('2026-10-13T00:00:00Z'), // 10 days duration
      },
    ];

    const result = calculateShortageProjection(supply, expeditions, [], {
      now: baseNow,
      targetHorizonDays: 16,
      safetyBufferDays: 7,
    });

    expect(result.expeditionDemandUntilHorizon).toBe(50); // 5 people * 10 days * 1 pack = 50 packs
    expect(result.totalGrossDemand).toBe(210); // 160 base + 50 expedition = 210 packs
    expect(result.totalDemandGap).toBe(90); // 210 gross demand - 120 on hand = 90 packs
  });

  it('handles zero daily consumption safely with clear warning text', () => {
    const supply: ShortageSupplyInput = {
      id: 'gear-001',
      name: 'Specialist Climbing Gear',
      unit: 'sets',
      onHandQuantity: 15,
      configuredDailyConsumption: 0,
    };

    const result = calculateShortageProjection(supply, [], [], { now: baseNow });

    expect(result.coverageDays).toBeNull();
    expect(result.coverageDisplay).toBe('No baseline consumption configured');
    expect(result.coverageStatus).toBe('UNCONFIGURED');
    expect(result.baseDemandUntilHorizon).toBe(0);
    expect(result.totalDemandGap).toBe(0);
  });

  it('never lets a later shipment conceal an earlier stockout ("Earlier delivery required")', () => {
    // Stock = 120, Daily = 10 -> Stock runs out on day 12
    // A shipment of 200 packs arrives on day 15 (before the 16d horizon)
    const supply: ShortageSupplyInput = {
      id: 'food-001',
      name: 'Food Packs',
      unit: 'packs',
      onHandQuantity: 120,
      configuredDailyConsumption: 10,
    };

    const shipments: ShortageShipmentInput[] = [
      {
        id: 'ship-late',
        status: 'DISPATCHED',
        eta: new Date('2026-10-16T00:00:00Z'), // Day 15 relative to 2026-10-01
        items: [{ supplyId: 'food-001', quantity: 200 }],
      },
    ];

    const result = calculateShortageProjection(supply, [], shipments, {
      now: baseNow,
      targetHorizonDays: 16,
    });

    expect(result.earlierDeliveryRequired).toBe(true);
    expect(result.projectedStockoutDay).toBe(12);
    expect(result.earlierDeliveryReason).toContain('Stockout projected on Day 12');
    expect(result.earlierDeliveryReason).toContain('Earlier delivery required');
  });

  it('distinguishes REQUESTED (uncommitted) from DISPATCHED (committed) shipments', () => {
    const supply: ShortageSupplyInput = {
      id: 'food-001',
      name: 'Food Packs',
      unit: 'packs',
      onHandQuantity: 120,
      configuredDailyConsumption: 10,
    };

    const shipments: ShortageShipmentInput[] = [
      {
        id: 'ship-requested',
        status: 'REQUESTED',
        eta: new Date('2026-10-10T00:00:00Z'),
        items: [{ supplyId: 'food-001', quantity: 100 }],
      },
      {
        id: 'ship-dispatched',
        status: 'DISPATCHED',
        eta: new Date('2026-10-08T00:00:00Z'),
        items: [{ supplyId: 'food-001', quantity: 50 }],
      },
    ];

    const result = calculateShortageProjection(supply, [], shipments, {
      now: baseNow,
      targetHorizonDays: 16,
    });

    // Only the DISPATCHED shipment counts in committed incoming stock
    expect(result.committedIncomingQuantity).toBe(50);
    // The REQUESTED shipment is tracked separately as uncommitted
    expect(result.uncommittedIncomingQuantity).toBe(100);
    expect(result.uncommittedShipments).toHaveLength(1);
    expect(result.committedShipments).toHaveLength(1);
  });
});
