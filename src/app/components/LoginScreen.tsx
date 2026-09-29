'use client';

import React, { useState } from 'react';
import { Snowflake, Lock, ArrowRight } from 'lucide-react';

interface LoginScreenProps {
  onLogin: (accessKey: string) => Promise<{ success: boolean; error?: string }>;
}

export default function LoginScreen({ onLogin }: LoginScreenProps) {
  const [accessKey, setAccessKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!accessKey.trim()) {
      setError('Access key is required');
      return;
    }
    setLoading(true);
    setError('');
    const result = await onLogin(accessKey.trim());
    setLoading(false);
    if (!result.success) {
      setError(result.error || 'Authentication failed');
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(ellipse at 30% 20%, rgba(6, 182, 212, 0.08) 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, rgba(16, 185, 129, 0.06) 0%, transparent 50%), var(--color-polar-900)',
        padding: '20px',
      }}
    >
      <div className="animate-fade-in-up" style={{ width: '100%', maxWidth: '420px' }}>
        {/* Logo + Title */}
        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '64px',
              height: '64px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.2), rgba(16, 185, 129, 0.1))',
              border: '1px solid rgba(34, 211, 238, 0.25)',
              marginBottom: '18px',
            }}
          >
            <Snowflake size={32} color="#22d3ee" />
          </div>
          <h1
            style={{
              fontSize: '28px',
              fontWeight: 700,
              color: '#f1f5f9',
              margin: '0 0 6px',
              letterSpacing: '-0.02em',
            }}
          >
            PolarLink
          </h1>
          <p
            style={{
              fontSize: '14px',
              color: '#94a3b8',
              margin: 0,
            }}
          >
            Polar Station Supply Logistics
          </p>
        </div>

        {/* Card */}
        <div className="glass-card" style={{ padding: '32px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginBottom: '24px',
            }}
          >
            <Lock size={18} color="#94a3b8" />
            <span
              style={{
                fontSize: '15px',
                fontWeight: 600,
                color: '#e2e8f0',
              }}
            >
              Demo Access
            </span>
          </div>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '18px' }}>
              <label className="input-label" htmlFor="accessKey">
                Access Key
              </label>
              <input
                id="accessKey"
                className="input"
                type="password"
                placeholder="Enter demo access key"
                value={accessKey}
                onChange={(e) => setAccessKey(e.target.value)}
                autoFocus
                autoComplete="off"
              />
            </div>

            {error && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  background: 'rgba(244, 63, 94, 0.1)',
                  border: '1px solid rgba(244, 63, 94, 0.2)',
                  color: '#fb7185',
                  fontSize: '13px',
                  marginBottom: '18px',
                }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{ width: '100%' }}
            >
              {loading ? (
                <>
                  <span className="animate-spin" style={{ display: 'inline-block' }}>⟳</span>
                  Authenticating…
                </>
              ) : (
                <>
                  Continue
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          <p
            style={{
              marginTop: '20px',
              fontSize: '12px',
              color: '#64748b',
              textAlign: 'center',
              lineHeight: 1.5,
            }}
          >
            Default key: <code style={{ color: '#22d3ee', background: 'rgba(6, 182, 212, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>polarlink-demo-2026</code>
          </p>
        </div>
      </div>
    </div>
  );
}
