import React, { useState } from 'react';
import AuthLayout from './AuthLayout';
import { signup, errorMessage } from './authApi';

const USERNAME_RE = /^[a-z0-9_-]{3,32}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function strength(pw) {
  let s = 0;
  if (pw.length >= 10) s++;
  if (pw.length >= 14) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(3, Math.ceil(s * 3 / 5));   // 0..3
}

const LABELS = ['', 'Faible', 'Correct', 'Solide'];

export default function SignupPage({ onDone, onGotoLogin }) {
  const [f, setF] = useState({ username: '', email: '', password: '', confirm: '' });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const set = k => e => setF(v => ({ ...v, [k]: e.target.value }));
  const score = strength(f.password);

  const validate = () => {
    const u = f.username.trim().toLowerCase();
    if (!USERNAME_RE.test(u)) return "Nom d'utilisateur : 3 à 32 caractères (lettres minuscules, chiffres, _ ou -)";
    if (!EMAIL_RE.test(f.email.trim())) return 'Adresse email invalide';
    if (f.password.length < 10) return 'Le mot de passe doit contenir au moins 10 caractères';
    if (!/[A-Za-z]/.test(f.password) || !/\d/.test(f.password)) return 'Le mot de passe doit contenir une lettre et un chiffre';
    if (f.password.toLowerCase().includes(u)) return "Le mot de passe ne doit pas contenir le nom d'utilisateur";
    if (f.password !== f.confirm) return 'Les mots de passe ne correspondent pas';
    return '';
  };

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const problem = validate();
    if (problem) { setError(problem); return; }
    setBusy(true);
    setError('');
    try {
      const data = await signup(f.username.trim().toLowerCase(), f.email.trim(), f.password);
      onDone(data);               // { username, step: 'enroll', token }
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Créer un compte"
      subtitle="Après l'inscription, vous enregistrerez votre visage pour sécuriser l'accès."
      footer={<>Déjà inscrit ? <button type="button" className="fq-link" onClick={onGotoLogin}>Se connecter</button></>}
    >
      {error ? <div className="fq-msg err" role="alert">{error}</div> : null}

      <form onSubmit={submit} autoComplete="on">
        <div className="fq-field">
          <label htmlFor="su-user">Nom d'utilisateur</label>
          <input id="su-user" className="fq-input" value={f.username} onChange={set('username')}
                 autoFocus required autoComplete="username" autoCapitalize="none" spellCheck={false} />
        </div>

        <div className="fq-field">
          <label htmlFor="su-mail">Email</label>
          <input id="su-mail" className="fq-input" type="email" value={f.email} onChange={set('email')}
                 required autoComplete="email" />
        </div>

        <div className="fq-field">
          <label htmlFor="su-pass">Mot de passe</label>
          <div className="fq-input-wrap">
            <input id="su-pass" className="fq-input has-toggle" type={show ? 'text' : 'password'}
                   value={f.password} onChange={set('password')} required autoComplete="new-password" />
            <button type="button" className="fq-toggle" onClick={() => setShow(s => !s)}>
              {show ? 'Masquer' : 'Afficher'}
            </button>
          </div>
          <div className="fq-meter" aria-hidden="true">
            {[1, 2, 3].map(i => <span key={i} className={score >= i ? `on-${score}` : ''} />)}
          </div>
          <div className="fq-hint">
            {f.password ? `Force : ${LABELS[score] || 'Faible'} · ` : ''}10 caractères minimum, avec lettres et chiffres
          </div>
        </div>

        <div className="fq-field">
          <label htmlFor="su-conf">Confirmer le mot de passe</label>
          <input id="su-conf" className="fq-input" type={show ? 'text' : 'password'}
                 value={f.confirm} onChange={set('confirm')} required autoComplete="new-password" />
        </div>

        <button className="fq-btn" disabled={busy}>
          {busy ? 'Création…' : 'Créer mon compte'}
        </button>
      </form>
    </AuthLayout>
  );
}
