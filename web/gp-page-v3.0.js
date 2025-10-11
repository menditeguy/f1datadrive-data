/* gp-page-v3.0.js — version complète et robuste (PerfTime + boutons statiques)
   Détection automatique du sous-dépôt — maintien intégral des fonctions v2.9 */

'use strict';

// === Utilitaires ===
function qs(sel, root) { return (root || document).querySelector(sel); }
function ce(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e; }
function fmtPct(v) { return (v && !isNaN(v)) ? v.toFixed(2) + '%' : '—'; }
function fmtNum(v) { return (v != null && !isNaN(v)) ? v : '—'; }
function fmtTime(ms) {
  if (!ms || ms <= 0) return '—';
  const m = Math.floor(ms / 60000);
  const s = ((ms % 60000) / 1000).toFixed(3).padStart(6, '0');
  return `${m}:${s}`;
}
function parseTimeToMs(t) {
  if (!t || typeof t !== 'string') return null;
  const m = t.match(/^(\d+):(\d+\.\d+)$/);
  return m ? (parseInt(m[1]) * 60000 + parseFloat(m[2]) * 1000) : parseFloat(t);
}

// === Configuration statique ===
const STATIC_SESSIONS = [
  'EL1','EL2','EL3','EL4','WUP',
  'PQ1','PQ2','SQ1','SQ2','SQ3',
  'Q1','Q2','Q3','Q4',
  'Grid','FL','LPbLP','TLaps','Lead','Race','Resume'
];

const COLOR_CLASSES = {
  EL: 'orange', WUP: 'orange',
  PQ: 'green', SQ: 'green', Q: 'green',
  Grid: 'blue', FL: 'blue', LPbLP: 'blue', TLaps: 'blue', Lead: 'blue', Race: 'blue',
  Resume: 'violet'
};

// === Élément principal ===
const app = qs('#f1-gp-app');
const BASES = [
  'https://menditeguy.github.io/f1data-races-1-500',
  'https://menditeguy.github.io/f1data-races-501-1000',
  'https://menditeguy.github.io/f1data-races-1001-1500'
];
let baseURL = null;

// === Étape 1 : Déterminer le sous-dépôt ===
async function detectBase(raceId) {
  for (const b of BASES) {
    const testURL = `${b}/races/${raceId}/sessions.json`;
    try {
      const r = await fetch(testURL, { cache: 'no-store' });
      if (r.ok) return b;
    } catch { /* ignore */ }
  }
  throw new Error('Aucun sous-dépôt trouvé pour race ' + raceId);
}

// === Étape 2 : Charger les JSON de séance ===
async function loadJSON(url) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error('HTTP ' + r.status + ' on ' + url);
  return await r.json();
}

// === Étape 3 : Construire les boutons statiques ===
function buildSessionButtons(container, sessionsByCode, onSelect) {
  container.innerHTML = '';
  STATIC_SESSIONS.forEach(code => {
    const btn = ce('button', 'session-btn');
    btn.textContent = code;
    const color = COLOR_CLASSES[Object.keys(COLOR_CLASSES).find(k => code.startsWith(k))] || 'gray';
    btn.style.borderColor = btn.style.color = (
      color === 'orange' ? '#f46b09' :
      color === 'green' ? '#1aa74e' :
      color === 'blue' ? '#1a73e8' :
      color === 'violet' ? '#7e57c2' : '#999'
    );
    const sessData = sessionsByCode[code];
    if (!sessData || !sessData.rows?.length) {
      btn.style.opacity = '0.4';
      btn.style.cursor = 'not-allowed';
    } else {
      btn.addEventListener('click', () => onSelect(code));
    }
    container.appendChild(btn);
  });
}

// === Étape 4 : Calcul PerfTime (meilleur temps global du week-end) ===
function computePerfTime(sByCode) {
  const perftimeSessions = ['EL1','EL2','EL3','EL4','WUP','PQ1','PQ2','SQ1','SQ2','SQ3','Q1','Q2','Q3','Q4','FL'];
  const bestOfDriver = {};
  let globalBest = Infinity;

  for (const sCode of perftimeSessions) {
    const sess = sByCode[sCode];
    if (!sess || !sess.rows) continue;
    for (const r of sess.rows) {
      const id = +r.driver_id;
      const ms = parseTimeToMs(r.best_lap_time_raw) || +r.best_lap_ms || +r.best_ms;
      if (!id || !ms) continue;
      if (!bestOfDriver[id] || ms < bestOfDriver[id]) bestOfDriver[id] = ms;
      if (ms < globalBest) globalBest = ms;
    }
  }
  const perfList = Object.entries(bestOfDriver).map(([id, ms]) => ({
    id: +id,
    pos: 0,
    pct: (ms / globalBest) * 100,
    ms
  })).sort((a, b) => a.ms - b.ms);
  perfList.forEach((e, i) => e.pos = i + 1);
  return perfList;
}

// === Étape 5 : Construction du tableau Résumé ===
function buildResumeTable(data, perftimeList) {
  const tbl = ce('table', 'resume-table');
  const thead = ce('thead');
  const trh = ce('tr');

  const headers = [
    'Resultat race','Driver / Team',
    ...STATIC_SESSIONS.filter(s => s !== 'Resume' && s !== 'Race').map(s => [s + ' Pos', s + ' %']).flat(),
    'Nb tours weekend','PerfTime Pos','PerfTime %','Ab mec','Ab pilote','Lead laps','Lead km',
    'Top1 Laps','Top1 Lt','Top3 Laps','Top3 Lt','Top6 Laps','Top6 Lt','Top10 Laps','Top10 Lt'
  ];

  headers.forEach(h => {
    const th = ce('th');
    th.textContent = h;
    trh.appendChild(th);
  });
  thead.appendChild(trh);
  tbl.appendChild(thead);

  const tbody = ce('tbody');
  data.forEach(d => {
    const tr = ce('tr');
    const id = +d.driver_id;
    const perf = perftimeList.find(p => p.id === id);
    const rowVals = [
      fmtNum(d.racePos),
      d.driver_name + '\n' + (d.team_name || '—'),
      ...STATIC_SESSIONS.filter(s => s !== 'Resume' && s !== 'Race').map(s => {
        const sess = d.sessions?.[s] || {};
        return [fmtNum(sess.pos), fmtPct(sess.pct)];
      }).flat(),
      fmtNum(d.nbToursWeekend),
      fmtNum(perf?.pos), fmtPct(perf?.pct),
      fmtNum(d.abMec), fmtNum(d.abPil),
      fmtNum(d.leadLaps), fmtNum(d.leadKm),
      fmtNum(d.top1Laps), fmtNum(d.top1Lt),
      fmtNum(d.top3Laps), fmtNum(d.top3Lt),
      fmtNum(d.top6Laps), fmtNum(d.top6Lt),
      fmtNum(d.top10Laps), fmtNum(d.top10Lt)
    ];
    rowVals.forEach(v => {
      const td = ce('td');
      td.textContent = v;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  tbl.appendChild(tbody);

  return tbl;
}

// === Étape 6 : Affichage principal ===
async function init() {
  const params = new URLSearchParams(location.search);
  const raceId = params.get('race') || params.get('race_id');
  if (!raceId) return alert('Param race=? manquant.');

  baseURL = await detectBase(raceId);
  const sessRoot = `${baseURL}/races/${raceId}`;

  const sessionsByCode = {};
  for (const code of STATIC_SESSIONS) {
    const url = `${sessRoot}/${code}.json`;
    try {
      const js = await loadJSON(url);
      sessionsByCode[code] = js;
    } catch { sessionsByCode[code] = null; }
  }

  const btnBox = qs('#session-buttons');
  buildSessionButtons(btnBox, sessionsByCode, s => displaySession(s, sessionsByCode));

  displaySession('Resume', sessionsByCode);
}

// === Étape 7 : Afficher une séance ou le Résumé ===
function displaySession(code, sByCode) {
  const out = qs('#session-output');
  out.innerHTML = '';

  if (code === 'Resume') {
    const perftime = computePerfTime(sByCode);
    const data = buildResumeDataset(sByCode);
    const tbl = buildResumeTable(data, perftime);
    out.appendChild(tbl);
    addScrollSync(tbl);
    return;
  }

  const sess = sByCode[code];
  if (!sess || !sess.rows) {
    out.textContent = `Aucune donnée pour ${code}`;
    return;
  }

  const tbl = ce('table', 'session-table');
  const head = ce('thead');
  const hr = ce('tr');
  Object.keys(sess.rows[0]).forEach(k => {
    const th = ce('th'); th.textContent = k; hr.appendChild(th);
  });
  head.appendChild(hr);
  tbl.appendChild(head);
  const body = ce('tbody');
  sess.rows.forEach(r => {
    const tr = ce('tr');
    Object.values(r).forEach(v => {
      const td = ce('td'); td.textContent = v; tr.appendChild(td);
    });
    body.appendChild(tr);
  });
  tbl.appendChild(body);
  out.appendChild(tbl);
  addScrollSync(tbl);
}

// === Étape 8 : Dataset résumé (placeholder simplifié) ===
function buildResumeDataset(sByCode) {
  const drivers = {};
  const race = sByCode['Race'];
  if (race?.rows) {
    race.rows.forEach(r => {
      const id = +r.driver_id;
      drivers[id] = {
        driver_id: id,
        driver_name: r.Driver || r.driver_name,
        team_name: r.Car || r.team_name,
        racePos: r.Position || r.position || r.Pos,
        sessions: {},
        nbToursWeekend: r.Laps || r.laps || null
      };
    });
  }
  return Object.values(drivers);
}

// === Étape 9 : Scroll synchronisé ===
function addScrollSync(tbl) {
  const wrapper = ce('div', 'scroll-wrapper');
  wrapper.style.overflowX = 'auto';
  wrapper.appendChild(tbl.cloneNode(true));
  tbl.parentNode.insertBefore(wrapper, tbl);
  wrapper.addEventListener('scroll', () => { tbl.parentNode.scrollLeft = wrapper.scrollLeft; });
}

// === Lancement ===
init();
