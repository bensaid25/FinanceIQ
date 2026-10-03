import React, { useState, useRef } from 'react';
import { addTransaction, importCsv } from '../api/api';

const CATEGORIES = ['Food', 'Transport', 'Bills', 'Entertainment',
                    'Health', 'Shopping', 'Education'];

const field = {
  background: 'var(--bg-hover)', border: '1px solid var(--border)',
  borderRadius: '8px', padding: '9px 12px', color: 'var(--text-primary)',
  fontSize: '14px', outline: 'none'
};

const COLORS = {
  ok:   'var(--accent-green)',
  warn: 'var(--accent-amber)',
  err:  'var(--accent-red)'
};

export default function AddTransaction({ userId = 1, onChanged }) {
  const today = new Date().toISOString().slice(0, 10);
  const [desc, setDesc]         = useState('');
  const [amount, setAmount]     = useState('');
  const [type, setType]         = useState('expense');
  const [category, setCategory] = useState('auto');
  const [date, setDate]         = useState(today);
  const [busy, setBusy]         = useState(false);
  const [feedback, setFeedback] = useState(null); // { level, text }
  const fileRef = useRef(null);

  const submit = async () => {
    if (!desc.trim() || !(parseFloat(amount) > 0)) {
      setFeedback({ level: 'err', text: 'Description et montant (> 0) requis.' });
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      const r = await addTransaction({
        user_id: userId,
        description: desc.trim(),
        amount: parseFloat(amount),
        type,
        category: type === 'expense' ? category : null,
        date: `${date}T00:00:00`
      });
      const t = r.data;
      let text = type === 'income'
        ? '✅ Revenu ajouté'
        : `✅ Ajouté — catégorie : ${t.category}` +
          (t.confidence ? ` (${t.confidence}% de confiance IA)` : '');
      if (t.is_anomaly) text += ' — ⚠️ dépense inhabituelle !';
      setFeedback({ level: t.is_anomaly ? 'warn' : 'ok', text });
      setDesc('');
      setAmount('');
      const d = new Date(t.date);
      onChanged && onChanged({ month: d.getMonth() + 1, year: d.getFullYear() });
    } catch (e) {
      setFeedback({ level: 'err',
                    text: '❌ ' + (e.response?.data?.detail || e.message) });
    }
    setBusy(false);
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setFeedback(null);
    try {
      const text = await file.text();
      const r = await importCsv(userId, text);
      const d = r.data;
      setFeedback({
        level: 'ok',
        text: `✅ ${d.imported} importées (${d.expenses} dépenses, ${d.income} revenus), ` +
              `${d.duplicates} doublons ignorés, ${d.skipped} lignes invalides`
      });
      if (d.latest_date) {
        const dt = new Date(d.latest_date);
        onChanged && onChanged({ month: dt.getMonth() + 1, year: dt.getFullYear() });
      } else {
        onChanged && onChanged(null);
      }
    } catch (err) {
      setFeedback({ level: 'err',
                    text: '❌ ' + (err.response?.data?.detail || err.message) });
    }
    e.target.value = '';
    setBusy(false);
  };

  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: '14px',
                  padding: '16px 20px', border: '1px solid var(--border)',
                  marginBottom: '24px' }}>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap',
                    alignItems: 'center' }}>
        <span style={{ fontWeight: '600', fontSize: '15px',
                       color: 'var(--text-primary)' }}>➕ Ajouter</span>

        <select value={type} onChange={e => setType(e.target.value)} style={field}>
          <option value="expense">Dépense</option>
          <option value="income">Revenu</option>
        </select>

        <input value={desc} onChange={e => setDesc(e.target.value)}
          placeholder="Description (ex: Uber, Pharmacy…)"
          onKeyDown={e => e.key === 'Enter' && submit()}
          style={{ ...field, flex: 1, minWidth: '180px' }} />

        <input type="number" min="0" step="0.01" value={amount}
          onChange={e => setAmount(e.target.value)} placeholder="Montant"
          onKeyDown={e => e.key === 'Enter' && submit()}
          style={{ ...field, width: '110px' }} />

        {type === 'expense' && (
          <select value={category} onChange={e => setCategory(e.target.value)}
                  style={field}>
            <option value="auto">🤖 Catégorie auto (IA)</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}

        <input type="date" value={date} onChange={e => setDate(e.target.value)}
               style={field} />

        <button onClick={submit} disabled={busy}
          style={{ background: 'var(--accent-green)', color: '#000', border: 'none',
                   borderRadius: '8px', padding: '9px 18px', cursor: 'pointer',
                   fontSize: '14px', fontWeight: '700' }}>
          {busy ? '…' : 'Ajouter'}
        </button>

        <button onClick={() => fileRef.current?.click()} disabled={busy}
          style={{ background: 'transparent', color: 'var(--text-primary)',
                   border: '1px solid var(--border)', borderRadius: '8px',
                   padding: '9px 14px', cursor: 'pointer', fontSize: '14px' }}>
          📄 Importer un CSV
        </button>
        <input ref={fileRef} type="file" accept=".csv,text/csv"
               onChange={onFile} style={{ display: 'none' }} />
      </div>

      {feedback && (
        <div style={{ marginTop: '12px', fontSize: '14px',
                      color: COLORS[feedback.level] }}>{feedback.text}</div>
      )}
    </div>
  );
}
