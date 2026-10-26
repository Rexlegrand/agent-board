# Fonctionnement

## L'écran

| Zone | Contenu |
|---|---|
| Barre du haut | Retour à l'accueil, dépôt et espaces de travail en onglets (double-clic = renommer), Close (archive dans `data/archive`, jamais effacé), RAM libre, usage du jour, Tools, Settings |
| Barre gauche | Sélection, Agent (une vingtaine de CLI ; celles qui ne sont pas installées sont grisées), Formes, Texte, Encre, Gomme, Web, Image, Tout voir |
| Rail droit | To-do (checklist, kanban, calendrier), Orchestrator, Markdown du dépôt, Mémoire (lecture seule), tuile web, usage |
| Bas | New console, Spawn 4, Group, Orchestrator, Pause all, Resume all ; barre de commande ; fil Thread ; pastille Git |

**Barre de commande** (en bas) :
- `@Nova fais X` écrit dans une console, `@groupe …` dans un groupe, `@all …` partout ;
- `spawn 3 claude` ou `spawn codex` lance des consoles ;
- `- Nova, fais X - Leo, fais Y` envoie un message à chaque console nommée ;
- `help` affiche l'aide.

Une phrase sans `@` part à la console sélectionnée, sinon à la console **Board**, lancée au besoin avec le rôle `data/roles/Board.md`.

**Raccourcis :**
- ⌘ Entrée : console ; ⌘ ⇧ Entrée : terminal ; ⌘ G : Git ; ⌘ 0 : tout voir ; ⌘ K : commande ; ⌘ D : dupliquer ; Suppr : effacer.
- Lettres V A R O D L X T P E W I N : les outils.
- `?` : aide complète.

## Statut en direct

- **Claude** est lancé avec `--settings data/hooks/claude-hooks.json`, un fichier propre au Board : ton `~/.claude/settings.json` n'est jamais touché.
- **Codex** : `-c notify=…`.
- **Autres CLI** : activité de la sortie.

États : **working**, **needs you**, **ready**. En fin de tâche, le Board joue un bip et affiche une pop-up en bas à droite ; un clic dessus mène à la console. Le bip se coupe dans Tools.

## Rôles d'agents

Un fichier `data/roles/<Nom>.md` = un rôle. Toute console qui s'appelle `<Nom>` (ou `<Nom> 2`, `<Nom> 3`…) le reçoit en consigne système au lancement. Modèle : `examples/roles/Exemple.md`. Renommer une console : double-clic sur son titre.

## Tuiles que les agents remplissent

Le Board donne à chaque console Claude une consigne qui explique où écrire. La tuile s'ouvre seule à côté de la console et se redessine à chaque écriture.

| L'agent écrit… | Le Board affiche… |
|---|---|
| `data/diagrams/<nom>.mmd` (Mermaid) | un diagramme ; tes annotations sur les nœuds repartent à l'agent |
| `data/todos/<nom>.json` | une checklist, un kanban ou un calendrier ; quand tu coches, le fichier est réécrit |
| des images ou vidéos dans `data/images/<lot>/` | une grille : clic = cocher, double-clic = plein écran, « Envoyer à Claude » renvoie les numéros choisis |

Une image collée ou glissée sur le tableau peut être **reliée** à une console (bouton Connect) : son chemin est tapé dans l'invite.

## Mode bypass

Settings > « yolo » lance les agents sans demande de permission (`--dangerously-skip-permissions` pour Claude). C'est pratique sur un VPS dédié, mais l'agent peut alors tout faire sur le serveur. Mets les limites dans son rôle : rien de payant, d'irréversible ni de public sans accord.

## Reprise

Au redémarrage du service, les shells repartent seuls. Les consoles Claude et Codex proposent « Resume all conversations? » : elles reprennent leur conversation (`claude --resume <id>`).

## Scripts

| Script | Usage |
|---|---|
| `scripts/send-when-idle.sh <id> /chemin/message.txt` | envoie un message à une console quand elle est au repos (90 s sans activité) |
| `scripts/restart-when-idle.sh` | redémarre le Board quand plus aucun agent ne travaille (après un `git pull`) |
| `client/open-board.sh` | ouvre le tunnel et Chrome (côté ordinateur) |
| `client/sync-memoire.sh` | synchronise le coffre Obsidian (côté ordinateur) |
| `start.sh` / `stop.sh` | lancer ou arrêter le Board sur ton PC, sans VPS (voir installation-pc.md) |

## Variables d'environnement du serveur

| Variable | Défaut | Rôle |
|---|---|---|
| `BOARD_PORT` | `4777` | port d'écoute (toujours sur 127.0.0.1) |
| `BOARD_TUNNEL_PORTS` | (vide) | ports locaux du tunnel acceptés, ex. `4790` (protection anti DNS-rebinding) |
| `BOARD_MEMORY_DIR` | `~/memoire` | coffre affiché par la tuile Mémoire |
| `BOARD_CHROME` | `1` | `0` = ne pas relier les consoles Claude à Claude in Chrome |
| `BOARD_DATA` | `./data` | données du tableau (consoles, to-do, images…) |

## Garde-fous

- Plafond d'agents simultanés : 10 par défaut (Settings).
- Le serveur n'écoute que `127.0.0.1`. Un jeton aléatoire, régénéré à chaque démarrage, est exigé pour l'API, le WebSocket et les images.
- Un push Git demande toujours une confirmation. Un nouveau dépôt GitHub est créé en **privé**.
- La jauge d'usage lit le jeton de connexion de Claude Code (`~/.claude/.credentials.json`) côté serveur. Il n'est jamais envoyé au navigateur.

## Tuile Musique

Elle a besoin d'une application native qui fournit un pont `yt-dlp`. Cette app n'est pas incluse. Sans elle, la tuile affiche un message et un lien FreeTube.
