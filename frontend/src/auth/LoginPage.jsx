import React, { useState } from 'react';
import AuthLayout from './AuthLayout';
import { login, errorMessage } from './authApi';

export default function LoginPage({ notice, onStep, onGotoSignup }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const data = await login(username.trim(), password);
      setPassword('');
      onStep(data);               // { step: 'face' | 'enroll', token, username }
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      step={1}
      title="Connexion"
      subtitle="Saisissez vos identifiants. La vérification de votre visage suivra."
      footer={<>Pas encore de compte ? <button type="button" className="fq-link" onClick={onGotoSignup}>Créer un compte</button></>}
    >
      {notice ? <div className={`fq-msg ${notice.type || 'info'}`}>{notice.text}</div> : null}
      {error ? <div className="fq-msg err" role="alert">{error}</div> : null}

      <form onSubmit={submit} autoComplete="on">
        <div className="fq-field">
          <label htmlFor="fq-user">Nom d'utilisateur</label>
          <input id="fq-user" className="fq-input" value={username} autoFocus required
                 autoComplete="username" autoCapitalize="none" spellCheck={false}
                 onChange={e => setUsername(e.target.value)} />
        </div>

        <div className="fq-field">
          <label htmlFor="fq-pass">Mot de passe</label>
          <div className="fq-input-wrap">
            <input id="fq-pass" className="fq-input has-toggle" required
                   type={show ? 'text' : 'password'} value={password}
                   autoComplete="current-password"
                   onChange={e => setPassword(e.target.value)} />
            <button type="button" className="fq-toggle" onClick={() => setShow(s => !s)}>
              {show ? 'Masquer' : 'Afficher'}
            </button>
          </div>
        </div>

        <button className="fq-btn" disabled={busy || !username || !password}>
          {busy ? 'Vérification…' : 'Continuer'}
        </button>
      </form>
    </AuthLayout>
  );
}
