'use client';

import React from 'react';
import { Snowflake, Wifi, WifiOff, RefreshCw } from 'lucide-react';

interface HeaderProps {
  isOnline: boolean;
  pendingCount: number;
  onSync: () => void;
  syncing: boolean;
}

export default function Header({ isOnline, pendingCount, onSync, syncing }: HeaderProps) {
  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        padding: '14px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'rgba(11, 17, 32, 0.85)',
        backdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(148, 163, 184, 0.08)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.2), rgba(16, 185, 129, 0.1))',
            border: '1px solid rgba(34, 211, 238, 0.2)',
          }}
        >
          <Snowflake size={20} color="#22d3ee" />
        </div>
        <div>
          <h1
            style={{
              fontSize: '18px',
              fontWeight: 700,
              color: '#f1f5f9',
              margin: 0,
              letterSpacing: '-0.01em',
            }}
          >
            PolarLink
          </h1>
          <p style={{ fontSize: '11px', color: '#64748b', margin: 0 }}>
            Maitri Antarctic Research Station
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {/* Pending outbox indicator */}
        {pendingCount > 0 && (
          <button
            onClick={onSync}
            disabled={syncing}
            className="btn btn-sm btn-ghost"
            style={{ gap: '6px' }}
          >
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
            <span>{pendingCount} pending</span>
          </button>
        )}

        {/* Online status */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 14px',
            borderRadius: '8px',
            background: isOnline
              ? 'rgba(52, 211, 153, 0.08)'
              : 'rgba(251, 191, 36, 0.08)',
            border: `1px solid ${isOnline ? 'rgba(52, 211, 153, 0.15)' : 'rgba(251, 191, 36, 0.15)'}`,
          }}
        >
          {isOnline ? (
            <Wifi size={14} color="#34d399" />
          ) : (
            <WifiOff size={14} color="#fbbf24" />
          )}
          <span
            style={{
              fontSize: '12px',
              fontWeight: 600,
              color: isOnline ? '#34d399' : '#fbbf24',
            }}
          >
            {isOnline ? 'Online' : 'Offline'}
          </span>
        </div>
      </div>
    </header>
  );
}
