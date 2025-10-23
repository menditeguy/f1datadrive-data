/* championship-section.js — ES5, global (no modules)
   Expose: window.renderChampionshipSection(json)

   JSON attendu (extrait) :
   {
     year: 1958,
     rounds: [
       {
         round: 1,
         gp_name: "Kyalami",
         drivers: [
           { driver_id, driver_name, team, points_f1, points_total, points }
         ]
       },
       ...
     ]
   }
*/
(function () {
  'use strict';

  // --- util ---------------------------------------------------------------
  function emptyNote(target, msg) {
    target.innerHTML =
      '<div style="padding:24px 10px;color:#666;text-align:center">'
      + (msg || 'No data for Championship')
      + '</div>';
  }

  // --- modèle : transforme les cumulés éventuels en points par course -----
  function buildChampionshipModel(json) {
    if (!json || !Array.isArray(json.rounds) || !json.rounds.length) {
      return { maxRound: 0, rows: [] };
    }

    // Tri sûr par numéro de manche
    var rounds = json.rounds.slice().sort(function (a, b) {
      return (+a.round || 0) - (+b.round || 0);
    });

    var maxRound = rounds.length;
    var drivers = {}; // id -> { id, name, team, results[], total, lastCumul }

    // Parcours manche par manche
    for (var r = 0; r < rounds.length; r++) {
      var rd = rounds[r];
      var list = Array.isArray(rd.drivers) ? rd.drivers : [];

      // Index de colonne (0-based)
      var col = r;

      // 1) Injecter/mettre à jour les pilotes présents
      for (var i = 0; i < list.length; i++) {
        var d = list[i];
        var id = String(d.driver_id || d.id);
        if (!drivers[id]) {
          drivers[id] = {
            id: id,
            name: d.driver_name || '',
            team: d.team || '',
            results: Array(maxRound),  // on remplira progressivement
            total: 0,
            lastCumul: 0
          };
        }

        // valeur fournie par la source (peut être par course OU cumulée)
        var rawPts = +d.points_f1 || +d.points_total || +d.points || 0;

        // Si la source est cumulative, earned = cumul - cumul précédent
        // Si la source est déjà par course, lastCumul reste 0 et earned = rawPts
        var earned = rawPts - (drivers[id].lastCumul || 0);
        drivers[id].lastCumul = rawPts;

        // Protéger contre valeurs négatives éventuelles (diffs foireux)
        if (earned < 0) earned = rawPts;

        drivers[id].results[col] = earned;
      }

      // 2) Pour les absents à cette manche : valeur 0 sur cette colonne
      for (var pid in drivers) {
        if (drivers.hasOwnProperty(pid)) {
          if (typeof drivers[pid].results[col] === 'undefined') {
            drivers[pid].results[col] = 0;
          }
        }
      }
    }

    // Totaux
    var rows = [];
    for (var pid2 in drivers) {
      if (drivers.hasOwnProperty(pid2)) {
        var p = drivers[pid2];
        var sum = 0;
        for (var k = 0; k < maxRound; k++) sum += (+p.results[k] || 0);
        p.total = sum;
        rows.push({
          rank: 0, // on posera après tri
          driver_name: p.name,
          results: p.results,
          total: p.total
        });
      }
    }

    // Classement par total décroissant
    rows.sort(function (a, b) { return b.total - a.total; });
    for (var j = 0; j < rows.length; j++) rows[j].rank = j + 1;

    return { maxRound: maxRound, rows: rows };
  }

  // --- vue : construit le tableau HTML ------------------------------------
  function drawTable(model, mount) {
    if (!model || !Array.isArray(model.rows) || !model.rows.length) {
      emptyNote(mount, 'No data for Championship');
      return;
    }

    var table = document.createElement('table');
    table.className = 'datatable';

    // En-tête : Cla, Pilote, 1..N, Points
    var thead = document.createElement('thead');
    var hdr = document.createElement('tr');

    var labels = ['Cla', 'Pilote'];
    for (var r = 1; r <= model.maxRound; r++) labels.push(String(r));
    labels.push('Points');

    for (var i = 0; i < labels.length; i++) {
      var th = document.createElement('th');
      th.textContent = labels[i];
      hdr.appendChild(th);
    }
    thead.appendChild(hdr);
    table.appendChild(thead);

    // Corps
    var tbody = document.createElement('tbody');

    for (var row = 0; row < model.rows.length; row++) {
      var p = model.rows[row];
      var tr = document.createElement('tr');

      var tdRank = document.createElement('td');
      tdRank.textContent = p.rank;
      tr.appendChild(tdRank);

      var tdName = document.createElement('td');
      tdName.textContent = p.driver_name;
      tr.appendChild(tdName);

      // Colonnes 1..N (seulement jusqu’à la manche courante)
      for (var c = 0; c < model.maxRound; c++) {
        var td = document.createElement('td');
        td.textContent = p.results[c] != null ? p.results[c] : '';
        tr.appendChild(td);
      }

      var tdTotal = document.createElement('td');
      tdTotal.textContent = p.total;
      tr.appendChild(tdTotal);

      tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    mount.innerHTML = '';
    mount.appendChild(table);
  }

  // --- point d’entrée global ----------------------------------------------
  function renderChampionshipSection(json) {
    var mount = document.getElementById('sessionTable');
    if (!mount) {
      console.warn('[championship] mount #sessionTable introuvable');
      return;
    }
    if (!json || !Array.isArray(json.rounds) || !json.rounds.length) {
      emptyNote(mount, 'No data for Championship');
      return;
    }

    var model = buildChampionshipModel(json);
    drawTable(model, mount);
  }

  // export global
  window.renderChampionshipSection = renderChampionshipSection;
})();
