import React, { useState } from 'react';
import { categorize, trainModel } from '../api/api';

const CAT_COLORS = {
  Food:'#c8f135', Transport:'#4d9fff', Bills:'#ffb347',
  Entertainment:'#9d6fff', Health:'#00d4aa', Shopping:'#ff4d6d', Education:'#06b6d4'
};

const EXAMPLES = ['Pharmacy','Uber ride','Netflix subscription','Electricity bill',
                  'Supermarket','University fees','H&M purchase','Gym membership'];

export default function AITools() {
  const [desc,      setDesc]      = useState('');
  const [catResult, setCatResult] = useState(null);
  const [catLoading,setCatLoading]= useState(false);
  const [trainResult,setTrainResult] = useState(null);
  const [trainLoading,setTrainLoading] = useState(false);

  const handleCategorize = async (d) => {
    const text = d || desc;
    if (!text) return;
    setCatLoading(true);
    setCatResult(null);
    try {
      const r = await categorize(text);
      setCatResult(r.data);
      if (d) setDesc(d);
    } catch { setCatResult({ error: 'API error' }); }
    setCatLoading(false);
  };

  const handleTrain = async () => {
    setTrainLoading(true);
    setTrainResult(null);
    try {
      const r = await trainModel();
      setTrainResult(r.data);
    } catch { setTrainResult({ error: 'Training failed' }); }
    setTrainLoading(false);
  };

  const s = { background:'var(--bg-card)', borderRadius:'14px',
               padding:'24px', border:'1px solid var(--border)' };

  return (
    <div style={{ padding:'28px' }}>
      <h1 style={{ fontSize:'24px', fontWeight:'700', marginBottom:'4px' }}>🤖 AI Tools</h1>
      <p style={{ color:'var(--text-secondary)', fontSize:'14px', marginBottom:'28px' }}>
        Machine learning tools powering FinanceIQ
      </p>

      <div style={{ display:'grid', gridTemplateColumns:'1.2fr 1fr', gap:'20px' }}>

        {/* Categorizer */}
        <div style={s}>
          <h2 style={{ fontSize:'16px', fontWeight:'600', marginBottom:'6px' }}>
            🏷️ Auto-Categorization
          </h2>
          <p style={{ fontSize:'13px', color:'var(--text-secondary)', marginBottom:'20px' }}>
            TF-IDF + Logistic Regression — type a transaction description to predict its category
          </p>

          <div style={{ display:'flex', gap:'10px', marginBottom:'16px' }}>
            <input value={desc} onChange={e => setDesc(e.target.value)}
              onKeyDown={e => e.key==='Enter' && handleCategorize()}
              placeholder="e.g. Pharmacy, Uber, Netflix..."
              style={{ flex:1 }} />
            <button onClick={() => handleCategorize()} disabled={catLoading || !desc}
              style={{ padding:'10px 20px', background:'var(--accent)', color:'#000',
                       border:'none', borderRadius:'8px', fontWeight:'700', fontSize:'14px',
                       opacity: (!desc||catLoading) ? 0.5 : 1 }}>
              {catLoading ? '...' : 'Predict'}
            </button>
          </div>

          {/* Example chips */}
          <div style={{ display:'flex', flexWrap:'wrap', gap:'6px', marginBottom:'16px' }}>
            {EXAMPLES.map(ex => (
              <button key={ex} onClick={() => handleCategorize(ex)}
                style={{ padding:'4px 12px', background:'var(--bg-hover)',
                         border:'1px solid var(--border-light)', borderRadius:'20px',
                         fontSize:'12px', color:'var(--text-secondary)' }}>
                {ex}
              </button>
            ))}
          </div>

          {/* Result */}
          {catResult && !catResult.error && (
            <div style={{ padding:'16px', background:'var(--bg-hover)',
                          borderRadius:'10px', border:`1px solid ${CAT_COLORS[catResult.predicted_category]||'#666'}44` }}>
              <div style={{ fontSize:'13px', color:'var(--text-secondary)', marginBottom:'8px' }}>
                "{catResult.description}"
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:'16px' }}>
                <div>
                  <div style={{ fontSize:'11px', color:'var(--text-muted)', marginBottom:'2px' }}>Category</div>
                  <div style={{ fontSize:'22px', fontWeight:'700',
                                color: CAT_COLORS[catResult.predicted_category]||'var(--accent)' }}>
                    {catResult.predicted_category}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize:'11px', color:'var(--text-muted)', marginBottom:'2px' }}>Confidence</div>
                  <div style={{ fontSize:'22px', fontWeight:'700', color:'var(--accent-blue)' }}>
                    {catResult.confidence}%
                  </div>
                </div>
              </div>
              {/* Confidence bar */}
              <div style={{ marginTop:'12px', height:'6px', background:'var(--border)',
                            borderRadius:'3px', overflow:'hidden' }}>
                <div style={{ width:`${catResult.confidence}%`, height:'100%',
                              background: catResult.confidence > 80 ? 'var(--accent)' :
                                          catResult.confidence > 50 ? 'var(--accent-amber)' : 'var(--accent-red)',
                              borderRadius:'3px', transition:'width 0.5s' }} />
              </div>
            </div>
          )}
        </div>

        {/* Model trainer */}
        <div style={s}>
          <h2 style={{ fontSize:'16px', fontWeight:'600', marginBottom:'6px' }}>
            🧠 Model Training
          </h2>
          <p style={{ fontSize:'13px', color:'var(--text-secondary)', marginBottom:'20px' }}>
            Re-train the categorization model on all your transactions for better accuracy
          </p>

          <div style={{ padding:'16px', background:'var(--bg-hover)', borderRadius:'10px',
                        border:'1px solid var(--border-light)', marginBottom:'20px' }}>
            <div style={{ fontSize:'13px', color:'var(--text-secondary)', marginBottom:'12px' }}>
              Current model info
            </div>
            {[
              { label:'Algorithm',   value:'TF-IDF + Logistic Regression' },
              { label:'Vectorizer',  value:'Unigrams + Bigrams' },
              { label:'Categories',  value:'7 (Food, Transport, Bills...)' },
              { label:'Model file',  value:'ml/categorizer_model.pkl' },
            ].map(r => (
              <div key={r.label} style={{ display:'flex', justifyContent:'space-between',
                                          fontSize:'13px', padding:'4px 0',
                                          borderBottom:'1px solid var(--border)' }}>
                <span style={{ color:'var(--text-secondary)' }}>{r.label}</span>
                <span style={{ fontWeight:'500' }}>{r.value}</span>
              </div>
            ))}
          </div>

          <button onClick={handleTrain} disabled={trainLoading}
            style={{ width:'100%', padding:'14px', background:'var(--accent-blue)', color:'#fff',
                     border:'none', borderRadius:'10px', fontWeight:'700', fontSize:'14px',
                     opacity: trainLoading ? 0.7 : 1 }}>
            {trainLoading ? '⏳ Training...' : '🚀 Re-train Model'}
          </button>

          {trainResult && !trainResult.error && (
            <div style={{ marginTop:'16px', padding:'14px', background:'rgba(200,241,53,0.1)',
                          border:'1px solid var(--accent)', borderRadius:'10px' }}>
              <div style={{ fontSize:'14px', fontWeight:'600', color:'var(--accent)', marginBottom:'4px' }}>
                ✅ {trainResult.status}
              </div>
              <div style={{ fontSize:'13px', color:'var(--text-secondary)' }}>
                Accuracy: <strong style={{ color:'var(--accent)' }}>{trainResult.accuracy}</strong>
              </div>
            </div>
          )}

          {trainResult?.error && (
            <div style={{ marginTop:'16px', padding:'14px', background:'rgba(255,77,109,0.1)',
                          border:'1px solid var(--accent-red)', borderRadius:'10px',
                          fontSize:'13px', color:'var(--accent-red)' }}>
              ❌ {trainResult.error}
            </div>
          )}
        </div>
      </div>

      {/* Info cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'16px', marginTop:'20px' }}>
        {[
          { icon:'🏷️', title:'Auto-Categorization', desc:'TF-IDF vectorizes descriptions, Logistic Regression classifies into 7 categories', color:'var(--accent)' },
          { icon:'🔮', title:'Spending Forecast',    desc:'Facebook Prophet analyzes 3 months of data to predict next month per category', color:'var(--accent-purple)' },
          { icon:'⚠️', title:'Anomaly Detection',    desc:'Z-score flags transactions > 2 standard deviations from category average', color:'var(--accent-amber)' },
        ].map(c => (
          <div key={c.title} style={{ ...s, borderTop:`3px solid ${c.color}` }}>
            <div style={{ fontSize:'24px', marginBottom:'8px' }}>{c.icon}</div>
            <div style={{ fontSize:'14px', fontWeight:'600', marginBottom:'6px' }}>{c.title}</div>
            <div style={{ fontSize:'13px', color:'var(--text-secondary)', lineHeight:1.5 }}>{c.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
