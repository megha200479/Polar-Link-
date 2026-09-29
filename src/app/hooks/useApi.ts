'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// ── Types ──

export interface Supply {
  id: string;
  stationId: string;
  stationName: string;
  name: string;
  unit: string;
  onHandQuantity: number;
  configuredDailyConsumption: number;
  perPersonDailyExpeditionConsumption: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ShipmentItem {
  id: string;
  supplyId: string;
  supplyName: string;
  unit: string;
  quantity: number;
}

export interface Shipment {
  id: string;
  stationId: string;
  stationName: string;
  status: 'REQUESTED' | 'DISPATCHED' | 'RECEIVED';
  idempotencyKey: string;
  eta: string | null;
  requestedAt: string;
  dispatchedAt: string | null;
  receivedAt: string | null;
  notes: string | null;
  items: ShipmentItem[];
}

export interface ShortageProjection {
  supplyId: string;
  supplyName: string;
  unit: string;
  onHandQuantity: number;
  configuredDailyConsumption: number;
  coverageDays: number | null;
  coverageStatus: 'CRITICAL' | 'LOW' | 'NORMAL';
  coverageDisplay: string;
  suggestedResupplyQuantity: number;
  earlierDeliveryRequired: boolean;
  earlierDeliveryReason: string | null;
  calculationExplanation: string;
  projectedStockoutDay?: number | null;
  committedShipments?: Array<{
    shipmentId: string;
    status: string;
    arrivalDayOffset: number;
    quantity: number;
  }>;
}

export interface ShortagesResponse {
  station: { id: string; identifier: string; name: string };
  horizonDays: number;
  safetyBufferDays: number;
  summary: {
    totalSupplies: number;
    criticalCount: number;
    lowCount: number;
    earlierDeliveryCount: number;
  };
  projections: ShortageProjection[];
}

export interface Movement {
  id: string;
  supplyId: string;
  supplyName: string;
  unit: string;
  signedQuantityChange: number;
  movementType: 'OPENING_STOCK' | 'CONSUMPTION' | 'SHIPMENT_RECEIPT' | 'ADJUSTMENT';
  sourceReference: string;
  occurredAt: string;
}

// ── Generic fetch hook ──

export function useFetch<T>(
  url: string,
  options?: { enabled?: boolean; pollIntervalMs?: number }
) {
  const { enabled = true, pollIntervalMs } = options || {};
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const fetchData = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (mountedRef.current) {
        setData(json);
        setError(null);
      }
    } catch (err: unknown) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Fetch failed');
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [url, enabled]);

  const refetch = useCallback(() => {
    setLoading(true);
    return fetchData();
  }, [fetchData]);

  useEffect(() => {
    mountedRef.current = true;
    fetchData();
    return () => {
      mountedRef.current = false;
    };
  }, [fetchData]);

  useEffect(() => {
    if (!pollIntervalMs || !enabled) return;
    const timer = setInterval(fetchData, pollIntervalMs);
    return () => clearInterval(timer);
  }, [pollIntervalMs, enabled, fetchData]);

  return { data, loading, error, refetch };
}

// ── Auth hooks ──

export function useAuth() {
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);

  const checkSession = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/session');
      const data = await res.json();
      setAuthenticated(data.authenticated);
    } catch {
      setAuthenticated(false);
    } finally {
      setChecking(false);
    }
  }, []);

  const login = useCallback(async (accessKey: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessKey }),
    });
    const data = await res.json();
    if (data.success) {
      setAuthenticated(true);
      return { success: true };
    }
    return { success: false, error: data.error || 'Login failed' };
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  return { authenticated, checking, login, checkSession };
}

// ── Online detection ──

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return isOnline;
}

// ── API Calls (mutations) ──

export async function apiRecordConsumption(params: {
  operationId: string;
  supplyId: string;
  quantity: number;
  occurredAt: string;
}) {
  const res = await fetch('/api/consumption', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return res.json();
}

export async function apiCreateShipment(params: {
  stationIdentifier: string;
  idempotencyKey: string;
  eta: string | null;
  notes: string;
  items: Array<{ supplyId: string; quantity: number }>;
}) {
  const res = await fetch('/api/shipments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return res.json();
}

export async function apiDispatchShipment(shipmentId: string, eta?: string) {
  const res = await fetch(`/api/shipments/${shipmentId}/dispatch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eta }),
  });
  return res.json();
}

export async function apiReceiveShipment(shipmentId: string) {
  const res = await fetch(`/api/shipments/${shipmentId}/receive`, {
    method: 'POST',
  });
  return res.json();
}
