// ====================================================================
// championship-section.js
// --------------------------------------------------------------------
// Affiche le championnat pilote pour la saison sélectionnée.
// Lecture du fichier /seasons/<year>/championship.json
// Affichage progressif des points course par course.
// ====================================================================

export function renderChampionshipSection() {
  const root = document.getElementById("gp-content");
  root.innerHTML = `
    <h2 class="title">F1 Championship</h2>
    <div id="year-select"></div>
    <div id="championship-table" class="fade-in"></div>
  `;

  const selectContainer = document.getElementById("year-select");
  const tableContainer = document.getElementById("championship-table");

  // Sélecteur de saison
  const sel = document.createElement("select");
  for (let y = 1950; y <= 2024; y++) {
    const opt = document.createElement("option");
    opt.value = y;
    opt.textContent = y;
    if (y === 1958) opt.selected = true; // valeur par défaut
    sel.appendChild(opt);
  }
  selectContainer.appendChild(sel);

  sel.onchange = () => loadSeason(sel.value);
  loadSeason(sel.value);

  // Chargement et affichage
  async function loadSeason(year) {
    tableContainer.innerHTML = `<p>Chargement du championnat ${year}...</p>`;
    try {
      const resp = await fetch(`https://menditeguy.github.io/f1datadrive-data/seasons/${year}/championship.json`);
      const data = await resp.json();
      renderTable(data);
    } catch (e) {
      tableContainer.innerHTML = `<p>Erreur de chargement du championnat ${year}</p>`;
      console.error(e);
    }
  }

  // --- Rendu du tableau principal ---
  function renderTable(data) {
    const rounds = data.rounds || [];
    const drivers = data.drivers || [];

    // En-têtes
    let html = `
      <table class="champ-table">
        <thead><tr>
          <th>#</th><th>Pilote</th><th>Points</th>
    `;
    rounds.forEach((r, i) => { html += `<th>${i + 1}</th>`; });
    html += `</tr></thead><tbody></tbody></table>`;
    tableContainer.innerHTML = html;

    const tbody = tableContainer.querySelector("tbody");

    // Lignes pilotes
    drivers.forEach((d, idx) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${idx + 1}</td>
        <td>${d.driver_name}</td>
        <td class="pts" id="total-${idx}">0</td>
      `;
      // colonnes GP vides
      rounds.forEach((_, j) => {
        const td = document.createElement("td");
        td.className = `gp gp-${j}`;
        td.textContent = "";
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });

    // Animation progressive
    let step = 0;
    const timer = setInterval(() => {
      if (step >= rounds.length) {
        clearInterval(timer);
        return;
      }
      drivers.forEach((d, idx) => {
        const row = tbody.children[idx];
        const gpCell = row.querySelector(`.gp-${step}`);
        const pointsHere = d.points_by_round ? d.points_by_round[step] || 0 : 0;
        const prevTotal = parseFloat(row.querySelector(`#total-${idx}`)?.textContent || 0);
        const newTotal = prevTotal + pointsHere;
        if (gpCell) gpCell.textContent = pointsHere ? pointsHere.toFixed(0) : "-";
        const totalCell = row.querySelector(`#total-${idx}`);
        if (totalCell) totalCell.textContent = newTotal.toFixed(0);
      });
      step++;
    }, 800); // 0.8s par course
  }
}

// --- Style de base ---
const style = document.createElement("style");
style.textContent = `
  .champ-table {
    border-collapse: collapse;
    width: 100%;
    font-size: 13px;
    margin-top: 10px;
  }
  .champ-table th {
    background:#222;
    color:#fff;
    padding:4px 6px;
    text-align:center;
  }
  .champ-table td {
    padding:3px 6px;
    text-align:center;
    border-bottom:1px solid #ccc;
  }
  .champ-table tr:nth-child(even) { background:#f6f6f6; }
  .champ-table .pts { font-weight:bold; text-align:right; }
  .fade-in { animation: fadein 0.4s; }
  @keyframes fadein { from {opacity:0;} to {opacity:1;} }
`;
document.head.appendChild(style);
