'use client';

import React, { useState } from 'react';
import type { Supply, ShortagesResponse } from '../hooks/useApi';
import { useToast } from './ToastProvider';
import { apiRecordConsumption } from '../hooks/useApi';
import { useOfflineSync } from '../hooks/useOfflineSync';

interface InventoryTabProps {
  supplies: Supply[];
  shortages: ShortagesResponse | null;
  onRefresh: () => void;
  isOnline: boolean;
}

const BADGE: Record<string, string> = {
  CRITICAL: 'critical',
  LOW: 'low',
  NORMAL: 'ok',
};

export default function InventoryTab({ supplies, shortages, onRefresh, isOnline }: InventoryTabProps) {
  const { addToast } = useToast();
  const { queueConsumption } = useOfflineSync();
  const [consumeModal, setConsumeModal] = useState<Supply | null>(null);
  const [consumeQty, setConsumeQty] = useState('');
  const [consuming, setConsuming] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const summary = shortages?.summary;
  const projections = shortages?.projections ?? [];
  const visible = supplies.filter((s) =>
    s.name.toLowerCase().includes(query.trim().toLowerCase())
  );

  async function handleConsume(e: React.FormEvent) {
    e.preventDefault();
    if (!consumeModal) return;
    const qty = parseFloat(consumeQty);
    if (isNaN(qty) || qty <= 0) {
      addToast('error', 'Enter a valid positive quantity');
      return;
    }

    setConsuming(true);

    if (!isOnline) {
      const queued = await queueConsumption({
        operationId: crypto.randomUUID(),
        supplyId: consumeModal.id,
        supplyName: consumeModal.name,
        unit: consumeModal.unit,
        quantity: qty,
      });
      if (queued.success) {
        addToast('info', `Saved offline. ${qty} ${consumeModal.unit} of ${consumeModal.name} will sync when back online.`);
      } else {
        addToast('error', queued.error || 'Could not save offline');
      }
      setConsumeModal(null);
      setConsumeQty('');
      setConsuming(false);
      return;
    }

    try {
      const result = await apiRecordConsumption({
        operationId: crypto.randomUUID(),
        supplyId: consumeModal.id,
        quantity: qty,
        occurredAt: new Date().toISOString(),
      });

      if (result.status === 'ACCEPTED' || result.status === 'ALREADY_APPLIED') {
        addToast('success', `Consumed ${qty} ${consumeModal.unit} of ${consumeModal.name}`);
        setConsumeModal(null);
        setConsumeQty('');
        onRefresh();
      } else {
        addToast('error', result.error || 'Consumption failed');
      }
    } catch {
      const queued = await queueConsumption({
        operationId: crypto.randomUUID(),
        supplyId: consumeModal.id,
        supplyName: consumeModal.name,
        unit: consumeModal.unit,
        quantity: qty,
      });
      if (queued.success) {
        addToast('info', 'Network unavailable. Entry saved offline for later sync.');
      } else {
        addToast('error', queued.error || 'Consumption failed and could not be saved offline');
      }
      setConsumeModal(null);
      setConsumeQty('');
    } finally {
      setConsuming(false);
    }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Inventory</h2>
          <p>On-hand stock, coverage and consumption</p>
        </div>
        <input
          className="input"
          style={{ width: '220px' }}
          placeholder="Search supplies"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {summary && (
        <div className="strip">
          <span><b className="mono">{summary.totalSupplies}</b>supplies</span>
          <span><b className={`mono ${summary.criticalCount > 0 ? 't-crit' : ''}`}>{summary.criticalCount}</b>critical</span>
          <span><b className={`mono ${summary.lowCount > 0 ? 't-low' : ''}`}>{summary.lowCount}</b>low</span>
          <span><b className={`mono ${summary.earlierDeliveryCount > 0 ? 't-low' : ''}`}>{summary.earlierDeliveryCount}</b>need earlier delivery</span>
        </div>
      )}

      <div className="sec">
        <table className="ops-table">
          <thead>
            <tr>
              <th>Supply</th>
              <th className="r">On hand</th>
              <th className="r">Daily use</th>
              <th className="r">Coverage</th>
              <th>Status</th>
              <th className="r">Suggested resupply</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr><td colSpan={7} className="empty">No supplies match your search.</td></tr>
            )}
            {visible.map((supply) => {
              const proj = projections.find((p) => p.supplyId === supply.id);
              const status = proj?.coverageStatus ?? 'NORMAL';
              const open = expanded === supply.id;

              return (
                <React.Fragment key={supply.id}>
                  <tr>
                    <td style={{ fontWeight: 600 }}>{supply.name}</td>
                    <td className="r mono">
                      {supply.onHandQuantity.toLocaleString('en-IN')} <span className="t-muted">{supply.unit}</span>
                    </td>
                    <td className="r mono">{supply.configuredDailyConsumption}/d</td>
                    <td className="r mono">{proj?.coverageDisplay ?? 'n/a'}</td>
                    <td>
                      <span className={`badge badge-${BADGE[status] ?? 'ok'}`}>{status}</span>
                    </td>
                    <td className={`r mono ${proj && proj.suggestedResupplyQuantity > 0 ? 't-crit' : 't-faint'}`}>
                      {proj && proj.suggestedResupplyQuantity > 0
                        ? `${proj.suggestedResupplyQuantity.toLocaleString('en-IN')} ${supply.unit}`
                        : 'none'}
                    </td>
                    <td className="actions">
                      {proj && (
                        <button
                          className="btn btn-sm btn-ghost"
                          onClick={() => setExpanded(open ? null : supply.id)}
                        >
                          {open ? 'Hide math' : 'Show math'}
                        </button>
                      )}
                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={() => {
                          setConsumeModal(supply);
                          setConsumeQty('');
                        }}
                      >
                        Record use
                      </button>
                    </td>
                  </tr>
                  {open && proj && (
                    <tr>
                      <td colSpan={7} className="explain mono">{proj.calculationExplanation}</td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {consumeModal && (
        <div className="modal-backdrop" onClick={() => setConsumeModal(null)}>
          <div className="modal-content glass-card" style={{ padding: '28px' }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 6px' }}>Record consumption</h2>
            <p className="t-muted" style={{ fontSize: '13px', margin: '0 0 24px' }}>
              {consumeModal.name}: {consumeModal.onHandQuantity.toLocaleString('en-IN')} {consumeModal.unit} on hand
            </p>

            <form onSubmit={handleConsume}>
              <div style={{ marginBottom: '20px' }}>
                <label className="input-label" htmlFor="consumeQty">
                  Quantity ({consumeModal.unit})
                </label>
                <input
                  id="consumeQty"
                  className="input"
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder={`e.g. ${consumeModal.configuredDailyConsumption}`}
                  value={consumeQty}
                  onChange={(e) => setConsumeQty(e.target.value)}
                  autoFocus
                />
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setConsumeModal(null)} style={{ flex: 1 }}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={consuming} style={{ flex: 1 }}>
                  {consuming ? 'Recording…' : 'Confirm'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
