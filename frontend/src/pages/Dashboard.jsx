import React, { useState, useEffect, useCallback } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip,
         ResponsiveContainer, Legend } from 'recharts';
import MetricCard from '../components/MetricCard';
import AnomalyCard from '../components/AnomalyCard';
import TransactionsTable from '../components/TransactionsTable';
import AddTransaction from '../components/AddTransaction';
import AlertsBar from '../components/AlertsBar';
import HistoryStats from '../components/HistoryStats';
import { getSummary, getTransactions, getAnomalies,
         detectAnomalies, getForecast, categorize, trainModel } from '../api/api';

const COLORS = ['#1e3a8a','#0d9488','#d97706','#4f46e5','#059669','#be185d','#0284c7'];
const MONTHS = ['','Janvier','Février','Mars','Avril','Mai','Juin',
                'Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

const fmt = (n, d = 2) =>
  new Intl.NumberFormat('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d })
    .format(Number(n) || 0);

/* ── Styles partagés ─────────────────────────────── */
const card = {
  background: 'var(--bg-card)', borderRadius: '16px',
  padding: '20px 24px', border: '1px solid var(--border)',
  boxShadow: 'var(--shadow-card)'
};

const sectionTitle = {
  fontSize: '15px', fontWeight: '600', marginBottom: '16px',
  color: 'var(--text-primary)'
};

const btn = {
  border: 'none', borderRadius: '10px', padding: '9px 16px',
  cursor: 'pointer', fontSize: '14px', fontWeight: '600'
};
const btnPrimary = { ...btn, background: 'var(--brand)', color: '#fff' };
const btnOutline = {
  ...btn, background: 'var(--bg-card)', color: 'var(--text-primary)',
  border: '1px solid var(--border)'
};

const selectStyle = {
  background: 'var(--bg-card)', color: 'var(--text-primary)',
  border: '1px solid var(--border)', borderRadius: '10px',
  padding: '9px 12px', fontSize: '14px'
};

const tooltipStyle = {
  background: 'var(--bg-card)', border: '1px solid var(--border)',
  borderRadius: '10px', color: 'var(--text-primary)',
  boxShadow: 'var(--shadow-card)'
};

export default function Dashboard() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [error, setError] = useState('');
  const [summary, setSummary]           = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [allTx, setAllTx]               = useState([]);
  const [anomalies, setAnomalies]       = useState([]);
  const [forecast, setForecast]         = useState(null);
  const [desc, setDesc]                 = useState('');
  const [catResult, setCatResult]       = useState(null);
  const [loading, setLoading]           = useState(false);
  const [msg, setMsg]                   = useState('');

  const load = useCallback(async () => {
    try {
      const [s, t, a, all] = await Promise.all([
        getSummary(1, month, year),
        getTransactions(month, year),
        getAnomalies(),
        getTransactions(1).catch(() => null)   // l'historique ne doit pas casser le reste
      ]);
      setSummary(s.data);
      setTransactions(t.data);
      if (all) setAllTx(all.data || []);
      setAnomalies(a.data.anomalies || []);
      setError('');
    } catch (e) {
      console.error('load() a échoué', e);
      setError('Erreur de chargement (' + (e.response?.status || e.message) + ')');
      setSummary(null);
      setTransactions([]);
    }
  }, [month, year]);

  useEffect(() => { load(); }, [load]);

  // Au démarrage : se placer sur le mois de la transaction la plus récente
  useEffect(() => {
    getTransactions(1).then(r => {
      const latest = r.data?.[0]?.date;  // l'API trie du plus récent au plus ancien
      if (latest) {
        const d = new Date(latest);
        setMonth(d.getMonth() + 1);
        setYear(d.getFullYear());
      }
    }).catch(() => {});
  }, []);

  // Après un ajout / import : aller sur le mois concerné, recharger, recalculer la prévision
  const handleChanged = (info) => {
    if (info) { setMonth(info.month); setYear(info.year); }
    load();
    handleForecast(true);
  };

  // Rafraîchissement automatique : toutes les 30 s et au retour sur l'onglet
  useEffect(() => {
    const tick = () => { if (!document.hidden) load(); };
    const id = setInterval(tick, 30000);
    window.addEventListener('focus', tick);
    return () => { clearInterval(id); window.removeEventListener('focus', tick); };
  }, [load]);

  // Prévision calculée automatiquement à l'ouverture
  useEffect(() => { handleForecast(true); }, []); // eslint-disable-line

  const handleDetect = async () => {
    setLoading(true);
    setMsg('');
    try {
      const r = await detectAnomalies();
      setMsg(`✅ ${r.data.anomalies_found} anomalie(s) détectée(s)`);
      load();
    } catch { setMsg('❌ Erreur'); }
    setLoading(false);
  };

  const handleTrain = async () => {
    setLoading(true);
    setMsg('');
    try {
      const r = await trainModel();
      setMsg(`✅ ${r.data.status} — ${r.data.accuracy}`);
    } catch { setMsg('❌ Erreur'); }
    setLoading(false);
  };

  const handleForecast = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const r = await getForecast();
      setForecast(r.data);
    } catch {}
    if (!silent) setLoading(false);
  };

  const handleCategorize = async () => {
    if (!desc) return;
    try {
      const r = await categorize(desc);
      setCatResult(r.data);
    } catch {}
  };

  const pieData = summary?.categories?.map(c => ({
    name: c.category, value: c.total_spent
  })) || [];

  const budgetData = summary?.categories?.filter(c => c.budget_limit).map(c => ({
    name: c.category, Dépensé: c.total_spent, Budget: c.budget_limit
  })) || [];

  const forecastData = forecast?.by_category
    ? Object.entries(forecast.by_category)
        .filter(([,v]) => v !== null)
        .map(([k, v]) => ({ name: k, value: Math.round(v) }))
    : [];

  const saved = summary ? summary.total_income - summary.total_expenses : 0;
  const savingsRate = Number(summary?.savings_rate) || 0;
  const goalProgress = Math.max(0, Math.min(100, (savingsRate / 20) * 100));

  // Alerte de prévision : le revenu de référence est celui du mois affiché
  const refIncome = summary?.total_income;
  const forecastAlert = (forecast?.total_predicted && refIncome)
    ? (forecast.total_predicted > refIncome
        ? { level: 'danger',
            title: `Prévision ${forecast.forecast_month} supérieure à vos revenus`,
            detail: `${Math.round(forecast.total_predicted)} TND prévus vs ${Math.round(refIncome)} TND de revenu ce mois` }
        : forecast.total_predicted > refIncome * 0.85
          ? { level: 'warning',
              title: `Prévision ${forecast.forecast_month} proche de vos revenus`,
              detail: `${Math.round(forecast.total_predicted)} TND prévus vs ${Math.round(refIncome)} TND de revenu ce mois` }
          : null)
    : null;
  const allAlerts = forecastAlert ? [forecastAlert] : [];

  // Anomalies du mois affiché (la détection reste globale, l'affichage est filtré)
  const ym = `${year}-${String(month).padStart(2, '0')}`;
  const monthAnomalies = anomalies
    .filter(a => String(a.date).startsWith(ym))
    .sort((a, b) => b.amount - a.amount);

  return (
    <div style={{ padding: '28px 32px', minHeight: '100vh' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text-primary)' }}>
            {MONTHS[month]} {year}
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>
            Tableau de bord financier intelligent
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <select value={month} onChange={e => setMonth(+e.target.value)} style={selectStyle}>
            {MONTHS.slice(1).map((m, i) => (
              <option key={i+1} value={i+1}>{m}</option>
            ))}
          </select>
          <select value={year} onChange={e => setYear(+e.target.value)} style={selectStyle}>
            {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={handleDetect} disabled={loading}
            style={{ ...btnOutline, opacity: loading ? 0.6 : 1 }}>
            Détecter anomalies
          </button>
          <button onClick={handleTrain} disabled={loading}
            style={{ ...btnPrimary, opacity: loading ? 0.6 : 1 }}>
            Entraîner
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca',
                      borderRadius: '10px', padding: '10px 16px', marginBottom: '20px',
                      fontSize: '14px', color: 'var(--accent-red)' }}>{error}</div>
      )}

      {msg && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)',
                      borderRadius: '10px', padding: '10px 16px', marginBottom: '20px',
                      fontSize: '14px', color: 'var(--text-primary)',
                      boxShadow: 'var(--shadow-card)' }}>{msg}</div>
      )}

      <AlertsBar alerts={allAlerts} />

      {/* Hero : solde du mois, style carte bancaire */}
      <div style={{
        position: 'relative', overflow: 'hidden', marginBottom: '24px',
        borderRadius: '20px', padding: '28px 32px', color: '#fff',
        background: 'linear-gradient(135deg, #0b1f44 0%, #0b2a6f 55%, #0d9488 140%)',
        boxShadow: '0 10px 30px rgba(11, 42, 111, 0.25)'
      }}>
        <div style={{ position: 'absolute', right: '-60px', top: '-80px', width: '260px',
                      height: '260px', borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />
        <div style={{ position: 'absolute', right: '120px', bottom: '-110px', width: '220px',
                      height: '220px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />

        <div style={{ position: 'relative', display: 'flex',
                      justifyContent: 'space-between', alignItems: 'flex-end', gap: '24px',
                      flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '12px', letterSpacing: '0.08em', textTransform: 'uppercase',
                          opacity: 0.75 }}>
              Solde du mois · {MONTHS[month]} {year}
            </div>
            <div style={{ fontSize: '40px', fontWeight: '700', marginTop: '8px',
                          letterSpacing: '-0.02em' }}>
              {fmt(saved)} <span style={{ fontSize: '18px', fontWeight: '600', opacity: 0.8 }}>TND</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '32px' }}>
            <div>
              <div style={{ fontSize: '12px', opacity: 0.7 }}>Revenus</div>
              <div style={{ fontSize: '18px', fontWeight: '600', marginTop: '4px', color: '#6ee7b7' }}>
                + {fmt(summary?.total_income)} TND
              </div>
            </div>
            <div>
              <div style={{ fontSize: '12px', opacity: 0.7 }}>Dépenses</div>
              <div style={{ fontSize: '18px', fontWeight: '600', marginTop: '4px', color: '#fca5a5' }}>
                − {fmt(summary?.total_expenses)} TND
              </div>
            </div>
          </div>
        </div>

        <div style={{ position: 'relative', marginTop: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between',
                        fontSize: '12px', opacity: 0.8, marginBottom: '6px' }}>
            <span>Objectif d'épargne : 20%</span>
            <span>{savingsRate}% atteint</span>
          </div>
          <div style={{ height: '6px', borderRadius: '6px', background: 'rgba(255,255,255,0.18)' }}>
            <div style={{ height: '100%', width: `${goalProgress}%`, borderRadius: '6px',
                          background: '#5eead4', transition: 'width 0.4s' }} />
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
        <MetricCard title="Revenus" icon="💵"
          value={`${summary?.total_income?.toFixed(0) || 0} TND`}
          subtitle="Ce mois" color="var(--accent-green)" />
        <MetricCard title="Dépenses" icon="💸"
          value={`${summary?.total_expenses?.toFixed(0) || 0} TND`}
          subtitle="Ce mois" color="var(--accent-red)" />
        <MetricCard title="Taux d'épargne" icon="📈"
          value={`${summary?.savings_rate || 0}%`}
          subtitle="Objectif: 20%" color="var(--accent-purple)" />
        <MetricCard title="Anomalies" icon="⚠️"
          value={monthAnomalies.length}
          subtitle="Ce mois" color="var(--accent-amber)" />
      </div>

      <AddTransaction userId={1} onChanged={handleChanged} />

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px',
                    margin: '24px 0' }}>

        {/* Pie */}
        <div style={card}>
          <div style={sectionTitle}>Dépenses par catégorie</div>
          {pieData.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={60}
                     outerRadius={100} paddingAngle={3} dataKey="value">
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => `${v.toFixed(2)} TND`} contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: '12px', color: 'var(--text-secondary)' }} />
              </PieChart>
            </ResponsiveContainer>
          ) : <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px' }}>
                Pas de données
              </p>}
        </div>

        {/* Budget vs dépenses */}
        <div style={card}>
          <div style={sectionTitle}>Dépenses vs Budget</div>
          {budgetData.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={budgetData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <XAxis dataKey="name" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: '12px', color: 'var(--text-secondary)' }} />
                <Bar dataKey="Dépensé" fill="#dc2626" radius={[4,4,0,0]} />
                <Bar dataKey="Budget"  fill="#0d9488" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px' }}>
                Aucun budget défini
              </p>}
        </div>
      </div>

      {/* Anomalies + Forecast */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>

        {/* Anomalies */}
        <div style={card}>
          <div style={sectionTitle}>Anomalies du mois ({monthAnomalies.length})</div>
          {monthAnomalies.length ? monthAnomalies.slice(0, 5).map(a => (
            <AnomalyCard key={a.id} anomaly={a} />
          )) : (
            <div style={{ textAlign: 'center', padding: '30px',
                          color: 'var(--accent-green)' }}>
              ✅ Aucune anomalie détectée
            </div>
          )}
        </div>

        {/* Forecast */}
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between',
                        alignItems: 'center', marginBottom: '16px' }}>
            <span style={{ ...sectionTitle, marginBottom: 0 }}>Prévisions</span>
            <button onClick={() => handleForecast()} disabled={loading}
              style={{ ...btnPrimary, padding: '6px 14px', fontSize: '13px',
                       opacity: loading ? 0.6 : 1 }}>
              {loading ? '...' : 'Calculer'}
            </button>
          </div>
          {forecast ? (
            <>
              <div style={{ marginBottom: '12px', fontSize: '14px',
                            color: 'var(--text-secondary)' }}>
                {forecast.forecast_month} —
                <span style={{ color: 'var(--brand)', fontWeight: '700',
                               marginLeft: '6px' }}>
                  {forecast.total_predicted?.toFixed(0)} TND prévu
                </span>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={forecastData}>
                  <XAxis dataKey="name" tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} />
                  <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="value" fill="#1e3a8a" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px',
                          color: 'var(--text-muted)', fontSize: '14px' }}>
              Clique "Calculer" pour voir les prévisions Prophet
            </div>
          )}
        </div>
      </div>

      {/* Transactions */}
      <div style={{ ...card, marginBottom: '24px' }}>
        <div style={sectionTitle}>Transactions récentes</div>
        <TransactionsTable transactions={transactions} />
      </div>

      {/* AI Categorizer */}
      <div style={card}>
        <div style={sectionTitle}>Catégoriser une transaction</div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <input value={desc} onChange={e => setDesc(e.target.value)}
            placeholder="ex: Pharmacy, Uber, Netflix..."
            onKeyDown={e => e.key === 'Enter' && handleCategorize()}
            style={{ flex: 1, background: 'var(--bg-hover)', border: '1px solid var(--border)',
                     borderRadius: '10px', padding: '10px 14px', color: 'var(--text-primary)',
                     fontSize: '14px' }} />
          <button onClick={handleCategorize} style={{ ...btnPrimary, padding: '10px 20px' }}>
            Prédire
          </button>
        </div>
        {catResult && (
          <div style={{ marginTop: '16px', display: 'flex', gap: '16px' }}>
            <div style={{ background: 'var(--bg-hover)', borderRadius: '12px',
                          padding: '12px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Catégorie</div>
              <div style={{ fontSize: '20px', fontWeight: '700',
                            color: 'var(--brand)', marginTop: '4px' }}>
                {catResult.predicted_category}
              </div>
            </div>
            <div style={{ background: 'var(--bg-hover)', borderRadius: '12px',
                          padding: '12px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Confiance</div>
              <div style={{ fontSize: '20px', fontWeight: '700',
                            color: 'var(--accent-green)', marginTop: '4px' }}>
                {catResult.confidence}%
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Historique & statistiques */}
      <HistoryStats transactions={allTx} />
    </div>
  );
}