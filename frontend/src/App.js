import React, { useState } from 'react';
import { AuthGate, useAuth } from './auth';
import Dashboard   from './pages/Dashboard';
import Transactions from './pages/Transactions';
import Budgets     from './pages/Budgets';
import Anomalies   from './pages/Anomalies';
import Forecast    from './pages/Forecast';
import AITools     from './pages/AITools';
import Sidebar     from './components/Sidebar';

// Tout ce qui est ici n'est affiché qu'après mot de passe + visage.
function Shell() {
  const { username, logout } = useAuth();
  const [page, setPage] = useState('dashboard');

  const pages = {
    dashboard:    <Dashboard />,
    transactions: <Transactions />,
    budgets:      <Budgets />,
    anomalies:    <Anomalies />,
    forecast:     <Forecast />,
    aitools:      <AITools />,
  };

  return (
    <div style={{ display:'flex', minHeight:'100vh', background:'var(--bg-primary)' }}>
      <Sidebar
        page={page}
        setPage={setPage}
        username={username}
        onLogout={logout}
      />
      <main style={{ flex:1, marginLeft:'220px', overflowY:'auto' }}>
        {pages[page] || <Dashboard />}
      </main>
    </div>
  );
}

export default function App() {
  // AuthGate affiche connexion / inscription / visage / déconnexion,
  // puis <Shell /> uniquement quand la session est ouverte.
  return (
    <AuthGate>
      <Shell />
    </AuthGate>
  );
}