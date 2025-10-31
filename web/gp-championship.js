// gp-championship.js
import { fetchJSON, info, error } from './gp-core.js';

// === Règles de points par saison ===
const POINTS_RULES = {
  1958: { points: [8,6,4,3,2], fastestLap: 1, bestResults: 6 },
  1987: { points: [9,6,4,3,2,1], fastestLap: 0, bestResults: 11 },
};

function getRules(year) {
  return POINTS_RULES[year] || { points: [25,18,15,12,10,8,6,4,2,1], fastestLap: 1, bestResults: Infinity };
}

// === Fonction principale ===
export async function loadChampionship(raceId, year) {
  try {
    const base = 'https://menditeguy.github.io/f1datadrive-data';
    const seasonPath = `/seasons/${year}/season.json`;
    const championshipPath = `/seasons/${year}/championship.json`;

    const [season, fullChampionship] = await Promise.all([
      fetchJSON(base + seasonPath),
      fetchJSON(base + championshipPath)
    ]);

    // Trouver le rang de la course sélectionnée dans la saison (Indianapolis inclus)
    const roundIndex = season.races.findIndex(r => r.id === raceId);
    if (roundIndex === -1) throw new Error('Course introuvable dans la saison');

    const partialChampionship = buildChampionshipUntilRound(season, roundIndex, year);
    renderChampionshipTable(partialChampionship, year, roundIndex + 1);
    info(`Championship loaded • ${year} • after ${roundIndex + 1} races`);
  } catch (e) {
    error(`Championship indisponible — ${e.message}`);
  }
}

// === Calcul du classement cumulé jusqu’à la course N ===
function buildChampionshipUntilRound(season, roundIndex, year) {
  const { points, fastestLap, bestResults } = getRules(year);
  const table = new Map();

  for (let i = 0; i <= roundIndex; i++) {
    const race = season.races[i];
    if (!race || !race.results) continue;

    race.results.forEach(row => {
      const pos = Number(row.position);
      const pts = pos >= 1 && pos <= points.length ? points[pos - 1] : 0;
      const fl = (fastestLap && row.fastestLap) ? fastestLap : 0;
      if (!table.has(row.driverId)) {
        table.set(row.driverId, { name: row.driverName, scores: [] });
      }
      if (pts > 0 || fl > 0) table.get(row.driverId).scores.push(pts + fl);
    });
  }

  // appliquer la règle des meilleurs X résultats
  for (const rec of table.values()) {
    rec.scores.sort((a,b) => b - a);
    const kept = rec.scores.slice(0, bestResults);
    rec.total = kept.reduce((s,x) => s + x, 0);
  }

  const rows = [...table.entries()]
    .map(([id, rec]) => ({ id, name: rec.name, total: rec.total }))
    .sort((a,b) => b.total - a.total);

  return rows;
}

// === Rendu HTML ===
function renderChampionshipTable(rows, year, raceCount) {
  const box = document.getElementById('sessionTable');
  if (!box) return;

  let html = `<h3>Championnat ${year} – après ${raceCount} courses</h3>`;
  html += `<table><thead><tr><th>Pos</th><th>Pilote</th><th>Points</th></tr></thead><tbody>`;

  rows.forEach((r, i) => {
    html += `<tr><td>${i + 1}</td><td>${r.name}</td><td>${r.total}</td></tr>`;
  });

  html += '</tbody></table>';
  box.innerHTML = html;
}
