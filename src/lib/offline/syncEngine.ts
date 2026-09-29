import { offlineDb, OutboxEntry, RejectedEntry, CachedSupply } from './db';

let isSyncing = false;
type SyncListener = () => void;
const listeners: Set<SyncListener> = new Set();

export function subscribeSyncStatus(listener: SyncListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyListeners() {
  listeners.forEach((l) => l());
}

export async function cacheSuppliesLocally(
  supplies: Array<{
    id: string;
    stationId: string;
    name: string;
    unit: string;
    onHandQuantity: number;
    configuredDailyConsumption: number;
  }>
) {
  const db = offlineDb;
  if (!db) return;

  const nowIso = new Date().toISOString();
  await db.transaction('rw', db.supplies, db.outbox, async () => {
    const pendingOutbox = await db.outbox.toArray();

    for (const sup of supplies) {
      // Calculate pending provisional deduction for this supply
      const pendingDeduction = pendingOutbox
        .filter((o) => o.supplyId === sup.id)
        .reduce((sum, o) => sum + o.quantity, 0);

      const provisionalStock = Math.max(0, sup.onHandQuantity - pendingDeduction);

      await db.supplies.put({
        id: sup.id,
        stationId: sup.stationId,
        name: sup.name,
        unit: sup.unit,
        serverOnHandQuantity: sup.onHandQuantity,
        provisionalOnHandQuantity: provisionalStock,
        configuredDailyConsumption: sup.configuredDailyConsumption,
        cachedAt: nowIso,
      });
    }
  });

  notifyListeners();
}

export async function enqueueOfflineConsumption(params: {
  operationId: string;
  supplyId: string;
  supplyName: string;
  unit: string;
  quantity: number;
  occurredAt?: Date;
}): Promise<{ success: boolean; error?: string }> {
  const db = offlineDb;
  if (!db) {
    return { success: false, error: 'Offline storage is unavailable.' };
  }

  try {
    const occurredAtIso = (params.occurredAt || new Date()).toISOString();
    const entry: OutboxEntry = {
      operationId: params.operationId,
      supplyId: params.supplyId,
      supplyName: params.supplyName,
      unit: params.unit,
      quantity: params.quantity,
      occurredAt: occurredAtIso,
      status: 'PENDING',
      attempts: 0,
      createdAt: new Date().toISOString(),
    };

    // Save in Dexie before returning success
    await db.transaction('rw', db.outbox, db.supplies, async () => {
      await db.outbox.put(entry);

      // Deduct from provisional local stock
      const cached = await db.supplies.get(params.supplyId);
      if (cached) {
        cached.provisionalOnHandQuantity = Math.max(
          0,
          cached.provisionalOnHandQuantity - params.quantity
        );
        await db.supplies.put(cached);
      }
    });

    notifyListeners();
    return { success: true };
  } catch (err: unknown) {
    console.error('Failed to save to local IndexedDB outbox:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to write to local storage.',
    };
  }
}

export async function syncOutbox(): Promise<{
  syncedCount: number;
  rejectedCount: number;
  remainingCount: number;
}> {
  const db = offlineDb;
  if (!db || isSyncing) {
    const remaining = db ? await db.outbox.count() : 0;
    return { syncedCount: 0, rejectedCount: 0, remainingCount: remaining };
  }

  isSyncing = true;
  notifyListeners();

  let syncedCount = 0;
  let rejectedCount = 0;

  try {
    const pendingEntries = await db.outbox.toArray();
    if (pendingEntries.length === 0) {
      isSyncing = false;
      notifyListeners();
      return { syncedCount: 0, rejectedCount: 0, remainingCount: 0 };
    }

    // Mark entries as SYNCING in local storage
    await db.outbox.bulkPut(
      pendingEntries.map((e) => ({ ...e, status: 'SYNCING' as const }))
    );
    notifyListeners();

    // Send batch to server
    const payload = {
      operations: pendingEntries.map((e) => ({
        operationId: e.operationId,
        supplyId: e.supplyId,
        quantity: e.quantity,
        occurredAt: e.occurredAt,
      })),
    };

    const response = await fetch('/api/consumption/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Server returned HTTP ${response.status}`);
    }

    const data = await response.json();
    const results = data.results || [];

    await db.transaction('rw', db.outbox, db.rejected, async () => {
      for (const res of results) {
        const localEntry = pendingEntries.find((e) => e.operationId === res.operationId);
        if (!localEntry) continue;

        if (res.status === 'ACCEPTED' || res.status === 'ALREADY_APPLIED') {
          // Confirmed processed by server: remove from outbox
          await db.outbox.delete(res.operationId);
          syncedCount++;
        } else if (
          res.status === 'INSUFFICIENT_STOCK' ||
          res.status === 'CONFLICT' ||
          res.status === 'INVALID_SUPPLY'
        ) {
          // Irrecoverable mutation rejection: move to rejected queue so it is never lost
          const rejected: RejectedEntry = {
            operationId: localEntry.operationId,
            supplyId: localEntry.supplyId,
            supplyName: localEntry.supplyName,
            unit: localEntry.unit,
            quantity: localEntry.quantity,
            occurredAt: localEntry.occurredAt,
            rejectedAt: new Date().toISOString(),
            reason: res.error || res.status,
          };
          await db.rejected.put(rejected);
          await db.outbox.delete(res.operationId);
          rejectedCount++;
        } else {
          // Temporary error: keep in outbox with retry increment
          localEntry.status = 'PENDING';
          localEntry.attempts += 1;
          localEntry.lastAttemptAt = new Date().toISOString();
          localEntry.lastError = res.error || 'Temporary server failure';
          await db.outbox.put(localEntry);
        }
      }
    });

    // Update last sync timestamp
    await db.syncMeta.put({
      key: 'lastSuccessfulSync',
      value: new Date().toISOString(),
    });

    // Refresh authoritative supply cache from server
    try {
      const freshSuppliesRes = await fetch('/api/supplies');
      if (freshSuppliesRes.ok) {
        const freshData = await freshSuppliesRes.json();
        if (freshData.supplies) {
          await cacheSuppliesLocally(freshData.supplies);
        }
      }
    } catch {
      // Non-fatal if supply refresh fails
    }
  } catch (err: unknown) {
    console.warn('Network sync failed, retaining pending entries for retry:', err);
    // Reset entries back to PENDING with error notes
    const entries = await db.outbox.toArray();
    for (const e of entries) {
      if (e.status === 'SYNCING') {
        e.status = 'PENDING';
        e.attempts += 1;
        e.lastAttemptAt = new Date().toISOString();
        e.lastError = err instanceof Error ? err.message : 'Network offline / server unreachable';
        await db.outbox.put(e);
      }
    }
  } finally {
    isSyncing = false;
    notifyListeners();
  }

  const remainingCount = await db.outbox.count();
  return { syncedCount, rejectedCount, remainingCount };
}

export async function clearRejectedEntry(operationId: string) {
  const db = offlineDb;
  if (!db) return;
  await db.rejected.delete(operationId);
  notifyListeners();
}
