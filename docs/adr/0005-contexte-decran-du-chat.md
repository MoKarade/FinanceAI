# ADR — Contexte d'écran du chat : injection `system` figée par envoi, PAS un tool (`CHAT-PAGE-CONTEXT`, 2026-07-22)
**Statut** : accepté (OK Marc donné d'avance, plan architect 2026-07-22).

**Contexte** : le chat in-app doit savoir ce que l'utilisateur regarde (onglet, période, chiffres
affichés) pour répondre à « explique-moi ce chiffre » — sans jamais recalculer un montant déjà
affiché (« jamais un 3e chiffre »), sans fuiter en mode discret, et avec un contexte FIGÉ au moment
de l'envoi (naviguer pendant la réponse ne doit pas la faire dériver).

**Décision** : registre pur `services/aiChat/viewContext.ts` (Tier 1 = onglet actif, gratuit,
partout ; Tier 2 = détail publié par les pages instrumentées via `useViewContextPublisher`, gate
mode discret À LA SOURCE). La ligne « CONTEXTE ÉCRAN » est construite en SYNCHRONE au démarrage de
`sendMessage` (avant tout await) et injectée en FIN de `system` prompt (`buildAgentSystemPrompt`,
param additif). Aucun nouveau tool.

**Pourquoi** : `system` est structurellement figé pour toute la boucle agentique (calculé une fois
par envoi, jamais relu) = exactement le contrat de fraîcheur voulu, zéro code de fraîcheur neuf.
Un tool serait relu à CHAQUE tour (jusqu'à 6) → une navigation mi-envoi ferait dériver le contexte.
Et le registre de tools (`READ_SPECS`) est partagé app↔MCP par construction (AITOOLS-A, verrouillé
par `registryParity`) — un tool app-only casserait cette frontière pour un contenu qui tient en une
ligne compacte (moins cher en tokens qu'un aller-retour tool_use/tool_result).

**Trade-offs** : la ligne est renvoyée sur chaque tour de la boucle (bornée : top 3 catégories,
montants arrondis). ⚠️ MAJ commit de suivi (finding ai-reviewer) : le split en blocs est FAIT —
`buildAgentSystemBlocks` = préfixe statique AVEC `cache_control` ephemeral + ligne dynamique
séparée (un `system` string variable invalidait le préfixe de cache entier, pièces jointes
incluses) ; livre l'essentiel d'`[AITOOLS-PROMPT-CACHE]`. Résiduel assumé : l'entrée de cache des
MESSAGES est ré-écrite quand la ligne de contexte change entre deux envois.

**Alternatives rejetées** : (a) tool `get_current_view` app-only (fraîcheur incompatible multi-tours,
frontière app↔MCP cassée) ; (b) contexte dans le message user (entrerait dans le transcript persisté,
contraire à ADR-4) ; (c) store Zustand pour le registre (rien à persister/synchroniser — module pur
+ useSyncExternalStore, patron ARCH-SYNC-SPLIT).
