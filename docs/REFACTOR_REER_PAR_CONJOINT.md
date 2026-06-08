# Refactor — soldes enregistrés PAR CONJOINT (REER/FERR/CELI/CELIAPP)

> **But** : attribuer les soldes et flux enregistrés à chaque conjoint pour une fiscalité
> exacte au décaissement (impôt par conjoint, FERR 71/72 par conjoint, **fractionnement de
> pension 65+** correct). Aujourd'hui le moteur met ces soldes EN COMMUN
> (`state.reer`, `state.celi`…) et répartit l'impôt de retraite 50/50 → approximation
> trop généreuse pour un couple <65 à comptes inégaux (cf `FISCAL_REFERENCE.md` §9).
>
> **Décision Marc (2026-06)** : faire le vrai refactor par conjoint (pas l'approx).
> **Approche** : incrémentale, la moins risquée — soldes en commun gardés pour la
> croissance/allocation ; **registre par conjoint** ajouté et consommé par la couche fiscale.
> Réversible, livrable en 2-3 PRs, validé à chaque étape par `fiscal-accuracy` +
> `projection-validator` (money-critical).

## Règles d'attribution (défauts — corrigeables)
- **Solde REER initial** : réparti au prorata du **salaire brut** de chaque conjoint
  (proxy de l'historique de cotisation) ; 50/50 si aucun salaire. CELI/CELIAPP idem.
- **Cotisations** : au conjoint qui a du **plafond** disponible (REER = 18 % de SON brut − FE,
  par conjoint ; CELI room déjà par conjoint). Au prorata du plafond si les deux en ont.
- **Retraits** : au **prorata du solde** de chaque conjoint (neutre). Le meltdown REER suit
  la même clé.
- **Croissance** : au prorata du solde (les rendements stochastiques restent au niveau ménage).
- **FERR** : minimum obligatoire calculé sur le solde REER de CHAQUE conjoint, gate 72 par
  conjoint (cf décision FERR 72).
- **Fractionnement de pension 65+** : à décembre, chaque conjoint est taxé sur SON revenu ;
  on autorise le transfert de ≤ 50 % du revenu de pension ADMISSIBLE (rente DB à tout âge ;
  retraits REER/FERR seulement si le conjoint cédant est **65+**) vers le conjoint à plus
  bas revenu, en minimisant l'impôt combiné. RRQ/PSV non fractionnables (déjà par conjoint).

## Phasage (1 PR par phase)
1. **État + attribution (sans changement fiscal)** : introduire `reerByUser/celiByUser/…`
   + `accRetraitsReerYearByUser`, initialisés et threadés en parallèle des soldes communs
   (qui restent la vérité pour croissance/allocation). Invariant : `somme(byUser) == commun`
   à tout instant. Zéro changement de résultat. Tests d'invariant.
2. **Fiscalité par conjoint** : `taxDecember` + `taxJanuary` (FERR) consomment les soldes
   par conjoint. Changement de comportement **attendu** (impôt plus exact). Validé agents.
3. **Fractionnement 65+** : appliquer l'admissibilité + l'optimisation du transfert ≤ 50 %.

## Fichiers touchés (estimé)
`services/projection/setupSimulation.ts` (init), `services/projection/cashflowAllocation.ts`
(cotis/retraits), `services/projection/monthlyCalcs.ts` (croissance/threading),
`services/projection/taxJanuary.ts` (FERR), `services/projection/taxDecember.ts` (impôt +
split), `services/projection/meltdownReer.ts`, `services/projection/types.ts`, +
`docs/FISCAL_REFERENCE.md` §9 (lever la limite une fois fait). Tests à chaque phase.

## Invariant de sécurité
À chaque commit : `Σ reerByUser == state.reer` (± epsilon) pour tout mois — sinon le refactor
a divergé. Un test d'intégration vérifie l'égalité sur un scénario couple complet.
