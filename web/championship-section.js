/* championship-section.js — build: ES5 global (no modules)
   Expose: window.renderChampionshipSection(json)
   JSON attendu:
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

  // === Message vide ===
  function buildEmptyNote(target, msg) {
    target.innerHTML =
      '<div style="padding:24px 10px;color:#666;text-align:center">' +
      (msg || 'No data for Championship') +
      '</div>';
  }

  // === Modèle Championship (points par course à partir des cumulés) ===
  function buildChampionshipModel(json) {
    if (!json || !json.rounds) return { maxRound: 0, rows: [] };

    // Récupérer le paramètre race depuis l’URL
    const params = new URLSearchParams(window.location.search);
    const raceId = params.get("race") ? parseInt(params.get("race")) : null;

    // Trouver la manche courante correspondant à ce GP
    let currentRound = null;
    if (raceId) {
      for (const r of json.rounds) {
        if (Array.isArray(r.drivers)) {
          const found = r.drivers.some(d => d.race_id === raceId);
          if (found) {
            currentRound = parseInt(r.round);
            break;
          }
        }
      }
    }

    // Si non trouvé : fallback = dernière manche
    const maxRound = currentRound || json.rounds.length;

    // Trier les manches
    const rounds = json.rounds
      .slice()
      .sort((a, b) => Number(a.round || 0) - Number(b.round || 0))
      .slice(0, maxRound); // <= limite ici

    // Dictionnaire pilotes
    const drivers = {};

    // Boucle sur les manches jusqu’à la limite
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
            total: 0,
            lastCumul: 0
          };
        }

        // Valeur fournie (par course ou cumulative)
        const raw = Number(d.points_f1 || d.points_total || d.points || 0);

        // Si cumulatif : différence avec cumul précédent
        let earned = raw - (drivers[id].lastCumul || 0);
        if (earned < 0) earned = raw;
        drivers[id].lastCumul = raw;

        drivers[id].results[roundNum - 1] = earned;
      });

      // Pilotes absents => zéro
      Object.keys(drivers).forEach(id => {
        if (typeof drivers[id].results[roundNum - 1] === 'undefined') {
          drivers[id].results[roundNum - 1] = 0;
        }
      });
    });

    // Recalcul total
    Object.values(drivers).forEach(p => {
      p.total = p.results.reduce((sum, v) => sum + (Number(v) || 0), 0);
    });

    // Classement
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

    // --- En-tête ---
    const thead = document.createElement('thead');
    const hdr = document.createElement('tr');

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
        th.style.fontWeight = '600';
        hdr.appendChild(th);
      });

    thead.appendChild(hdr);
    table.appendChild(thead);

    // --- Corps ---
    const tbody = document.createElement('tbody');

    model.rows.forEach(r => {
      const tr = document.createElement('tr');

      addCell(r.rank, true);
      addCell(r.driver_name, false);

      for (let i = 0; i < model.maxRound; i++) {
        addCell(r.results[i] || 0, true);
      }

      addCell(r.total, true);
      tbody.appendChild(tr);

      function addCell(value, numeric) {
        const td = document.createElement('td');
        td.textContent = value;
        td.style.padding = '4px 8px';
        td.style.borderBottom = '1px solid #eee';
        td.style.textAlign = numeric ? 'right' : 'left';
        tr.appendChild(td);
      }
    });

    table.appendChild(tbody);
    mount.innerHTML = '';
    mount.appendChild(table);
  }

  // === Entrée globale ===
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
