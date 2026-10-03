import React from 'react';

const nav = [
  { key:'dashboard',    icon:'📊', label:'Dashboard'    },
  { key:'transactions', icon:'💸', label:'Transactions'  },
  { key:'budgets',      icon:'🎯', label:'Budgets'       },
  { key:'anomalies',    icon:'⚠️',  label:'Anomalies'    },
  { key:'forecast',     icon:'🔮', label:'Forecast'      },
  { key:'aitools',      icon:'🤖', label:'AI Tools'      },
];

export default function Sidebar({ page, setPage, username, onLogout }) {
  return (
    <aside style={{
      width:'220px', minHeight:'100vh', background:'var(--bg-secondary)',
      borderRight:'1px solid var(--border)', display:'flex',
      flexDirection:'column', padding:'24px 12px',
      position:'fixed', top:0, left:0, zIndex:100
    }}>
      {/* Logo */}
      <div style={{ padding:'0 8px 24px', borderBottom:'1px solid var(--border)' }}>
        <div style={{ fontSize:'20px', fontWeight:'700', color:'var(--accent)' }}>
          💰 FinanceIQ
        </div>
        <div style={{ fontSize:'11px', color:'var(--text-muted)', marginTop:'2px' }}>
          Smart Finance Dashboard
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex:1, paddingTop:'16px', display:'flex', flexDirection:'column', gap:'2px' }}>
        {nav.map(item => {
          const active = page === item.key;
          return (
            <button key={item.key} onClick={() => setPage(item.key)}
              style={{
                display:'flex', alignItems:'center', gap:'10px',
                padding:'10px 12px', borderRadius:'10px', border:'none',
                background: active ? 'var(--bg-hover)' : 'transparent',
                color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontSize:'14px', textAlign:'left', width:'100%',
                borderLeft: active ? '3px solid var(--accent)' : '3px solid transparent',
                fontWeight: active ? '600' : '400',
                transition:'all 0.15s'
              }}>
              <span style={{ fontSize:'16px' }}>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* User + Logout */}
      <div style={{
        borderTop:'1px solid var(--border)', paddingTop:'16px',
        display:'flex', flexDirection:'column', gap:'8px'
      }}>
        <div style={{
          padding:'10px 12px', background:'var(--bg-card)',
          borderRadius:'10px', border:'1px solid var(--border)'
        }}>
          <div style={{ fontSize:'12px', color:'var(--text-muted)' }}>Signed in as</div>
          <div style={{ fontSize:'14px', fontWeight:'600', marginTop:'2px', textTransform:'capitalize' }}>
            {username}
          </div>
          <div style={{ fontSize:'11px', color:'var(--accent)', marginTop:'2px' }}>● Online</div>
        </div>
        <button onClick={onLogout}
          style={{
            padding:'10px 12px', borderRadius:'10px',
            background:'transparent', border:'1px solid var(--accent-red)',
            color:'var(--accent-red)', fontSize:'14px', fontWeight:'500',
            width:'100%', textAlign:'center'
          }}>
          🚪 Logout
        </button>
      </div>
    </aside>
  );
}
