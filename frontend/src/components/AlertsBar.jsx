import React from 'react';

const STYLE = {
  danger:  { color: 'var(--accent-red)',   icon: '🚨' },
  warning: { color: 'var(--accent-amber)', icon: '⚠️' },
  info:    { color: 'var(--accent-blue)',  icon: 'ℹ️' }
};

export default function AlertsBar({ alerts = [] }) {
  if (!alerts.length) {
    return (
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)',
                    borderRadius: '14px', padding: '12px 20px', marginBottom: '24px',
                    fontSize: '14px', color: 'var(--accent-green)' }}>
        ✅ Aucune alerte — vos dépenses sont dans les clous ce mois-ci.
      </div>
    );
  }

  return (
    <div style={{ marginBottom: '24px', display: 'flex', flexDirection: 'column',
                  gap: '8px' }}>
      {alerts.map((a, i) => {
        const st = STYLE[a.level] || STYLE.info;
        return (
          <div key={i} style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderLeft: `4px solid ${st.color}`, borderRadius: '10px',
            padding: '10px 16px', display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', gap: '16px'
          }}>
            <span style={{ fontWeight: '600', fontSize: '14px', color: st.color }}>
              {st.icon} {a.title}
            </span>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)',
                           textAlign: 'right' }}>{a.detail}</span>
          </div>
        );
      })}
    </div>
  );
}
