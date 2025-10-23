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
        // Points de cette course uniquement
        // Si les points fournis sont cumulatifs, on les convertit en points gagnés
        let earned = pts;
        if (roundNum > 1) {
          const prev = drivers[id].results[roundNum - 2] || 0;
          const prevCumul = drivers[id].cumul || 0;
          earned = pts - prevCumul;
        }
        drivers[id].results[roundNum - 1] = earned;
        drivers[id].cumul = pts; // mémorise le cumul officiel pour calcul suivant

        // On recalculera le total plus tard (plus bas)
      });

      // Pilotes absents : laisser 0 (pas de points)
      Object.keys(drivers).forEach(id => {
        if (typeof drivers[id].results[roundNum - 1] === 'undefined') {
          drivers[id].results[roundNum - 1] = 0;
        }
      });
    });

        // 🔹 Recalcul du total pour chaque pilote
    Object.values(drivers).forEach(p => {
      p.total = p.results.reduce((sum, v) => sum + (Number(v) || 0), 0);
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

    // === En-tête dynamique ===
    const thead = document.createElement("thead");
    const hdr = document.createElement("tr");

    // On détermine le nombre maximum de courses (selon la manche en cours)
    const currentRound = Math.max(...json.rounds.map(r => Number(r.round) || 0));
    const maxRounds = currentRound || json.rounds.length || 0;

    // Création de l’en-tête dynamique
    ["Cla", "Pilote", ...Array.from({ length: maxRounds }, (_, i) => (i + 1).toString()), "Points"]
    .forEach(label => {
        const th = document.createElement("th");
        th.textContent = label;
        hdr.appendChild(th);
    });

    thead.appendChild(hdr);
    table.appendChild(thead);

    // === Corps du tableau ===
    const tbody = document.createElement("tbody");

    Object.values(drivers)
    .sort((a, b) => b.total - a.total)
    .forEach((p, idx) => {
        const tr = document.createElement("tr");

        // Colonne classement
        const tdRank = document.createElement("td");
        tdRank.textContent = idx + 1;
        tr.appendChild(tdRank);

        // Colonne pilote
        const tdDriver = document.createElement("td");
        tdDriver.textContent = p.name;
        tr.appendChild(tdDriver);

        // Colonnes par manche (seulement jusqu'à la course actuelle)
        for (let i = 0; i < maxRounds; i++) {
        const td = document.createElement("td");
        td.textContent = p.results[i] ?? "";
        tr.appendChild(td);
        }

        // Total final
        const tdTotal = document.createElement("td");
        tdTotal.textContent = p.total;
        tr.appendChild(tdTotal);

        tbody.appendChild(tr);
    });

    table.appendChild(tbody);
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
