'use client';

import React from 'react';
import type { Movement } from '../hooks/useApi';

interface MovementsTabProps {
  movements: Movement[];
  loading: boolean;
}

const LABEL: Record<string, string> = {
  CONSUMPTION: 'Consumption',
  SHIPMENT_RECEIPT: 'Shipment receipt',
  OPENING_STOCK: 'Opening stock',
  ADJUSTMENT: 'Adjustment',
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function MovementsTab({ movements, loading }: MovementsTabProps) {
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {[...Array(6)].map((_, i) => (
          <div key={i} className="skeleton" style={{ height: '44px' }} />
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Ledger</h2>
          <p>Append-only record of every inventory change</p>
        </div>
        <div className="page-meta mono">{movements.length} ENTRIES</div>
      </div>

      <div className="sec">
        <table className="ops-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Supply</th>
              <th>Type</th>
              <th className="r">Change</th>
              <th>Source reference</th>
            </tr>
          </thead>
          <tbody>
            {movements.length === 0 && (
              <tr><td colSpan={5} className="empty">No movements recorded yet.</td></tr>
            )}
            {movements.map((m) => {
              const positive = m.signedQuantityChange >= 0;
              return (
                <tr key={m.id}>
                  <td className="mono" style={{ whiteSpace: 'nowrap' }}>{formatDateTime(m.occurredAt)}</td>
                  <td style={{ fontWeight: 600 }}>{m.supplyName}</td>
                  <td className="t-muted">{LABEL[m.movementType] ?? m.movementType}</td>
                  <td className={`r mono ${positive ? 't-ok' : 't-crit'}`} style={{ fontWeight: 500 }}>
                    {positive ? '+' : ''}{m.signedQuantityChange.toLocaleString('en-IN')} {m.unit}
                  </td>
                  <td className="mono t-faint trunc" style={{ fontSize: '11px' }} title={m.sourceReference}>
                    {m.sourceReference}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
