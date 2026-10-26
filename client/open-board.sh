#!/bin/bash
# Ouvre le Board du VPS depuis ton ordinateur (macOS ou Linux) : tunnel SSH privé puis fenêtre Chrome.
# Rien n'est exposé sur internet : le Board écoute 127.0.0.1 sur le VPS, on y accède par le tunnel.
# Usage : client/open-board.sh            (ouvre Chrome)
#         client/open-board.sh --url      (affiche seulement l'URL)
# Réglages : BOARD_SSH_HOST (alias de ~/.ssh/config, défaut « board »), BOARD_LOCAL_PORT (défaut 4790),
#            BOARD_REMOTE_DIR (dossier du Board sur le VPS, défaut ~/agent-board).
HOST="${BOARD_SSH_HOST:-board}"
PORT="${BOARD_LOCAL_PORT:-4790}"
REMOTE_DIR="${BOARD_REMOTE_DIR:-~/agent-board}"

if ! curl -s -o /dev/null --max-time 1 "http://127.0.0.1:$PORT/"; then
  ssh -fN -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o ConnectTimeout=10 \
    -L "$PORT:127.0.0.1:4777" "$HOST" || { echo "Tunnel SSH impossible vers $HOST"; exit 1; }
  sleep 1
fi
TOKEN=$(ssh -o ConnectTimeout=10 "$HOST" "cut -d'#' -f2 $REMOTE_DIR/.url")
[ -n "$TOKEN" ] || { echo "Jeton introuvable : le Board tourne-t-il ? (ssh $HOST systemctl status board)"; exit 1; }
URL="http://127.0.0.1:$PORT/#$TOKEN"
[ "$1" = "--url" ] && { echo "$URL"; exit 0; }

if [ "$(uname)" = Darwin ]; then
  open -na "Google Chrome" --args --app="$URL"
else
  (google-chrome --app="$URL" || chromium --app="$URL" || xdg-open "$URL") >/dev/null 2>&1 &
fi
