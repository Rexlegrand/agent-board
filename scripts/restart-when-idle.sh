#!/bin/bash
# Redémarre le Board (après une mise à jour du code) sans couper un agent au milieu d'une tâche :
# attend que toutes les consoles Claude soient au repos (120 s sans écriture), max 3 h.
# Au redémarrage, le Board propose « Resume all » : les conversations reprennent là où elles étaient.
for i in $(seq 1 360); do
  busy=0
  for s in $(ps -eo args | grep -oE "claude --(resume|session-id) [0-9a-f-]+" | cut -d" " -f3); do
    p=$(ls "$HOME"/.claude/projects/*/"$s".jsonl 2>/dev/null | head -1); [ -n "$p" ] || continue
    [ $(( $(date +%s) - $(stat -c %Y "$p") )) -lt 120 ] && busy=1
  done
  [ $busy = 0 ] && { echo "calme $(date)"; exec sudo systemctl restart board; }
  sleep 30
done
echo "abandon $(date)"
