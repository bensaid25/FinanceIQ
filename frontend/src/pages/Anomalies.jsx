import React, { useState, useEffect } from 'react';
import { getAnomalies, detectAnomalies } from '../api/api';

const CAT_COLORS = {
  Food:'#c8f135', Transport:'#4d9fff', Bills:'#ffb347',
  Entertainment:'#9d6fff', Health:'#00d4aa', Shopping:'#ff4d6d', Education:'#06b6d4'
};

export default function Anomalies() {
  const [anomalies, setAnomalies] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [scanning,  setScanning]  = useState(false);
  const [scanResult,setScanResult]= useState(null);

  const load = () => {
    getAnomalies().then(r => {
      setAnomalies(r.data.anomalies || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleScan = async () => {
    setScanning(true);
    setScanResult(null);
    try {
      const r = await detectAnomalies();
      setScanResult(r.data);
      load();
    } catch { setScanResult({ error: 'Scan failed' }); }
    setScanning(false);
  };

  const s = { background:'var(--bg-card)', borderRadius:'14px',
               padding:'20px 24px', border:'1px solid var(--border)' };

  return (
    <div style={{ padding:'28px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'24px' }}>
        <div>
          <h1 style={{ fontSize:'24px', fontWeight:'700', marginBottom:'4px' }}>⚠️ Anomalies</h1>
          <p style={{ color:'var(--text-secondary)', fontSize:'14px' }}>
            Transactions flagged as statistically abnormal
          </p>
        </div>
        <button onClick={handleScan} disabled={scanning}
          style={{ padding:'12px 20px', background:'var(--accent-amber)', color:'#000',
                   border:'none', borderRadius:'10px', fontWeight:'700', fontSize:'14px' }}>
          {scanning ? '🔍 Scanning...' : '🔍 Re-scan All'}
        </button>
      </div>

      {/* Scan result */}
      {scanResult && !scanResult.error && (
        <div style={{ ...s, marginBottom:'20px', borderLeft:'4px solid var(--accent)' }}>
          <div style={{ fontSize:'14px' }}>
            ✅ Scanned <strong>{scanResult.total_scanned}</strong> transactions —
            found <strong style={{ color:'var(--accent-amber)' }}>{scanResult.anomalies_found}</strong> anomalies
            (Z-threshold: {scanResult.z_threshold})
          </div>
        </div>
      )}

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'16px', marginBottom:'24px' }}>
        {[
          { label:'Total anomalies',     value: anomalies.length,                                              color:'var(--accent-amber)' },
          { label:'Highest amount',      value: anomalies.length ? `${Math.max(...anomalies.map(a=>a.amount)).toFixed(0)} TND`:'—', color:'var(--accent-red)' },
          { label:'Categories affected', value: new Set(anomalies.map(a=>a.category)).size,                   color:'var(--accent-purple)' },
        ].map(m => (
          <div key={m.label} style={s}>
            <div style={{ fontSize:'13px', color:'var(--text-secondary)', marginBottom:'6px' }}>{m.label}</div>
            <div style={{ fontSize:'26px', fontWeight:'700', color:m.color }}>{m.value}</div>
          </div>
        ))}
      </div>

      {/* List */}
      <div style={s}>
        <h2 style={{ fontSize:'16px', fontWeight:'600', marginBottom:'16px' }}>
          Flagged Transactions
        </h2>
        {loading ? (
          <div style={{ textAlign:'center', padding:'40px', color:'var(--text-muted)' }}>Loading...</div>
        ) : anomalies.length === 0 ? (
          <div style={{ textAlign:'center', padding:'40px', color:'var(--accent-teal)' }}>
            ✅ No anomalies detected — your spending looks normal!
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
            {anomalies.map(a => (
              <div key={a.id} style={{
                display:'flex', justifyContent:'space-between', alignItems:'center',
                padding:'14px 16px', background:'var(--bg-hover)', borderRadius:'10px',
                border:'1px solid var(--border-light)',
                borderLeft:'4px solid var(--accent-red)'
              }}>
                <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
                  <div style={{
                    width:'40px', height:'40px', borderRadius:'10px', fontSize:'20px',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    background:'rgba(255,77,109,0.15)'
                  }}>⚠️</div>
                  <div>
                    <div style={{ fontWeight:'600', fontSize:'14px' }}>{a.description}</div>
                    <div style={{ fontSize:'12px', color:'var(--text-secondary)', marginTop:'2px' }}>
                      <span style={{
                        background:`${CAT_COLORS[a.category]||'#666'}22`,
                        color: CAT_COLORS[a.category]||'#666',
                        padding:'1px 8px', borderRadius:'20px', marginRight:'8px'
                      }}>{a.category}</span>
                      {a.date?.slice(0,10)}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:'18px', fontWeight:'700', color:'var(--accent-red)' }}>
                    {a.amount?.toFixed(2)} TND
                  </div>
                  <div style={{ fontSize:'11px', color:'var(--text-muted)', marginTop:'2px' }}>
                    Abnormally high
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
