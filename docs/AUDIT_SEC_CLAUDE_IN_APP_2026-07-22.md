# Audit sécurité — chantier Claude-in-app (rapport de clôture)

> Date : 2026-07-22 · Périmètre : lots A→E (chat Claude in-app + tools MCP partagés), sur `main`.
> Exigence Marc : « fait un audit de sec à la fin + qu'aucune donnée soit changée + résultat fiable ».
> Méthode : panel de 2 agents (`security-privacy` + `ai-reviewer`), findings **mesurés par sondes
> exécutées** (pas déduits), sur toute la surface livrée (pas un diff).

## Verdict

**Chantier sain et bien gardé.** Le contrat non-négociable « rien ne s'écrit sans ton clic » est prouvé
**structurellement** (chat in-app). Clés API, mode discret (Loi 25), isolation persona, pureté des tools
de lecture : tous **prouvés sains par du code exécuté**. L'audit a trouvé **1 finding ÉLEVÉ** (côté serveur
MCP/claude.ai, corrigé ici) + **2 findings de robustesse** (corrigés ici). Aucun trou de « donnée changée ».

## Findings corrigés dans ce cycle

### ÉLEVÉ — Injection de prompt indirecte via `summary` (serveur MCP) — CORRIGÉ
`mcp/tools/_writeHelper.ts` (`runApply`, surface claude.ai/Cloud Run) renvoyait `summary` + `changes[].field/
before/after/note` **non désinfectés** au modèle. Ces champs sont de la prose code-auteur qui interpole des
substrings **saisies par l'utilisateur** (nom de dette/employeur/ticker, souvent extraits d'un **document
joint**) → un nom piégé (« `<IGNORE ALL PRIOR INSTRUCTIONS>…` ») revenait verbatim dans le contexte du tour
suivant (injection indirecte). Le scrub existait **côté app** (`writeExecutor`) depuis le Lot D mais n'avait
jamais été porté côté serveur — classe « delta appliqué à une seule des deux copies ».
**Fix** : helper PARTAGÉ `mcp/tools/scrubWriteResult.ts` (`scrubWriteResultForModel`) consommé par les DEUX
surfaces (app `writeExecutor` + serveur `runApply`) → parité par construction, plus de dérive possible.
Preuve : `tests/mcp/writeResultScrub.test.ts` (un nom malveillant ressort scrubé côté serveur).
⚠️ **Prise d'effet sur claude.ai = au prochain redéploiement Cloud Run** (le code est corrigé ; le connecteur
tourne sur une révision déployée séparément de Vercel).

### MOYEN — `.finite()` manquant sur des champs $ de 3 tools de lecture — CORRIGÉ
`run_projection` (startingNetWorth, monthlySavings), `calculate_real_estate` (price, downPayment, renovations,
maxValue), `search_transactions` (min/maxAmount), `get_tax_room` (currentCeliBalance) : `Infinity` traversait
Zod (`.positive()/.nonnegative()` ne l'excluent pas) → calcul absurde présenté avec autorité. **Fix** : `.finite()`
ajouté + garde-scan `tests/aiTools/specFiniteGuard.test.ts` (volume prouvé) interdisant tout futur champ $ nu.

### MOYEN — `stop_reason: 'refusal'` non traité comme fin dégradée — CORRIGÉ
Un refus sans texte retombait sur « aucune réponse, réessaie » (invite à re-poser une question re-refusée) sans
trace. **Fix** : marqueur honnête « [Réponse refusée] » + `logError`, cohérent avec `truncated` ; test ajouté.

## Prouvé SAIN (mesuré)

- **Aucune écriture sans confirmation** : `writeExecutor.ts` est le SEUL site qui appelle `setAppState` dans
  tout `services/aiTools/` ; les `apply_*` ne sont déclarés à l'API que si l'exécuteur de confirmation est
  branché ; diff pur → clic → recalcul état frais → backup (condition, pas best-effort) → écriture.
- **Clés API** : exclues du snapshot (`appStateProvider`) ET du patch appliqué (`writeExecutor`) — une vraie
  clé survit intacte à un apply (test).
- **Mode discret (Loi 25)** : chat + modal + montants sortent du DOM (pas un blur) ; une confirmation en
  attente est auto-refusée dès l'activation du mode discret (garde de rendu + auto-cancel).
- **Personas / mode test** : `aiConversation` remise à vide à chaque bascule de persona ; une écriture en mode
  test va dans le state persona (jamais `realDataSnapshot`), perdue à la sortie ; push Drive coupé en test.
- **Lecture = zéro mutation** : `structuredClone` à la frontière ; aucun handler ne mute `state` (grep exhaustif).
- **Parité app ↔ claude.ai** : `registryParity.test` (8 tools × 2 personas, payload strictement identique).
- **Boucle agentique** : cap de tours + timeout par tour (anti-boucle BYOK) ; fins dégradées honnêtes ;
  abort ≠ error ; callbacks UI isolés.

## Optimisation routée au BACKLOG (hors sécurité)

- `[AITOOLS-PROMPT-CACHE]` — pas de prompt caching Anthropic → coût BYOK repayé à chaque tour multi-outils.
  Optimisation de coût (pas un trou de sécurité) → ticket dédié, à mesurer.
- `[PERF-SDK-BOOT-PRELOAD]` — SDK préchargé au boot via `claude.ts` (pré-existant, découvert au Lot E).

## Conclusion

Le chantier Claude-in-app est **livré et sécurisé** : lecture sans mutation prouvée, écriture uniquement après
clic, clés/PII protégées, injection indirecte fermée sur les DEUX surfaces (app + serveur, après ce cycle).
Restent des optimisations de coût (non bloquantes) au BACKLOG.
