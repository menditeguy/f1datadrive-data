(function(){
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
    // GP
    const rlist = Array.isArray(data.races) ? data.races : [];
    const rRows = rlist.map(x => {
      const winner = [x.forename, x.surname].filter(Boolean).join(" ");
      const dash = winner ? ` – ${winner}${x.teams_name?(" ("+x.teams_name+")"):""}` : "";
      const label = `R${x.round} • ${x.circuit ?? x.name ?? "GP"} (${x.country ?? ""})${dash}`;
      return `<tr>${textCell(x.race_id ? linkGP(x.round, x.race_id, label) : label)}</tr>`;
    }).join("");
    racesTable.innerHTML = table(["Grand Prix"], rRows || `<tr>${textCell("—")}</tr>`);
  }

  function init(){
    try { loadManifestAndInit().catch(err => setStatus("Erreur: " + err.message)); }
    catch(err){ setStatus("Erreur: " + err.message); }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
