// gp-page-v2.js — Tableau v2 (tri + pagination) pour la page GP
(function () {
  "use strict";

  // --- Utilitaires ---
  const qs  = (sel, root=document) => root.querySelector(sel);
  const qsa = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  const fmtMs = (v) => {
    if (v == null || isNaN(Number(v))) return v;
    const ms = Number(v);
    const s = Math.floor(ms / 1000);
    const mm = Math.floor(s / 60);
    const ss = s % 60;
    const mmm = ms % 1000;
    return `${mm}:${String(ss).padStart(2,"0")}.${String(mmm).padStart(3,"0")}`;
  };

  const isLikelyMsCol = (c) =>
    /(^|_)(ms|milliseconds|lap_ms|best_lap_ms|fastest_lap_ms|best_time_ms)$/i.test(c);

  const isNumeric = (val) => val !== null && val !== "" && !isNaN(val);

  function getURLParam(name, def=null) {
    const url = new URL(window.location.href);
    return url.searchParams.get(name) ?? def;
  }

  // --- État du tableau ---
  const state = {
    raceId: null,
    sessionCode: null,
    sessions: [],
    rows: [],
    columns: [],
    sort: { key: null, dir: 1 }, // 1 asc, -1 desc
    page: 1,
    pageSize: 25
  };

  // --- DOM cible (créé par le bloc HTML) ---
  const app      = qs("#f1-gp-app");
  const titleEl  = qs("#gpTitle", app);
  const statusEl = qs("#status", app);
  const selEl    = qs("#sessionSelect", app);
  const tableBox = qs("#sessionTable", app);

  // --- Templates de pagination ---
  function renderPager() {
    const total = state.rows.length;
    const totalPages = Math.max(1, Math.ceil(total / state.pageSize));
    state.page = Math.min(state.page, totalPages);

    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.alignItems = "center";
    wrap.style.gap = "8px";
    wrap.style.margin = "10px 0";

    const info = document.createElement("span");
    info.style.fontSize = "12px";
    info.textContent = `Total : ${total} lignes • Page ${state.page}/${totalPages}`;
    wrap.appendChild(info);

    const mkBtn = (txt, on, disabled=false) => {
      const b = document.createElement("button");
      b.textContent = txt;
      b.disabled = disabled;
      b.style.padding = "6px 10px";
      b.style.border = "1px solid #ddd";
      b.style.borderRadius = "8px";
      b.style.background = disabled ? "#f5f5f5" : "#fff";
      b.style.cursor = disabled ? "not-allowed" : "pointer";
      b.onclick = on;
      return b;
    };

    wrap.appendChild(mkBtn("⏮", () => { state.page = 1; drawTable(); }, state.page===1));
    wrap.appendChild(mkBtn("◀", () => { state.page = Math.max(1, state.page-1); drawTable(); }, state.page===1));
    wrap.appendChild(mkBtn("▶", () => {
      state.page = Math.min(totalPages, state.page+1); drawTable();
    }, state.page===totalPages));
    wrap.appendChild(mkBtn("⏭", () => { state.page = totalPages; drawTable(); }, state.page===totalPages));

    const sizeSel = document.createElement("select");
    [10,25,50,100].forEach(n => {
      const o = document.createElement("option");
      o.value = n; o.textContent = `${n}/page`;
      if (n === state.pageSize) o.selected = true;
      sizeSel.appendChild(o);
    });
    sizeSel.onchange = () => { state.pageSize = Number(sizeSel.value); state.page = 1; drawTable(); };
    sizeSel.style.marginLeft = "auto";
    sizeSel.style.padding = "6px";
    sizeSel.style.borderRadius = "8px";
    wrap.appendChild(sizeSel);

    return wrap;
  }

  // --- Tri des données ---
  function sortRows() {
    const { key, dir } = state.sort;
    if (!key) return;

    const col = key;
    const numericHint = state.rows.some(r => isNumeric(r[col]));

    state.rows.sort((a,b) => {
      const va = a[col], vb = b[col];
      if (numericHint) {
        const na = Number(va), nb = Number(vb);
        if (isNaN(na) && isNaN(nb)) return 0;
        if (isNaN(na)) return 1;
        if (isNaN(nb)) return -1;
        return (na - nb) * dir;
      } else {
        const sa = (va ?? "").toString().toLowerCase();
        const sb = (vb ?? "").toString().toLowerCase();
        return sa.localeCompare(sb) * dir;
      }
    });
  }

  // --- Rendu du tableau ---
  function drawTable() {
    tableBox.innerHTML = "";

    // pagination top
    tableBox.appendChild(renderPager());

    const tbl = document.createElement("table");
    tbl.style.width = "100%";
    tbl.style.borderCollapse = "collapse";
    tbl.style.fontSize = "14px";
    tbl.style.background = "#fff";
    tbl.style.boxShadow = "0 1px 2px rgba(0,0,0,0.06)";
    tbl.style.borderRadius = "12px";
    tbl.style.overflow = "hidden";

    // thead
    const thead = document.createElement("thead");
    const trh = document.createElement("tr");
    state.columns.forEach(col => {
      const th = document.createElement("th");
      th.textContent = col;
      th.style.textAlign = "left";
      th.style.padding = "10px";
      th.style.borderBottom = "1px solid #eee";
      th.style.cursor = "pointer";
      th.style.userSelect = "none";
      th.onclick = () => {
        if (state.sort.key === col) {
          state.sort.dir *= -1;
        } else {
          state.sort.key = col;
          state.sort.dir = 1;
        }
        sortRows();
        drawTable();
      };
      if (state.sort.key === col) {
        const arrow = state.sort.dir === 1 ? "▲" : "▼";
        th.textContent = `${col} ${arrow}`;
      }
      trh.appendChild(th);
    });
    thead.appendChild(trh);
    thead.style.position = "sticky";
    thead.style.top = "0";
    thead.style.background = "#fafafa";
    tbl.appendChild(thead);

    // données triées + page
    sortRows();
    const start = (state.page-1) * state.pageSize;
    const end   = start + state.pageSize;
    const slice = state.rows.slice(start, end);

    // tbody
    const tbody = document.createElement("tbody");
    slice.forEach(r => {
      const tr = document.createElement("tr");
      tr.onmouseenter = () => tr.style.background = "#fcfcfd";
      tr.onmouseleave = () => tr.style.background = "";
      state.columns.forEach(c => {
        const td = document.createElement("td");
        let v = r[c];
        if (isLikelyMsCol(c) && isNumeric(v)) v = fmtMs(v);
        td.textContent = v == null ? "" : v;
        td.style.padding = "8px 10px";
        td.style.borderBottom = "1px solid #f3f3f3";
        tbody.appendChild(tr).appendChild(td);
      });
    });
    tbl.appendChild(tbody);

    tableBox.appendChild(tbl);

    // pagination bottom
    tableBox.appendChild(renderPager());
  }

  // --- Sélection session ---
  function populateSessionSelect() {
    selEl.innerHTML = "";
    state.sessions.forEach(s => {
      const o = document.createElement("option");
      o.value = s.code;
      o.textContent = s.code;
      if (s.code === state.sessionCode) o.selected = true;
      selEl.appendChild(o);
    });
    selEl.onchange = () => {
      state.sessionCode = selEl.value;
      loadSessionRows();
    };
  }

  // --- Chargement des lignes selon la session sélectionnée ---
  function loadSessionRows() {
    const sess = state.sessions.find(x => x.code === state.sessionCode) || state.sessions[0];
    if (!sess) {
      state.rows = []; state.columns = [];
      statusEl.textContent = "Aucune session disponible pour ce GP.";
      tableBox.innerHTML = "";
      return;
    }

    // Certains exports encodent les lignes sous 'rows', d’autres sous 'data' : on gère les deux.
    const rows = (sess.rows && Array.isArray(sess.rows)) ? sess.rows
               : (sess.data && Array.isArray(sess.data)) ? sess.data
               : [];
    state.rows = rows.slice(); // copie
    // colonnes = union ordonnée des clés visibles
    const keySet = new Set();
    rows.slice(0, 50).forEach(r => Object.keys(r||{}).forEach(k => keySet.add(k)));
    state.columns = Array.from(keySet);

    // Tri par défaut : si 'position' existe, tri ascendant dessus.
    if (state.columns.includes("position")) {
      state.sort = { key: "position", dir: 1 };
    } else {
      state.sort = { key: null, dir: 1 };
    }
    state.page = 1;

    statusEl.textContent = `Session ${sess.code} • ${rows.length} lignes`;
    drawTable();
  }

  // --- Point d’entrée : chargement du GP ---
  async function init() {
    // 1) Lire race & session dans l’URL
    state.raceId = Number(getURLParam("race", null));
    state.sessionCode = (getURLParam("session", "") || "").toUpperCase() || null;

    if (!state.raceId) {
      titleEl.textContent = "Grand Prix — paramètre ?race=<race_id> manquant";
      statusEl.textContent = "Exemple : ?race=501";
      return;
    }

    titleEl.textContent = `Grand Prix — race_id ${state.raceId}`;

    // 2) Récup JSON (via jsDelivr sur ton dépôt)
    // Remplace @main par un SHA si tu veux invalider le cache.
    const url = `https://cdn.jsdelivr.net/gh/menditeguy/f1datadrive-data@main/races/${state.raceId}/sessions.json`;
    statusEl.textContent = "Chargement…";
    try {
      const resp = await fetch(url, { cache: "no-store" });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();

      // Recherche flexible des sessions : json.sessions (recommandé) ou map {code:rows}
      let sessions = [];
      if (Array.isArray(json.sessions)) {
        sessions = json.sessions;
      } else {
        // fallback : si l’export est sous forme d’objet {Q1:[...], COURSE:[...]}
        const keys = Object.keys(json || {});
        sessions = keys.map(k => ({ code: k, rows: json[k] }));
      }

      // Ordonner selon la convention
      const order = ["EL1","EL2","EL3","EL4","WUP","Q1","Q2","Q3","Q4","SPRINT_SHOOTOUT","SPRINT","GRILLE","MT","COURSE"];
      sessions.sort((a,b) => order.indexOf(a.code) - order.indexOf(b.code));

      state.sessions = sessions;

      // Choix session par défaut : paramètre URL si valide, sinon première dispo
      const exists = sessions.some(s => s.code === state.sessionCode);
      if (!exists) state.sessionCode = sessions[0]?.code ?? null;

      populateSessionSelect();
      loadSessionRows();

    } catch (err) {
      console.error(err);
      statusEl.textContent = "Erreur de chargement du JSON.";
      tableBox.innerHTML = "";
    }
  }

  // Lance l’app
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
