# Installation

Installation sur un VPS, pour des agents qui tournent 24 h/24. Pour essayer sur ton ordinateur sans serveur : [installation-pc.md](installation-pc.md).

Les blocs `sur ton ordinateur` se tapent dans le Terminal de ton Mac ou PC (Linux/macOS ; sous Windows, utilise WSL). Les blocs `sur le VPS` se tapent une fois connecté en SSH.

---

## 1. Créer le VPS

Configuration recommandée, celle sur laquelle le Board a été testé : **Hetzner Cloud CX23**.

| Réglage | Valeur |
|---|---|
| Hébergeur | [Hetzner Cloud](https://console.hetzner.cloud) (compte, puis projet « Default ») |
| Type | Shared vCPU, **x86 (Intel/AMD)** ; « Cost-Optimized » ou « Regular Performance » selon ce qui est proposé |
| Modèle | **CX23** : 2 vCPU, 4 Go de RAM, 40 Go de disque, pour 3-4 agents en même temps |
| Prix | ≈ 6,60 € + 0,60 € d'IPv4 = **≈ 7,20 €/mois TTC** (octobre 2026), facturé à l'heure, sans engagement |
| Localisation | Falkenstein ou Nuremberg (Allemagne), ou Helsinki |
| Image | **Ubuntu 24.04** ou plus récent |
| Réseau | IPv4 publique cochée (nécessaire pour cloner depuis GitHub) |
| Clé SSH | la tienne (voir ci-dessous) |
| Nom | ce que tu veux, ex. `agents` |

- **Plus d'agents ?** **CX33** (4 vCPU, 8 Go, ≈ 12 €/mois) pour 6 agents ou plus. Hetzner change de modèle sans réinstaller : Rescale > « CPU and RAM only », et on peut revenir en arrière.
- **Arrêter les frais :** il faut **supprimer** le serveur (Servers > ton serveur > Delete). Un serveur éteint reste facturé.

Un autre hébergeur (OVH, DigitalOcean, Scaleway…) convient aussi, avec l'équivalent : Ubuntu, 2 vCPU, 4 Go de RAM, 40 Go de disque. Compte 200 à 300 Mo de RAM par console Claude.

Avant de créer le serveur, ajoute ta **clé SSH publique** dans l'interface de l'hébergeur (chez Hetzner : Security > SSH keys, ou directement à la création). Si tu n'en as pas :

```bash
# sur ton ordinateur
ssh-keygen -t ed25519 -f ~/.ssh/id_board -C board
cat ~/.ssh/id_board.pub        # à coller chez l'hébergeur
```

Ajoute un raccourci dans `~/.ssh/config` sur ton ordinateur. Les scripts du dossier `client/` utilisent l'alias `board` :

```
Host board
  HostName <IP_DU_VPS>
  User root
  IdentityFile ~/.ssh/id_board
```

Test : `ssh board` doit te connecter sans mot de passe.

**Durcissement conseillé** (le script d'installation active déjà le pare-feu et fail2ban) : désactive la connexion SSH par mot de passe.

```bash
# sur le VPS
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config && systemctl restart ssh
```

> Le Board lance des agents qui peuvent exécuter des commandes, surtout en mode « bypass ». Utilise un VPS **dédié** : n'y mets rien d'autre d'important.

---

## 2. Installer le Board

```bash
# sur le VPS
git clone https://github.com/<compte>/<depot>.git ~/agent-board
cd ~/agent-board
sudo bash deploy/install.sh
```

Le script installe dans l'ordre :

- Node.js 22, git, gh, outils de compilation ;
- Claude Code ;
- les dépendances du Board ;
- un service systemd `board`, qui démarre au boot et redémarre en cas de plantage ;
- le pare-feu : seul SSH est ouvert ;
- les dossiers `~/.config` (clés) et `~/memoire` (mémoire) ;
- un `~/.claude/CLAUDE.md` de départ et le rôle `Board`.

Vérification :

```bash
systemctl status board       # active (running)
cat ~/agent-board/.url       # http://127.0.0.1:4777/#<jeton>
```

Commandes utiles : `systemctl restart board`, `journalctl -u board -f` (logs), `bash scripts/restart-when-idle.sh` (redémarre sans couper un agent en plein travail).

**Mettre à jour :** `cd ~/agent-board && git pull && npm ci --omit=dev && bash scripts/restart-when-idle.sh`.

---

## 3. Connecter Claude Code (une seule fois)

```bash
# sur le VPS
claude
# puis tape /login : un lien s'affiche, ouvre-le sur ton ordinateur et valide avec ton compte Claude.
```

Les consoles du Board utilisent ensuite ce compte. Pour Codex ou Gemini, installe leur CLI (`npm i -g @openai/codex`, `npm i -g @google/gemini-cli`) et connecte-les de la même façon : le Board les détecte seul.

---

## 4. Ouvrir le Board depuis ton ordinateur

```bash
# sur ton ordinateur, dans une copie de ce dépôt
bash client/open-board.sh
```

Le script :

1. ouvre un tunnel SSH (port local `4790` vers `127.0.0.1:4777` sur le VPS) ;
2. lit le jeton dans `~/agent-board/.url` sur le VPS ;
3. ouvre une fenêtre Chrome en mode application.

Réglages par variables :

| Variable | Défaut | Rôle |
|---|---|---|
| `BOARD_SSH_HOST` | `board` | alias SSH du VPS |
| `BOARD_LOCAL_PORT` | `4790` | port local du tunnel (doit figurer dans `BOARD_TUNNEL_PORTS` du service) |
| `BOARD_REMOTE_DIR` | `~/agent-board` | dossier du Board sur le VPS |

**Raccourci macOS** (facultatif) : ouvre l'app Automator, crée une « Application » avec l'action « Exécuter un script shell » `bash ~/chemin/vers/client/open-board.sh`, puis enregistre-la dans `~/Applications`.

> Le jeton change à chaque redémarrage du service : relance `open-board.sh`.

---

## 5. Clés API (OpenAI, Apify, fal…)

Règle : **une clé = un fichier `~/.config/<service>.env` sur le VPS, en chmod 600, jamais dans un dépôt git.**

```bash
# sur le VPS : crée le fichier sans que la clé passe dans l'historique du shell
nano ~/.config/openai.env       # écris : OPENAI_API_KEY=sk-...
chmod 600 ~/.config/openai.env
```

Modèle : `examples/service.env.example`. Le `~/.claude/CLAUDE.md` installé à l'étape 2 dit déjà aux agents où trouver les clés et de **ne jamais les afficher**. Pour qu'un agent les charge :

```bash
set -a; . ~/.config/openai.env; set +a
```

Vérifier qu'une clé est présente **sans l'afficher** :

```bash
grep -c '^OPENAI_API_KEY=.\+' ~/.config/openai.env      # 1 = présente
```

---

## 6. Mémoire partagée (coffre Obsidian)

Les agents lisent et écrivent leurs notes dans `~/memoire` sur le VPS. Si tu veux voir et modifier ces notes dans Obsidian sur ton ordinateur, synchronise ce dossier avec un coffre local.

1. **Crée un coffre** dans Obsidian (ou choisis-en un existant), par exemple `~/Obsidian/Agents`. Une note = un fichier `.md`, et les liens `[[nom-de-note]]` forment le graphe.
2. **Synchro** depuis ton ordinateur. Le script fait l'aller-retour : les notes écrites par les agents remontent, tes modifications descendent.
   ```bash
   VAULT=~/Obsidian/Agents bash client/sync-memoire.sh
   ```
3. **Automatiser** toutes les 15 min avec `crontab -e` (ou launchd sur macOS) :
   ```
   */15 * * * * VAULT=$HOME/Obsidian/Agents bash $HOME/agent-board/client/sync-memoire.sh
   ```
   macOS bloque launchd et cron sur le Bureau, Documents et Téléchargements : place le dépôt et le coffre ailleurs.
4. **Brancher les agents** : `~/.claude/CLAUDE.md` sur le VPS pointe déjà vers `~/memoire`. Si tu tiens un index (`MEMORY.md`, une ligne par note), décommente la ligne `@…/MEMORY.md` à la fin : il sera chargé au début de chaque conversation.
5. Dans le Board, la tuile **Mémoire** (rail droit) affiche le coffre en lecture seule. Le dossier se change avec `BOARD_MEMORY_DIR` dans `/etc/systemd/system/board.service`.

Règles de la synchro : l'**ordinateur est la référence**. Une suppression se fait sur l'ordinateur ; si on supprime côté VPS, la synchro recrée la note. Si une note change des deux côtés entre deux synchros, la version du VPS gagne.

---

## 7. (Optionnel) Les agents pilotent ton Chrome

Le VPS n'a pas de navigateur. Le Board lance chaque console Claude avec `--chrome`, ce qui relie l'agent à **l'extension Claude in Chrome de ton ordinateur**. L'agent peut alors lire une page, remplir un formulaire, faire une capture, etc.

1. Installe l'extension « Claude in Chrome » dans Chrome, sur ton ordinateur, et connecte-la au **même compte Claude** que le VPS.
2. Garde l'ordinateur allumé avec Chrome ouvert pendant que les agents en ont besoin.
3. Tu ne veux pas de ce pont ? Ajoute `Environment=BOARD_CHROME=0` au service, puis `systemctl daemon-reload && systemctl restart board`.

> L'agent agit avec **tes** sessions Chrome. Donne-lui des consignes claires sur ce qu'il a le droit de faire, dans son rôle (`data/roles/<Nom>.md`) ou dans `~/.claude/CLAUDE.md`.

---

## Dépannage

| Symptôme | Cause / solution |
|---|---|
| Page blanche ou erreur 403 | Jeton périmé après redémarrage : relance `client/open-board.sh`. Port local différent de 4790 : ajoute-le à `BOARD_TUNNEL_PORTS`. |
| « Tunnel SSH impossible » | `ssh board` doit marcher seul. Un ancien tunnel occupe le port : `pkill -f "4790:127.0.0.1"`. |
| Les consoles Claude ne démarrent pas | Claude Code non connecté (étape 3), ou `claude` absent du PATH du service (`ls -l /usr/local/bin/claude`). |
| Statut toujours gris | Les hooks sont désactivés (Settings > Hooks) ou `curl` est absent. |
| RAM pleine | Baisse le plafond d'agents (Settings) ou passe à un VPS de 8 Go. |
