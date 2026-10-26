#!/bin/bash
# Arrête le serveur Board lancé par start.sh (tue aussi ses terminaux ; le tableau est gardé dans data/).
DIR="$(cd "$(dirname "$0")" && pwd)"
pkill -f "node $DIR/server.js" && echo "Board arrêté" || echo "Board ne tournait pas"
