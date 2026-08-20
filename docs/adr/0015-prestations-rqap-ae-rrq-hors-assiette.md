# ADR — Prestations RQAP/AE/RRQ : hors assiette de cotisation, imposables (Marc, 2026-08-20)
**Statut** : accepté — recherche sourcée de Marc (canada.ca, Retraite Québec, QPIP), 2026-08-20.

**Règle à coder** : l'assiette des cotisations RRQ/RQAP/AE = **revenus de TRAVAIL uniquement**
(salaire + revenu d'entreprise). Toute prestation gouvernementale (RQAP, AE, RRQ) est du **revenu
imposable à assiette de cotisation NULLE** — ces prestations ne figurent même pas dans les tables
« rémunérations non assujetties » de RQ parce qu'elles sont hors du périmètre paie par construction
(aucun employeur ne les verse). Exception : CNESST/SAAQ = non imposables. Détail transcrit dans
`FISCAL_REFERENCE.md` §2. Débloque `[RQAP-PRESTATION-COTISATIONS]` et nourrit `[AE-PLAFOND-MANQUANT]`.
