/* gp-page-v2.3.js – MODE DEBUG limité aux 500 premiers GP
 * Objectif : vérifier que le chargement depuis f1data-races-1-500 fonctionne.
 * Compatibilité : ES5 (aucun ?., ??, =>)
 * Historique : dérivé de la v2.3 complète, allégée pour diagnostic.
 */

(function () {
  // ========== UTILITAIRES ==========
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }

  function log(msg) { try { console.log(msg); } catch (e) {} }
  function warn(msg) { try { console.warn(msg); } catch (e) {} }
  function err(msg) { try { console.error(msg); } catch (e) {} }

  function getParam(name) {
    var match = RegExp('[?&]' + name + '=([^&]*)').exec(window.location.search);
    return match && decodeURIComponent(match[1].replace(/\+/g, ' '));
  }

  function msToTime(ms) {
    if (!ms || isNaN(ms)) return "";
    var m = Math.floor(ms / 60000);
    var s = Math.floor((ms % 60000) / 1000);
    var cs = Math.floor((ms % 1000) / 10);
    return m + ":" + (s < 10 ? "0" : "") + s + "." + (cs < 10 ? "0" : "") + cs;
  }

  // ========== VARIABLES GLOBALES ==========
  var baseRepo = "https://cdn.jsdelivr.net/gh/menditeguy/f1data-races-1-500@main";
  var drivers = {};
  var participants = {};
  var raceId = 0;
  var raceData = null;

  // ========== CHARGEMENT ==========
  function fetchJSON(url, cb) {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", url, true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            var data = JSON.parse(xhr.responseText);
            cb(null, data);
          } catch (e) {
            cb(e);
          }
        } else {
          cb(new Error("HTTP " + xhr.status));
        }
      }
    };
    xhr.send();
  }

  function loadDrivers(cb) {
    var url = "https://cdn.jsdelivr.net/gh/menditeguy/f1datadrive-data@46fa59560ae72b90fc58a481bb2d871350f99e59/lookups/drivers.min.json";
    log("[DEBUG] Chargement des pilotes : " + url);
    fetchJSON(url, function (e, d) {
      if (e) { warn("[WARN] drivers.json : " + e.message); return cb(); }
      for (var i = 0; i < d.length; i++) {
        drivers[d[i].id] = d[i].name || (d[i].first_name + " " + d[i].last_name);
      }
      cb();
    });
  }

  function loadParticipants(cb) {
    var url = "https://cdn.jsdelivr.net/gh/menditeguy/f1datadrive-data@46fa59560ae72b90fc58a481bb2d871350f99e59/lookups/participants.json";
    log("[DEBUG] Chargement des participants : " + url);
    fetchJSON(url, function (e, d) {
      if (e) { warn("[WARN] participants.json : " + e.message); return cb(); }
      for (var i = 0; i < d.length; i++) {
        if (d[i].race_id == raceId)
          participants[d[i].driver_id] = d[i].car_number;
      }
      cb();
    });
  }

  function loadRace(cb) {
    var url = baseRepo + "/races/" + raceId + "/sessions.json";
    log("[DEBUG] Chargement sessions.json : " + url);
    fetchJSON(url, function (e, d) {
      if (e) return cb(e);
      raceData = d;
      cb();
    });
  }

  // ========== AFFICHAGE ==========
  function renderLoading() {
    var app = $("f1-gp-app");
    if (!app) return;
    app.innerHTML = "<p style='color:#888'>Chargement du Grand Prix " + raceId + "…</p>";
  }

  function renderError(msg) {
    var app = $("f1-gp-app");
    if (!app) return;
    app.innerHTML = "<p style='color:red'>" + msg + "</p>";
  }

  function renderRace() {
    var app = $("f1-gp-app");
    if (!app) return;

    if (!raceData || !raceData.sessions || raceData.sessions.length === 0) {
      app.innerHTML = "<p style='color:gray'>Aucune session trouvée pour ce Grand Prix.</p>";
      return;
    }

    app.innerHTML = "";
    var meta = raceData.meta || {};
    var title = el("h2", null, "Grand Prix " + (meta.year || "") + " – " + (meta.circuit || ""));
    app.appendChild(title);

    var select = el("select");
    select.id = "sessionSelect";
    select.style.margin = "8px 0";
    app.appendChild(select);

    for (var i = 0; i < raceData.sessions.length; i++) {
      var s = raceData.sessions[i];
      var opt = el("option", null, s.name || s.code);
      opt.value = s.code;
      select.appendChild(opt);
    }

    var container = el("div", "sessionContainer");
    app.appendChild(container);

    select.onchange = function () {
      var code = select.value;
      for (var j = 0; j < raceData.sessions.length; j++) {
        if (raceData.sessions[j].code === code)
          return renderSession(raceData.sessions[j]);
      }
    };

    // afficher première session
    renderSession(raceData.sessions[0]);
  }

  function renderSession(session) {
    var container = document.querySelector(".sessionContainer");
    if (!container) return;
    container.innerHTML = "";

    if (!session.rows || session.rows.length === 0) {
      container.innerHTML = "<p>Aucune donnée pour cette session.</p>";
      return;
    }

    var table = el("table");
    table.style.borderCollapse = "collapse";
    table.style.width = "100%";

    var header = ["Pos", "No", "Driver", "Team", "Laps", "Time", "Gap/Reason"];
    var trh = el("tr");
    for (var i = 0; i < header.length; i++) {
      var th = el("th", null, header[i]);
      th.style.borderBottom = "1px solid #ccc";
      th.style.textAlign = "left";
      th.style.padding = "6px";
      trh.appendChild(th);
    }
    table.appendChild(trh);

    for (var j = 0; j < session.rows.length; j++) {
      var r = session.rows[j];
      var tr = el("tr");
      if (j % 2 === 1) tr.style.background = "#fafafa";

      var pos = r.position || "";
      var no = participants[r.driver_id] || "";
      var drv = drivers[r.driver_id] || ("#" + r.driver_id);
      var team = r.team || "";
      var laps = r.laps || "";
      var time = r.best_lap_time_raw || r.race_time_raw || msToTime(r.best_lap_ms) || "";
      var gap = r.gap_raw || r.reason || "";

      var vals = [pos, no, drv, team, laps, time, gap];
      for (var k = 0; k < vals.length; k++) {
        var td = el("td", null, vals[k]);
        td.style.padding = "6px";
        td.style.borderBottom = "1px solid #eee";
        tr.appendChild(td);
      }
      table.appendChild(tr);
    }

    container.appendChild(table);
  }

  // ========== INIT ==========
  function init() {
    raceId = parseInt(getParam("race"), 10);
    if (!raceId) {
      renderError("Paramètre ?race= manquant ou invalide");
      return;
    }

    renderLoading();
    log("🚀 [INIT] Lancement GP " + raceId);
    log("[INFO] Base repo : " + baseRepo);

    loadRace(function (e) {
      if (e) {
        err("🟥 Erreur race : " + e.message);
        renderError("Erreur lors du chargement des données : " + e.message);
        return;
      }
      log("✅ sessions.json chargé avec succès");

      loadDrivers(function () {
        log("✅ drivers.json chargé");
        loadParticipants(function () {
          log("✅ participants.json chargé");
          renderRace();
        });
      });
    });
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init);
  else
    init();
})();
