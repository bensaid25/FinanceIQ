import React, { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { getForecast } from '../api/api';

const COLORS = ['#c8f135','#4d9fff','#ffb347','#9d6fff','#00d4aa','#ff4d6d','#06b6d4'];

export default function Forecast() {
  const [forecast, setForecast] = useState(null);
  const [loading,  setLoading]  = useState(false);

  const handleForecast = async () => {
    setLoading(true);
    try {
      const r = await getForecast();
      setForecast(r.data);
    } catch {}
    setLoading(false);
  };

  const chartData = forecast?.by_category
    ? Object.entries(forecast.by_category)
        .filter(([,v]) => v !== null && v > 0)
        .map(([k,v], i) => ({ name:k, value: Math.round(v), color: COLORS[i%COLORS.length] }))
        .sort((a,b) => b.value - a.value)
    : [];

  const s = { background:'var(--bg-card)', borderRadius:'14px',
               padding:'20px 24px', border:'1px solid var(--border)' };

  return (
    <div style={{ padding:'28px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'24px' }}>
        <div>
          <h1 style={{ fontSize:'24px', fontWeight:'700', marginBottom:'4px' }}>🔮 Forecast</h1>
          <p style={{ color:'var(--text-secondary)', fontSize:'14px' }}>
            AI-powered spending predictions using Facebook Prophet
          </p>
        </div>
        <button onClick={handleForecast} disabled={loading}
          style={{ padding:'12px 24px', background:'var(--accent-purple)', color:'#fff',
                   border:'none', borderRadius:'10px', fontWeight:'700', fontSize:'14px' }}>
          {loading ? '⏳ Computing...' : '🔮 Generate Forecast'}
        </button>
      </div>

      {!forecast ? (
        <div style={{ ...s, textAlign:'center', padding:'80px 40px' }}>
          <div style={{ fontSize:'48px', marginBottom:'16px' }}>🔮</div>
          <h2 style={{ fontSize:'20px', fontWeight:'600', marginBottom:'8px' }}>
            Ready to predict your spending
          </h2>
          <p style={{ color:'var(--text-secondary)', fontSize:'14px', marginBottom:'24px' }}>
            Click "Generate Forecast" to see next month's predictions
          </p>
          <button onClick={handleForecast} disabled={loading}
            style={{ padding:'14px 32px', background:'var(--accent-purple)', color:'#fff',
                     border:'none', borderRadius:'10px', fontWeight:'700', fontSize:'15px' }}>
            {loading ? '⏳ Computing with Prophet...' : '🚀 Generate Now'}
          </button>
        </div>
      ) : (
        <>
          {/* Total metric */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'16px', marginBottom:'24px' }}>
            <div style={{ ...s, borderTop:'3px solid var(--accent-purple)', gridColumn:'span 1' }}>
              <div style={{ fontSize:'13px', color:'var(--text-secondary)', marginBottom:'6px' }}>Forecast Month</div>
              <div style={{ fontSize:'22px', fontWeight:'700', color:'var(--accent-purple)' }}>
                {forecast.forecast_month}
              </div>
            </div>
            <div style={{ ...s, borderTop:'3px solid var(--accent-red)' }}>
              <div style={{ fontSize:'13px', color:'var(--text-secondary)', marginBottom:'6px' }}>Total Predicted</div>
              <div style={{ fontSize:'22px', fontWeight:'700', color:'var(--accent-red)' }}>
                {forecast.total_predicted?.toFixed(0)} TND
              </div>
            </div>
            <div style={{ ...s, borderTop:'3px solid var(--accent)' }}>
              <div style={{ fontSize:'13px', color:'var(--text-secondary)', marginBottom:'6px' }}>Categories</div>
              <div style={{ fontSize:'22px', fontWeight:'700', color:'var(--accent)' }}>
                {chartData.length}
              </div>
            </div>
          </div>

          {/* Chart */}
          <div style={{ ...s, marginBottom:'20px' }}>
            <h2 style={{ fontSize:'16px', fontWeight:'600', marginBottom:'20px' }}>
              Predicted Spending by Category
            </h2>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={chartData} margin={{ top:5, right:20, left:0, bottom:5 }}>
                <XAxis dataKey="name" tick={{ fill:'var(--text-secondary)', fontSize:12 }} />
                <YAxis tick={{ fill:'var(--text-secondary)', fontSize:12 }} />
                <Tooltip
                  formatter={(v) => [`${v} TND`, 'Predicted']}
                  contentStyle={{ background:'var(--bg-card)', border:'1px solid var(--border)',
                                  borderRadius:'8px', color:'var(--text-primary)' }} />
                <Bar dataKey="value" radius={[6,6,0,0]}>
                  {chartData.map((d,i) => <Cell key={i} fill={d.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Breakdown table */}
          <div style={s}>
            <h2 style={{ fontSize:'16px', fontWeight:'600', marginBottom:'16px' }}>
              Detailed Breakdown
            </h2>
            <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
              {chartData.map((d,i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:'12px' }}>
                  <div style={{ width:'12px', height:'12px', borderRadius:'3px',
                                background:d.color, flexShrink:0 }} />
                  <span style={{ flex:1, fontSize:'14px' }}>{d.name}</span>
                  <span style={{ fontWeight:'600', color:d.color }}>{d.value} TND</span>
                  <div style={{ width:'120px', height:'6px', background:'var(--bg-hover)', borderRadius:'3px' }}>
                    <div style={{ width:`${(d.value/forecast.total_predicted*100).toFixed(0)}%`,
                                  height:'100%', background:d.color, borderRadius:'3px' }} />
                  </div>
                  <span style={{ fontSize:'12px', color:'var(--text-muted)', width:'36px', textAlign:'right' }}>
                    {(d.value/forecast.total_predicted*100).toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
