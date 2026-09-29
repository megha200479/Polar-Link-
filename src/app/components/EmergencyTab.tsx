'use client';

import React, { useState } from 'react';
import { useToast } from './ToastProvider';

export type IncidentSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type IncidentStatus = 'OPEN' | 'RESPONDING' | 'RESOLVED';

export interface Incident {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  severity: IncidentSeverity;
  status: IncidentStatus;
  reportedAt: string;
  resolvedAt: string | null;
}

interface EmergencyTabProps {
  incidents: Incident[];
  onRefresh: () => void;
}

const SEVERITY_BADGE: Record<IncidentSeverity, string> = {
  CRITICAL: 'critical',
  HIGH: 'low',
  MEDIUM: 'dispatched',
  LOW: 'pending',
};

const STATUS_BADGE: Record<IncidentStatus, string> = {
  OPEN: 'critical',
  RESPONDING: 'low',
  RESOLVED: 'ok',
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

export default function EmergencyTab({ incidents, onRefresh }: EmergencyTabProps) {
  const { addToast } = useToast();
  const [show, setShow] = useState(false);
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<IncidentSeverity>('MEDIUM');
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const open = incidents.filter((i) => i.status === 'OPEN').length;
  const responding = incidents.filter((i) => i.status === 'RESPONDING').length;
  const resolved = incidents.filter((i) => i.status === 'RESOLVED').length;

  async function handleReport(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      addToast('error', 'Enter a title');
      return;
    }
    setSaving(true);
    try {
      const result = await send('/api/incidents', 'POST', {
        title,
        location: location || undefined,
        description: description || undefined,
        severity,
      });
      if (result.success) {
        addToast('success', 'Incident reported');
        setShow(false);
        setTitle('');
        setLocation('');
        setDescription('');
        setSeverity('MEDIUM');
        onRefresh();
      } else {
        addToast('error', result.error || 'Could not report incident');
      }
    } catch {
      addToast('error', 'Network error reporting incident');
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(id: string, status: IncidentStatus) {
    setBusyId(id);
    try {
      const result = await send(`/api/incidents/${id}`, 'PATCH', { status });
      if (result.success) {
        addToast('success', status === 'RESOLVED' ? 'Incident resolved' : 'Response started');
        onRefresh();
      } else {
        addToast('error', result.error || 'Update failed');
      }
    } catch {
      addToast('error', 'Network error updating incident');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Emergency response</h2>
          <p>Report incidents and track the response to resolution</p>
        </div>
        <button className="btn btn-danger" onClick={() => setShow(true)}>
          Report incident
        </button>
      </div>

      <div className="strip">
        <span><b className={`mono ${open > 0 ? 't-crit' : ''}`}>{open}</b>open</span>
        <span><b className={`mono ${responding > 0 ? 't-low' : ''}`}>{responding}</b>responding</span>
        <span><b className="mono">{resolved}</b>resolved</span>
      </div>

      <div className="sec">
        <table className="ops-table">
          <thead>
            <tr>
              <th>Severity</th>
              <th>Incident</th>
              <th>Location</th>
              <th>Reported</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {incidents.length === 0 && (
              <tr><td colSpan={6} className="empty">No incidents reported.</td></tr>
            )}
            {incidents.map((i) => (
              <tr key={i.id}>
                <td><span className={`badge badge-${SEVERITY_BADGE[i.severity]}`}>{i.severity}</span></td>
                <td>
                  <div style={{ fontWeight: 600 }}>{i.title}</div>
                  {i.description && (
                    <div className="t-muted" style={{ fontSize: '12px', marginTop: '2px' }}>{i.description}</div>
                  )}
                </td>
                <td className="t-muted">{i.location ?? 'n/a'}</td>
                <td className="mono" style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(i.reportedAt)}</td>
                <td><span className={`badge badge-${STATUS_BADGE[i.status]}`}>{i.status}</span></td>
                <td className="actions">
                  {i.status === 'OPEN' && (
                    <button className="btn btn-sm btn-warning" disabled={busyId === i.id} onClick={() => setStatus(i.id, 'RESPONDING')}>
                      Start response
                    </button>
                  )}
                  {i.status !== 'RESOLVED' && (
                    <button className="btn btn-sm btn-success" disabled={busyId === i.id} onClick={() => setStatus(i.id, 'RESOLVED')}>
                      Resolve
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {show && (
        <div className="modal-backdrop" onClick={() => setShow(false)}>
          <div className="modal-content glass-card" style={{ padding: '28px' }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 24px' }}>Report incident</h2>
            <form onSubmit={handleReport}>
              <div style={{ marginBottom: '16px' }}>
                <label className="input-label">Title</label>
                <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
              </div>
              <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                <div style={{ flex: 1 }}>
                  <label className="input-label">Severity</label>
                  <select className="input" value={severity} onChange={(e) => setSeverity(e.target.value as IncidentSeverity)}>
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="CRITICAL">Critical</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label className="input-label">Location</label>
                  <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} />
                </div>
              </div>
              <div style={{ marginBottom: '20px' }}>
                <label className="input-label">Details (optional)</label>
                <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShow(false)} style={{ flex: 1 }}>Cancel</button>
                <button type="submit" className="btn btn-danger" disabled={saving} style={{ flex: 1 }}>
                  {saving ? 'Reporting…' : 'Report incident'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
