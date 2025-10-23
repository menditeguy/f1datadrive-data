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
    var rounds = Array.isArray(json.rounds) ? json.rounds.slice() : [];
    var maxRound = 0;
    for (var i = 0; i < rounds.length; i++) {
      if (rounds[i] && rounds[i].round != null) {
        var r = Number(rounds[i].round) || 0;
        if (r > maxRound) maxRound = r;
      }
    }

    // Index: driver_id -> {name, team, perRound[], total}
    var driversMap = {};
    function ensureDriver(d) {
      var id = String(d.driver_id != null ? d.driver_id : d.id);
      if (!driversMap[id]) {
        driversMap[id] = {
          id: id,
          driver_name: d.driver_name || '',
          team: d.team || '',
          perRound: [],
          total: 0
        };
      }
      return driversMap[id];
    }

    // Remplit manche par manche (on prend points_total si présent, sinon points_f1/points)
    for (var rIdx = 0; rIdx < rounds.length; rIdx++) {
      var rd = rounds[rIdx] || {};
      var rr = Number(rd.round) || (rIdx + 1);
      var list = Array.isArray(rd.drivers) ? rd.drivers : [];
      list.sort(byPointsDescThenName);
      for (var j = 0; j < list.length; j++) {
        var d = list[j];
        var row = ensureDriver(d);
        var score = (d.points_total != null ? d.points_total
                    : (d.points_best_rule_only != null ? d.points_best_rule_only
                    : (d.points_f1 != null ? d.points_f1
                    : d.points)));
        score = Number(score) || 0;
        row.perRound[rr] = score;
      }
    }

    // Complète les trous et calcule les totaux progressifs
    var out = [];
    for (var id in driversMap) {
      var dr = driversMap[id];
      var total = 0;
      var roundsVals = [];
      for (var r = 1; r <= maxRound; r++) {
        var v = Number(dr.perRound[r] || 0);
        total = v;
        roundsVals.push(v);
      }
      dr.total = total;
      dr.roundsVals = roundsVals;
      out.push(dr);
    }

    out.sort(function (a, b) {
      if (b.total !== a.total) return b.total - a.total;
      return String(a.driver_name).localeCompare(String(b.driver_name));
    });

    var rank = 1;
    out.forEach(function (d) { d.rank = rank++; });
    return { maxRound: maxRound, rows: out };
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
