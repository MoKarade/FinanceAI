# Backlog typecheck — historique (2026-05: TERMINÉ)

> **Statut au 2026-05** : le backlog est entièrement résorbé.
> `npm run typecheck` (`tsc --noEmit`) passe **sans erreur** en mode strict
> (noImplicitAny + strictNullChecks + alwaysStrict + useUnknownInCatchVariables).
> Le `tsconfig.json` n'exclut plus aucun fichier app du typecheck
> (juste `node_modules`, `dist`, `build`, `public`).

## Fichiers historiquement problématiques (tous fixés)

| Fichier | Statut | Comment |
|---|---|---|
| `utils/tax.ts` | ✅ Fixé | TS7005 breakdown implicit any[] |
| `components/Retirement.tsx` | ✅ Fixé | TS2367 comparaison CELIAPP impossible |
| `components/Settings.tsx` | ✅ Fixé | TS2322 User[] vs [User, User] tuple |
| `utils/useFutureSimulation.ts` | 🗑️ Supprimé | Refactoré dans `services/projection/*` (Phase 3 split) — n'existe plus |
| `components/Dashboard.tsx` | ✅ Fixé | `RealEstateGoal.currentValue/mortgageBalance` étendus, `LifeEvent.icon` ajouté |
| `components/FutureProjection.tsx` | ✅ Fixé | Annotations explicites `reduce`, types `ProjectionResult` propres, `isAnimationActive` retiré des `ReferenceDot` |
| `components/Investments.tsx` | ✅ Fixé | Annotations `any[]` explicites |
| `components/Transactions.tsx` | ✅ Fixé | Callbacks IA typés, `setTransactions` retour annoté |

## Pour les nouveaux développements

Maintenir la rigueur :
1. **Pas de `: any` implicite** — toujours annoter explicitement quand TS ne peut pas inférer.
2. **`as unknown as X`** pour les casts qui nécessitent un staging — éviter `as X` direct quand TS objecte.
3. **`unknown` au lieu de `any`** pour les index signatures (cf `ProjectionChartPoint`).
4. **CI typecheck** : `npm run typecheck` doit rester vert avant tout merge.

Le suivi des warnings restants (non-bloquants) se fait via review code et l'audit
trimestriel.
