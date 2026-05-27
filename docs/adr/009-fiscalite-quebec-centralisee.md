# ADR-009 : Calculs fiscaux QC centralisés (crédits 65+, RAMQ, FSS, SRG) + règles immobilières

**Date** : 2026-05
**Statut** : Acceptée (implémentée)

## Contexte

Un audit fiscal a identifié plusieurs manques structurels qui faussaient les
projections de retraite et d'immobilier :

- **Crédits non-remboursables 65+ jamais appliqués** (fédéral lignes 30100/31400
  + Québec ligne 361) → impôt surestimé d'environ 970 $/personne/an pour un
  retraité.
- **Cotisations individuelles QC non modélisées** : RAMQ (ligne 447, prime max
  ~766 $/adulte), FSS (ligne 446, max 1 000 $/adulte), SRG (Service Canada,
  supplément aux aînés à faible revenu).
- **Règles immobilières SCHL/OSFI absentes** : mise de fonds minimale et
  amortissement max, prime d'assurance hypothécaire si mise de fonds < 20 %,
  stress test B-20.

Trois voies d'implémentation envisagées :

1. **Fonctions pures centralisées par domaine** — exposées et indexées par
   année, appelées depuis les processeurs mensuels de projection.
2. **Service fiscal monolithique** distinct regroupant tout.
3. **Module externe** type plug-in fiscal versionné par année.

## Décision

**Option 1 — fonctions pures centralisées par domaine, indexées par année.**

- **Fiscalité des particuliers** → `utils/tax.ts` :
  `calculateAgeAndPensionCredits`, `calculateRamqPremium`,
  `calculateFSSPremium`, `calculateGISBenefit`, plus la décomposition typée des
  retenues à la source REER (`RRSP_WITHHOLDING_QC`). Toutes les constantes 2026
  (seuils, plafonds, taux) sont exportées et indexées via
  `getIndexedBracketsForYear` pour les années futures.
- **Règles immobilières** → `services/realEstate.ts` :
  `calculateMinDownPayment`, `validateMortgageParameters`,
  `calculateB20StressTest`, `calculateSchlPremiumRate`.

Chaque règle est une fonction pure typée, sourcée en commentaire à l'URL
officielle (ARC, Revenu Québec, RAMQ, OSFI/SCHL, Service Canada). Les callers
(`taxDecember`, `taxJanuary`, `retirementIncome`, `realEstateMonth`) construisent
localement leur contexte (`ageOpts`, `familyNetIncome`, paramètres hypothécaires)
et invoquent les fonctions pures.

## Conséquences

**Bonnes** :
- Une seule source de vérité par règle fiscale, traçable à sa source officielle.
- Fonctions pures = tests unitaires faciles : paliers, frontières exactes,
  indexation, garde-fous NaN.
- Mise à jour annuelle triviale : une PR par changement de barème, indexation
  automatique pour les années non encore publiées.
- Découplage propre : la fiscalité des particuliers et l'immobilier vivent dans
  des modules distincts plutôt qu'un fourre-tout fiscal.

**Mauvaises** :
- `utils/tax.ts` grossit. Acceptable pour l'instant ; à découper en sous-modules
  (`tax/age.ts`, `tax/ramq.ts`, `tax/fss.ts`…) si le poids devient gênant.
- Couplage accru entre les processeurs mensuels et ces modules, mitigé par des
  options optionnelles partout (`ageOpts?`, `childrenCount?`, `exempt?`).

**Ouvertes** :
- BPA fédéral partiellement dégressif au-delà du 4e palier : non implémenté.
- Les barèmes 2027+ reposent sur l'indexation estimée tant que les montants
  officiels ne sont pas publiés.
