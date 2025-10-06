/* gp-page-v2.3.js
 * v2.1 complète + routage dynamique sous-dépôts + compatibilité ES5 (sans ?. ni =>)
 * Fonctions clés conservées :
 * - Chargement sessions.json + meta
 * - Lookups drivers + participants (numéro voiture)
 * - Ordre de sessions : PreQ, EL1, EL2, EL3, EL4, Q1, Q2, Q3, Q4, WUP, GRILLE, MT, COURSE
 * - Rendu select des sessions + tableau résultats (Pos, No, Driver, Car/Engine, Laps, Time, Gap/Reason)
 * - Formatages temps & gaps style Forix
 * - Gestion erreurs propre avec logs
 */

(function () {
  // ---------- Utils génériques (ES5)
  function byId(id) { return document.getElementById(id); }
  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return (root || document).querySelectorAll(sel); }

  function logInfo(msg) { try { console.info(msg); } catch (e) {} }
  function logWarn(msg) { try { console.warn(msg); } catch (e) {} }
  function logError(msg) { try { console.error(msg); } catch (e) {} }

  function getParam(name) {
    var m = RegExp('[?&]' + name + '=([^&]*)').exec(window.location.search);
    return m && decodeURIComponent(m[1].replace(/\+/g, ' '));
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function msToLap(ms) {
    if (ms == null || isNaN(ms)) return '';
    var m = Math.floor(ms / 60000);
    var s = Math.floor((ms % 60000) / 1000);
    var cs = Math.floor((ms % 1000) / 10);
    return m + ':' + pad2(s) + '.' + pad2(cs);
  }

  function safeText(x) { return (x == null ? '' : String(x)); }

  function fetchJSON(url, cb) {
    // fetch + XHR fallback
    if (window.fetch) {
      fetch(url, { cache: 'no-store' })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (j) { cb(null, j); })
        .catch(function (e) { cb(e); });
    } else {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
          if (xhr.status >= 200 && xhr.status < 300) {
            try { cb(null, JSON.parse(xhr.responseText)); }
            catch (err) { cb(err); }
          } else {
            cb(new Error('HTTP ' + xhr.status));
          }
        }
      };
      xhr.send();
    }
  }

  function buildEl(tag, cls, text) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  }

  // ---------- État
  var state = {
    raceId: null,
    rootBase: null,      // lookups (drivers/participants) — f1datadrive-data@SHA
    sessionsBase: null,  // sessions — sous-dépôt dynamique @main
    race: null,          // sessions.json chargé
    drivers: {},         // driver_id -> {id, name, ...}
    numbers: {},         // driver_id -> car_number (pour la course courante)
    order: [
      'PREQ', 'EL1', 'EL2', 'EL3', 'EL4',
      'Q1', 'Q2', 'Q3', 'Q4',
      'WUP', 'GRILLE', 'MT', 'COURSE'
    ],
    codeToLabel: {       // fallback au cas où le JSON n'a pas "name"
      'PREQ': 'Pré-qualifications',
      'EL1': 'Essais Libres 1',
      'EL2': 'Essais Libres 2',
      'EL3': 'Essais Libres 3',
      'EL4': 'Essais Libres 4',
      'Q1': 'Qualifications 1',
      'Q2': 'Qualifications 2',
      'Q3': 'Qualifications 3',
      'Q4': 'Qualifications 4',
      'WUP': 'Warm-up',
      'GRILLE': 'Grille',
      'MT': 'Meilleurs Tours',
      'COURSE': 'Course'
    }
  };

  // ---------- Détermination dépôt sessions
  function computeSessionsBase(raceId) {
    var repo = 'menditeguy/f1data-races-1-500';
    if (raceId > 500 && raceId <= 1000) repo = 'menditeguy/f1data-races-501-1000';
    else if (raceId > 1000) repo = 'menditeguy/f1data-races-1001-1500';
    var base = 'https://cdn.jsdelivr.net/gh/' + repo + '@main';
    logInfo('[INFO] Using ' + repo + ' @main for race ' + raceId);
    return base;
  }

  // ---------- Rendu UI
  function setTitle(meta) {
    var titleEl = qs('h1, .page-title, .jw-heading h1, .jw-content h1');
    var text = 'Grand Prix';
    if (meta) {
      var year = safeText(meta.year);
      var circuit = safeText(meta.circuit);
      var country = safeText(meta.country);
      text = 'Grand Prix ' + (year ? ('(' + year + ') ') : '') +
             (circuit ? ('- ' + circuit) : '') +
             (country ? (' (' + country + ')') : '');
    }
    // Si pas de H1 clair dans le thème, on crée un titre local :
    var container = byId('f1-gp-app');
    if (!container) return;
    var hdr = qs('.f1gp-title', container);
    if (!hdr) {
      hdr = buildEl('div', 'f1gp-title');
      hdr.style.fontSize = '28px';
      hdr.style.margin = '16px 0 8px';
      container.insertBefore(hdr, container.firstChild || null);
    }
    hdr.textContent = text;
  }

  function clearContainer(el) {
    while (el && el.firstChild) el.removeChild(el.firstChild);
  }

  function renderSessionSelect(sessions) {
    var container = byId('f1-gp-app');
    if (!container) return;

    var bar = qs('.f1gp-bar', container);
    if (!bar) {
      bar = buildEl('div', 'f1gp-bar');
      bar.style.margin = '8px 0 16px';
      container.appendChild(bar);
    } else {
      clearContainer(bar);
    }

    var label = buildEl('label', 'f1gp-label', 'Session : ');
    label.style.marginRight = '8px';
    var sel = buildEl('select', 'f1gp-select');
    sel.style.padding = '6px 8px';

    var ordered = sessions.slice().sort(function (a, b) {
      var ai = state.order.indexOf(a.code);
      var bi = state.order.indexOf(b.code);
      if (ai < 0) ai = 999;
      if (bi < 0) bi = 999;
      return ai - bi;
    });

    for (var i = 0; i < ordered.length; i++) {
      var s = ordered[i];
      var o = document.createElement('option');
      var labelText = s.name || state.codeToLabel[s.code] || s.code;
      o.value = s.code;
      o.text = labelText + (s.nb_rows ? (' (' + s.nb_rows + ')') : '');
      sel.appendChild(o);
    }

    sel.onchange = function () {
      renderSessionTable(getSessionByCode(sel.value));
    };

    bar.appendChild(label);
    bar.appendChild(sel);

    // auto-sélection : première session existante dans l’ordre
    if (ordered.length) {
      sel.value = ordered[0].code;
      renderSessionTable(ordered[0]);
    } else {
      renderNoData('No session available for this GP.');
    }
  }

  function renderNoData(msg) {
    var container = byId('f1-gp-app');
    if (!container) return;
    var tblWrap = ensureTableWrap(container, true);
    tblWrap.appendChild(buildEl('div', 'f1gp-nodata', msg || 'No data'));
  }

  function ensureTableWrap(container, clear) {
    var wrap = qs('.f1gp-table-wrap', container);
    if (!wrap) {
      wrap = buildEl('div', 'f1gp-table-wrap');
      container.appendChild(wrap);
    }
    if (clear) clearContainer(wrap);
    return wrap;
  }

  function renderSessionTable(session) {
    var container = byId('f1-gp-app');
    if (!container) return;
    var wrap = ensureTableWrap(container, true);

    if (!session || !session.rows || !session.rows.length) {
      renderNoData('No rows for this session.');
      return;
    }

    var table = buildEl('table', 'f1gp-table');
    table.style.borderCollapse = 'collapse';
    table.style.width = '100%';
    table.style.fontSize = '14px';

    var thead = document.createElement('thead');
    var trh = document.createElement('tr');
    function th(txt, w) {
      var el = document.createElement('th');
      el.textContent = txt;
      el.style.textAlign = 'left';
      el.style.borderBottom = '1px solid #ddd';
      el.style.padding = '8px 6px';
      if (w) el.style.width = w;
      trh.appendChild(el);
    }
    th('Pos', '60px');
    th('No', '60px');
    th('Driver');
    th('Car / Engine');
    th('Laps', '70px');
    th('Time', '120px');
    th('Gap / Reason', '140px');
    thead.appendChild(trh);
    table.appendChild(thead);

    var tbody = document.createElement('tbody');

    // trier par position si dispo
    var rows = session.rows.slice().sort(function (a, b) {
      var pa = a.position == null ? 9999 : a.position;
      var pb = b.position == null ? 9999 : b.position;
      return pa - pb;
    });

    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var tr = document.createElement('tr');
      if (i % 2 === 1) tr.style.background = '#fafafa';

      function td(txt) {
        var el = document.createElement('td');
        el.textContent = txt == null ? '' : String(txt);
        el.style.padding = '8px 6px';
        el.style.borderBottom = '1px solid #f0f0f0';
        return el;
      }

      // Pos
      tr.appendChild(td(r.position == null ? '' : r.position));

      // No (via participants)
      var carNo = getCarNumber(r.driver_id);
      tr.appendChild(td(carNo == null ? '' : carNo));

      // Driver name
      var drv = state.drivers[r.driver_id];
      tr.appendChild(td(drv ? drv.name : ('#' + r.driver_id)));

      // Car / Engine (si présent)
      var car = r.team || r['car_engine'] || '';
      tr.appendChild(td(car));

      // Laps
      tr.appendChild(td(r.laps == null ? '' : r.laps));

      // Time (meilleur temps, race_time_raw, speed…)
      tr.appendChild(td(formatAnyTime(r)));

      // Gap / Reason
      tr.appendChild(td(formatGapOrReason(r)));

      tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    wrap.appendChild(table);
  }

  function formatAnyTime(row) {
    // Priorités : best_lap_time_raw -> time -> race_time_raw -> best_lap_ms -> race_time_ms
    if (row.best_lap_time_raw) return row.best_lap_time_raw;
    if (row.time) return row.time;
    if (row.race_time_raw) return row.race_time_raw;

    if (typeof row.best_lap_ms === 'number') return msToLap(row.best_lap_ms);
    if (typeof row.race_time_ms === 'number') return msToLap(row.race_time_ms);
    return '';
  }

  function formatGapOrReason(row) {
    // gap_raw | gap | reason | retired | status
    var s = '';
    if (row.gap_raw) s = row.gap_raw;
    else if (row.gap) s = row.gap;
    else if (row.reason) s = row.reason;
    else if (row.retired) s = row.retired;
    else if (row.status) s = row.status;
    return s || '';
  }

  function getSessionByCode(code) {
    if (!state.race || !state.race.sessions) return null;
    for (var i = 0; i < state.race.sessions.length; i++) {
      var s = state.race.sessions[i];
      if (s.code === code) return s;
    }
    return null;
  }

  // ---------- Lookups
  function loadDrivers(cb) {
    var url = state.rootBase.replace(/\/+$/, '') + '/lookups/drivers.min.json';
    fetchJSON(url, function (err, data) {
      if (err) { logWarn('[WARN] drivers.min.json ' + err.message); return cb(null); }
      var map = {};
      for (var i = 0; i < data.length; i++) {
        var d = data[i];
        map[d.id] = { id: d.id, name: d.name || (d.first_name ? (d.first_name + ' ' + (d.last_name || '')) : ('#' + d.id)) };
      }
      state.drivers = map;
      cb(null);
    });
  }

  function loadParticipants(cb) {
    var url = state.rootBase.replace(/\/+$/, '') + '/lookups/participants.json';
    fetchJSON(url, function (err, data) {
      if (err) { logWarn('[WARN] participants.json ' + err.message); state.numbers = {}; return cb(null); }
      var nmap = {};
      for (var i = 0; i < data.length; i++) {
        var p = data[i];
        if (p.race_id === state.raceId) {
          nmap[p.driver_id] = p.car_number;
        }
      }
      state.numbers = nmap;
      cb(null);
    });
  }

  function getCarNumber(driverId) {
    return state.numbers[driverId];
  }

  // ---------- Chargement race sessions
  function loadRace(cb) {
    var url = state.sessionsBase.replace(/\/+$/, '') + '/races/' + state.raceId + '/sessions.json';
    fetchJSON(url, function (err, data) {
      if (err) return cb(err);
      state.race = data;
      cb(null);
    });
  }

  // ---------- Initialisation
  function init() {
    // Conteneur
    var app = byId('f1-gp-app');
    if (!app) {
      // Crée-le par défaut si absent (pour thèmes “vides”)
      app = buildEl('div');
      app.id = 'f1-gp-app';
      document.body.appendChild(app);
    }

    // Race id
    var rid = parseInt(getParam('race'), 10);
    if (!rid || rid <= 0) {
      renderNoData('Paramètre ?race= manquant ou invalide.');
      return;
    }
    state.raceId = rid;

    // Bases
    var root = app.getAttribute('data-base');
    if (!root) {
      // fallback — mais on préfère data-base côté HTML
      root = 'https://cdn.jsdelivr.net/gh/menditeguy/f1datadrive-data@46fa59560ae72b90fc58a481bb2d871350f99e59';
    }
    state.rootBase = root;
    state.sessionsBase = computeSessionsBase(state.raceId);

    // Charge race + lookups
    loadRace(function (err) {
      if (err) {
        logError('[ERROR] loadRace: ' + err.message);
        renderNoData('Aucune donnée pour ce GP (sessions.json introuvable).');
        return;
      }

      // Titre
      setTitle(state.race && state.race.meta);

      // Lookups en // puis rendu
      var pending = 2, done = function () {
        pending--;
        if (pending === 0) {
          // Rendu select + table
          var sessions = (state.race && state.race.sessions) ? state.race.sessions : [];
          if (!sessions.length) {
            renderNoData('No session available for this GP.');
            return;
          }
          renderSessionSelect(sessions);
        }
      };
      loadDrivers(done);
      loadParticipants(done);
    });
  }

  // Lancement
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
