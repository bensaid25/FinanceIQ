import axios from 'axios';
import { attachAuth, getSession, parseJwt } from '../auth';

const API = axios.create({ baseURL: process.env.REACT_APP_API_URL || 'http://127.0.0.1:8000' });
attachAuth(API);

// ── Transactions ─────────────────────────────────────────────
export const getTransactions    = (m, y) => API.get('/transactions/',        { params: { month: m, year: y } });
export const getAllTransactions  = ()     => API.get('/transactions/');
export const getSummary         = (m, y) => API.get('/transactions/summary', { params: { month: m, year: y } });
export const createTransaction  = (data) => API.post('/transactions/',        data);
export const addTransaction     = (data) => API.post('/transactions/quick',   data);
export const importCsv          = (data) => API.post('/transactions/import-csv', data);

// ── Budgets ──────────────────────────────────────────────────
export const getBudgets   = (m, y) => API.get('/budgets/', { params: { month: m, year: y } });
export const createBudget = (data) => API.post('/budgets/', data);

// ── ML ───────────────────────────────────────────────────────
export const getAnomalies    = ()     => API.get('/ml/anomalies');
export const detectAnomalies = ()     => API.post('/ml/detect-anomalies?z_threshold=2.0');
export const getForecast     = ()     => API.get('/ml/forecast');
export const categorize      = (desc) => API.post('/ml/categorize', { description: desc });
export const trainModel      = ()     => API.post('/ml/train');
export const getAlerts       = ()     => API.get('/ml/anomalies');