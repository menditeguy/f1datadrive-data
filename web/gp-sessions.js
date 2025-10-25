// gp-sessions.js
import { fetchJSON, info, error, state } from './gp-core.js';

export async function loadSession(raceId, sessionCode) {
  try {
    const base = 'https://menditeguy.github.io/f1datadrive-data';
    const path = `/races/${raceId}/${sessionCode.toLowerCase()}.json`;
    const json = await fetchJSON(base + path);

    renderSessionTable(json, sessionCode);
    info(`${sessionCode} loaded`);
  } catch (e) {
    error(`${sessionCode} indisponible — ${e.message}`);
  }
}

function renderSessionTable(json, code) {
  const box = document.getElementById('sessionTable');
  if (!json || !Array.isArray(json.rows)) {
    box.innerHTML = `<i>Aucune donnée pour ${code}</i>`;
    return;
  }

  const headers = Object.keys(json.rows[0]);
  let html = `<table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>`;
  json.rows.forEach(r => {
    html += `<tr>${headers.map(h=>`<td>${r[h] ?? ''}</td>`).join('')}</tr>`;
  });
  box.innerHTML = html + '</tbody></table>';
}
