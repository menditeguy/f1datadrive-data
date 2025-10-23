/* championship-section.js — build: ES5 global (no modules)
   Expose: window.renderChampionshipSection(json)
   json schema attendu:
   {
     year,
     rounds:[
       {
         round,
         gp_name,
         drivers:[
           { driver_id, driver_name, team, points_f1, points_total, points }
         ]
       }
     ]
   }
*/

(function () {
  'use strict';

  // === Fonction utilitaire pour message vide ===
  function buildEmptyNote(target, msg) {
    target.innerHTML =
      '<div style="padding:24px 10px;color:#666;text-align:center">' +
      (msg || 'No data for Championship') + '</div>';
  }

  // === Modèle Championship progressif ===
  function buildChampionshipModel(json) {
    if (!json || !json.rounds) return { maxRound: 0, rows: [] };

    // 🔹 Détermination du nombre de courses disputées
    const rounds = json.rounds
      .slice()
      .sort((a, b) => Number(a.round || 0) - Number(b.round || 0));
    const maxRound = rounds.length;

    // 🔹 Dictionnaire des pilotes
    const drivers = {};

    // 🔹 Parcours des courses
    rounds.forEach((rd, idx) => {
      const roundNum = idx + 1;
      const list = Array.isArray(rd.drivers) ? rd.drivers : [];

      list.forEach(d => {
        const id = String(d.driver_id || d.id);
        if (!drivers[id]) {
          drivers[id] = {
            id,
            name: d.driver_name || '',
            team: d.team || '',
            results: Array(maxRound).fill(0),
            total: 0
          };
        }

        const pts = Number(
          d.points_f1 || d.points_total || d.points || 0
        );
        drivers[id].results[roundNum - 1] = pts;
        drivers[id].total += pts;
      });

      // Pilotes absents : laisser 0 (pas de points)
      Object.keys(drivers).forEach(id => {
        if (typeof drivers[id].results[roundNum - 1] === 'undefined') {
          drivers[id].results[roundNum - 1] = 0;
        }
      });
    });

    // 🔹 Calcul du classement final
    const rows = Object.values(drivers)
      .sort((a, b) => b.total - a.total)
      .map((p, i) => ({
        rank: i + 1,
        driver_name: p.name,
        results: p.results,
        total: p.total
      }));

    return { maxRound, rows };
  }

  // === Construction du tableau HTML ===
  function drawTable(model, mount) {
    if (!model || !model.rows) return;

    const table = document.createElement('table');
    table.className = 'datatable';
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';
    table.style.fontSize = '14px';

    // === En-tête ===
    const thead = document.createElement('thead');
    const hdr = document.createElement('tr');

    // Colonnes fixes
    ['Cla', 'Pilote']
      .concat(
        Array.from({ length: model.maxRound }, (_, i) => String(i + 1))
      )
      .concat(['Points'])
      .forEach(label => {
        const th = document.createElement('th');
        th.textContent = label;
        th.style.padding = '6px 10px';
        th.style.borderBottom = '1px solid #ccc';
        th.style.textAlign = 'center';
        hdr.appendChild(th);
      });

    thead.appendChild(hdr);
    table.appendChild(thead);

    // === Corps ===
    const tbody = document.createElement('tbody');

    model.rows.forEach(r => {
      const tr = document.createElement('tr');

      addCell(r.rank, true);
      addCell(r.driver_name);

      for (let i = 0; i < model.maxRound; i++) {
        addCell(r.results[i] || 0, true);
      }

      addCell(r.total, true);
      tbody.appendChild(tr);

      function addCell(value, isNumeric) {
        const td = document.createElement('td');
        td.textContent = value;
        td.style.padding = '4px 8px';
        td.style.borderBottom = '1px solid #eee';
        td.style.textAlign = isNumeric ? 'right' : 'left';
        tr.appendChild(td);
      }
    });

    table.appendChild(tbody);
    mount.innerHTML = '';
    mount.appendChild(table);
  }

  // === Point d’entrée global ===
  function renderChampionshipSection(json) {
    const mount = document.getElementById('sessionTable');
    if (!mount) {
      console.warn('[championship] mount #sessionTable introuvable');
      return;
    }
    if (!json || !Array.isArray(json.rounds) || !json.rounds.length) {
      buildEmptyNote(mount, 'No data for Championship');
      return;
    }

    const model = buildChampionshipModel(json);
    drawTable(model, mount);
  }

  // Export global
  window.renderChampionshipSection = renderChampionshipSection;
})();
