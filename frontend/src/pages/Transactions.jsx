import React, { useState, useEffect } from 'react';
import { getAllTransactions } from '../api/api';

const CAT_COLORS = {
  Food:'#c8f135', Transport:'#4d9fff', Bills:'#ffb347',
  Entertainment:'#9d6fff', Health:'#00d4aa', Shopping:'#ff4d6d', Education:'#06b6d4'
};

const MONTHS = ['All','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function Transactions() {
  const [transactions, setTransactions] = useState([]);
  const [filtered,     setFiltered]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState('');
  const [catFilter,    setCatFilter]    = useState('All');
  const [monthFilter,  setMonthFilter]  = useState('All');
  const [page,         setPage]         = useState(1);
  const PER_PAGE = 15;

  useEffect(() => {
    getAllTransactions(1).then(r => {
      setTransactions(r.data);
      setFiltered(r.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    let f = [...transactions];
    if (search)       f = f.filter(t => t.description.toLowerCase().includes(search.toLowerCase()));
    if (catFilter !== 'All') f = f.filter(t => t.category === catFilter);
    if (monthFilter !== 'All') {
      const m = MONTHS.indexOf(monthFilter);
      f = f.filter(t => new Date(t.date).getMonth() + 1 === m);
    }
    setFiltered(f);
    setPage(1);
  }, [search, catFilter, monthFilter, transactions]);

  const categories  = ['All', ...new Set(transactions.map(t => t.category))];
  const totalPages  = Math.ceil(filtered.length / PER_PAGE);
  const paginated   = filtered.slice((page-1)*PER_PAGE, page*PER_PAGE);
  const totalExp    = filtered.filter(t => t.amount < 0).reduce((s,t) => s + Math.abs(t.amount), 0);

  const s = { background:'var(--bg-card)', borderRadius:'14px',
               padding:'20px 24px', border:'1px solid var(--border)' };

  return (
    <div style={{ padding:'28px' }}>
      <h1 style={{ fontSize:'24px', fontWeight:'700', marginBottom:'4px' }}>💸 Transactions</h1>
      <p style={{ color:'var(--text-secondary)', fontSize:'14px', marginBottom:'24px' }}>
        Complete history of all your transactions
      </p>

      {/* Stats row */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'16px', marginBottom:'24px' }}>
        {[
          { label:'Total transactions', value: filtered.length,             color:'var(--accent)' },
          { label:'Total expenses',     value:`${totalExp.toFixed(0)} TND`, color:'var(--accent-red)' },
          { label:'Anomalies',          value: filtered.filter(t=>t.is_anomaly).length, color:'var(--accent-amber)' },
        ].map(m => (
          <div key={m.label} style={s}>
            <div style={{ fontSize:'13px', color:'var(--text-secondary)', marginBottom:'6px' }}>{m.label}</div>
            <div style={{ fontSize:'26px', fontWeight:'700', color: m.color }}>{m.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ ...s, marginBottom:'16px' }}>
        <div style={{ display:'flex', gap:'12px', flexWrap:'wrap', alignItems:'center' }}>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="🔍 Search description..."
            style={{ flex:1, minWidth:'200px' }} />
          <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
            style={{ minWidth:'140px' }}>
            {categories.map(c => <option key={c}>{c}</option>)}
          </select>
          <select value={monthFilter} onChange={e => setMonthFilter(e.target.value)}
            style={{ minWidth:'120px' }}>
            {MONTHS.map(m => <option key={m}>{m}</option>)}
          </select>
          <button onClick={() => { setSearch(''); setCatFilter('All'); setMonthFilter('All'); }}
            style={{ padding:'10px 16px', background:'var(--bg-hover)', border:'1px solid var(--border-light)',
                     borderRadius:'8px', color:'var(--text-secondary)', fontSize:'13px' }}>
            Reset
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={s}>
        {loading ? (
          <div style={{ textAlign:'center', padding:'40px', color:'var(--text-muted)' }}>Loading...</div>
        ) : (
          <>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'14px' }}>
              <thead>
                <tr style={{ borderBottom:'1px solid var(--border)' }}>
                  {['Date','Description','Category','Amount','Anomaly'].map(h => (
                    <th key={h} style={{ padding:'10px 14px', textAlign:'left',
                      color:'var(--text-secondary)', fontWeight:'500', fontSize:'12px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginated.map(t => (
                  <tr key={t.id} style={{
                    borderBottom:'1px solid var(--border)',
                    background: t.is_anomaly ? 'rgba(255,77,109,0.05)' : 'transparent'
                  }}>
                    <td style={{ padding:'11px 14px', color:'var(--text-secondary)', fontSize:'12px' }}>
                      {t.date?.slice(0,10)}
                    </td>
                    <td style={{ padding:'11px 14px', fontWeight:'500' }}>{t.description}</td>
                    <td style={{ padding:'11px 14px' }}>
                      <span style={{
                        background:`${CAT_COLORS[t.category]||'#666'}22`,
                        color: CAT_COLORS[t.category]||'#666',
                        padding:'3px 10px', borderRadius:'20px', fontSize:'12px', fontWeight:'500'
                      }}>{t.category}</span>
                    </td>
                    <td style={{ padding:'11px 14px', fontWeight:'600',
                      color: t.amount < 0 ? 'var(--accent-red)' : 'var(--accent)' }}>
                      {t.amount?.toFixed(2)} TND
                    </td>
                    <td style={{ padding:'11px 14px' }}>
                      {t.is_anomaly
                        ? <span style={{ color:'var(--accent-amber)', fontSize:'12px' }}>⚠️ Anomaly</span>
                        : <span style={{ color:'var(--accent-teal)',  fontSize:'12px' }}>✅ Normal</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
                          marginTop:'16px', paddingTop:'16px', borderTop:'1px solid var(--border)' }}>
              <span style={{ fontSize:'13px', color:'var(--text-secondary)' }}>
                Showing {(page-1)*PER_PAGE+1}–{Math.min(page*PER_PAGE, filtered.length)} of {filtered.length}
              </span>
              <div style={{ display:'flex', gap:'8px' }}>
                <button onClick={() => setPage(p => Math.max(1,p-1))} disabled={page===1}
                  style={{ padding:'6px 14px', borderRadius:'8px', border:'1px solid var(--border-light)',
                           background:'var(--bg-hover)', color: page===1?'var(--text-muted)':'var(--text-primary)',
                           fontSize:'13px' }}>← Prev</button>
                <span style={{ padding:'6px 14px', fontSize:'13px', color:'var(--text-secondary)' }}>
                  {page} / {totalPages}
                </span>
                <button onClick={() => setPage(p => Math.min(totalPages,p+1))} disabled={page===totalPages}
                  style={{ padding:'6px 14px', borderRadius:'8px', border:'1px solid var(--border-light)',
                           background:'var(--bg-hover)', color: page===totalPages?'var(--text-muted)':'var(--text-primary)',
                           fontSize:'13px' }}>Next →</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
