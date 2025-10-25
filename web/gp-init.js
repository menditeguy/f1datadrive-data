// gp-init.js
import { state, info } from './gp-core.js';
import { loadSession } from './gp-sessions.js';
import { loadPerftime } from './gp-perftime.js';
import { loadChampionship } from './gp-championship.js';

document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(location.search);
  state.raceId = Number(params.get('race') || 0);
  state.sessionCode = (params.get('session') || 'RACE').toUpperCase();
    const base = 'https://menditeguy.github.io/f1datadrive-data';
    const metaUrl = `${base}/races/${state.raceId}/meta.json`;
    try {
    state.meta = await fetch(metaUrl).then(r => r.json());
    } catch {
    state.meta = { year: detectYearFromRaceId(state.raceId) }; // fallback
    }

  info(`Using modular gp-init for race ${state.raceId}`);

  switch (state.sessionCode) {
    case 'PERFTIME': await loadPerftime(state.raceId); break;
    case 'CHAMPIONSHIP': await loadChampionship(state.raceId, state.meta.year); break;
    default: await loadSession(state.raceId, state.sessionCode);
  }
});

function detectYearFromRaceId(id) {
  if (id < 20) return 1950;
  if (id < 100) return 1958;
  return 2024;
}
