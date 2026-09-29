'use client';

import React, { useEffect, useState } from 'react';
import { ToastProvider } from './components/ToastProvider';
import InventoryTab from './components/InventoryTab';
import ShipmentsTab from './components/ShipmentsTab';
import MovementsTab from './components/MovementsTab';
import ExpeditionsTab, { type Expedition } from './components/ExpeditionsTab';
import PersonnelTab, { type Personnel, type PersonnelMovementRow } from './components/PersonnelTab';
import EmergencyTab, { type Incident } from './components/EmergencyTab';
import {
  useFetch,
  useAuth,
  useOnlineStatus,
  type Supply,
  type Shipment,
  type Movement,
  type ShortagesResponse,
} from './hooks/useApi';
import { useOfflineSync } from './hooks/useOfflineSync';

type TabId =
  | 'dashboard'
  | 'expeditions'
  | 'personnel'
  | 'inventory'
  | 'shipments'
  | 'movements'
  | 'emergency';

// ── Shared styles for the whole app (tabs reuse these class names) ──

const PAGE_CSS = `
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap');

:root {
  --paper: #ebece7;
  --card: #fbfbf8;
  --ink: #14202e;
  --muted: #5f6f7e;
  --faint: #8b98a5;
  --line: #cfd2cc;
  --line-soft: #e1e3dd;
  --accent: #0f6273;
  --crit: #a4262c;
  --low: #8a5a00;
  --ok: #2f6b47;
}
html, body { background: var(--paper); color: var(--ink); }
.mono { font-family: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-variant-numeric: tabular-nums; }
.t-crit { color: var(--crit); } .t-low { color: var(--low); } .t-ok { color: var(--ok); }
.t-muted { color: var(--muted); } .t-faint { color: var(--faint); }

/* surfaces: flat, no shadow, tight corners */
.glass-card { background: var(--card); border: 1px solid var(--line); border-radius: 3px; box-shadow: none; }
.btn, .btn-sm, .input { border-radius: 3px; }
.input { background: var(--card); border-color: var(--line); }
.btn-ghost { color: var(--ink); border-color: var(--line); }
.btn-ghost:hover:not(:disabled) { background: var(--paper); border-color: var(--faint); }

/* status badges: outlined text, no tint, no stripe */
.badge { background: transparent; border-radius: 2px; padding: 2px 8px; font-family: 'IBM Plex Mono', ui-monospace, Menlo, Consolas, monospace; font-size: 10.5px; font-weight: 500; letter-spacing: 0.06em; }
.badge-critical { color: var(--crit); background: transparent; border: 1px solid var(--crit); }
.badge-low { color: var(--low); background: transparent; border: 1px solid var(--low); }
.badge-ok, .badge-received { color: var(--ok); background: transparent; border: 1px solid var(--ok); }
.badge-pending { color: var(--muted); background: transparent; border: 1px solid var(--faint); }
.badge-dispatched { color: var(--accent); background: transparent; border: 1px solid var(--accent); }

/* no entrance animations, no gradient shimmer */
.animate-fade-in-up, .animate-fade-in, .animate-pulse-glow { animation: none; }
.skeleton { background: var(--line-soft); animation: pulse-glow 1.6s ease-in-out infinite; }

/* toasts + modals */
.toast { background: var(--card); border: 1px solid var(--line); border-radius: 3px; box-shadow: none; }
.toast-success { border-color: var(--ok); color: var(--ok); }
.toast-error { border-color: var(--crit); color: var(--crit); }
.toast-info { border-color: var(--accent); color: var(--accent); }
.modal-backdrop { background: rgba(20, 32, 46, 0.5); }
.modal-content { background: var(--card); border-radius: 3px; }

/* layout primitives */
.page-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; padding-bottom: 14px; border-bottom: 2px solid var(--ink); margin-bottom: 18px; }
.page-head h2 { font-size: 22px; font-weight: 700; margin: 0; letter-spacing: -0.01em; }
.page-head p { font-size: 12px; margin: 4px 0 0; color: var(--muted); }
.page-meta { font-size: 11px; color: var(--muted); letter-spacing: 0.06em; text-align: right; line-height: 1.7; }
.strip { display: flex; gap: 28px; flex-wrap: wrap; padding: 4px 0 20px; font-size: 13px; color: var(--muted); }
.strip b { font-size: 18px; font-weight: 600; margin-right: 6px; color: var(--ink); }
.sec { background: var(--card); border: 1px solid var(--line); border-radius: 3px; margin-bottom: 20px; overflow-x: auto; }
.sec-h { display: flex; justify-content: space-between; align-items: baseline; padding: 12px 16px; border-bottom: 1px solid var(--line-soft); }
.sec-h h3 { margin: 0; font-size: 11px; font-weight: 700; letter-spacing: 0.09em; text-transform: uppercase; }
.sec-h span { font-size: 11px; color: var(--muted); }
.ops-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.ops-table th { text-align: left; font-size: 10.5px; font-weight: 600; letter-spacing: 0.07em; text-transform: uppercase; color: var(--muted); padding: 9px 16px; border-bottom: 1px solid var(--line-soft); background: var(--paper); white-space: nowrap; }
.ops-table td { padding: 11px 16px; border-bottom: 1px solid var(--line-soft); vertical-align: middle; }
.ops-table tr:last-child td { border-bottom: none; }
.ops-table .r { text-align: right; }
.ops-table .actions { text-align: right; white-space: nowrap; }
.ops-table .actions .btn + .btn { margin-left: 6px; }
.ops-table td.explain { background: var(--paper); color: var(--muted); font-size: 12px; line-height: 1.7; padding: 12px 16px; }
.ops-table td.trunc { max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.empty { padding: 28px 16px; color: var(--muted); font-size: 13px; }

/* coverage timeline */
.cov-track { position: relative; height: 10px; background: var(--line-soft); min-width: 220px; }
.cov-fill { position: absolute; left: 0; top: 0; bottom: 0; }
.cov-marker { position: absolute; top: -4px; bottom: -4px; width: 2px; background: var(--ink); }
.cov-arrival { position: absolute; top: -7px; width: 0; height: 0; border-left: 5px solid transparent; border-right: 5px solid transparent; border-top: 7px solid var(--accent); transform: translateX(-5px); }
.cov-legend { padding: 10px 16px; font-size: 11px; color: var(--muted); border-top: 1px solid var(--line-soft); display: flex; gap: 18px; }
.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
@media (max-width: 1100px) { .two-col { grid-template-columns: 1fr; } }
`;

function PageStyles() {
  return <style>{PAGE_CSS}</style>;
}

// ── Root ──

export default function Home() {
  const { authenticated, checking, login } = useAuth();

  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      process.env.NODE_ENV === 'production'
    ) {
      navigator.serviceWorker
        .register('/sw.js')
        .catch((err) => console.warn('Service worker registration failed:', err));
    }
  }, []);

  if (checking) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <PageStyles />
        <div className="skeleton" style={{ width: '200px', height: '40px' }} />
      </div>
    );
  }

  if (!authenticated) {
    return <LoginScreen onLogin={login} />;
  }

  return (
    <ToastProvider>
      <Dashboard />
    </ToastProvider>
  );
}

// ── Login ──

function LoginScreen({
  onLogin,
}: {
  onLogin: (key: string) => Promise<{ success: boolean; error?: string }>;
}) {
  const [accessKey, setAccessKey] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    const result = await onLogin(accessKey);
    if (!result.success) {
      setError(result.error || 'Login failed');
      setSubmitting(false);
    } else {
      window.location.reload();
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <PageStyles />
      <form onSubmit={handleSubmit} className="glass-card" style={{ padding: '32px', width: '340px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 4px' }}>Polarlink</h1>
        <p className="t-muted" style={{ fontSize: '13px', margin: '0 0 24px' }}>
          Expedition logistics for Maitri Station
        </p>
        <label className="input-label" htmlFor="accessKey">Access key</label>
        <input
          id="accessKey"
          className="input"
          type="password"
          value={accessKey}
          onChange={(e) => setAccessKey(e.target.value)}
          autoFocus
        />
        {error && <p className="t-crit" style={{ fontSize: '12px', margin: '8px 0 0' }}>{error}</p>}
        <button
          type="submit"
          className="btn btn-primary"
          disabled={submitting}
          style={{ width: '100%', marginTop: '18px' }}
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="mono t-muted" style={{ fontSize: '11px', margin: '16px 0 0', lineHeight: 1.6 }}>
          Demo access key: polarlink-demo-2026
        </p>
      </form>
    </div>
  );
}

// ── App shell ──

function Dashboard() {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const isOnline = useOnlineStatus();
  const {
    pendingCount: outboxPending,
    rejectedCount: outboxRejected,
    syncNow: syncOutboxNow,
  } = useOfflineSync();

  const {
    data: suppliesData,
    loading: suppliesLoading,
    refetch: refetchSupplies,
  } = useFetch<{ supplies: Supply[] }>('/api/supplies', { pollIntervalMs: 20000 });

  const {
    data: shipmentsData,
    loading: shipmentsLoading,
    refetch: refetchShipments,
  } = useFetch<{ shipments: Shipment[] }>('/api/shipments', { pollIntervalMs: 20000 });

  const {
    data: movementsData,
    loading: movementsLoading,
    refetch: refetchMovements,
  } = useFetch<{ movements: Movement[] }>('/api/movements', { pollIntervalMs: 20000 });

  const {
    data: shortages,
    refetch: refetchShortages,
  } = useFetch<ShortagesResponse>('/api/shortages', { pollIntervalMs: 20000 });

  const { data: expeditionsData, refetch: refetchExpeditions } = useFetch<{
    expeditions: Expedition[];
  }>('/api/expeditions', { pollIntervalMs: 20000 });

  const { data: personnelData, refetch: refetchPersonnel } = useFetch<{
    personnel: Personnel[];
    movements: PersonnelMovementRow[];
  }>('/api/personnel', { pollIntervalMs: 20000 });

  const { data: incidentsData, refetch: refetchIncidents } = useFetch<{
    incidents: Incident[];
  }>('/api/incidents', { pollIntervalMs: 20000 });

  const supplies = suppliesData?.supplies || [];
  const shipments = shipmentsData?.shipments || [];
  const movements = movementsData?.movements || [];
  const expeditions = expeditionsData?.expeditions || [];
  const personnel = personnelData?.personnel || [];
  const personnelMovements = personnelData?.movements || [];
  const incidents = incidentsData?.incidents || [];
  const openIncidents = incidents.filter((i) => i.status !== 'RESOLVED').length;

  function refreshAll() {
    refetchSupplies();
    refetchShipments();
    refetchMovements();
    refetchShortages();
    refetchExpeditions();
    refetchPersonnel();
    refetchIncidents();
  }

  const navItems: { id: TabId; label: string }[] = [
    { id: 'dashboard', label: 'Overview' },
    { id: 'expeditions', label: 'Expeditions' },
    { id: 'personnel', label: 'Personnel' },
    { id: 'inventory', label: 'Inventory' },
    { id: 'shipments', label: 'Cargo' },
    { id: 'movements', label: 'Ledger' },
    { id: 'emergency', label: 'Emergency' },
  ];

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <PageStyles />

      <aside
        style={{
          width: '208px',
          background: '#0e1a2b',
          padding: '22px 14px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ padding: '0 10px', marginBottom: '30px' }}>
          <div style={{ fontSize: '16px', fontWeight: 700, color: '#f2f3ef', letterSpacing: '0.02em' }}>
            Polarlink
          </div>
          <div className="mono" style={{ fontSize: '10.5px', color: '#8b9db0', marginTop: '3px', letterSpacing: '0.06em' }}>
            MAITRI STATION
          </div>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1 }}>
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              style={{
                textAlign: 'left',
                padding: '9px 12px',
                fontSize: '13.5px',
                fontWeight: 500,
                borderRadius: '3px',
                cursor: 'pointer',
                border: 'none',
                background: activeTab === item.id ? '#1d2f45' : 'transparent',
                color: activeTab === item.id ? '#ffffff' : '#9db0c2',
              }}
            >
              {item.label}
              {item.id === 'emergency' && openIncidents > 0 && (
                <span className="mono" style={{ marginLeft: '8px', color: '#e28b8b' }}>
                  {openIncidents}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div style={{ padding: '10px' }}>
          <div
            className="mono"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '11px',
              letterSpacing: '0.05em',
              color: isOnline ? '#7fc39d' : '#d9a441',
            }}
          >
            <span
              style={{
                width: '7px',
                height: '7px',
                display: 'inline-block',
                background: isOnline ? '#5fb383' : '#d9a441',
              }}
            />
            {isOnline ? 'ONLINE' : 'OFFLINE'}
          </div>
          {outboxPending > 0 && (
            <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="mono" style={{ fontSize: '10.5px', color: '#d9a441' }}>
                {outboxPending} queued
              </span>
              {outboxRejected > 0 && (
                <span className="mono" style={{ fontSize: '10.5px', color: '#e28b8b' }}>
                  {outboxRejected} rejected
                </span>
              )}
              <button
                onClick={() => syncOutboxNow()}
                disabled={!isOnline}
                style={{
                  fontSize: '10.5px',
                  padding: '2px 8px',
                  borderRadius: '3px',
                  border: '1px solid #33475e',
                  background: 'transparent',
                  color: isOnline ? '#c9d3dc' : '#5a6b7c',
                  cursor: isOnline ? 'pointer' : 'not-allowed',
                }}
              >
                Sync now
              </button>
            </div>
          )}
        </div>
      </aside>

      <main style={{ flex: 1, padding: '30px 40px', overflowY: 'auto', minWidth: 0 }}>
        {(!isOnline || outboxPending > 0 || outboxRejected > 0) && (
          <div
            className="sec"
            style={{
              borderColor: 'var(--low)',
              padding: '10px 16px',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              fontSize: '13px',
            }}
          >
            <span
              style={{ width: '7px', height: '7px', background: 'var(--low)', flexShrink: 0 }}
            />
            <span>
              {!isOnline
                ? 'Offline. Consumption entries are being saved on this device.'
                : 'Reconnected.'}
              {outboxPending > 0 && (
                <span className="mono" style={{ marginLeft: '8px' }}>
                  {outboxPending} {outboxPending === 1 ? 'entry' : 'entries'} queued for sync
                </span>
              )}
              {outboxRejected > 0 && (
                <span className="mono t-crit" style={{ marginLeft: '8px' }}>
                  {outboxRejected} rejected, needs attention
                </span>
              )}
            </span>
            {isOnline && outboxPending > 0 && (
              <button className="btn btn-sm btn-ghost" style={{ marginLeft: 'auto' }} onClick={() => syncOutboxNow()}>
                Sync now
              </button>
            )}
          </div>
        )}
        {activeTab === 'dashboard' && (
          <DashboardView
            supplies={supplies}
            shipments={shipments}
            movements={movements}
            shortages={shortages}
            personnel={personnel}
            expeditions={expeditions}
            incidents={incidents}
            loading={suppliesLoading || shipmentsLoading || movementsLoading}
          />
        )}
        {activeTab === 'inventory' && (
          <InventoryTab
            supplies={supplies}
            shortages={shortages}
            onRefresh={refreshAll}
            isOnline={isOnline}
          />
        )}
        {activeTab === 'shipments' && (
          <ShipmentsTab shipments={shipments} supplies={supplies} onRefresh={refreshAll} />
        )}
        {activeTab === 'movements' && (
          <MovementsTab movements={movements} loading={movementsLoading} />
        )}
        {activeTab === 'expeditions' && (
          <ExpeditionsTab expeditions={expeditions} onRefresh={refreshAll} />
        )}
        {activeTab === 'personnel' && (
          <PersonnelTab
            personnel={personnel}
            movements={personnelMovements}
            expeditions={expeditions}
            onRefresh={refreshAll}
          />
        )}
        {activeTab === 'emergency' && (
          <EmergencyTab incidents={incidents} onRefresh={refreshAll} />
        )}
      </main>
    </div>
  );
}

// ── Overview ──

const STATUS_VAR: Record<string, string> = {
  CRITICAL: 'var(--crit)',
  LOW: 'var(--low)',
  NORMAL: 'var(--ok)',
};

const MOVEMENT_LABEL: Record<string, string> = {
  CONSUMPTION: 'Consumption',
  SHIPMENT_RECEIPT: 'Shipment receipt',
  OPENING_STOCK: 'Opening stock',
  ADJUSTMENT: 'Adjustment',
};

function fmtDate(iso: string | null) {
  if (!iso) return 'n/a';
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function DashboardView({
  supplies,
  shipments,
  movements,
  shortages,
  personnel,
  expeditions,
  incidents,
  loading,
}: {
  supplies: Supply[];
  shipments: Shipment[];
  movements: Movement[];
  shortages: ShortagesResponse | null;
  personnel: Personnel[];
  expeditions: Expedition[];
  incidents: Incident[];
  loading: boolean;
}) {
  const projections = shortages?.projections ?? [];
  const horizon = shortages?.horizonDays ?? 16;
  const buffer = shortages?.safetyBufferDays ?? 7;
  const criticalCount = shortages?.summary.criticalCount ?? 0;
  const lowCount = shortages?.summary.lowCount ?? 0;
  const openShipments = shipments.filter((s) => s.status !== 'RECEIVED');
  const recent = movements.slice(0, 6);
  const scaleMax = horizon * 2;
  const activeIncidents = incidents.filter((i) => i.status !== 'RESOLVED');
  const urgentIncident = activeIncidents.find(
    (i) => i.severity === 'CRITICAL' || i.severity === 'HIGH'
  );
  const atStation = personnel.filter((p) => p.status === 'AT_STATION').length;
  const onExpedition = personnel.filter((p) => p.status === 'ON_EXPEDITION').length;
  const inTransit = personnel.filter((p) => p.status === 'IN_TRANSIT').length;
  const nowMs = Date.now();
  const activeExpeditions = expeditions.filter(
    (e) => new Date(e.startDate).getTime() <= nowMs && new Date(e.endDate).getTime() >= nowMs
  ).length;

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {[...Array(4)].map((_, i) => (
          <div key={i} className="skeleton" style={{ height: '60px' }} />
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Station overview</h2>
          <p>Maitri Station · operations overview</p>
        </div>
        <div className="page-meta mono">
          HORIZON {horizon} D<br />
          SAFETY BUFFER {buffer} D
        </div>
      </div>

      {urgentIncident && (
        <div
          className="sec"
          style={{
            borderColor: 'var(--crit)',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <span className="badge badge-critical">{urgentIncident.severity}</span>
          <span style={{ fontWeight: 600 }}>{urgentIncident.title}</span>
          <span className="t-muted">{urgentIncident.location ?? ''}</span>
          <span className="mono t-muted" style={{ marginLeft: 'auto', fontSize: '11px' }}>
            {urgentIncident.status}
          </span>
        </div>
      )}

      <div className="strip">
        <span><b className={`mono ${criticalCount > 0 ? 't-crit' : ''}`}>{criticalCount}</b>critical supplies</span>
        <span><b className={`mono ${lowCount > 0 ? 't-low' : ''}`}>{lowCount}</b>low</span>
        <span><b className="mono">{openShipments.length}</b>shipments in transit</span>
        <span><b className="mono">{activeExpeditions}</b>active expeditions</span>
        <span><b className="mono">{atStation}</b>at station</span>
        <span><b className="mono">{onExpedition + inTransit}</b>away</span>
        <span><b className={`mono ${activeIncidents.length > 0 ? 't-crit' : ''}`}>{activeIncidents.length}</b>open incidents</span>
      </div>

      <div className="sec">
        <div className="sec-h">
          <h3>Supply coverage</h3>
          <span>days of stock vs. {horizon}-day delivery horizon</span>
        </div>
        <table className="ops-table">
          <thead>
            <tr>
              <th>Supply</th>
              <th className="r">On hand</th>
              <th className="r">Daily use</th>
              <th>Coverage (0 to {scaleMax} d)</th>
              <th className="r">Days</th>
              <th>Status</th>
              <th className="r">Resupply</th>
            </tr>
          </thead>
          <tbody>
            {projections.map((p) => {
              const color = STATUS_VAR[p.coverageStatus] ?? 'var(--muted)';
              const pct = p.coverageDays == null ? 100 : Math.min(100, (p.coverageDays / scaleMax) * 100);
              return (
                <tr key={p.supplyId}>
                  <td style={{ fontWeight: 600 }}>{p.supplyName}</td>
                  <td className="r mono">
                    {p.onHandQuantity.toLocaleString('en-IN')} <span className="t-muted">{p.unit}</span>
                  </td>
                  <td className="r mono">{p.configuredDailyConsumption}/d</td>
                  <td>
                    <div className="cov-track">
                      <div className="cov-fill" style={{ width: `${pct}%`, background: color }} />
                      <div className="cov-marker" style={{ left: `${(horizon / scaleMax) * 100}%` }} title={`${horizon}-day horizon`} />
                      {(p.committedShipments ?? []).map((sh) => (
                        <div
                          key={sh.shipmentId}
                          className="cov-arrival"
                          style={{ left: `${Math.min(100, Math.max(0, (sh.arrivalDayOffset / scaleMax) * 100))}%` }}
                          title={`Shipment arrives in ${sh.arrivalDayOffset} d (+${sh.quantity} ${p.unit})`}
                        />
                      ))}
                    </div>
                  </td>
                  <td className="r mono">{p.coverageDisplay.replace(' days', '')}</td>
                  <td>
                    <span className={`badge badge-${p.coverageStatus === 'NORMAL' ? 'ok' : p.coverageStatus.toLowerCase()}`}>
                      {p.coverageStatus}
                    </span>
                  </td>
                  <td className={`r mono ${p.suggestedResupplyQuantity > 0 ? 't-crit' : 't-faint'}`}>
                    {p.suggestedResupplyQuantity > 0
                      ? `${p.suggestedResupplyQuantity.toLocaleString('en-IN')} ${p.unit}`
                      : 'none'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="cov-legend">
          <span>▌ {horizon}-day delivery horizon</span>
          <span><span style={{ color: 'var(--accent)' }}>▼</span> committed shipment arrival</span>
        </div>
      </div>

      <div className="two-col">
        <div className="sec">
          <div className="sec-h">
            <h3>Shipments in transit</h3>
            <span>{openShipments.length} open</span>
          </div>
          <table className="ops-table">
            <thead>
              <tr><th>Shipment</th><th>Status</th><th className="r">ETA</th></tr>
            </thead>
            <tbody>
              {openShipments.length === 0 && (
                <tr><td colSpan={3} className="t-muted">No open shipments.</td></tr>
              )}
              {openShipments.map((s) => (
                <tr key={s.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{s.notes || `Shipment ${s.id.slice(0, 8)}`}</div>
                    <div className="mono t-muted" style={{ fontSize: '11px', marginTop: '2px' }}>
                      {s.items.map((i) => `${i.quantity} ${i.unit} ${i.supplyName}`).join(' · ')}
                    </div>
                  </td>
                  <td>
                    <span className={`badge badge-${s.status === 'REQUESTED' ? 'pending' : 'dispatched'}`}>{s.status}</span>
                  </td>
                  <td className="r mono" style={{ whiteSpace: 'nowrap' }}>{fmtDate(s.eta)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="sec">
          <div className="sec-h">
            <h3>Recent ledger activity</h3>
            <span>latest {recent.length}</span>
          </div>
          <table className="ops-table">
            <thead>
              <tr><th>Supply</th><th>Type</th><th className="r">Change</th></tr>
            </thead>
            <tbody>
              {recent.length === 0 && (
                <tr><td colSpan={3} className="t-muted">No activity yet.</td></tr>
              )}
              {recent.map((m) => (
                <tr key={m.id}>
                  <td style={{ fontWeight: 600 }}>{m.supplyName}</td>
                  <td className="t-muted">{MOVEMENT_LABEL[m.movementType] ?? m.movementType}</td>
                  <td className={`r mono ${m.signedQuantityChange >= 0 ? 't-ok' : 't-crit'}`} style={{ fontWeight: 500 }}>
                    {m.signedQuantityChange >= 0 ? '+' : ''}{m.signedQuantityChange} {m.unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
