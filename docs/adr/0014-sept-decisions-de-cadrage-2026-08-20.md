# ADR — Sept décisions de cadrage en lot (Marc, 2026-08-20)
**Statut** : accepté (réponses de Marc au batch A1-A7, message du 2026-08-20).

| # | Question | Décision Marc | Effet |
|---|---|---|---|
| A1 | Droits REER par personne (règle ARC) vs revenu du ménage | **Par personne** | `[FISC-RRSP-ROOM-PER-USER]` DÉBLOQUÉ — GO, avec plan + mesure avant/après |
| A2 | `[FISC-TAXDEC-INCR]` : coder ou différer | **« code le »** | DÉBLOQUÉ — GO (risque $ élevé : plan-first + re-base goldens assumé) |
| A3 | Crédit pension fédéral 2 000 $ gelé nominal vs traité réel | **GO** | `[FISC-PENSION-CREDIT-REAL]` DÉBLOQUÉ — re-base des goldens retraités assumé |
| A4 | « Impôt minimum » du classement : de son vivant ou TOTAL | **TOUT** (successoral inclus) | `[ENG-RANKTAX-ESTATE]` DÉBLOQUÉ — l'impôt latent entre dans l'objectif |
| A5 | Bien immobilier créé `isActive: false` : activer par défaut ? | **NON — attendre le clic**, « pareil pour enfant » | `[UX-ISACTIVE-SEMANTIQUE]` TRANCHÉ : statu quo VOULU, à documenter, pas à « corriger » |
| A6 | Champ « déjà DÉTENU » vs « objectif planifié » | **OUI** + à la date planifiée d'un objectif, POPUP « est-ce acheté ? » | `[ENG-PAST-OWNED-VS-PLANNED]` DÉBLOQUÉ avec le spec du popup |
| A7 | Paliers d'impôt sous stress (i ≠ 2 %) : indexer à simInflation ? | **Conservateur** (statu quo ADR 009) | `[FISC-BRACKET-CPI-STRESS]` FERMÉ sans code — décision de modèle confirmée |

⚠️ A5 est un choix de PRODUIT qui renverse la lecture « bug » du panel #552 : un bien saisi ne
compte pas tant que Marc ne l'active pas, et c'est VOULU — y compris pour les enfants. La prochaine
session ne doit pas « réparer » ça. Le travail restant est de la CLARTÉ UI (le statut inactif doit
se voir), pas un changement de défaut.
