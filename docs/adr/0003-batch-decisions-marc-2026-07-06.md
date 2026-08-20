# Batch 2026-07-06 — Décisions Marc consolidées (8 items, 2 jeux fiscaux reçus)
**Statut** : accepté (Marc, 2026-07-06). Applicabilité : immédiate (FISC), à confirmer (FISC-TAXDEC-INCR).

**Contexte** : audit financier complet (6 lots 2026-06-23), reste des blocages fiscaux/produit. Marc formule
des choix de design, approuve des proxies/limites, et reçoit **2 jeux de données fiscales 2026** (taxe de
bienvenue Québec + grille TP-1.G personne vivant seule).

### Décisions fondées (avec sources documentées)
1. **Taxe de bienvenue Québec 2026** (`FISC-WELCOME-2026`, barème reste_qc) :
   - **Seuils** : 62 900 / 315 000 (vs 2025 : 58 900 / 290 000)
   - **Source** : *Loi concernant les droits sur les mutations immobilières* (RLRQ c. D-15.1), indexation
     2026 (*Gazette officielle du Québec, Partie 1, 2025-06-07*), **+2,3438 %**.
   - **Implication** : update `FISCAL_REFERENCE.md` §8 + code `realEstate.ts:101-105` (même PR).

2. **Crédit d'âge 65+ / Personne vivant seule (TP-1.G, QC ligne 361)** (`TP1G-VIVANT-SEUL`) :
   - **Montant base** : 2 172 $ ; **supplément monoparental** : 2 681 $ ; **seuil revenu net** : 42 955 $
   - **Taux réduction** : 18,75 % au-delà du seuil ; **taux crédit** : 14 %
   - **Source** : MFQ *Dépenses fiscales 2025*, fiche 110606, **Tableau C.31** + Loi sur les impôts art. 752.0.7.4 a)/b).
   - **Implication** : update `FISCAL_REFERENCE.md` §4 + intégrer au moteur line361 QC (plan-first, discriminant git-stash).

### Décisions de design (proxies et limites acceptées)
3. **W5-TAX-PROXY** (revenus locatif 0,45 / dividende CCPC 0,36) :
   - **Choix (a)** : garder les proxies documentés = estimation de taux marginal QC (rapide, honnête).
   - **Alternative rejetée (b)** : modéliser l'impôt incrémental réel (exact mais lourd, plan-first, impact moteur).
   - **Implication** : ajouter mention UI + source taux marginal QC dans `FISCAL_REFERENCE` ; code inchangé.

4. **HIST-NW-DEBT-DISCLAIMER** (patrimoine net passé sans dettes) :
   - **Choix (b)** : disclaimer visuel sur la zone passée du graphe (honnête vs gonflé pour endettés).
   - **Alternative (a)** : laisser tel quel documenté (moins honnête).
   - **Alternative (c)** : soustraire dette courante (imprécis, suppose dette stable).
   - **Implication** : UI disclaimer sur `FutureProjection` + doc existante (HIST-NW-NO-DEBT).

5. **D6-PRIV-MONTANTS** (montants sliders REER/CELIAPP/REEE/paiements masqués en mode privé) :
   - **Choix** : OUI masquer au repose, révéler au focus (par symétrie `<PrivateNumberInput>`).
   - **Implication** : wrapper sliders 3 fichiers (TaxCenter, ChildPlanning, DebtManager), effort S.

### Décisions de fermeture (périmées ou en limite assumée)
6. **FA-11** (discontinuité SRG au seuil) : **maintenir en limite assumée** (doc `FISCAL_REFERENCE §6` suffisante).
   - Reste optionnel = transcrire tables Service Canada (formule non officielle) — clos, ouvert seulement si voulu.

7. **ITEM-2C** (gates timing per-conjoint, reset REER 71 + PSV/RRQ au décès) :
   - **Phases 1+2 livrées** : FERR per-conjoint ✅ + PSV/RRQ per-conjoint ✅ (2026-06-25).
   - **Restes** : reset REER 71 + per-conjoint PSV/RRQ au décès = **laisser en limite assumée** (impact $ minimal).
   - **Implication** : clos, doc §9 survivorMode ; relancer seulement si impact $ détecté.

### À clarifier (en attente de confirmation)
8. **FISC-TAXDEC-INCR** (impôt décembre : 3 sous-claims bornés mais risqué à fixer) :
   - Marc répond « ok » 2026-07-06 → **interprétation ambigüe** : (a) COD ER le fix (re-baser golden, tests,
     risque moteur élevé) ou (b) statu quo / différé (passer) ?
   - **Blocage** : avant tout code, clarifier l'intention → « go fix » ou « wait ».

---
