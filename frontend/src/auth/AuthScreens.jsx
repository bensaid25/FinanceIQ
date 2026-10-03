import React, { useState } from 'react';
import LoginPage from './LoginPage';
import SignupPage from './SignupPage';
import FaceCapture from './FaceCapture';
import LoggedOutPage from './LoggedOutPage';
import { setSession } from './authApi';

/* Machine à états des écrans non authentifiés :
   loggedout -> login -> (face | enroll) -> session ouverte
   signup -> enroll -> login -> face -> session ouverte                         */
export default function AuthScreens({ initialReason }) {
  const [view, setView] = useState(initialReason ? 'loggedout' : 'login');
  const [pending, setPending] = useState(null);     // { token, username }
  const [notice, setNotice] = useState(null);

  const toLogin = (n = null) => { setPending(null); setNotice(n); setView('login'); };

  if (view === 'loggedout') {
    return <LoggedOutPage reason={initialReason} onLogin={() => toLogin()} />;
  }

  if (view === 'signup') {
    return (
      <SignupPage
        onGotoLogin={() => toLogin()}
        onDone={({ token, username }) => { setPending({ token, username }); setView('enroll'); }}
      />
    );
  }

  if (view === 'enroll' && pending) {
    return (
      <FaceCapture
        mode="enroll"
        token={pending.token}
        username={pending.username}
        onBack={() => toLogin({ type: 'info', text: "Connectez-vous pour enregistrer votre visage : l'accès l'exige." })}
        onExpired={text => toLogin({ type: 'err', text })}
        onDone={() => toLogin({ type: 'ok', text: 'Visage enregistré. Connectez-vous pour continuer.' })}
      />
    );
  }

  if (view === 'face' && pending) {
    return (
      <FaceCapture
        mode="verify"
        token={pending.token}
        username={pending.username}
        onBack={() => toLogin()}
        onExpired={text => toLogin({ type: 'err', text })}
        onDone={res => setSession({
          token: res.access_token,
          username: res.username,
          expiresAt: Date.now() + res.expires_in * 1000,
        })}
      />
    );
  }

  return (
    <LoginPage
      notice={notice}
      onGotoSignup={() => setView('signup')}
      onStep={({ step, token, username }) => {
        setNotice(null);
        setPending({ token, username });
        setView(step === 'enroll' ? 'enroll' : 'face');
      }}
    />
  );
}
