# Plan Phase 6 — Manques fiscaux structurels

> **Document de travail** suivi PR par PR jusqu'à complétion. Mis à jour à chaque merge.
> **Branche** : `claude/phase-6-tax-qc` (depuis `main`, indépendante de PR #83 docs cleanup).
> **Origine** : audit 2026-05 §Phase 6 (résumé dans `docs/HANDOVER.md` §3.4).
> **Statut au 2026-05-19** : §6.9 ✅ + §6.10 ✅ (PR #82). Reste 8 items + tests régression.

---

## Ordre d'attaque

Priorité par valeur unitaire descendante, items immobilier groupés en fin :

| Rang | Item | Effort | Impact $ | Fichiers cibles | État |
|---|---|---|---|---|---|
| 1 | **§6.2** Crédits 65+ et revenu retraite (fed + QC) | 4h | ~970$/pers./an | `utils/tax.ts` · `taxDecember.ts` · `taxJanuary.ts` | 🚧 En cours |
| 2 | §6.4 RAMQ médicaments | 3h | ~744$/adulte/an | `utils/tax.ts` · `taxDecember.ts` | ⏳ |
| 3 | §6.6 Stress test B-20 OSFI | 3h | Validation prêt | `realEstateMonth.ts` | ⏳ |
| 4 | §6.8 Validation mise de fonds + amortissement max | 2h | Garde-fou réaliste | `realEstateMonth.ts` | ⏳ |
| 5 | §6.1 FSS retraités | 3h | Jusqu'à 1 000$/an | `utils/tax.ts` · `taxDecember.ts` | ⏳ |
| 6 | §6.5 SCHL prime hypothécaire | 4h | 2.8-4% du prêt | `realEstateMonth.ts` | ⏳ |
| 7 | §6.7 TPS/TVQ résidence neuve | 4h | Remboursement partiel jusqu'à 450k$ | `realEstateMonth.ts` | ⏳ |
| 8 | §6.3 SRG (Supplément revenu garanti) | 6h | Crucial faible revenu retraite | `retirementIncome.ts` | ⏳ |

**Total** : ~29h + 9h tests régression = ~38h.

---

## Convention par item

1. **Sources officielles citées** en commentaire à côté de chaque constante (no fake — règle Marc).
2. **Constantes nommées** : `UPPER_SNAKE_CASE`, suffixe `_2026` si indexé.
3. **Tests régression Vitest** : ≥ 1 test par item dans `tests/services/tax.test.ts` ou `tests/services/realEstate.test.ts`.
4. **PR atomique** par item §6.x. Body de PR inclut sources fiscales.
5. **Triple validation locale** avant push : `npm run typecheck && npm test -- --run && npm run build`.

---

## Sources officielles par item

### §6.2 — Crédits 65+ et revenu retraite (fed + QC)

**Fédéral** — ARC, indexation 2026 = 2.0%
- **Ligne 30100 — Montant en raison de l'âge** : base 2025 = 8 790$, seuil 45 522$, réduction 15%.
  → 2026 indexé : **8 966$ max**, seuil **46 432$**, réduction 15%.
- **Ligne 31400 — Crédit pour revenu de pension** : **2 000$ max fixe** (non indexé depuis 2006).
- Taux applicable : **15%** (palier le plus bas, garanti par ARC malgré la baisse à 14%).

**Québec** — Revenu Québec, formulaire TP-1.G + indexation 2026 = 2.05%
- **Ligne 361 partie A** — combine 3 montants :
  1. Montant accordé en raison de l'âge (65+) : **3 986$/personne** (2026)
  2. Montant pour revenus de retraite : **3 058$/personne** (≈ 2 998 × 1.0205)
  3. Montant pour personne vivant seule : non implémenté dans cette PR (à raffiner si pertinent pour scénarios Marc)
- **Seuils revenu familial** :
  - Sans conjoint : 27 835$
  - Avec conjoint : 45 270$
- **Taux de réduction** : 18.75% au-delà du seuil
- Taux applicable : **14%** (palier le plus bas QC)

### §6.4 — RAMQ médicaments

- Régie de l'assurance maladie du Québec, cotisation annuelle pour personnes non couvertes par régime privé
- 2026 : prime de 0$ à ~744$/adulte selon revenu net familial
- Source : ramq.gouv.qc.ca/publications/regime-public-assurance-medicaments

### §6.6 — Stress test B-20 OSFI

- Bureau du surintendant des institutions financières, ligne directrice B-20
- **Qualifying rate** : `max(contractRate + 2 pts, 5.25%)` pour la qualification du prêt
- Source : osfi-bsif.gc.ca/Eng/fi-if/rg-ro/gdn-ort/gl-ld/Pages/b20.aspx

### §6.8 — Mise de fonds min + amortissement max

- SCHL : mise de fonds minimum selon prix d'achat
  - ≤ 500 000$ : 5% min sur tranche
  - 500 000-1 500 000$ : 5% sur premier 500k + 10% au-delà
  - > 1 500 000$ : 20% min (assurance SCHL non disponible)
- Amortissement max :
  - Assuré (mise de fonds < 20%) : 25 ans (30 ans 1er acheteur ou résidence neuve depuis août 2024)
  - Conventionnel (≥ 20%) : 30 ans
- Source : schl-cmhc.gc.ca

### §6.1 — FSS retraités

- Revenu Québec, ligne 446 — Cotisation Fonds des services de santé
- Applicable aux personnes 65+ avec revenu net > seuil (~16 780$ en 2026 ?)
- Taux : 1% sur la fraction au-delà du seuil, max 1 000$/an
- Source : revenuquebec.ca/fr/citoyens/declaration-de-revenus/produire-votre-declaration-de-revenus/comment-remplir-votre-declaration-de-revenus/aide-par-ligne/443-a-446-rajustements-et-impot/ligne-446/

### §6.5 — SCHL prime hypothécaire

- SCHL primes 2026 par tranche LTV (Loan-to-Value)
  - ≤ 65% : 0.60%
  - 65-75% : 1.70%
  - 75-80% : 2.40%
  - 80-85% : 2.80%
  - 85-90% : 3.10%
  - 90-95% : 4.00%
- Calcul : `prime = mortgageAmount × rate`, ajoutée au principal
- Source : schl-cmhc.gc.ca/buying/mortgage-loan-insurance

### §6.7 — TPS/TVQ résidence neuve

- ARC : remboursement TPS pour résidence neuve
  - ≤ 350k$ : remboursement 36% de la TPS
  - 350k-450k$ : décroît linéairement
  - > 450k$ : 0% remboursement
- Revenu Québec : remboursement TVQ
  - ≤ 200k$ : 50%
  - 200k-300k$ : décroît
  - > 300k$ : 0%
- À ajouter aux `closingCosts` du goal immobilier si `isNewConstruction`

### §6.3 — SRG (Supplément revenu garanti)

- Service Canada, programmes des aînés
- Disponible à 65+ avec PSV admissible (résidence Canada)
- Réduit par revenu autre que PSV (incl. RRQ, pensions privées, retraits REER)
- Max 2026 (avril-juin) :
  - Célibataire : ~1 098$/mois (à confirmer barème 2026)
  - Couple (chacun reçoit PSV) : ~661$/mois par personne
- Clawback : 50¢ par 1$ de revenu autre que PSV
- Source : canada.ca/en/services/benefits/publicpensions/cpp/old-age-security/guaranteed-income-supplement

---

## Suivi PR

| PR | Item | État | Tests ajoutés |
|---|---|---|---|
| #84 (à créer) | §6.2 Crédits 65+ et revenu retraite | 🚧 | 5-7 tests `tax.test.ts` |
| à venir | §6.4 RAMQ | ⏳ | 2-3 tests |
| à venir | §6.6 B-20 | ⏳ | 2 tests `realEstate.test.ts` |
| à venir | §6.8 Validation hypothèque | ⏳ | 3 tests |
| à venir | §6.1 FSS | ⏳ | 2 tests |
| à venir | §6.5 SCHL | ⏳ | 4 tests |
| à venir | §6.7 TPS/TVQ neuf | ⏳ | 3 tests |
| à venir | §6.3 SRG | ⏳ | 5 tests |

---

## Fin de Phase 6 (à faire après la dernière PR)

1. Mettre à jour `docs/HANDOVER.md` §3.4 — tous les ⏳ → ✅.
2. Ajouter entrée `CHANGELOG.md` : "cycle 7 — Phase 6 fiscalité complète".
3. Considérer ADR-005 : "Crédits non-remboursables 65+ et règles fiscales spécifiques aux retraités QC".
4. Supprimer ce fichier `PLAN_PHASE_6.md` une fois Phase 6 close (info migrée dans CHANGELOG + ADR).
