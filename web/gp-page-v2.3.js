console.log("🟢 gp-page-v2.3.js – MODE DEBUG (races 1–500 uniquement)");

async function loadRaceData(raceId) {
  try {
    const url = `https://cdn.jsdelivr.net/gh/menditeguy/f1data-races-1-500@main/races/${raceId}/sessions.json`;
    console.log(`🔍 Tentative de chargement : ${url}`);

    const response = await fetch(url);
    console.log(`📡 Statut réponse : ${response.status}`);

    if (!response.ok) throw new Error(`Erreur HTTP ${response.status}`);

    const data = await response.json();
    console.log("✅ JSON chargé :", data);

    if (!data.sessions || data.sessions.length === 0) {
      console.warn("⚠️ Aucune session trouvée pour ce GP.");
      document.querySelector("#sessionSelect").innerHTML =
        "<option>Aucune session disponible</option>";
      return;
    }

    // Remplir le menu déroulant avec les sessions
    const sessionSelect = document.querySelector("#sessionSelect");
    sessionSelect.innerHTML = "";

    data.sessions.forEach((session) => {
      const option = document.createElement("option");
      option.value = session.code;
      option.textContent = session.name;
      sessionSelect.appendChild(option);
    });

    console.log("🟩 Liste des sessions affichée.");
  } catch (error) {
    console.error("🟥 Erreur lors du chargement des données :", error);
    document.querySelector("#sessionSelect").innerHTML =
      "<option>Erreur de chargement</option>";
  }
}

// === Lancement automatique au chargement de la page ===
document.addEventListener("DOMContentLoaded", () => {
  console.log("🚀 Page chargée, lancement du debug...");
  const params = new URLSearchParams(window.location.search);
  const raceId = params.get("race");

  if (!raceId) {
    console.warn("⚠️ Aucun race_id dans l’URL");
    return;
  }

  console.log(`🏁 Chargement du Grand Prix ${raceId}`);
  loadRaceData(raceId);
});
