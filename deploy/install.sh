#!/bin/bash
# Installe le Board sur un VPS Ubuntu/Debian neuf (à lancer depuis le dossier du dépôt cloné).
# Usage : sudo bash deploy/install.sh        (installe pour l'utilisateur courant, root accepté)
set -euo pipefail

BOARD_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RUN_USER="${SUDO_USER:-$(id -un)}"
RUN_HOME="$(getent passwd "$RUN_USER" | cut -d: -f6)"
TUNNEL_PORT="${BOARD_TUNNEL_PORTS:-4790}"

[ "$(id -u)" = 0 ] || { echo "Lance ce script avec sudo (ou en root)."; exit 1; }

echo "== Paquets système"
apt-get update -q
apt-get install -yq curl git ca-certificates build-essential python3 tmux ufw fail2ban unattended-upgrades

echo "== Node.js 22"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -yq nodejs
fi

echo "== GitHub CLI (optionnel, pour la pastille Git du Board)"
command -v gh >/dev/null || apt-get install -yq gh || echo "gh non installé : la partie GitHub du Board sera grisée."

echo "== Claude Code"
if ! sudo -u "$RUN_USER" -i bash -lc 'command -v claude' >/dev/null 2>&1; then
  sudo -u "$RUN_USER" -i bash -lc 'curl -fsSL https://claude.ai/install.sh | bash'
fi
CLAUDE_BIN="$(sudo -u "$RUN_USER" -i bash -lc 'command -v claude' || true)"
[ -n "$CLAUDE_BIN" ] && ln -sf "$CLAUDE_BIN" /usr/local/bin/claude

echo "== Dépendances du Board"
chown -R "$RUN_USER" "$BOARD_DIR"
sudo -u "$RUN_USER" bash -c "cd '$BOARD_DIR' && npm ci --omit=dev"

echo "== Dossiers clés + mémoire"
sudo -u "$RUN_USER" mkdir -p "$RUN_HOME/.config" "$RUN_HOME/memoire"
chmod 700 "$RUN_HOME/.config"
sudo -u "$RUN_USER" mkdir -p "$BOARD_DIR/data/roles"
sudo -u "$RUN_USER" cp -n "$BOARD_DIR"/examples/roles/Board.md "$BOARD_DIR/data/roles/" 2>/dev/null || true
[ -f "$RUN_HOME/.claude/CLAUDE.md" ] || { sudo -u "$RUN_USER" mkdir -p "$RUN_HOME/.claude"; sed "s#__HOME__#$RUN_HOME#g" "$BOARD_DIR/examples/CLAUDE.md" | sudo -u "$RUN_USER" tee "$RUN_HOME/.claude/CLAUDE.md" >/dev/null; }

echo "== Service systemd"
sed -e "s#__USER__#$RUN_USER#g" -e "s#__HOME__#$RUN_HOME#g" -e "s#__DIR__#$BOARD_DIR#g" -e "s#__TUNNEL__#$TUNNEL_PORT#g" \
  "$BOARD_DIR/deploy/board.service" > /etc/systemd/system/board.service
systemctl daemon-reload
systemctl enable --now board

echo "== Pare-feu : SSH seulement (le Board n'écoute que 127.0.0.1)"
ufw allow OpenSSH >/dev/null
ufw --force enable >/dev/null
systemctl enable --now fail2ban >/dev/null

sleep 2
if systemctl is-active --quiet board; then
  echo
  echo "Board installé et démarré (127.0.0.1:4777, jamais exposé sur internet)."
  echo "Étapes suivantes :"
  echo "  1. Connecte Claude Code une fois :   sudo -u $RUN_USER -i claude   puis /login"
  echo "  2. Sur ton ordinateur : client/open-board.sh (voir docs/installation.md, étape 4)"
else
  echo "Le service ne démarre pas : journalctl -u board -n 50"; exit 1
fi
