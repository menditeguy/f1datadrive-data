/* championship-section.js — build: ES5 global (no modules)
   Expose: window.renderChampionshipSection(json)
   json schema attendu: { year, rounds:[ { round, gp_name, drivers:[{driver_id,driver_name,points,wins,team,points_f1,points_best_rule_only,points_total}] } ] }
*/
(function () {
  'use strict';

  function $(sel, root) { return (root || document).querySelector(sel); }
  function fmt(n) { return (n == null ? '—' : String(n)); }

  function buildTableHeader() {
    var thead = document.createElement('thead');
    var tr = document.createElement('tr');
    var cols = [
      { k: 'rank', label: 'Cla', w: '42px' },
      { k: 'driver', label: 'Pilote', w: '220px' },
      { k: 'points', label: 'Points', w: '70px' }
    ];
    // colonnes de manche 1..11 (seront étendues si plus)
    for (var i = 1; i <= 30; i++) { cols.push({ k: 'r' + i, label: String(i) }); }

    cols.forEach(function (c) {
      var th = document.createElement('th');
      th.textContent = c.label;
      th.style.textAlign = 'left';
      th.style.padding = '8px 10px';
      th.style.borderBottom = '1px solid #eee';
      if (c.w) th.style.width = c.w;
      tr.appendChild(th);
    });
    thead.appendChild(tr);
    return thead;
  }

  function buildEmptyNote(target, msg) {
    target.innerHTML =
      '<div style="padding:24px 10px;color:#666;text-align:center">' +
      (msg || 'No data for Championship') + '</div>';
  }

  function byPointsDescThenName(a, b) {
    var pa = Number(a.points_total || a.points || 0);
    var pb = Number(b.points_total || b.points || 0);
    if (pa !== pb) return pb - pa;
    return String(a.driver_name || '').localeCompare(String(b.driver_name || ''));
  }

  // Construit un modèle cumulant manche par manche
function buildProgressiveModel(json) {
  if (!json || !json.rounds) return { maxRound: 0, rows: [] };

  // Déterminer la manche actuelle (nombre de GP effectivement courus)
  var rounds = json.rounds.slice().sort(function(a, b) {
    return Number(a.round || 0) - Number(b.round || 0);
  });
  var currentRound = rounds.length;

  // Dictionnaire des pilotes
  var driversMap = {};

  // Fonction utilitaire pour garantir l'entrée d'un pilote
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

  // Pour chaque manche, calculer les points cumulés au fur et à mesure
  var cumulative = {}; // id -> points cumulés

  for (var i = 0; i < rounds.length; i++) {
    var rd = rounds[i];
    var list = Array.isArray(rd.drivers) ? rd.drivers : [];

    list.forEach(function(d) {
      var id = String(d.driver_id || d.id);
      var pts = Number(
        d.points_total ??
        d.points_best_rule_only ??
        d.points_f1 ??
        d.points ??
        0
      );
      cumulative[id] = (cumulative[id] || 0) + pts;

      var row = ensureDriver(d);
      row.pointsByRound[i + 1] = cumulative[id];
      row.total = cumulative[id];
    });

    // Si un pilote n'était pas classé à cette manche, répéter son total précédent
    for (var id in driversMap) {
      if (!driversMap[id].pointsByRound[i + 1]) {
        driversMap[id].pointsByRound[i + 1] = cumulative[id] || 0;
      }
    }
  }

  // Construction finale des lignes
  var rows = Object.values(driversMap);

  // Classement par total actuel (au round courant)
  rows.sort(function(a, b) {
    return (b.total || 0) - (a.total || 0);
  });

  rows.forEach(function(r, idx) {
    r.rank = idx + 1;
  });

  return {
    maxRound: currentRound,
    rows: rows
  };
}

  function drawTable(model, mount) {
    mount.innerHTML = '';

    var table = document.createElement('table');
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';
    table.style.fontSize = '14px';
    table.style.background = '#fff';
    table.style.boxShadow = '0 1px 2px rgba(0,0,0,0.06)';
    table.style.borderRadius = '12px';
    table.style.overflow = 'hidden';

    table.appendChild(buildTableHeader());

    var tbody = document.createElement('tbody');
    var last = model.maxRound;

    model.rows.forEach(function (r) {
      var tr = document.createElement('tr');
      tr.onmouseenter = function () { tr.style.background = '#f7fafc'; };
      tr.onmouseleave = function () { tr.style.background = ''; };

      function td(txt, bold) {
        var c = document.createElement('td');
        c.textContent = txt;
        c.style.padding = '8px 10px';
        c.style.borderBottom = '1px solid #f3f3f3';
        if (bold) c.style.fontWeight = '700';
        tr.appendChild(c);
      }

      td(r.rank, true);
      td(r.driver_name);
      td(r.total, true);

      for (var i = 1; i <= last; i++) {
        var v = r.roundsVals[i - 1];
        td(v != null ? v : '—', false);
      }

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    mount.appendChild(table);
  }

  function renderChampionshipSection(json) {
    var mount = document.getElementById('sessionTable');
    if (!mount) {
      console.warn('[championship] mount #sessionTable introuvable');
      return;
    }
    if (!json || !Array.isArray(json.rounds) || json.rounds.length === 0) {
      buildEmptyNote(mount, 'No data for Championship');
      return;
    }
    var model = buildProgressiveModel(json);
    drawTable(model, mount);
  }

  window.renderChampionshipSection = renderChampionshipSection;
})();
