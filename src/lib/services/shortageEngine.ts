import { Decimal } from 'decimal.js';

export interface ShortageSupplyInput {
  id: string;
  name: string;
  unit: string;
  onHandQuantity: number | Decimal;
  configuredDailyConsumption: number | Decimal;
  perPersonDailyExpeditionConsumption?: number | Decimal | null;
}

export interface ShortageExpeditionInput {
  id: string;
  name: string;
  additionalPeople: number;
  startDate: Date | string;
  endDate: Date | string;
}

export interface ShortageShipmentItemInput {
  supplyId: string;
  quantity: number | Decimal;
}

export interface ShortageShipmentInput {
  id: string;
  status: 'REQUESTED' | 'DISPATCHED' | 'RECEIVED';
  eta?: Date | string | null;
  items: ShortageShipmentItemInput[];
}

export interface ShortageCalculationOptions {
  now?: Date;
  targetHorizonDays?: number; // Days until planned delivery (default 16)
  safetyBufferDays?: number; // Days of safety stock buffer (default 7)
}

export interface ExpeditionDemandDetail {
  expeditionId: string;
  expeditionName: string;
  additionalPeople: number;
  overlapDays: number;
  ratePerPersonDay: number;
  demandQuantity: number;
}

export interface CommittedShipmentDetail {
  shipmentId: string;
  status: 'DISPATCHED';
  arrivalDayOffset: number;
  arrivalDate: string;
  quantity: number;
}

export interface UncommittedShipmentDetail {
  shipmentId: string;
  status: 'REQUESTED';
  quantity: number;
  notes: string;
}

export interface ShortageAnalysisResult {
  supplyId: string;
  supplyName: string;
  unit: string;
  onHandQuantity: number;
  configuredDailyConsumption: number;

  // 1. Coverage
  coverageDays: number | null;
  coverageStatus: 'NORMAL' | 'LOW' | 'CRITICAL' | 'UNCONFIGURED';
  coverageDisplay: string;

  // 2. Horizon & Demand
  horizonDays: number;
  targetDeliveryDate: string;
  baseDemandUntilHorizon: number;
  expeditionDemandUntilHorizon: number;
  expeditionDetails: ExpeditionDemandDetail[];
  totalGrossDemand: number;

  // 3. Safety Buffer
  safetyBufferDays: number;
  bufferDemand: number;

  // 4. Committed & Uncommitted Inflow
  committedIncomingQuantity: number;
  committedShipments: CommittedShipmentDetail[];
  uncommittedIncomingQuantity: number;
  uncommittedShipments: UncommittedShipmentDetail[];
  hasOverdueShipment: boolean;
  hasMissingEtaShipment: boolean;

  // 5. Shortage & Gap
  baselineShortageDays: number;
  baselineDemandGap: number; // Baseline demand - stock (ignoring buffer & expedition)
  totalDemandGap: number; // Gross demand - stock - committed inflow
  suggestedResupplyQuantity: number;

  // 6. Chronological stockout & alerts
  projectedStockoutDay: number | null; // Day offset 0..H when stock hits 0
  earlierDeliveryRequired: boolean;
  earlierDeliveryReason: string | null;

  // 7. Full mathematical breakdown
  calculationExplanation: string;
}

export function utcDayDiff(start: Date, end: Date): number {
  const msPerDay = 86400000;
  const startUtc = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const endUtc = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  return Math.round((endUtc - startUtc) / msPerDay);
}

export function calculateShortageProjection(
  supply: ShortageSupplyInput,
  expeditions: ShortageExpeditionInput[] = [],
  shipments: ShortageShipmentInput[] = [],
  options: ShortageCalculationOptions = {}
): ShortageAnalysisResult {
  const now = options.now ? new Date(options.now) : new Date();
  const horizonDays = options.targetHorizonDays !== undefined ? options.targetHorizonDays : 16;
  const safetyBufferDays = options.safetyBufferDays !== undefined ? options.safetyBufferDays : 7;

  const onHand = new Decimal(supply.onHandQuantity).toNumber();
  const dailyRate = new Decimal(supply.configuredDailyConsumption).toNumber();
  const expeditionRate = supply.perPersonDailyExpeditionConsumption
    ? new Decimal(supply.perPersonDailyExpeditionConsumption).toNumber()
    : 0;

  const targetDeliveryDate = new Date(now.getTime() + horizonDays * 86400000);

  // 1. Base Coverage
  let coverageDays: number | null = null;
  let coverageDisplay: string;
  let coverageStatus: 'NORMAL' | 'LOW' | 'CRITICAL' | 'UNCONFIGURED' = 'NORMAL';

  if (dailyRate <= 0) {
    coverageDisplay = 'No baseline consumption configured';
    coverageStatus = 'UNCONFIGURED';
  } else {
    coverageDays = Math.round((onHand / dailyRate) * 100) / 100;
    coverageDisplay = `${coverageDays.toFixed(1)} days`;

    if (coverageDays < horizonDays) {
      coverageStatus = 'CRITICAL';
    } else if (coverageDays < horizonDays + safetyBufferDays) {
      coverageStatus = 'LOW';
    } else {
      coverageStatus = 'NORMAL';
    }
  }

  // 2. Base Demand until Horizon
  const baseDemandUntilHorizon = Math.round(dailyRate * horizonDays * 100) / 100;

  // 3. Expedition Overlap Demand
  const horizonStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const horizonEnd = new Date(Date.UTC(targetDeliveryDate.getUTCFullYear(), targetDeliveryDate.getUTCMonth(), targetDeliveryDate.getUTCDate()));

  let totalExpeditionDemand = 0;
  const expeditionDetails: ExpeditionDemandDetail[] = [];

  if (expeditionRate > 0) {
    for (const exp of expeditions) {
      const expStart = new Date(exp.startDate);
      const expEnd = new Date(exp.endDate);

      const overlapStart = new Date(Math.max(horizonStart.getTime(), expStart.getTime()));
      const overlapEnd = new Date(Math.min(horizonEnd.getTime(), expEnd.getTime()));

      const overlapDays = Math.max(0, utcDayDiff(overlapStart, overlapEnd));

      if (overlapDays > 0) {
        const demand = Math.round(exp.additionalPeople * overlapDays * expeditionRate * 100) / 100;
        totalExpeditionDemand += demand;
        expeditionDetails.push({
          expeditionId: exp.id,
          expeditionName: exp.name,
          additionalPeople: exp.additionalPeople,
          overlapDays,
          ratePerPersonDay: expeditionRate,
          demandQuantity: demand,
        });
      }
    }
  }

  const totalGrossDemand = Math.round((baseDemandUntilHorizon + totalExpeditionDemand) * 100) / 100;
  const bufferDemand = Math.round(dailyRate * safetyBufferDays * 100) / 100;

  // 4. Committed vs Uncommitted Inflow
  let committedIncomingQuantity = 0;
  const committedShipments: CommittedShipmentDetail[] = [];

  let uncommittedIncomingQuantity = 0;
  const uncommittedShipments: UncommittedShipmentDetail[] = [];

  let hasOverdueShipment = false;
  let hasMissingEtaShipment = false;

  for (const shipment of shipments) {
    const item = shipment.items.find((i) => i.supplyId === supply.id);
    if (!item) continue;
    const itemQty = new Decimal(item.quantity).toNumber();

    if (shipment.status === 'REQUESTED') {
      uncommittedIncomingQuantity += itemQty;
      uncommittedShipments.push({
        shipmentId: shipment.id,
        status: 'REQUESTED',
        quantity: itemQty,
        notes: 'Order requested but not dispatched; not counted in committed inventory.',
      });
    } else if (shipment.status === 'DISPATCHED') {
      if (!shipment.eta) {
        hasMissingEtaShipment = true;
      } else {
        const etaDate = new Date(shipment.eta);
        const dayOffset = utcDayDiff(now, etaDate);

        if (dayOffset < 0) {
          hasOverdueShipment = true;
        } else if (dayOffset <= horizonDays) {
          committedIncomingQuantity += itemQty;
          committedShipments.push({
            shipmentId: shipment.id,
            status: 'DISPATCHED',
            arrivalDayOffset: dayOffset,
            arrivalDate: etaDate.toISOString(),
            quantity: itemQty,
          });
        }
      }
    }
    // RECEIVED shipments are already part of onHandQuantity, never counted again!
  }

  // 5. Shortages and Gaps
  const baselineShortageDays = coverageDays !== null ? Math.max(0, horizonDays - coverageDays) : 0;
  const baselineDemandGap = Math.max(0, Math.round((baseDemandUntilHorizon - onHand) * 100) / 100);

  const totalDemandGap = Math.max(
    0,
    Math.round((totalGrossDemand - onHand - committedIncomingQuantity) * 100) / 100
  );

  const suggestedResupplyQuantity = Math.max(
    0,
    Math.round((totalGrossDemand + bufferDemand - onHand - committedIncomingQuantity) * 100) / 100
  );

  // 6. Chronological Simulation: Stockout before Shipment Arrival
  let projectedStockoutDay: number | null = null;
  let earlierDeliveryRequired = false;
  let earlierDeliveryReason: string | null = null;

  if (dailyRate > 0) {
    let runningStock = onHand;
    const earliestCommittedArrival = committedShipments.length > 0
      ? Math.min(...committedShipments.map((s) => s.arrivalDayOffset))
      : null;

    for (let day = 1; day <= horizonDays; day++) {
      // Calculate daily expedition demand on this day
      let dayExpDemand = 0;
      if (expeditionRate > 0) {
        const dayDate = new Date(horizonStart.getTime() + day * 86400000);
        for (const exp of expeditions) {
          const expStart = new Date(exp.startDate);
          const expEnd = new Date(exp.endDate);
          if (dayDate >= expStart && dayDate <= expEnd) {
            dayExpDemand += exp.additionalPeople * expeditionRate;
          }
        }
      }

      runningStock -= (dailyRate + dayExpDemand);

      // Check if stock runs out
      if (runningStock <= 0 && projectedStockoutDay === null) {
        projectedStockoutDay = day;
      }

      // Add committed shipments arriving on this day
      const arrivalsToday = committedShipments
        .filter((s) => s.arrivalDayOffset === day)
        .reduce((sum, s) => sum + s.quantity, 0);

      runningStock += arrivalsToday;
    }

    if (
      projectedStockoutDay !== null &&
      earliestCommittedArrival !== null &&
      projectedStockoutDay < earliestCommittedArrival
    ) {
      earlierDeliveryRequired = true;
      earlierDeliveryReason = `Stockout projected on Day ${projectedStockoutDay}, but earliest shipment does not arrive until Day ${earliestCommittedArrival}. Earlier delivery required — ordering more will not prevent the intermediate stockout.`;
    }
  }

  // 7. Explanatory breakdown
  const explanation = [
    `Horizon: ${horizonDays} days (Target Delivery: ${targetDeliveryDate.toISOString().slice(0, 10)})`,
    `On-hand: ${onHand} ${supply.unit}`,
    `Base Demand: ${horizonDays}d × ${dailyRate} ${supply.unit}/d = ${baseDemandUntilHorizon} ${supply.unit}`,
    totalExpeditionDemand > 0 ? `Expedition Demand: +${totalExpeditionDemand} ${supply.unit}` : null,
    `Total Gross Demand: ${totalGrossDemand} ${supply.unit}`,
    `Safety Buffer (${safetyBufferDays}d): +${bufferDemand} ${supply.unit}`,
    committedIncomingQuantity > 0 ? `Committed Inflow: -${committedIncomingQuantity} ${supply.unit}` : null,
    `Suggested Resupply: ${suggestedResupplyQuantity} ${supply.unit}`,
  ]
    .filter(Boolean)
    .join(' | ');

  return {
    supplyId: supply.id,
    supplyName: supply.name,
    unit: supply.unit,
    onHandQuantity: onHand,
    configuredDailyConsumption: dailyRate,
    coverageDays,
    coverageStatus,
    coverageDisplay,
    horizonDays,
    targetDeliveryDate: targetDeliveryDate.toISOString(),
    baseDemandUntilHorizon,
    expeditionDemandUntilHorizon: totalExpeditionDemand,
    expeditionDetails,
    totalGrossDemand,
    safetyBufferDays,
    bufferDemand,
    committedIncomingQuantity,
    committedShipments,
    uncommittedIncomingQuantity,
    uncommittedShipments,
    hasOverdueShipment,
    hasMissingEtaShipment,
    baselineShortageDays,
    baselineDemandGap,
    totalDemandGap,
    suggestedResupplyQuantity,
    projectedStockoutDay,
    earlierDeliveryRequired,
    earlierDeliveryReason,
    calculationExplanation: explanation,
  };
}
