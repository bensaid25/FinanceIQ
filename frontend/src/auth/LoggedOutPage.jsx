import React from 'react';
import AuthLayout from './AuthLayout';

const TEXT = {
  logout:  { title: 'Vous êtes déconnecté', sub: 'Votre session est fermée et son accès a été révoqué. À bientôt !' },
  expired: { title: 'Session expirée', sub: 'Par sécurité, votre session a pris fin. Reconnectez-vous pour continuer.' },
  idle:    { title: 'Déconnexion automatique', sub: "Vous êtes resté inactif trop longtemps. Reconnectez-vous pour continuer." },
};

export default function LoggedOutPage({ reason = 'logout', onLogin }) {
  const t = TEXT[reason] || TEXT.logout;
  return (
    <AuthLayout title={t.title} subtitle={t.sub}>
      <div className="fq-big" aria-hidden="true">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
      </div>
      <button className="fq-btn" onClick={onLogin} autoFocus>Se reconnecter</button>
    </AuthLayout>
  );
}
