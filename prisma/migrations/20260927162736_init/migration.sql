-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('REQUESTED', 'DISPATCHED', 'RECEIVED');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('OPENING_STOCK', 'CONSUMPTION', 'SHIPMENT_RECEIPT', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "Station" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Station_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supply" (
    "id" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "onHandQuantity" DECIMAL(12,2) NOT NULL,
    "configuredDailyConsumption" DECIMAL(12,2) NOT NULL,
    "perPersonDailyExpeditionConsumption" DECIMAL(12,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsumptionEvent" (
    "id" TEXT NOT NULL,
    "supplyId" TEXT NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestFingerprint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsumptionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'REQUESTED',
    "idempotencyKey" TEXT NOT NULL,
    "eta" TIMESTAMP(3),
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispatchedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentItem" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "supplyId" TEXT NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "ShipmentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL,
    "supplyId" TEXT NOT NULL,
    "signedQuantityChange" DECIMAL(12,2) NOT NULL,
    "movementType" "MovementType" NOT NULL,
    "sourceReference" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expedition" (
    "id" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "additionalPeople" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expedition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Station_identifier_key" ON "Station"("identifier");

-- CreateIndex
CREATE INDEX "Supply_stationId_isActive_idx" ON "Supply"("stationId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Supply_stationId_name_key" ON "Supply"("stationId", "name");

-- CreateIndex
CREATE INDEX "ConsumptionEvent_supplyId_occurredAt_idx" ON "ConsumptionEvent"("supplyId", "occurredAt");

-- CreateIndex
CREATE INDEX "ConsumptionEvent_requestFingerprint_idx" ON "ConsumptionEvent"("requestFingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_idempotencyKey_key" ON "Shipment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Shipment_stationId_status_idx" ON "Shipment"("stationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ShipmentItem_shipmentId_supplyId_key" ON "ShipmentItem"("shipmentId", "supplyId");

-- CreateIndex
CREATE INDEX "InventoryMovement_supplyId_occurredAt_idx" ON "InventoryMovement"("supplyId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryMovement_sourceReference_movementType_key" ON "InventoryMovement"("sourceReference", "movementType");

-- CreateIndex
CREATE INDEX "Expedition_stationId_startDate_endDate_idx" ON "Expedition"("stationId", "startDate", "endDate");

-- AddForeignKey
ALTER TABLE "Supply" ADD CONSTRAINT "Supply_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsumptionEvent" ADD CONSTRAINT "ConsumptionEvent_supplyId_fkey" FOREIGN KEY ("supplyId") REFERENCES "Supply"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentItem" ADD CONSTRAINT "ShipmentItem_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentItem" ADD CONSTRAINT "ShipmentItem_supplyId_fkey" FOREIGN KEY ("supplyId") REFERENCES "Supply"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_supplyId_fkey" FOREIGN KEY ("supplyId") REFERENCES "Supply"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expedition" ADD CONSTRAINT "Expedition_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Check Constraints
ALTER TABLE "Supply" ADD CONSTRAINT "supply_on_hand_nonnegative" CHECK ("onHandQuantity" >= 0);
ALTER TABLE "ConsumptionEvent" ADD CONSTRAINT "consumption_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "ShipmentItem" ADD CONSTRAINT "shipment_item_quantity_positive" CHECK ("quantity" > 0);
