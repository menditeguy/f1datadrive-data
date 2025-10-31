// === gp-init.js ===
import { state, info, error } from './gp-core.js';
import { loadSession } from './gp-sessions.js';
import { loadPerftime } from './gp-perftime.js';
import { loadChampionship } from './gp-championship.js';

// Sélection du bon sous-dépôt via CDN jsDelivr (CORS-friendly)
function baseCdnForRace(raceId) {
  const id = Number(raceId);
  if (id >= 1 && id <= 500)
    return "https://cdn.jsdelivr.net/gh/menditeguy/f1data-races-1-500@main/";
  if (id >= 501 && id <= 1000)
    return "https://cdn.jsdelivr.net/gh/menditeguy/f1data-races-501-1000@main/";
  if (id >= 1001 && id <= 1500)
    return "https://cdn.jsdelivr.net/gh/menditeguy/f1data-races-1001-1500@main/";
  return "https://cdn.jsdelivr.net/gh/menditeguy/f1data-races-1-500@main/";
}

document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(location.search);
  state.raceId = Number(params.get('race') || 0);
  state.sessionCode = (params.get('session') || 'RACE').toUpperCase();

  // ✅ on force ici le domaine jsDelivr, pas github.io
  const base = baseCdnForRace(state.raceId);
  const metaUrl = `${base}races/${state.raceId}/meta.json`;
  const sessionsUrl = `${base}races/${state.raceId}/sessions.json`;

  try {
    let res = await fetch(metaUrl);
    if (!res.ok) {
      res = await fetch(sessionsUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    }
    state.meta = await res.json();
  } catch (err) {
    state.meta = {};
    error(`[ERREUR] RACE indisponible — ${err.message}`);
    return;
  }

  info(`Initialisation du GP ${state.raceId}, session ${state.sessionCode}`);

  switch (state.sessionCode) {
    case 'PERFTIME':
      await loadPerftime(state.raceId);
      break;
    case 'CHAMPIONSHIP':
      await loadChampionship(state.raceId, state.meta?.year);
      break;
    default:
      await loadSession(state.raceId, state.sessionCode);
  }
});
