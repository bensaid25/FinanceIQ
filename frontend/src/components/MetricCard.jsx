import React from 'react';

export default function MetricCard({ title, value, subtitle, color = 'var(--accent-green)', icon }) {
  return (
    <div style={{
      background: 'var(--bg-card)', borderRadius: '14px',
      padding: '20px 24px', border: '1px solid var(--border)',
      borderTop: `3px solid ${color}`, flex: 1
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
            {title}
          </div>
          <div style={{ fontSize: '28px', fontWeight: '700', color: 'var(--text-primary)' }}>
            {value}
          </div>
          {subtitle && (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
              {subtitle}
            </div>
          )}
        </div>
        {icon && (
          <span style={{
            fontSize: '28px', background: 'var(--bg-hover)',
            padding: '10px', borderRadius: '10px'
          }}>{icon}</span>
        )}
      </div>
    </div>
  );
}
