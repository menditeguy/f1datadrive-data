// === gp-init.js ===
import { state, info, error } from './gp-core.js';
import { loadSession } from './gp-sessions.js';
import { loadPerftime } from './gp-perftime.js';
import { loadChampionship } from './gp-championship.js';

document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(location.search);
  state.raceId = Number(params.get('race') || 0);
  state.sessionCode = (params.get('session') || 'RACE').toUpperCase();

  // Choix automatique du bon sous-dépôt selon raceId
  let base = "https://menditeguy.github.io/f1data-races-1-500";
  if (state.raceId > 500 && state.raceId <= 1000)
    base = "https://menditeguy.github.io/f1data-races-501-1000";
  else if (state.raceId > 1000)
    base = "https://menditeguy.github.io/f1data-races-1001-1500";

  // ✅ metaUrl défini DANS le scope du listener
  const metaUrl = `${base}/races/${state.raceId}/meta.json`;

  try {
    const response = await fetch(metaUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.meta = await response.json();
  } catch (err) {
    state.meta = {};
    error(`[ERREUR] RACE indisponible — ${err.message}`);
    return;
  }

  info(`Initialisation du GP ${state.raceId}, session ${state.sessionCode}`);

  switch (state.sessionCode) {
    case 'PERFTIME': await loadPerftime(state.raceId); break;
    case 'CHAMPIONSHIP': await loadChampionship(state.raceId, state.meta.year); break;
    default: await loadSession(state.raceId, state.sessionCode);
  }
});
