import React from 'react';
import './auth.css';

const Check = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const Logo = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 3v18h18" /><path d="m7 15 4-4 3 3 5-6" />
  </svg>
);

function Steps({ step }) {
  const cls = n => (step === n ? 'fq-step on' : step > n ? 'fq-step done' : 'fq-step');
  return (
    <div className="fq-steps" aria-label="Étapes de connexion">
      <div className={cls(1)}><i>{step > 1 ? '✓' : '1'}</i>Identifiants</div>
      <hr />
      <div className={cls(2)}><i>2</i>Visage</div>
    </div>
  );
}

export default function AuthLayout({ title, subtitle, step, children, footer }) {
  return (
    <div className="fq-auth">
      <aside className="fq-aside">
        <div className="fq-brand"><span className="fq-logo"><Logo /></span>FinanceIQ</div>
        <div className="fq-pitch">
          <h2>Vos finances, protégées à chaque connexion.</h2>
          <p>Un accès en deux étapes : vos identifiants, puis la reconnaissance de votre visage.</p>
          <ul className="fq-points">
            <li><Check />Mots de passe chiffrés, jamais stockés en clair</li>
            <li><Check />Vérification faciale obligatoire après le mot de passe</li>
            <li><Check />Verrouillage automatique après des tentatives répétées</li>
            <li><Check />Déconnexion automatique après inactivité</li>
          </ul>
        </div>
        <div className="fq-copy">© FinanceIQ · Smart Finance Dashboard</div>
      </aside>

      <main className="fq-main">
        <div className="fq-card">
          {step ? <Steps step={step} /> : null}
          <h1>{title}</h1>
          {subtitle ? <p className="fq-sub">{subtitle}</p> : null}
          {children}
          {footer ? <div className="fq-foot">{footer}</div> : null}
        </div>
      </main>
    </div>
  );
}
