#!/bin/bash
# Synchro du coffre Obsidian (mémoire) ordinateur <-> VPS. L'ordinateur est la référence.
# 1) remonte les notes créées/modifiées sur le VPS (par les agents) depuis la dernière synchro ;
# 2) pousse l'ordinateur vers le VPS (--delete : une suppression se fait sur l'ordinateur).
# ponytail: si la même note change des deux côtés entre deux synchros, la version VPS gagne.
# Réglages : VAULT (coffre local), BOARD_SSH_HOST (défaut « board »), REMOTE_VAULT (défaut ~/memoire).
VAULT="${VAULT:?Indique le coffre local, ex. VAULT=~/Obsidian/MonCoffre}"
HOST="${BOARD_SSH_HOST:-board}"
REMOTE="${REMOTE_VAULT:-memoire}"
SSH="ssh -o ConnectTimeout=10 -o BatchMode=yes"
LIST="$(mktemp)"; trap 'rm -f "$LIST"' EXIT

$SSH "$HOST" "mkdir -p $REMOTE && touch -a $REMOTE/.last-sync" || exit 1
$SSH "$HOST" "cd $REMOTE && find . -type f -newer .last-sync ! -name .last-sync ! -path './.obsidian/*' -print0" > "$LIST"
[ -s "$LIST" ] && rsync -az --from0 --files-from="$LIST" -e "$SSH" "$HOST:$REMOTE/" "${VAULT%/}/"
rsync -az --delete --exclude '.obsidian/workspace*' --exclude '.last-sync' -e "$SSH" "${VAULT%/}/" "$HOST:$REMOTE/"
$SSH "$HOST" "touch $REMOTE/.last-sync"
