(async function(){
  const CDN_BASE = "https://cdn.jsdelivr.net/gh/menditeguy/f1datadrive-data@main";
  const PAGE_GP_URL = "/gp";
  const PAGE_PILOTE_URL = "/pilote";

  const $ = (s)=>document.querySelector(s);
  const setStatus = (m)=>{ const st = $("#status"); if(st) st.textContent = m; };

  function textCell(t){ return `<td style="padding:6px 8px;border-bottom:1px solid #eee">${t ?? ""}</td>`; }
  function th(t){ return `<th style="text-align:left;padding:6px 8px;border-bottom:2px solid #ddd">${t}</th>`; }
  function table(headCols, rowsHtml){
    return `<div style="overflow:auto;border:1px solid #eee;border-radius:8px">
      <table style="width:100%;border-collapse:collapse;font-size:14px;min-width:600px">
        <thead><tr>${headCols.map(th).join("")}</tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>`;
  }
  function linkGP(round, raceId, label){
    return `<a href="${PAGE_GP_URL}?race=${encodeURIComponent(raceId)}" title="Ouvrir GP #${round} (${raceId})">${label}</a>`;
  }
  function linkPilote(driverId, label){
    return `<a href="${PAGE_PILOTE_URL}?id=${encodeURIComponent(driverId)}" title="Ouvrir pilote ${driverId}">${label}</a>`;
  }
  async function fetchJson(url){
    const r = await fetch(url + (url.includes("?")?"&":"?") + "ts=" + Date.now(), {cache:"no-store"});
    if(!r.ok) throw new Error(`HTTP ${r.status} sur ${url}`);
    return r.json();
  }
  async function seasonExists(year){
    try{ const r = await fetch(`${CDN_BASE}/seasons/${year}/season.json?ts=${Date.now()}`, {cache:"no-store"}); return r.ok; }
    catch(_){ return false; }
  }

  // ----- MAIN -----
  try{
    setStatus("Chargement du manifest…");
    const manifest = await fetchJson(`${CDN_BASE}/manifest.json`);
    const years = (manifest.seasons || []).map(s => s.year).filter(Boolean).sort((a,b)=>a-b);

    const yearSelect = $("#yearSelect");
    yearSelect.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join("");
    setStatus(`Manifest OK (${years.length} saisons)`);

    // Choix par défaut : 1991 si dispo (et season.json existant), sinon la plus récente dispo
    let defaultYear = null;
    if (years.includes(1991) && await seasonExists(1991)) defaultYear = 1991;
    if (!defaultYear){
      const desc = [...years].sort((a,b)=>b-a);
      for (const y of desc){ if (await seasonExists(y)) { defaultYear = y; break; } }
    }
    if (!defaultYear){ setStatus("Aucune season.json disponible."); return; }

    yearSelect.value = String(defaultYear);

    async function render(year){
      setStatus(`Chargement saison ${year}…`);
      const data = await fetchJson(`${CDN_BASE}/seasons/${year}/season.json`);
      setStatus(`Saison ${year} chargée`);

      const driversTable = $("#driversTable");
      const constructorsTable = $("#constructorsTable");
      const racesTable = $("#racesTable");

      // Pilotes
      const d = Array.isArray(data.drivers) ? data.drivers : [];
      const dRows = d.map(x => {
        const name = `${x.forename ?? ""} ${x.surname ?? ""}`.trim() || x.driver_id;
        const nameLink = linkPilote(x.driver_id, name);
        return `<tr>
          ${textCell(nameLink)}
          ${textCell(x.points)}${textCell(x.wins)}${textCell(x.podiums)}${textCell(x.starts)}${textCell(x.poles)}${textCell(x.fastlaps)}
        </tr>`;
      }).join("");
      driversTable.innerHTML = table(
        ["Pilote","Pts","V","POD","Départs","Poles","MT"],
        dRows || `<tr>${textCell("—")}${textCell("")}${textCell("")}${textCell("")}${textCell("")}${textCell("")}${textCell("")}</tr>`
      );

      // Constructeurs
      const c = Array.isArray(data.constructors) ? data.constructors : [];
      const cRows = c.map(x => `<tr>
        ${textCell(x.team)}${textCell(x.points)}${textCell(x.wins)}${textCell(x.starts)}
      </tr>`).join("");
      constructorsTable.innerHTML = table(
        ["Équipe","Pts","V","Départs"],
        cRows || `<tr>${textCell("—")}${textCell("")}${textCell("")}${textCell("")}</tr>`
      );

      // Grands Prix
      const rlist = Array.isArray(data.races) ? data.races : [];
      const rRows = rlist.map(x => {
        const winner = [x.forename, x.surname].filter(Boolean).join(" ");
        const dash = winner ? ` – ${winner}${x.teams_name?(" ("+x.teams_name+")"):""}` : "";
        const label = `R${x.round} • ${x.circuit ?? x.name ?? "GP"} (${x.country ?? ""})${dash}`;
        return `<tr>${textCell(x.race_id ? linkGP(x.round, x.race_id, label) : label)}</tr>`;
      }).join("");
      racesTable.innerHTML = table(["Grand Prix"], rRows || `<tr>${textCell("—")}</tr>`);
    }

    await render(defaultYear);

    yearSelect.addEventListener("change", async ()=>{
      const y = Number(yearSelect.value);
      if(!(await seasonExists(y))){ setStatus(`season.json ${y} introuvable`); return; }
      await render(y);
    });

  }catch(err){
    setStatus("Erreur: " + err.message);
    console.error(err);
  }
})();
