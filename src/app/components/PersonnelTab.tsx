'use client';

import React, { useState } from 'react';
import { useToast } from './ToastProvider';
import type { Expedition } from './ExpeditionsTab';

export type PersonnelStatus = 'AT_STATION' | 'IN_TRANSIT' | 'ON_EXPEDITION';

export interface Personnel {
  id: string;
  name: string;
  role: string;
  status: PersonnelStatus;
  expeditionId: string | null;
  expeditionName: string | null;
}

export interface PersonnelMovementRow {
  id: string;
  personnelId: string;
  personnelName: string;
  fromStatus: PersonnelStatus;
  toStatus: PersonnelStatus;
  note: string | null;
  occurredAt: string;
}

interface PersonnelTabProps {
  personnel: Personnel[];
  movements: PersonnelMovementRow[];
  expeditions: Expedition[];
  onRefresh: () => void;
}

const LABEL: Record<PersonnelStatus, string> = {
  AT_STATION: 'At station',
  IN_TRANSIT: 'In transit',
  ON_EXPEDITION: 'On expedition',
};

const BADGE: Record<PersonnelStatus, string> = {
  AT_STATION: 'ok',
  IN_TRANSIT: 'dispatched',
  ON_EXPEDITION: 'pending',
};

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

export default function PersonnelTab({ personnel, movements, expeditions, onRefresh }: PersonnelTabProps) {
  const { addToast } = useToast();

  const [moving, setMoving] = useState<Personnel | null>(null);
  const [toStatus, setToStatus] = useState<PersonnelStatus>('AT_STATION');
  const [expeditionId, setExpeditionId] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('');

  const counts = {
    AT_STATION: personnel.filter((p) => p.status === 'AT_STATION').length,
    IN_TRANSIT: personnel.filter((p) => p.status === 'IN_TRANSIT').length,
    ON_EXPEDITION: personnel.filter((p) => p.status === 'ON_EXPEDITION').length,
  };

  function openMove(p: Personnel) {
    setMoving(p);
    setToStatus(p.status);
    setExpeditionId(p.expeditionId ?? '');
    setNote('');
  }

  async function handleMove(e: React.FormEvent) {
    e.preventDefault();
    if (!moving) return;
    if (toStatus === 'ON_EXPEDITION' && !expeditionId) {
      addToast('error', 'Choose an expedition');
      return;
    }
    setSaving(true);
    try {
      const result = await send(`/api/personnel/${moving.id}/move`, 'POST', {
        toStatus,
        expeditionId: toStatus === 'ON_EXPEDITION' ? expeditionId : null,
        note: note || undefined,
      });
      if (result.success) {
        addToast('success', `${moving.name}: ${LABEL[toStatus].toLowerCase()}`);
        setMoving(null);
        onRefresh();
      } else {
        addToast('error', result.error || 'Could not record movement');
      }
    } catch {
      addToast('error', 'Network error recording movement');
    } finally {
      setSaving(false);
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || !newRole.trim()) {
      addToast('error', 'Enter a name and role');
      return;
    }
    setSaving(true);
    try {
      const result = await send('/api/personnel', 'POST', { name: newName, role: newRole });
      if (result.success) {
        addToast('success', 'Person added');
        setShowAdd(false);
        setNewName('');
        setNewRole('');
        onRefresh();
      } else {
        addToast('error', result.error || 'Could not add person');
      }
    } catch {
      addToast('error', 'Network error adding person');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Personnel</h2>
          <p>Who is where, and every movement between locations</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
          Add person
        </button>
      </div>

      <div className="strip">
        <span><b className="mono">{counts.AT_STATION}</b>at station</span>
        <span><b className="mono">{counts.IN_TRANSIT}</b>in transit</span>
        <span><b className="mono">{counts.ON_EXPEDITION}</b>on expedition</span>
        <span><b className="mono">{personnel.length}</b>total</span>
      </div>

      <div className="sec">
        <table className="ops-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Status</th>
              <th>Assignment</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {personnel.length === 0 && (
              <tr><td colSpan={5} className="empty">No personnel recorded.</td></tr>
            )}
            {personnel.map((p) => (
              <tr key={p.id}>
                <td style={{ fontWeight: 600 }}>{p.name}</td>
                <td className="t-muted">{p.role}</td>
                <td><span className={`badge badge-${BADGE[p.status]}`}>{LABEL[p.status]}</span></td>
                <td className="t-muted">{p.expeditionName ?? 'none'}</td>
                <td className="actions">
                  <button className="btn btn-sm btn-ghost" onClick={() => openMove(p)}>
                    Update movement
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="sec">
        <div className="sec-h">
          <h3>Movement log</h3>
          <span>latest {movements.length}</span>
        </div>
        <table className="ops-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Person</th>
              <th>Movement</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {movements.length === 0 && (
              <tr><td colSpan={4} className="empty">No movements recorded yet.</td></tr>
            )}
            {movements.map((m) => (
              <tr key={m.id}>
                <td className="mono" style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(m.occurredAt)}</td>
                <td style={{ fontWeight: 600 }}>{m.personnelName}</td>
                <td className="mono" style={{ fontSize: '12px' }}>
                  {LABEL[m.fromStatus]} to {LABEL[m.toStatus]}
                </td>
                <td className="t-muted">{m.note ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {moving && (
        <div className="modal-backdrop" onClick={() => setMoving(null)}>
          <div className="modal-content glass-card" style={{ padding: '28px' }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 6px' }}>Update movement</h2>
            <p className="t-muted" style={{ fontSize: '13px', margin: '0 0 24px' }}>
              {moving.name}, currently {LABEL[moving.status].toLowerCase()}
            </p>
            <form onSubmit={handleMove}>
              <div style={{ marginBottom: '16px' }}>
                <label className="input-label">Move to</label>
                <select className="input" value={toStatus} onChange={(e) => setToStatus(e.target.value as PersonnelStatus)}>
                  <option value="AT_STATION">At station</option>
                  <option value="IN_TRANSIT">In transit</option>
                  <option value="ON_EXPEDITION">On expedition</option>
                </select>
              </div>
              {toStatus === 'ON_EXPEDITION' && (
                <div style={{ marginBottom: '16px' }}>
                  <label className="input-label">Expedition</label>
                  <select className="input" value={expeditionId} onChange={(e) => setExpeditionId(e.target.value)}>
                    <option value="">Select expedition</option>
                    {expeditions.map((ex) => (
                      <option key={ex.id} value={ex.id}>{ex.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div style={{ marginBottom: '20px' }}>
                <label className="input-label">Note (optional)</label>
                <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Departed with survey team" />
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setMoving(null)} style={{ flex: 1 }}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving} style={{ flex: 1 }}>
                  {saving ? 'Saving…' : 'Record movement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAdd && (
        <div className="modal-backdrop" onClick={() => setShowAdd(false)}>
          <div className="modal-content glass-card" style={{ padding: '28px' }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 24px' }}>Add person</h2>
            <form onSubmit={handleAdd}>
              <div style={{ marginBottom: '16px' }}>
                <label className="input-label">Name</label>
                <input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
              </div>
              <div style={{ marginBottom: '20px' }}>
                <label className="input-label">Role</label>
                <input className="input" value={newRole} onChange={(e) => setNewRole(e.target.value)} placeholder="e.g. Field engineer" />
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowAdd(false)} style={{ flex: 1 }}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving} style={{ flex: 1 }}>
                  {saving ? 'Saving…' : 'Add person'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
