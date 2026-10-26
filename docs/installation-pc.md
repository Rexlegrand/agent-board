# Installation sur ton PC (sans VPS)

Le plus simple pour essayer : tout tourne sur ton ordinateur, sans serveur ni tunnel. Tu passeras sur un VPS ([installation.md](installation.md)) quand tu voudras des agents qui travaillent 24 h/24, même ordinateur éteint.

| | PC | VPS |
|---|---|---|
| Coût | 0 € | ≈ 7 €/mois |
| Agents actifs ordinateur éteint | non | oui |
| Installation | 5 min | 20 min |
| Mémoire Obsidian | le coffre directement | coffre synchronisé |

Systèmes : **macOS** et **Linux**. Sous **Windows**, installe d'abord WSL2 (`wsl --install` dans PowerShell en administrateur), puis suis la partie Linux dans le terminal Ubuntu.

---

## 1. Prérequis

- **Node.js 20 ou plus** : https://nodejs.org (version LTS). Vérifie avec `node -v`.
- **Git** :
  - macOS : `xcode-select --install`, qui installe aussi les outils de compilation ;
  - Linux / WSL : `sudo apt install -y git build-essential python3 curl`.
- **Claude Code** : `curl -fsSL https://claude.ai/install.sh | bash`, puis `claude` et `/login` une fois.
- **Google Chrome**, pour la fenêtre du Board.

## 2. Installer

```bash
git clone https://github.com/<compte>/<depot>.git ~/agent-board
cd ~/agent-board
npm ci --omit=dev
mkdir -p data/roles && cp examples/roles/Board.md data/roles/
```

## 3. Lancer et arrêter

```bash
./start.sh       # démarre le serveur et ouvre la fenêtre Chrome
./stop.sh        # arrête le serveur ; le tableau est gardé dans data/
```

- `./start.sh --no-open` affiche seulement l'URL (avec le jeton).
- Port occupé ? `BOARD_PORT=4800 ./start.sh`.
- Logs : `server.log`.

**Raccourci macOS** (facultatif) : Automator > Application > « Exécuter un script shell » `~/agent-board/start.sh`, à enregistrer dans `~/Applications` puis à glisser dans le Dock.

## 4. Mémoire (coffre Obsidian)

Pas de synchro sur PC : le Board lit directement ton coffre.

```bash
BOARD_MEMORY_DIR=~/Obsidian/MonCoffre ./start.sh
```

Pour que les agents s'en servent, crée ou complète `~/.claude/CLAUDE.md` à partir de `examples/CLAUDE.md` : remplace `__HOME__/memoire` par le chemin de ton coffre.

## 5. Clés API

Même règle que sur VPS : un fichier `~/.config/<service>.env`, en `chmod 600`, jamais dans un dépôt. Voir [installation.md, étape 5](installation.md#5-clés-api-openai-apify-fal).

## 6. Chrome

Sur PC, l'extension **Claude in Chrome** marche directement : les agents pilotent le Chrome de la même machine.

---

## Passer du PC au VPS plus tard

Suis [installation.md](installation.md). Pour garder tes rôles et tes tableaux, copie le dossier `data/` vers le VPS :

```bash
rsync -a ~/agent-board/data/ board:~/agent-board/data/
```

Ensuite, sur le VPS : `systemctl restart board`.
