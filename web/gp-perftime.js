// gp-perftime.js
import { fetchJSON, info, error } from './gp-core.js';

export async function loadPerftime(raceId) {
  try {
    const base = 'https://menditeguy.github.io/f1datadrive-data';
    const path = `/races/${raceId}/perftime.json`;
    const json = await fetchJSON(base + path);
    renderPerftimeTable(json);
    info(`Perftime loaded`);
  } catch (e) {
    error(`Perftime indisponible — ${e.message}`);
  }
}

function renderPerftimeTable(json) {
  const box = document.getElementById('sessionTable');
  if (!json || !Array.isArray(json.drivers)) {
    box.innerHTML = `<i>Données non disponibles</i>`;
    return;
  }

  const rows = json.drivers.map(d =>
    `<tr><td>${d.driver_id}</td><td>${d.best_time_raw}</td><td>${d.team}</td></tr>`
  );
  box.innerHTML = `<table><tr><th>Pilote</th><th>Temps</th><th>Équipe</th></tr>${rows.join('')}</table>`;
}
