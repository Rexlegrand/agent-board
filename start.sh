#!/bin/bash
# Installation sur PC (sans VPS) : lance le serveur Board s'il ne tourne pas, puis ouvre Chrome en mode app.
# Usage : ./start.sh            (ouvre Chrome)
#         ./start.sh --no-open  (affiche seulement l'URL)
# Réglages : BOARD_PORT (défaut 4777), BOARD_MEMORY_DIR (coffre Obsidian, défaut ~/memoire).
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"
PORT="${BOARD_PORT:-4777}"
NODE="$(command -v node)"
[ -z "$NODE" ] && [ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null && NODE="$(command -v node)"
[ -z "$NODE" ] && { echo "Node.js introuvable : installe Node 20+ (https://nodejs.org)"; exit 1; }

if ! curl -s -o /dev/null --max-time 1 "http://127.0.0.1:$PORT/" || [ ! -s .url ]; then
  # Shell de login : les consoles héritent du PATH complet (claude, git…)
  nohup "${SHELL:-/bin/bash}" -l -c "exec '$NODE' '$DIR/server.js'" >> "$DIR/server.log" 2>&1 &
  for i in $(seq 1 50); do [ -s .url ] && curl -s -o /dev/null --max-time 1 "http://127.0.0.1:$PORT/" && break; sleep 0.2; done
fi
[ -s .url ] || { echo "Le serveur ne démarre pas, voir server.log"; exit 1; }
[ "$1" = "--no-open" ] && { cat .url; echo; exit 0; }

URL="$(cat .url)"
if [ "$(uname)" = Darwin ]; then
  open -na "Google Chrome" --args --app="$URL"
else
  (google-chrome --app="$URL" || chromium --app="$URL" || xdg-open "$URL") >/dev/null 2>&1 &
fi
