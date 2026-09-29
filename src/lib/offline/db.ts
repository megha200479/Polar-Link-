/**
 * Client-side offline storage (Dexie / IndexedDB) for the consumption outbox,
 * the rejected-entry queue, a local supply cache, and sync metadata.
 *
 * Reconstructed to match the existing src/lib/offline/syncEngine.ts contract.
 * Only initialized in the browser: offlineDb is null during server rendering.
 */
import Dexie, { type Table } from 'dexie';

export type OutboxStatus = 'PENDING' | 'SYNCING';

export interface OutboxEntry {
  operationId: string;
  supplyId: string;
  supplyName: string;
  unit: string;
  quantity: number;
  occurredAt: string;
  status: OutboxStatus;
  attempts: number;
  createdAt: string;
  lastAttemptAt?: string;
  lastError?: string;
}

export interface RejectedEntry {
  operationId: string;
  supplyId: string;
  supplyName: string;
  unit: string;
  quantity: number;
  occurredAt: string;
  rejectedAt: string;
  reason: string;
}

export interface CachedSupply {
  id: string;
  stationId: string;
  name: string;
  unit: string;
  serverOnHandQuantity: number;
  provisionalOnHandQuantity: number;
  configuredDailyConsumption: number;
  cachedAt: string;
}

interface SyncMetaEntry {
  key: string;
  value: string;
}

class OfflineDatabase extends Dexie {
  outbox!: Table<OutboxEntry, string>;
  rejected!: Table<RejectedEntry, string>;
  supplies!: Table<CachedSupply, string>;
  syncMeta!: Table<SyncMetaEntry, string>;

  constructor() {
    super('polarlink-offline');
    this.version(1).stores({
      outbox: 'operationId, supplyId, status, createdAt',
      rejected: 'operationId, supplyId, rejectedAt',
      supplies: 'id, stationId',
      syncMeta: 'key',
    });
  }
}

export const offlineDb: OfflineDatabase | null =
  typeof window !== 'undefined' ? new OfflineDatabase() : null;
