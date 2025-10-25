// gp-core.js
export const state = { raceId: null, meta: null, sessionCode: null };

export function info(msg) {
  const el = document.getElementById('status');
  if (el) el.textContent = `[INFO] ${msg}`;
  console.log('[INFO]', msg);
}

export function error(msg) {
  const el = document.getElementById('status');
  if (el) el.textContent = `[ERREUR] ${msg}`;
  console.error('[ERREUR]', msg);
}

export async function fetchJSON(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return await res.json();
}

// Helpers génériques
export function formatMs(ms) {
  if (ms == null) return '';
  const m = Math.floor(ms / 60000);
  const s = ((ms % 60000) / 1000).toFixed(3);
  return `${m}:${s.padStart(6, '0')}`;
}
