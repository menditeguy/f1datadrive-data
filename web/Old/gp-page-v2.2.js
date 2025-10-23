/* gp-page-v2.1.js - F1DataDrive
 * Gère l’affichage dynamique des sessions et résultats
 * Compatible multi-dépôts (1–500 / 501–1000 / 1001–1500)
 */

console.log("[INFO] gp-page-v2.1.js loaded");

const state = {
  raceId: null,
  sessions: [],
  selectedSession: null,
  rows: [],
  columns: [],
};

async function init() {
  const app = document.getElementById("app");
  const urlParams = new URLSearchParams(window.location.search);
  const raceIdParam = urlParams.get("race");
  state.raceId = raceIdParam ? parseInt(raceIdParam) : null;

  if (!state.raceId) {
    console.warn("[WARN] No race ID in URL");
    return;
  }

  // === Déterminer automatiquement le dépôt à utiliser selon raceId ===
  let baseRepo = "menditeguy/f1data-races-1-500";
  if (state.raceId > 500 && state.raceId <= 1000)
    baseRepo = "menditeguy/f1data-races-501-1000";
  else if (state.raceId > 1000)
    baseRepo = "menditeguy/f1data-races-1001-1500";

  // Déterminer automatiquement le dépôt selon raceId (version dynamique)
let repoName;
if (state.raceId <= 500) repoName = "f1data-races-1-500";
else if (state.raceId <= 1000) repoName = "f1data-races-501-1000";
else repoName = "f1data-races-1001-1500";

const base = `https://cdn.jsdelivr.net/gh/menditeguy/${repoName}@main`;
console.info(`[INFO] Loading from ${repoName} (latest @main) for race ${state.raceId}`);

  try {
    const url = `${base}/races/${state.raceId}/sessions.json`;
    console.log(`[INFO] Loading data from ${url}`);

    const response = await fetch(url);
    if (!response.ok) throw new Error(`[HTTP ${response.status}] ${url}`);

    const data = await response.json();
    state.sessions = data.sessions || [];

    if (!state.sessions.length) {
      showInfo("No session available for this GP.");
      return;
    }

    renderSessionSelector();
  } catch (err) {
    console.error("[ERROR] Failed to load data:", err);
    showInfo("Unable to load sessions for this Grand Prix.");
  }
}

function renderSessionSelector() {
  const container = document.getElementById("sessionSelector");
  if (!container) return;
  container.innerHTML = "";

  state.sessions.forEach((s, idx) => {
    const btn = document.createElement("button");
    btn.textContent = s.session_name || s.code || `Session ${idx + 1}`;
    btn.className = "session-btn";
    btn.onclick = () => selectSession(s);
    container.appendChild(btn);
  });
}

function selectSession(session) {
  state.selectedSession = session;
  renderSessionTable();
}

function renderSessionTable() {
  const tableBox = document.getElementById("tableBox");
  if (!tableBox || !state.selectedSession) return;

  const rows = state.selectedSession.rows || [];
  if (!rows.length) {
    tableBox.innerHTML = "<p>No data available for this session.</p>";
    return;
  }

  const columns = Object.keys(rows[0]);
  let html = "<table class='results-table'><thead><tr>";
  columns.forEach((c) => (html += `<th>${c}</th>`));
  html += "</tr></thead><tbody>";

  rows.forEach((r) => {
    html += "<tr>";
    columns.forEach((c) => (html += `<td>${r[c] ?? ""}</td>`));
    html += "</tr>";
  });

  html += "</tbody></table>";
  tableBox.innerHTML = html;
}

function showInfo(msg) {
  const box = document.getElementById("infoBox");
  if (box) box.textContent = msg;
  else console.info(msg);
}

// Exécution au chargement
document.addEventListener("DOMContentLoaded", init);
