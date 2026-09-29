'use client';

import React, { useState } from 'react';
import { useToast } from './ToastProvider';

export interface Expedition {
  id: string;
  name: string;
  additionalPeople: number;
  startDate: string;
  endDate: string;
  assignedPersonnel: number;
}

interface ExpeditionsTabProps {
  expeditions: Expedition[];
  onRefresh: () => void;
}

type Phase = 'ACTIVE' | 'UPCOMING' | 'COMPLETED';

const PHASE_BADGE: Record<Phase, string> = {
  ACTIVE: 'dispatched',
  UPCOMING: 'pending',
  COMPLETED: 'received',
};

function phaseOf(e: Expedition): Phase {
  const now = Date.now();
  if (new Date(e.endDate).getTime() < now) return 'COMPLETED';
  if (new Date(e.startDate).getTime() > now) return 'UPCOMING';
  return 'ACTIVE';
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function durationDays(e: Expedition) {
  return Math.round((new Date(e.endDate).getTime() - new Date(e.startDate).getTime()) / 86400000) + 1;
}

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

export default function ExpeditionsTab({ expeditions, onRefresh }: ExpeditionsTabProps) {
  const { addToast } = useToast();
  const [show, setShow] = useState(false);
  const [name, setName] = useState('');
  const [people, setPeople] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const count = parseInt(people, 10);
    if (!name.trim() || isNaN(count) || count < 1 || !start || !end) {
      addToast('error', 'Fill in name, people, start and end dates');
      return;
    }
    setSaving(true);
    try {
      const result = await send('/api/expeditions', 'POST', {
        name,
        additionalPeople: count,
        startDate: start,
        endDate: end,
      });
      if (result.success) {
        addToast('success', 'Expedition planned. Supply projections updated');
        setShow(false);
        setName('');
        setPeople('');
        setStart('');
        setEnd('');
        onRefresh();
      } else {
        addToast('error', result.error || 'Could not plan expedition');
      }
    } catch {
      addToast('error', 'Network error planning expedition');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Expeditions</h2>
          <p>Planned field trips. Their extra people are added to supply demand.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShow(true)}>
          Plan expedition
        </button>
      </div>

      <div className="sec">
        <table className="ops-table">
          <thead>
            <tr>
              <th>Expedition</th>
              <th>Dates</th>
              <th className="r">Days</th>
              <th className="r">Extra people</th>
              <th className="r">Assigned</th>
              <th>Phase</th>
            </tr>
          </thead>
          <tbody>
            {expeditions.length === 0 && (
              <tr><td colSpan={6} className="empty">No expeditions planned.</td></tr>
            )}
            {expeditions.map((ex) => {
              const phase = phaseOf(ex);
              return (
                <tr key={ex.id}>
                  <td style={{ fontWeight: 600 }}>{ex.name}</td>
                  <td className="mono" style={{ whiteSpace: 'nowrap' }}>
                    {fmt(ex.startDate)} to {fmt(ex.endDate)}
                  </td>
                  <td className="r mono">{durationDays(ex)}</td>
                  <td className="r mono">{ex.additionalPeople}</td>
                  <td className="r mono">{ex.assignedPersonnel}</td>
                  <td><span className={`badge badge-${PHASE_BADGE[phase]}`}>{phase}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {show && (
        <div className="modal-backdrop" onClick={() => setShow(false)}>
          <div className="modal-content glass-card" style={{ padding: '28px' }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 24px' }}>Plan expedition</h2>
            <form onSubmit={handleCreate}>
              <div style={{ marginBottom: '16px' }}>
                <label className="input-label">Name</label>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Schirmacher Oasis survey" autoFocus />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label className="input-label">Additional people</label>
                <input className="input" type="number" min="1" value={people} onChange={(e) => setPeople(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
                <div style={{ flex: 1 }}>
                  <label className="input-label">Start</label>
                  <input className="input" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="input-label">End</label>
                  <input className="input" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShow(false)} style={{ flex: 1 }}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving} style={{ flex: 1 }}>
                  {saving ? 'Saving…' : 'Plan expedition'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
