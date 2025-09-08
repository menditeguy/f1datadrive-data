(() => {
  const app = document.getElementById("f1-season-app");
  if (!app) return;

  // Base des données (même SHA que dans <script>)
  const BASE = app.dataset.base || "https://cdn.jsdelivr.net/gh/menditeguy/f1datadrive-data@main";

  const yearSelect = document.getElementById("yearSelect");
  const statusEl = document.getElementById("status");
  const racesTable = document.getElementById("racesTable");

  // Remplit la liste des années (1950..2024) et choisit 1991 par défaut
  const years = Array.from({ length: 2024 - 1950 + 1 }, (_, i) => 1950 + i);
  yearSelect.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join("");
  const initialYear = "1991";
  yearSelect.value = initialYear;

  function buildLabel(r) {
    // Priorité au 'label' généré côté export, sinon circuit/name puis country
    const circuitOrName = r.circuit || r.name || "GP";
    const country = r.country ? ` (${r.country})` : "";
    const round = r.round != null ? r.round : "?";
    return `R${round} • ${circuitOrName}${country}`;
  }

  async function loadSeason(year) {
    statusEl.textContent = "Chargement…";
    racesTable.textContent = "";
    try {
      const url = `${BASE}/seasons/${year}/season.json`;
      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json();

      statusEl.textContent = `Saison ${data.year} chargée`;

      const rows = data.races || [];
      const html = [
        `<table style="width:100%;border-collapse:collapse">`,
        `<thead><tr><th style="text-align:left;border-bottom:1px solid #ddd;padding:8px">Grand Prix</th></tr></thead>`,
        `<tbody>`
      ];
      for (const r of rows) {
        const label = r.label || buildLabel(r);
        html.push(
          `<tr><td style="padding:8px;border-bottom:1px solid #f0f0f0">` +
          `<a href="/grands-prix?race=${r.race_id}" style="color:#d6402b;text-decoration:none">${label}</a>` +
          `</td></tr>`
        );
      }
      html.push(`</tbody></table>`);
      racesTable.innerHTML = html.join("");
    } catch (e) {
      console.error(e);
      statusEl.textContent = "Erreur de chargement des données.";
    }
  }

  yearSelect.addEventListener("change", e => loadSeason(e.target.value));
  loadSeason(initialYear);
})();
