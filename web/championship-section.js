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
           { driver_id, driver_name, team, points_f1, points_total }
         ]
       }
     ]
   }
*/

(function () {
  'use strict';

  function buildEmptyNote(target, msg) {
    target.innerHTML =
      '<div style="padding:24px 10px;color:#666;text-align:center">' +
      (msg || 'No data for Championship') + '</div>';
  }

  // --- Modèle cumulatif dynamique ---
  function buildProgressiveModel(json) {
    if (!json || !json.rounds) return { maxRound: 0, rows: [] };

    const rounds = json.rounds.slice().sort((a, b) => Number(a.round || 0) - Number(b.round || 0));
    const currentRound = rounds.length;
    const driversMap = {}; // id → { driver_name, team, results[], total }

    rounds.forEach((rd, idx) => {
      const roundNum = idx + 1;
      const list = Array.isArray(rd.drivers) ? rd.drivers : [];

      // 1️⃣ Ajout des pilotes présents à cette manche
      list.forEach(d => {
        const id = String(d.driver_id || d.id);
        const name = d.driver_name || '';
        const team = d.team || '';
        const pts = Number(d.points_f1 || d.points_total || d.points || 0);

        if (!driversMap[id]) {
          driversMap[id] = {
            id,
            driver_name: name,
            team,
            results: [],
            total: 0
          };
        }

        driversMap[id].results[roundNum] = pts;
        driversMap[id].total += pts;
      });

      // 2️⃣ Pilotes absents : 0 point à cette manche
      for (const id in driversMap) {
        if (typeof driversMap[id].results[roundNum] === 'undefined') {
          driversMap[id].results[roundNum] = 0;
        }
      }
    });

    // 3️⃣ Classement
    const rows = Object.values(driversMap)
      .sort((a, b) => b.total - a.total)
      .map((r, idx) => ({
        rank: idx + 1,
        driver_name: r.driver_name,
        results: r.results,
        total: r.total
      }));

    return { maxRound: currentRound, rows };
  }

  // --- Construction du tableau HTML ---
  function drawTable(model, mount) {
    if (!model || !model.rows) return;

    const table = document.createElement('table');
    table.className = 'datatable';

    // === En-tête ===
    const thead = document.createElement('thead');
    const hdr = document.createElement('tr');
    ['Cla', 'Pilote'].forEach(label => {
      const th = document.createElement('th');
      th.textContent = label;
      hdr.appendChild(th);
    });

    for (let i = 1; i <= model.maxRound; i++) {
      const th = document.createElement('th');
      th.textContent = i;
      hdr.appendChild(th);
    }

    const thTotal = document.createElement('th');
    thTotal.textContent = 'Points';
    hdr.appendChild(thTotal);

    thead.appendChild(hdr);
    table.appendChild(thead);

    // === Corps ===
    const tbody = document.createElement('tbody');
    model.rows.forEach(r => {
      const tr = document.createElement('tr');
      addCell(r.rank, true);
      addCell(r.driver_name);

      for (let i = 1; i <= model.maxRound; i++) {
        addCell(r.results[i] || '-', true);
      }
      addCell(r.total, true);
      tbody.appendChild(tr);

      function addCell(value, isNumeric) {
        const td = document.createElement('td');
        td.textContent = value;
        if (isNumeric) td.style.textAlign = 'right';
        tr.appendChild(td);
      }
    });

    table.appendChild(tbody);
    mount.innerHTML = '';
    mount.appendChild(table);
  }

  // --- Point d’entrée ---
  function renderChampionshipSection(json) {
    const mount = document.getElementById('sessionTable');
    if (!mount) return console.warn('[championship] mount #sessionTable introuvable');

    if (!json || !Array.isArray(json.rounds) || !json.rounds.length) {
      buildEmptyNote(mount, 'No data for Championship');
      return;
    }

    const model = buildProgressiveModel(json);
    drawTable(model, mount);
  }

  window.renderChampionshipSection = renderChampionshipSection;
})();
