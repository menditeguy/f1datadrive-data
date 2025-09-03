(function(){
  const CDN_BASE = "https://cdn.jsdelivr.net/gh/menditeguy/f1datadrive-data@main";
  const $ = (s)=>document.querySelector(s);
  const setStatus = (m)=>{ const st = $("#status"); if(st) st.textContent = m; };

  // util
  function getQueryParam(name){ return new URLSearchParams(location.search).get(name); }
  async function fetchJson(url){
    const r = await fetch(url + (url.includes("?")?"&":"?") + "ts=" + Date.now(), {cache:"no-store"});
    if(!r.ok) throw new Error(`HTTP ${r.status} sur ${url}`);
    return r.json();
  }
  function th(t){ return `<th style="text-align:left;padding:6px 8px;border-bottom:2px solid #ddd">${t}</th>`; }
  function td(t){ return `<td style="padding:6px 8px;border-bottom:1px solid #eee">${t ?? ""}</td>`; }
  function table(head, rows){
    return `<div style="overflow:auto;border:1px solid #eee;border-radius:8px">
      <table style="width:100%;border-collapse:collapse;font-size:14px;min-width:720px">
        <thead><tr>${head.map(th).join("")}</tr></thead>
        <tbody>${rows || `<tr>${td("—")}</tr>`}</tbody>
      </table>
    </div>`;
  }

  // ordre lisible des colonnes si présentes
  const COL_PRIORITY = ["pos","position","positionOrder","grid","driver","forename","surname","driver_id","team","constructor","team_id","time","milliseconds","gap","delta","laps","status","points"];

  function pickColumns(rows){
    const keys = new Set();
    rows.slice(0,50).forEach(o => Object.keys(o||{}).forEach(k => keys.add(k)));
    const cols = Array.from(keys);
    // map driver name if forename/surname exist
    if(cols.includes("forename") || cols.includes("surname")){
      rows.forEach(r => r.driver = [r.forename, r.surname].filter(Boolean).join(" ").trim() || r.driver);
      if(!cols.includes("driver")) cols.push("driver");
    }
    // tri par priorité
    cols.sort((a,b)=>{
      const ia = COL_PRIORITY.indexOf(a); const ib = COL_PRIORITY.indexOf(b);
      if(ia === -1 && ib === -1) return a.localeCompare(b);
      if(ia === -1) return 1; if(ib === -1) return -1;
      return ia - ib;
    });
    return cols.slice(0,18); // max 18 colonnes pour lisibilité
  }

  function renderRows(rows, cols){
    return rows.map(r => `<tr>${cols.map(c => td(r[c])) .join("")}</tr>`).join("");
  }

  async function init(){
    const raceId = getQueryParam("race");
    if(!raceId){ setStatus("Ajoute ?race=<id> dans l’URL (ex: ?race=501)"); return; }

    setStatus(`Chargement GP ${raceId}…`);

    // 1) Sessions attendues (depuis manifest)
    const manifest = await fetchJson(`${CDN_BASE}/manifest.json`);
    let manifestRace = null, manifestSeason = null;
    for(const s of manifest.seasons||[]){
      const r = (s.races||[]).find(x => String(x.race_id) === String(raceId));
      if(r){ manifestSeason = s.year; manifestRace = r; break; }
    }
    const expectedSessions = Array.isArray(manifestRace?.sessions) ? manifestRace.sessions : [];

    // 2) Charger sessions.json s'il existe
    let sessionsData = null;
    try{
      sessionsData = await fetchJson(`${CDN_BASE}/races/${raceId}/sessions.json`);
    }catch(_){
      // rien, on affichera un message + les sessions attendues
    }

    // 3) Construire le sélecteur
    const select = $("#sessionSelect");
    let sessionNames = [];
    if(sessionsData && sessionsData.sessions && typeof sessionsData.sessions === "object"){
      sessionNames = Object.keys(sessionsData.sessions);
    }else{
      sessionNames = expectedSessions; // fallback manifest
    }
    select.innerHTML = sessionNames.map(s => `<option value="${s}">${s}</option>`).join("");

    // 4) Affichage
    const title = $("#gpTitle");
    title.textContent = `GP ${manifestRace?.name || raceId} — ${manifestSeason || ""}`;

    async function renderSession(name){
      const out = $("#sessionTable");
      const rows = sessionsData?.sessions?.[name] || [];
      if(!rows.length){
        setStatus(`Session ${name} : aucune donnée (sessions.json manquant ou vide).`);
        out.innerHTML = table(["Données"], "");
        return;
      }
      const cols = pickColumns(rows);
      out.innerHTML = table(cols, renderRows(rows, cols));
      setStatus(`GP ${raceId} • ${name} (${rows.length} entrées).`);
    }

    select.addEventListener("change", ()=> renderSession(select.value));
    if(select.value){ renderSession(select.value); }
    else setStatus("Aucune session trouvée pour ce GP.");
  }

  if(document.readyState === "loading"){ document.addEventListener("DOMContentLoaded", init); }
  else { init(); }
})();
