import React from 'react';

const categoryColors = {
  Food: '#a3e635', Transport: '#3b82f6', Bills: '#f59e0b',
  Entertainment: '#8b5cf6', Health: '#10b981', Shopping: '#ec4899',
  Education: '#06b6d4'
};

export default function TransactionsTable({ transactions }) {
  if (!transactions?.length) {
    return (
      <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
        Aucune transaction pour cette période
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {['Date', 'Description', 'Catégorie', 'Montant', 'Anomalie'].map(h => (
              <th key={h} style={{
                padding: '10px 14px', textAlign: 'left',
                color: 'var(--text-secondary)', fontWeight: '500', fontSize: '12px'
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {transactions.slice(0, 15).map((t) => (
            <tr key={t.id} style={{
              borderBottom: '1px solid var(--border)',
              background: t.is_anomaly ? 'rgba(239,68,68,0.05)' : 'transparent'
            }}>
              <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontSize: '12px' }}>
                {t.date?.slice(0, 10)}
              </td>
              <td style={{ padding: '10px 14px' }}>{t.description}</td>
              <td style={{ padding: '10px 14px' }}>
                <span style={{
                  background: `${categoryColors[t.category] || '#666'}22`,
                  color: categoryColors[t.category] || '#666',
                  padding: '2px 10px', borderRadius: '20px', fontSize: '12px'
                }}>{t.category}</span>
              </td>
              <td style={{
                padding: '10px 14px', fontWeight: '600',
                color: t.amount < 0 ? 'var(--accent-red)' : 'var(--accent-green)'
              }}>
                {t.amount?.toFixed(2)} TND
              </td>
              <td style={{ padding: '10px 14px' }}>
                {t.is_anomaly ? '⚠️' : '✅'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
