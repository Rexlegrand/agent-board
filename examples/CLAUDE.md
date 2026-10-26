# Claude sur le VPS (Board)

## Mémoire
- La mémoire partagée (coffre Obsidian) est ici : `__HOME__/memoire/` (index : `__HOME__/memoire/MEMORY.md` si tu en tiens un).
- Au début d'un chat : lire l'index puis les notes utiles à la tâche.
- Nouvelle note ou note corrigée : l'écrire dans `__HOME__/memoire/` (une idée = un fichier). Elle remonte sur l'ordinateur à la prochaine synchro.
- Ne jamais supprimer une note ici : la suppression se fait sur l'ordinateur (sinon la synchro la recrée).

## Clés API
- Une clé = un fichier `~/.config/<service>.env` (chmod 600). Les charger avec `set -a; . ~/.config/<service>.env; set +a`.
- Ne jamais afficher une clé, ni dans le terminal ni dans un fichier.

# Décommente si tu tiens un index dans le coffre :
# @__HOME__/memoire/MEMORY.md
