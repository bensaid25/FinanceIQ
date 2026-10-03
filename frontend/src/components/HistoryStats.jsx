import React, { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
         ResponsiveContainer } from 'recharts';

const MONTHS_SHORT = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Août','Sep','Oct','Nov','Déc'];

/* ── Lecture des transactions ────────────────────────
   Si les revenus sortent en dépenses (ou l'inverse), c'est cette fonction
   qu'il faut ajuster selon les champs renvoyés par ton API. */
const isIncome = (t) => {
  const v = String(t.type || t.transaction_type || t.kind || '').toLowerCase();
  if (v) return /(income|revenu|revenue|credit|crédit|entr)/.test(v);
  if (typeof t.is_income === 'boolean') return t.is_income;
  return Number(t.amount) > 0;
};
const categoryOf = (t) => t.category || t.category_name || 'Autre';

/* ── Formats ─────────────────────────────────────── */
const nf = (d) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: d });
const f0 = (n) => nf(0).format(n);
const f1 = (n) => nf(1).format(n);

/* ── Styles ──────────────────────────────────────── */
const card = {
  background: 'var(--bg-card)', borderRadius: '16px',
  padding: '20px 24px', border: '1px solid var(--border)',
  boxShadow: 'var(--shadow-card)'
};
const sectionTitle = {
  fontSize: '15px', fontWeight: '600', marginBottom: '14px',
  color: 'var(--text-primary)'
};
const th = {
  textAlign: 'right', padding: '8px 10px', fontSize: '12px', fontWeight: 600,
  color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)',
  whiteSpace: 'nowrap'
};
const td = {
  textAlign: 'right', padding: '8px 10px', fontSize: '13px',
  color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums',
  borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap'
};
const tdLabel = { ...td, textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 500 };
const tooltipStyle = {
  background: 'var(--bg-card)', border: '1px solid var(--border)',
  borderRadius: '10px', color: 'var(--text-primary)', fontSize: '12px'
};

/* ── Couleurs "heatmap" (fonctionnent en clair comme en sombre) ── */
const tint = (good, ratio) => {
  const r = Math.max(0, Math.min(1, ratio));
  return `rgba(${good ? '16,185,129' : '239,68,68'},${(0.08 + 0.30 * r).toFixed(2)})`;
};

function HeatRow({ label, values, total, kind, fmtFn = f0 }) {
  const nums = values.filter(v => typeof v === 'number');
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  const span = (hi - lo) || 1;
  const maxAbs = Math.max(Math.abs(lo), Math.abs(hi)) || 1;

  const bg = (v) => {
    if (typeof v !== 'number' || nums.length < 2) return 'transparent';
    if (kind === 'good') return tint(true,  (v - lo) / span);
    if (kind === 'bad')  return tint(false, (v - lo) / span);
    return v >= 0 ? tint(true, v / maxAbs) : tint(false, Math.abs(v) / maxAbs);
  };

  return (
    <tr>
      <td style={tdLabel}>{label}</td>
      {values.map((v, i) => (
        <td key={i} style={{ ...td, background: bg(v) }}>
          {typeof v === 'number' ? fmtFn(v) : '–'}
        </td>
      ))}
      <td style={{ ...td, fontWeight: 700 }}>
        {typeof total === 'number' ? fmtFn(total) : '–'}
      </td>
    </tr>
  );
}

function MiniChart({ title, data, dataKey, color, suffix = '', decimals = 0 }) {
  const f = (v) => nf(decimals).format(v);
  return (
    <div style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)',
                  borderRadius: '12px', padding: '12px 12px 4px' }}>
      <div style={{ fontSize: '12px', fontWeight: 600,
                    color: 'var(--text-secondary)', marginBottom: '6px' }}>{title}</div>
      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={data} margin={{ top: 5, right: 8, left: -14, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" interval="preserveStartEnd"
                 tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
          <YAxis width={44} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
          <Tooltip formatter={(v) => `${f(v)}${suffix}`} contentStyle={tooltipStyle} />
          <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2}
                dot={data.length < 3} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function HistoryStats({ transactions = [] }) {
  const [sel, setSel] = useState('all');

  /* Agrégation : ym[année][mois] = {inc, exp} ; cat[catégorie][année] = total dépensé */
  const { ym, cat, years } = useMemo(() => {
    const ym = {};
    const cat = {};
    for (const t of transactions) {
      const date = String(t.date || '');
      const y = +date.slice(0, 4);
      const m = +date.slice(5, 7);
      if (!y || !m) continue;
      const amt = Math.abs(Number(t.amount) || 0);
      const inc = isIncome(t);
      if (!ym[y]) ym[y] = {};
      if (!ym[y][m]) ym[y][m] = { inc: 0, exp: 0 };
      ym[y][m][inc ? 'inc' : 'exp'] += amt;
      if (!inc) {
        const c = categoryOf(t);
        if (!cat[c]) cat[c] = {};
        cat[c][y] = (cat[c][y] || 0) + amt;
      }
    }
    return { ym, cat, years: Object.keys(ym).map(Number).sort((a, b) => a - b) };
  }, [transactions]);

  if (!years.length) {
    return (
      <div style={{ ...card, marginTop: '24px' }}>
        <div style={sectionTitle}>Historique financier</div>
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '30px' }}>
          Pas encore d'historique
        </p>
      </div>
    );
  }

  /* ── Par année ── */
  const yearTotals = years.map(y => {
    let inc = 0, exp = 0;
    Object.values(ym[y]).forEach(v => { inc += v.inc; exp += v.exp; });
    return { y, inc, exp, sav: inc - exp, rate: inc ? ((inc - exp) / inc) * 100 : 0 };
  });
  const all = yearTotals.reduce((a, t) => ({ inc: a.inc + t.inc, exp: a.exp + t.exp }),
                                { inc: 0, exp: 0 });
  const allRate = all.inc ? ((all.inc - all.exp) / all.inc) * 100 : 0;

  /* ── Par catégorie (top 10) ── */
  const catRows = Object.keys(cat).map(c => {
    const vals = years.map(y => cat[c][y] || 0);
    return { c, vals, total: vals.reduce((s, v) => s + v, 0) };
  }).sort((a, b) => b.total - a.total).slice(0, 10);
  const catMax = Math.max(1, ...catRows.flatMap(r => r.vals));

  /* ── Par mois (selon l'année choisie) ── */
  const selYears = sel === 'all' ? years : [sel];
  const monthly = MONTHS_SHORT.map((_, i) => {
    const m = i + 1;
    const present = selYears.some(y => ym[y] && ym[y][m]);
    let inc = 0, exp = 0;
    selYears.forEach(y => {
      if (ym[y] && ym[y][m]) { inc += ym[y][m].inc; exp += ym[y][m].exp; }
    });
    return present ? { inc, exp, sav: inc - exp } : null;
  });
  const sumOf = (k) => monthly.reduce((s, v) => s + (v ? v[k] : 0), 0);

  /* ── Séries pour les graphiques (chronologique) ── */
  let cum = 0;
  const series = [];
  selYears.forEach(y => {
    for (let m = 1; m <= 12; m++) {
      const v = ym[y] && ym[y][m];
      if (!v) continue;
      cum += v.inc - v.exp;
      series.push({
        label: `${MONTHS_SHORT[m - 1]} ${String(y).slice(2)}`,
        inc: v.inc, exp: v.exp, sav: v.inc - v.exp,
        ratio: v.inc ? (v.exp / v.inc) * 100 : null,
        cum
      });
    }
  });

  const chip = (active) => ({
    border: active ? 'none' : '1px solid var(--border)',
    background: active ? 'var(--brand)' : 'var(--bg-card)',
    color: active ? '#fff' : 'var(--text-primary)',
    borderRadius: '10px', padding: '7px 16px', fontSize: '13px',
    fontWeight: 600, cursor: 'pointer'
  });

  return (
    <div style={{ marginTop: '24px' }}>

      {/* En-tête + filtre année */}
      <div style={{ display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 700 }}>Historique financier</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '2px' }}>
            Statistiques sur toute la période enregistrée
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button style={chip(sel === 'all')} onClick={() => setSel('all')}>Tout</button>
          {years.map(y => (
            <button key={y} style={chip(sel === y)} onClick={() => setSel(y)}>{y}</button>
          ))}
        </div>
      </div>

      {/* Par année + par catégorie */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
        <div style={card}>
          <div style={sectionTitle}>Par année</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign: 'left' }}>TND</th>
                  {years.map(y => <th key={y} style={th}>{y}</th>)}
                  <th style={th}>Total</th>
                </tr>
              </thead>
              <tbody>
                <HeatRow label="Revenus"  kind="good" values={yearTotals.map(t => t.inc)} total={all.inc} />
                <HeatRow label="Dépenses" kind="bad"  values={yearTotals.map(t => t.exp)} total={all.exp} />
                <HeatRow label="Épargne"  kind="sign" values={yearTotals.map(t => t.sav)} total={all.inc - all.exp} />
                <HeatRow label="Taux d'épargne %" kind="sign" fmtFn={f1}
                         values={yearTotals.map(t => t.rate)} total={allRate} />
              </tbody>
            </table>
          </div>
        </div>

        <div style={card}>
          <div style={sectionTitle}>Dépenses par catégorie</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign: 'left' }}>Catégorie</th>
                  {years.map(y => <th key={y} style={th}>{y}</th>)}
                  <th style={th}>Total</th>
                </tr>
              </thead>
              <tbody>
                {catRows.length ? catRows.map(r => (
                  <tr key={r.c}>
                    <td style={tdLabel}>{r.c}</td>
                    {r.vals.map((v, i) => (
                      <td key={i} style={{ ...td, background: v ? tint(false, v / catMax) : 'transparent' }}>
                        {v ? f0(v) : '–'}
                      </td>
                    ))}
                    <td style={{ ...td, fontWeight: 700 }}>{f0(r.total)}</td>
                  </tr>
                )) : (
                  <tr><td style={tdLabel} colSpan={years.length + 2}>Aucune dépense</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Par mois */}
      <div style={{ ...card, marginBottom: '16px' }}>
        <div style={sectionTitle}>
          Par mois {sel === 'all' ? '(toutes années cumulées)' : `(${sel})`}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left' }}>TND</th>
                {MONTHS_SHORT.map(m => <th key={m} style={th}>{m}</th>)}
                <th style={th}>Total</th>
              </tr>
            </thead>
            <tbody>
              <HeatRow label="Revenus"  kind="good" values={monthly.map(v => v && v.inc)} total={sumOf('inc')} />
              <HeatRow label="Dépenses" kind="bad"  values={monthly.map(v => v && v.exp)} total={sumOf('exp')} />
              <HeatRow label="Épargne"  kind="sign" values={monthly.map(v => v && v.sav)} total={sumOf('sav')} />
            </tbody>
          </table>
        </div>
      </div>

      {/* Indicateurs clés */}
      <div style={card}>
        <div style={sectionTitle}>Indicateurs clés dans le temps</div>
        <div style={{ display: 'grid', gap: '12px',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
          <MiniChart title="Dépenses / Revenus %" data={series} dataKey="ratio"
                     color="#d97706" suffix=" %" decimals={1} />
          <MiniChart title="Revenus mensuels (TND)" data={series} dataKey="inc" color="#059669" />
          <MiniChart title="Dépenses mensuelles (TND)" data={series} dataKey="exp" color="#dc2626" />
          <MiniChart title="Épargne mensuelle (TND)" data={series} dataKey="sav" color="#2563eb" />
          <MiniChart title="Épargne cumulée (TND)" data={series} dataKey="cum" color="#0d9488" />
        </div>
      </div>
    </div>
  );
}
