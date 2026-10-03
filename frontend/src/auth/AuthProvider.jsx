import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import AuthScreens from './AuthScreens';
import { getSession, onSessionChange, clearSession, logout as apiLogout } from './authApi';

const IDLE_MS = 15 * 60 * 1000;   // déconnexion après 15 min sans activité
const Ctx = createContext(null);

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth() doit être utilisé dans <AuthProvider>');
  return v;
}

export function AuthProvider({ children }) {
  const [session, setS] = useState(getSession());
  const [reason, setReason] = useState(null);       // 'logout' | 'expired' | 'idle' | null
  const lastActivity = useRef(Date.now());

  // Toute modification de session (connexion, déconnexion, 401 reçu) arrive ici
  useEffect(() => onSessionChange((s, why) => {
    setS(s);
    if (s) { setReason(null); lastActivity.current = Date.now(); }
    else if (why) setReason(why);
  }), []);

  // Fin de validité du jeton d'accès
  useEffect(() => {
    if (!session) return undefined;
    const id = setTimeout(() => clearSession('expired'), Math.max(0, session.expiresAt - Date.now()));
    return () => clearTimeout(id);
  }, [session]);

  // Inactivité
  useEffect(() => {
    if (!session) return undefined;
    const touch = () => { lastActivity.current = Date.now(); };
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach(e => window.addEventListener(e, touch, { passive: true }));
    const id = setInterval(() => {
      if (Date.now() - lastActivity.current > IDLE_MS) {
        apiLogout().then(() => setReason('idle'));   // révoque le jeton côté serveur aussi
      }
    }, 20000);
    return () => {
      events.forEach(e => window.removeEventListener(e, touch));
      clearInterval(id);
    };
  }, [session]);

  const logout = useCallback(() => apiLogout(), []);

  return (
    <Ctx.Provider value={{ username: session?.username || null, authenticated: !!session, logout }}>
      {children({ session, reason })}
    </Ctx.Provider>
  );
}

/* Utilisation :
   <AuthProvider>{({ session, reason }) => session ? <App /> : <AuthScreens initialReason={reason} />}</AuthProvider>
   ou plus simplement <AuthGate><App /></AuthGate> */
export function AuthGate({ children }) {
  return (
    <AuthProvider>
      {({ session, reason }) => (session ? children : <AuthScreens key={reason || 'start'} initialReason={reason} />)}
    </AuthProvider>
  );
}
