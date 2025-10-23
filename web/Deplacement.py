import os
import shutil
from datetime import datetime

# === PARAMÈTRES UTILISATEUR ===
BASE_DIR = r"C:\Users\cydem\Documents\ImportDataF1"
SRC_DIR = os.path.join(BASE_DIR, "f1datadrive-data", "seasons")
DEST_DIR = os.path.join(BASE_DIR, "GitHub_SubRepos")
LOG_DIR = os.path.join(BASE_DIR, "Logs")
os.makedirs(LOG_DIR, exist_ok=True)

LOG_PATH = os.path.join(LOG_DIR, f"reorg_races_{datetime.now():%Y%m%d_%H%M%S}.txt")

# === FICHIERS À CONSERVER ===
FILES_TO_COPY = ["sessions.json", "grid.json", "perftime.json", "resume.json"]

# === ROUTAGE SELON race_id ===
def get_target_repo(race_id: int) -> str:
    if race_id <= 500:
        return os.path.join(DEST_DIR, "f1data-races-1-500", "races")
    elif race_id <= 1000:
        return os.path.join(DEST_DIR, "f1data-races-501-1000", "races")
    else:
        return os.path.join(DEST_DIR, "f1data-races-1001-1500", "races")

# === OUTILS ===
def safe_copy(src_file, dest_file):
    os.makedirs(os.path.dirname(dest_file), exist_ok=True)
    shutil.copy2(src_file, dest_file)

# === EXÉCUTION ===
def main():
    moved, skipped = [], []
    with open(LOG_PATH, "w", encoding="utf-8") as log:
        log.write(f"=== Réorganisation des dossiers F1DataDrive ===\n")
        log.write(f"Date : {datetime.now():%Y-%m-%d %H:%M:%S}\n")
        log.write(f"Source : {SRC_DIR}\n\n")

        for year in sorted(os.listdir(SRC_DIR)):
            year_path = os.path.join(SRC_DIR, year, "races")
            if not os.path.isdir(year_path):
                continue

            for race_id_str in os.listdir(year_path):
                race_path = os.path.join(year_path, race_id_str)
                if not os.path.isdir(race_path):
                    continue

                try:
                    race_id = int(race_id_str)
                except ValueError:
                    log.write(f"[WARN] {race_id_str} ignoré (non numérique)\n")
                    skipped.append(race_id_str)
                    continue

                target_repo = get_target_repo(race_id)
                target_path = os.path.join(target_repo, str(race_id))
                os.makedirs(target_path, exist_ok=True)

                copied = 0
                for f in FILES_TO_COPY:
                    src_file = os.path.join(race_path, f)
                    if os.path.exists(src_file):
                        safe_copy(src_file, os.path.join(target_path, f))
                        copied += 1

                if copied:
                    log.write(f"[{race_id}] → Copié vers {os.path.basename(os.path.dirname(target_repo))} ({copied} fichiers)\n")
                    moved.append((race_id, copied))
                else:
                    log.write(f"[{race_id}] → Aucun fichier trouvé\n")
                    skipped.append(race_id)

        log.write(f"\n=== RÉSUMÉ ===\n")
        log.write(f"Total courses copiées : {len(moved)}\n")
        log.write(f"Total ignorées : {len(skipped)}\n")

    print(f"✅ Réorganisation terminée — log : {LOG_PATH}")

if __name__ == "__main__":
    main()
