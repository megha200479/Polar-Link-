'use client';

import { useCallback, useEffect, useState } from 'react';
import { offlineDb, type OutboxEntry, type RejectedEntry } from '@/lib/offline/db';
import {
  enqueueOfflineConsumption,
  syncOutbox,
  subscribeSyncStatus,
  clearRejectedEntry,
} from '@/lib/offline/syncEngine';

export function useOfflineSync() {
  const [outbox, setOutbox] = useState<OutboxEntry[]>([]);
  const [rejected, setRejected] = useState<RejectedEntry[]>([]);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => {
    if (!offlineDb) return;
    const [o, r] = await Promise.all([
      offlineDb.outbox.toArray(),
      offlineDb.rejected.toArray(),
    ]);
    setOutbox(o);
    setRejected(r);
  }, []);

  useEffect(() => {
    refresh();
    return subscribeSyncStatus(refresh);
  }, [refresh]);

  const syncNow = useCallback(async () => {
    setSyncing(true);
    try {
      await syncOutbox();
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    function handleOnline() {
      syncNow();
    }
    window.addEventListener('online', handleOnline);
    syncNow(); // try once on mount, in case entries were queued in a past session
    return () => window.removeEventListener('online', handleOnline);
  }, [syncNow]);

  return {
    pendingCount: outbox.length,
    rejectedCount: rejected.length,
    outbox,
    rejected,
    syncing,
    syncNow,
    queueConsumption: enqueueOfflineConsumption,
    clearRejected: clearRejectedEntry,
    refresh,
  };
}
