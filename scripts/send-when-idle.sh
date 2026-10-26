#!/bin/bash
# Envoie un message à une console Claude du Board quand elle est au repos (90 s sans écriture de sa conversation, max 4 h).
# Usage : scripts/send-when-idle.sh <id-console> /chemin/absolu/message.txt
# L'id d'une console : clé de data/repos/*.json > agents (le champ name donne son nom).
set -e
ID=$1; MSG=$(realpath "$2"); cd "$(dirname "$0")/.."
SID=$(python3 -c "import json,glob,sys
for f in glob.glob('data/repos/*.json'):
  a=json.load(open(f)).get('agents',{}).get(sys.argv[1])
  if a: print(a.get('sessionId',''))" "$ID")
[ -n "$SID" ] || { echo "Console $ID introuvable"; exit 1; }
J=$(ls "$HOME"/.claude/projects/*/"$SID".jsonl 2>/dev/null | head -1)
for i in $(seq 1 1440); do
  [ -z "$J" ] || [ $(( $(date +%s) - $(stat -c %Y "$J") )) -ge 90 ] && break; sleep 10
done
TOK=$(sed 's/.*#//' .url)
python3 -c "import json,sys;print(json.dumps({'text':open(sys.argv[1]).read().strip()}))" "$MSG" \
  | curl -s -X POST -H "x-token: $TOK" -H "Content-Type: application/json" --data-binary @- "http://127.0.0.1:${BOARD_PORT:-4777}/api/agents/$ID/send"
echo " envoyé $(date)"
