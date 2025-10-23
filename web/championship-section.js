/* championship-section.js — build: ES5 global (no modules)
   Expose: window.renderChampionshipSection(json)
   json schema attendu: { year, rounds:[ { round, gp_name, drivers:[{driver_id,driver_name,points,wins,team,points_f1,points_best_rule_only,points_total}] } ] }
*/
(function () {
  'use strict';

  function $(sel, root) { return (root || document).querySelector(sel); }
  function fmt(n) { return (n == null ? '—' : String(n)); }

  // --- Modèle cumulatif manche par manche ---
  function buildProgressiveModel(json) {
    if (!json || !json.rounds) return { maxRound: 0, rows: [] };

    var rounds = json.rounds.slice().sort(function (a, b) {
      return Number(a.round || 0) - Number(b.round || 0);
    });
    var currentRound = rounds.length;

    var driversMap = {};
    var cumulative = {}; // cumul par pilote

    function ensureDriver(d) {
      var id = String(d.driver_id || d.id);
      if (!driversMap[id]) {
        driversMap[id] = {
          id: id,
          driver_name: d.driver_name || '',
          team: d.team || '',
          pointsByRound: [],
          total: 0
        };
      }
      return driversMap[id];
    }

    // Calcul progressif des points
    for (var i = 0; i < rounds.length; i++) {
      var rd = rounds[i];
      var list = Array.isArray(rd.drivers) ? rd.drivers : [];

      list.forEach(function (d) {
        var id = String(d.driver_id || d.id);
        var pts = Number(
          d.points_total ||
          d.points_best_rule_only ||
          d.points_f1 ||
          d.points ||
          0
        );
        cumulative[id] = (cumulative[id] || 0) + pts;

        var row = ensureDriver(d);
        row.pointsByRound[i + 1] = cumulative[id];
        row.total = cumulative[id];
      });

      // remplir les absents
      for (var id in driversMap) {
        if (driversMap.hasOwnProperty(id)) {
          var row = driversMap[id];
          if (typeof row.pointsByRound[i + 1] === 'undefined') {
            var prev = row.pointsByRound[i] || 0;
            row.pointsByRound[i + 1] = prev;
          }
        }
      }
    }

    var rows = Object.values(driversMap);
    rows.sort(function (a, b) { return (b.total || 0) - (a.total || 0); });
    rows.forEach(function (r, idx) { r.rank = idx + 1; });

    return { maxRound: currentRound, rows: rows };
  }

  // --- Construction du tableau ---
  function drawTable(model, mount) {
    if (!model || !model.rows) return;

    var table = document.createElement("table");
    table.className = "datatable";

    // En-tête
    var thead = document.createElement("thead");
    var hdr = document.createElement("tr");
    ["Cla", "Pilote", "Points"].forEach(function (h) {
      var th = document.createElement("th");
      th.textContent = h;
      hdr.appendChild(th);
    });
    for (var i = 1; i <= model.maxRound; i++) {
      var th = document.createElement("th");
      th.textContent = i;
      hdr.appendChild(th);
    }
    thead.appendChild(hdr);
    table.appendChild(thead);

    // Corps
    var tbody = document.createElement("tbody");

    model.rows.forEach(function (r) {
      var tr = document.createElement("tr");

      td(r.rank, true);
      td(r.driver_name);
      td(r.total, true);

      // ✅ Sécurité totale sur pointsByRound
      for (var i = 1; i <= model.maxRound; i++) {
        var val = "-";
        if (Array.isArray(r.pointsByRound)) {
          var v = r.pointsByRound[i];
          val = (typeof v !== 'undefined' && v !== null) ? v : "-";
        }
        td(val);
      }

      tbody.appendChild(tr);

      function td(value, isNumeric) {
        var cell = document.createElement("td");
        cell.textContent = (value != null ? value : "-");
        if (isNumeric) cell.style.textAlign = "right";
        tr.appendChild(cell);
      }
    });

    table.appendChild(tbody);
    mount.innerHTML = "";
    mount.appendChild(table);
  }

  // --- Point d’entrée ---
  function renderChampionshipSection(json) {
    var mount = document.getElementById('sessionTable');
    if (!mount) {
      console.warn('[championship] mount #sessionTable introuvable');
      return;
    }
    if (!json || !Array.isArray(json.rounds) || json.rounds.length === 0) {
      mount.innerHTML = '<div style="padding:24px;color:#666;text-align:center">No data for Championship</div>';
      return;
    }

    var model = buildProgressiveModel(json);
    drawTable(model, mount);
  }

  window.renderChampionshipSection = renderChampionshipSection;
})();
