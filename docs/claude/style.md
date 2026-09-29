<!-- Extrait de CLAUDE.md, déplacé le 2026-09-26 (texte copié à l'identique, rien supprimé). Index : CLAUDE.md -->

## 10. Style et compte-rendu

> 📣 Forme des comptes-rendus, des commits, des PR et des docs générées :
> [convention commune aux neuf dépôts](https://github.com/MoKarade/claude-config/blob/main/conventions/COMPTE-RENDU.md).
> Elle régit **la forme** ; ce fichier garde **le contenu métier**. Sur la forme, c'est la
> convention qui gagne ; sur le métier, c'est ce fichier.

@docs/COMPTE-RENDU.md

⚠️ **Pourquoi une COPIE et pas seulement un lien.** Un `CLAUDE.md` ne charge rien hors de son
propre arbre : le lien ci-dessus est lisible par un humain, il n'arrive jamais dans la session.
C'est exactement le mode de panne du 20/08/2026 — les règles de cadrage écrites dans un
`~/.claude/CLAUDE.md` local ne descendaient nulle part, et Marc constatait « je ne vois pas la
différence » alors que rien n'était jamais arrivé. `docs/COMPTE-RENDU.md` est donc une copie
**synchronisée**, importée ci-dessus, et la CI échoue si elle a dérivé de la source.

Pour changer la convention : la changer dans `claude-config`, propager les huit copies, mettre
à jour les huit empreintes. La friction est le garde-fou — une copie qu'on peut modifier sur
place redevient huit conventions différentes en trois mois.

### Propre à ce dépôt

- **`[YYYY-MM-DD HH:MM UTC]` en tête de CHAQUE réponse** (via `date`), sans exception.
- **Qualité d'abord, coût tokens NON contraint** : passes multiples, panels d'agents, vérifs
  exhaustives. Seule limite = le SIGNAL (pas de bruit que personne ne lira). Pas de stub ni de
  « TODO plus tard » non demandé.
  ⚠️ Cette règle porte sur l'**effort**, pas sur le volume écrit. Le « ~15 lignes » de la
  convention (§4) décrit le RAPPORT, pas la recherche. Chercher moins pour écrire moins serait
  exactement l'inverse de ce qui est demandé ici (arbitrage Marc, 21/08/2026).

