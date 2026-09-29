'use client';

import React, { useState } from 'react';
import type { Shipment, Supply } from '../hooks/useApi';
import { useToast } from './ToastProvider';
import {
  apiCreateShipment,
  apiDispatchShipment,
  apiReceiveShipment,
} from '../hooks/useApi';

interface ShipmentsTabProps {
  shipments: Shipment[];
  supplies: Supply[];
  onRefresh: () => void;
}

function statusBadge(status: string) {
  if (status === 'REQUESTED') return 'pending';
  if (status === 'DISPATCHED') return 'dispatched';
  return 'received';
}

function formatDate(iso: string | null) {
  if (!iso) return 'n/a';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function ShipmentsTab({ shipments, supplies, onRefresh }: ShipmentsTabProps) {
  const { addToast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [formNotes, setFormNotes] = useState('');
  const [formEta, setFormEta] = useState('');
  const [formItems, setFormItems] = useState<Array<{ supplyId: string; quantity: string }>>([
    { supplyId: '', quantity: '' },
  ]);
  const [creating, setCreating] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  function addFormItem() {
    setFormItems([...formItems, { supplyId: '', quantity: '' }]);
  }

  function updateFormItem(index: number, field: 'supplyId' | 'quantity', value: string) {
    const updated = [...formItems];
    updated[index] = { ...updated[index], [field]: value };
    setFormItems(updated);
  }

  function removeFormItem(index: number) {
    if (formItems.length <= 1) return;
    setFormItems(formItems.filter((_, i) => i !== index));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const items = formItems
      .filter((i) => i.supplyId && parseFloat(i.quantity) > 0)
      .map((i) => ({ supplyId: i.supplyId, quantity: parseFloat(i.quantity) }));

    if (items.length === 0) {
      addToast('error', 'Add at least one supply item');
      return;
    }

    setCreating(true);
    try {
      const result = await apiCreateShipment({
        stationIdentifier: 'MAITRI',
        idempotencyKey: crypto.randomUUID(),
        eta: formEta ? new Date(formEta).toISOString() : null,
        notes: formNotes,
        items,
      });

      if (result.status === 'CREATED' || result.shipmentId) {
        addToast('success', 'Resupply shipment requested');
        setShowCreate(false);
        setFormNotes('');
        setFormEta('');
        setFormItems([{ supplyId: '', quantity: '' }]);
        onRefresh();
      } else {
        addToast('error', result.error || 'Failed to create shipment');
      }
    } catch {
      addToast('error', 'Network error creating shipment');
    } finally {
      setCreating(false);
    }
  }

  async function handleDispatch(id: string) {
    setActionLoading(id);
    try {
      const result = await apiDispatchShipment(id);
      if (result.status === 'ACCEPTED' || result.status === 'ALREADY_PROCESSED') {
        addToast('success', 'Shipment dispatched');
        onRefresh();
      } else {
        addToast('error', result.error || 'Dispatch failed');
      }
    } catch {
      addToast('error', 'Network error dispatching shipment');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleReceive(id: string) {
    setActionLoading(id);
    try {
      const result = await apiReceiveShipment(id);
      if (result.status === 'ACCEPTED' || result.status === 'ALREADY_RECEIVED') {
        addToast('success', 'Shipment received, inventory updated');
        onRefresh();
      } else {
        addToast('error', result.error || 'Receive failed');
      }
    } catch {
      addToast('error', 'Network error receiving shipment');
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Shipments</h2>
          <p>Resupply requests and deliveries</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          Request resupply
        </button>
      </div>

      <div className="sec">
        <table className="ops-table">
          <thead>
            <tr>
              <th>Shipment</th>
              <th>Items</th>
              <th>Requested</th>
              <th>ETA</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shipments.length === 0 && (
              <tr><td colSpan={6} className="empty">No shipments yet.</td></tr>
            )}
            {shipments.map((s) => (
              <tr key={s.id}>
                <td>
                  <div style={{ fontWeight: 600 }}>{s.notes || 'Resupply shipment'}</div>
                  <div className="mono t-faint" style={{ fontSize: '11px', marginTop: '2px' }}>
                    {s.id.slice(0, 8)}
                  </div>
                </td>
                <td className="mono" style={{ fontSize: '12px' }}>
                  {s.items.map((item) => (
                    <div key={item.id}>
                      {item.quantity.toLocaleString('en-IN')} {item.unit} <span className="t-muted">{item.supplyName}</span>
                    </div>
                  ))}
                </td>
                <td className="mono">{formatDate(s.requestedAt)}</td>
                <td className="mono">{formatDate(s.eta)}</td>
                <td>
                  <span className={`badge badge-${statusBadge(s.status)}`}>{s.status}</span>
                </td>
                <td className="actions">
                  {s.status === 'REQUESTED' && (
                    <button
                      className="btn btn-sm btn-warning"
                      disabled={actionLoading === s.id}
                      onClick={() => handleDispatch(s.id)}
                    >
                      {actionLoading === s.id ? 'Dispatching…' : 'Mark dispatched'}
                    </button>
                  )}
                  {s.status === 'DISPATCHED' && (
                    <button
                      className="btn btn-sm btn-success"
                      disabled={actionLoading === s.id}
                      onClick={() => handleReceive(s.id)}
                    >
                      {actionLoading === s.id ? 'Receiving…' : 'Mark received'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <div className="modal-backdrop" onClick={() => setShowCreate(false)}>
          <div
            className="modal-content glass-card"
            style={{ padding: '28px', maxWidth: '560px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 24px' }}>Request resupply</h2>

            <form onSubmit={handleCreate}>
              <div style={{ marginBottom: '16px' }}>
                <label className="input-label">Description</label>
                <input
                  className="input"
                  placeholder="e.g. Emergency food resupply"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label className="input-label">Expected arrival (ETA)</label>
                <input
                  className="input"
                  type="date"
                  value={formEta}
                  onChange={(e) => setFormEta(e.target.value)}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label className="input-label">Supply items</label>
                {formItems.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
                    <select
                      className="input"
                      value={item.supplyId}
                      onChange={(e) => updateFormItem(idx, 'supplyId', e.target.value)}
                      style={{ flex: 2 }}
                    >
                      <option value="">Select supply</option>
                      {supplies.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.unit})
                        </option>
                      ))}
                    </select>
                    <input
                      className="input"
                      type="number"
                      step="0.01"
                      min="0.01"
                      placeholder="Qty"
                      value={item.quantity}
                      onChange={(e) => updateFormItem(idx, 'quantity', e.target.value)}
                      style={{ flex: 1 }}
                    />
                    {formItems.length > 1 && (
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        onClick={() => removeFormItem(idx)}
                        style={{ flexShrink: 0 }}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
                <button type="button" className="btn btn-sm btn-ghost" onClick={addFormItem} style={{ marginTop: '4px' }}>
                  Add item
                </button>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowCreate(false)} style={{ flex: 1 }}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={creating} style={{ flex: 1 }}>
                  {creating ? 'Creating…' : 'Submit request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
