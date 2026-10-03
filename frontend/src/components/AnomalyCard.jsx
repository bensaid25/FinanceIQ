import React from 'react';

export default function AnomalyCard({ anomaly }) {
  return (
    <div style={{
      background: 'var(--bg-card)', borderRadius: '10px',
      padding: '12px 16px', border: '1px solid var(--border)',
      borderLeft: '4px solid var(--accent-red)', marginBottom: '8px',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center'
    }}>
      <div>
        <div style={{ fontSize: '14px', fontWeight: '600' }}>{anomaly.description}</div>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
          {anomaly.category} · {anomaly.date?.slice(0, 10)}
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--accent-red)' }}>
          {anomaly.amount?.toFixed(2)} TND
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          Z-score élevé
        </div>
      </div>
    </div>
  );
}
