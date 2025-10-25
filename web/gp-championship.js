// gp-championship.js
import { fetchJSON, info, error } from './gp-core.js';

export async function loadChampionship(raceId, year) {
  try {
    const base = 'https://menditeguy.github.io/f1datadrive-data';
    const path = `/seasons/${year}/championship.json`;
    const json = await fetchJSON(base + path);

    const filtered = filterChampionshipRaces(json);
    renderChampionshipTable(filtered);
    info(`Championship loaded • ${year}`);
  } catch (e) {
    error(`Championship indisponible — ${e.message}`);
  }
}

// === Règles métier ===
function filterChampionshipRaces(json) {
  if (!json || !Array.isArray(json.races)) return json;
  const year = json.year;
  const rules = {
    1950: 6, 1951: 8, 1952: 8, 1953: 8, 1954: 8, 1955: 7,
    1956: 8, 1957: 8, 1958: 5, 1959: 5, 1960: 6
  };
  const limit = rules[year] || json.races.length;
  const filtered = json.races
    .filter(r => !r.name.toLowerCase().includes('indianapolis'))
    .slice(0, limit);
  return { ...json, races: filtered };
}

function renderChampionshipTable(json) {
  const box = document.getElementById('sessionTable');
  const races = json.races || [];
  const drivers = json.drivers || [];

  let html = `<table><thead><tr><th>Cla</th><th>Pilote</th>`;
  races.forEach((r, i) => { html += `<th>${i + 1}</th>`; });
  html += `<th>Points</th></tr></thead><tbody>`;

  drivers.forEach(d => {
    html += `<tr><td>${d.pos}</td><td>${d.name}</td>`;
    races.forEach(r => html += `<td>${d.results?.[r.round] ?? ''}</td>`);
    html += `<td>${d.points}</td></tr>`;
  });

  box.innerHTML = html + '</tbody></table>';
}
