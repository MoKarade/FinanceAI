<!-- Extrait de CLAUDE.md, déplacé le 2026-09-26 (texte copié à l'identique, rien supprimé). Index : CLAUDE.md -->

## 1. Principes non négociables

- **Source unique — Future** : tout calcul long-terme vient de `lastProjection.chartData`.
  Avant d'ajouter un calcul côté UI, **grep le moteur** : s'il l'émet déjà, le CONSOMMER.
- **Source unique — Patrimoine net** : `services/projection/netWorth.ts` `computeRawNetWorth`.
  `realEstateEquity` est DÉJÀ net d'hypothèque (ne jamais re-soustraire). Jamais de copie
  locale de la formule.
- **No-fake-data** : zéro donnée simulée en prod. Projection non calculée →
  `<ProjectionRequired>`. Une valeur non finie ne devient JAMAIS un défaut numérique
  (`0 $` crédible est pire qu'un « — » honnête), y compris dans un prompt IA.
  ⚠️ Vaut aussi pour un OBJET : superposer du réel sur du projeté par `{...projeté, ...réel}` laisse
  filtrer tous les champs non recouverts. Un point « réel » se construit à partir de RIEN.
- **Valeurs fiscales** : toute constante fiscale vient de `docs/FISCAL_REFERENCE.md` (datée +
  sourcée). Jamais de chiffre fiscal en dur non sourcé — un chiffre sans source est SUSPECT,
  pas « à re-sourcer un jour ».
- **Unités argent** : `grossSalary`/`netSalary` du store sont **MENSUELS** → ×12 pour toute
  comparaison annuelle (sinon bug d'échelle ~12×).
- **Devises** : `Asset.currentPrice`/`buyPrice` sont en devise **NATIVE** → toute somme
  affichée passe par `assetValueCad`. Garde-test : `tests/services/assetFxGuard.test.ts`.
- **Formatage $** : `formatCAD` (`utils/format.ts`) UNIQUEMENT. Jamais `toLocaleString()` nu,
  jamais `` `${n.toFixed(0)}$` ``. Pourcentages → `formatPercent`.
- **Sécurité** : jamais de secret en clair (code, repo, chat). Clés API en IDB chiffré,
  exclues de localStorage / backups / push Drive.

