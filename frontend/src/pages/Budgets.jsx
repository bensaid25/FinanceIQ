import React, { useState, useEffect } from 'react';
import { getBudgets, createBudget, getSummary } from '../api/api';

const CATEGORIES = ['Food','Transport','Bills','Entertainment','Health','Shopping','Education'];
const now = new Date();

export default function Budgets() {
  const [budgets,  setBudgets]  = useState([]);
  const [summary,  setSummary]  = useState(null);
  const [month,    setMonth]    = useState(now.getMonth()+1);
  const [year]                  = useState(now.getFullYear());
  const [form,     setForm]     = useState({ category:'Food', limit_amount:'', month:now.getMonth()+1, year:now.getFullYear() });
  const [msg,      setMsg]      = useState('');
  const [loading,  setLoading]  = useState(false);

  const load = () => {
    getBudgets(1, month, year).then(r => setBudgets(r.data)).catch(()=>{});
    getSummary(1, month, year).then(r => setSummary(r.data)).catch(()=>{});
  };

  useEffect(() => { load(); }, [month]);

  const handleSubmit = async () => {
    if (!form.limit_amount) return setMsg('⚠️ Enter a limit amount');
    setLoading(true);
    try {
      await createBudget({ ...form, user_id:1, limit_amount: parseFloat(form.limit_amount) });
      setMsg('✅ Budget saved!');
      setForm(f => ({ ...f, limit_amount:'' }));
      load();
    } catch { setMsg('❌ Error saving budget'); }
    setLoading(false);
    setTimeout(() => setMsg(''), 3000);
  };

  const spentMap = {};
  summary?.categories?.forEach(c => { spentMap[c.category] = c.total_spent; });

  const s = { background:'var(--bg-card)', borderRadius:'14px',
               padding:'20px 24px', border:'1px solid var(--border)' };

  const MONTHS = ['','January','February','March','April','May','June',
                  'July','August','September','October','November','December'];

  return (
    <div style={{ padding:'28px' }}>
      <h1 style={{ fontSize:'24px', fontWeight:'700', marginBottom:'4px' }}>🎯 Budgets</h1>
      <p style={{ color:'var(--text-secondary)', fontSize:'14px', marginBottom:'24px' }}>
        Set and track spending limits per category
      </p>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1.5fr', gap:'20px' }}>

        {/* Form */}
        <div style={s}>
          <h2 style={{ fontSize:'16px', fontWeight:'600', marginBottom:'20px' }}>
            ➕ Set a Budget
          </h2>
          <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
            <div>
              <label style={{ fontSize:'12px', color:'var(--text-secondary)', marginBottom:'6px', display:'block' }}>
                Month
              </label>
              <select value={form.month} onChange={e => { setForm(f=>({...f,month:+e.target.value})); setMonth(+e.target.value); }}
                style={{ width:'100%' }}>
                {MONTHS.slice(1).map((m,i) => <option key={i+1} value={i+1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize:'12px', color:'var(--text-secondary)', marginBottom:'6px', display:'block' }}>
                Category
              </label>
              <select value={form.category} onChange={e => setForm(f=>({...f,category:e.target.value}))}
                style={{ width:'100%' }}>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize:'12px', color:'var(--text-secondary)', marginBottom:'6px', display:'block' }}>
                Limit (TND)
              </label>
              <input type="number" value={form.limit_amount}
                onChange={e => setForm(f=>({...f,limit_amount:e.target.value}))}
                placeholder="e.g. 300" style={{ width:'100%' }} />
            </div>
            {msg && <div style={{ fontSize:'13px', color: msg.startsWith('✅')?'var(--accent)':'var(--accent-red)' }}>{msg}</div>}
            <button onClick={handleSubmit} disabled={loading}
              style={{ padding:'12px', background:'var(--accent)', color:'#000',
                       border:'none', borderRadius:'10px', fontWeight:'700', fontSize:'14px' }}>
              {loading ? 'Saving...' : 'Save Budget'}
            </button>
          </div>
        </div>

        {/* Budget progress */}
        <div style={s}>
          <h2 style={{ fontSize:'16px', fontWeight:'600', marginBottom:'20px' }}>
            📊 {MONTHS[month]} Budget Overview
          </h2>
          {budgets.length === 0 ? (
            <div style={{ textAlign:'center', padding:'40px', color:'var(--text-muted)' }}>
              No budgets set for this month
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>
              {budgets.map(b => {
                const spent   = spentMap[b.category] || 0;
                const pct     = Math.min(100, (spent / b.limit_amount) * 100);
                const over    = spent > b.limit_amount;
                const color   = over ? 'var(--accent-red)' : pct > 75 ? 'var(--accent-amber)' : 'var(--accent)';
                return (
                  <div key={b.id}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'6px' }}>
                      <span style={{ fontSize:'14px', fontWeight:'500' }}>{b.category}</span>
                      <span style={{ fontSize:'13px', color: over?'var(--accent-red)':'var(--text-secondary)' }}>
                        {spent.toFixed(0)} / {b.limit_amount} TND
                        {over && ' ⚠️ Over!'}
                      </span>
                    </div>
                    <div style={{ height:'8px', background:'var(--bg-hover)', borderRadius:'4px', overflow:'hidden' }}>
                      <div style={{ width:`${pct}%`, height:'100%',
                                    background: color, borderRadius:'4px',
                                    transition:'width 0.4s' }} />
                    </div>
                    <div style={{ fontSize:'11px', color:'var(--text-muted)', marginTop:'4px' }}>
                      {pct.toFixed(0)}% used · {Math.max(0, b.limit_amount - spent).toFixed(0)} TND remaining
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
