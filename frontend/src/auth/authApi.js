import axios from 'axios';

export const API = process.env.REACT_APP_API_URL || 'http://127.0.0.1:8000';
const KEY = 'fq_session';

let session = null;
const listeners = new Set();

try {
  const raw = JSON.parse(sessionStorage.getItem(KEY));
  if (raw && raw.expiresAt > Date.now()) session = raw;
} catch { /* sessionStorage indisponible */ }

function persist() {
  try {
    if (session) sessionStorage.setItem(KEY, JSON.stringify(session));
    else sessionStorage.removeItem(KEY);
  } catch { /* ignoré */ }
}

// ── Parse JWT payload ─────────────────────────────────────────
export function parseJwt(token) {
  try { return JSON.parse(atob(token.split('.')[1])); }
  catch { return {}; }
}

export const getSession = () => session;

export function onSessionChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setSession(s) {
  session = s;
  persist();
  listeners.forEach(fn => fn(session, null));
}

// ── Appelé après face/verify pour ouvrir la session ──────────
export function openSession({ access_token, username, expires_in }) {
  const claims = parseJwt(access_token);
  setSession({
    token:     access_token,
    username:  username,
    userId:    parseInt(claims.sub, 10),
    expiresAt: Date.now() + (expires_in || 1800) * 1000,
  });
}

export function clearSession(reason = 'logout') {
  session = null;
  persist();
  listeners.forEach(fn => fn(null, reason));
}

const attached = new WeakSet();

export function attachAuth(instance) {
  if (attached.has(instance)) return instance;
  attached.add(instance);

  instance.interceptors.request.use(config => {
    if (session && !config.headers?.Authorization) {
      config.headers = {
        ...(config.headers || {}),
        Authorization: `Bearer ${session.token}`
      };
    }
    return config;
  });

  instance.interceptors.response.use(
    res => res,
    err => {
      const url = String(err.config?.url || '');
      if (err.response?.status === 401 && session && !url.includes('/auth/')) {
        clearSession('expired');
      }
      return Promise.reject(err);
    }
  );
  return instance;
}

attachAuth(axios);

// ── Appels auth ───────────────────────────────────────────────
const post = (path, data, token) =>
  axios.post(`${API}${path}`, data, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    timeout: 60000,
  });

export function errorMessage(e) {
  const d = e?.response?.data?.detail;
  if (typeof d === 'string') return d;
  if (Array.isArray(d)) return d.map(x => x.msg).join(' · ');
  if (e?.response) return `Erreur serveur (${e.response.status})`;
  return "Impossible de joindre le serveur. Vérifiez que l'API est démarrée.";
}

export const signup      = (u, e, p)   => post('/auth/signup',      { username:u, email:e, password:p }).then(r => r.data);
export const login       = (u, p)      => post('/auth/login',       { username:u, password:p }).then(r => r.data);
export const enrollFace  = (token, imgs)=> post('/auth/face/enroll', { images:imgs }, token).then(r => r.data);
export const verifyFace  = (token, img) => post('/auth/face/verify', { image:img },  token).then(r => r.data);

export async function logout() {
  const s = session;
  if (s) {
    try { await post('/auth/logout', null, s.token); } catch {}
  }
  clearSession('logout');
}