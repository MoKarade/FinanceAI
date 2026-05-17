# ADR-002 : Era Context comme moteur de qualité IA

**Date** : 2026-05
**Statut** : Acceptée

## Contexte

Avant la Phase 4.B, l'app appelait Claude **directement** pour chaque
question utilisateur — sans contexte enrichi. Le system prompt contenait
seulement un dump du store Zustand (`generateContext()`). Conséquences :
- Claude ne voyait pas les transactions réelles (juste les agrégats)
- Pas de mémoire entre sessions (chaque conversation repartait à zéro)
- La catégorisation batch envoyait **toutes** les transactions à Haiku, même
  celles déjà connues
- Anomalies de dépenses (ex: facture x3 du mois courant) invisibles à
  l'utilisateur jusqu'à ce qu'il les remarque manuellement

Era Context (api.era.app) expose une API d'insights pré-calculés et de
mémoire persistante. Inutilisée avant Phase 4.B sauf pour un endpoint
basique.

## Décision

**Era Context devient le moteur de qualité** côté données ; Claude devient
le moteur d'interprétation et de génération.

**Architecture composable** (`services/aiOrchestrator.ts`) :

```
Question utilisateur
  ├─ Détection "remember:" / "souviens-toi:" → eraContext.rememberFact()
  └─ Sinon :
       └─ buildEnrichedContext(token) en parallèle (Promise.all) :
            ├─ eraContext.getCashFlow(90j)
            ├─ eraContext.analyzeSpending(30j)         [+ anomalies]
            ├─ eraContext.forecastSpending(1 mois)
            └─ eraContext.recallHistory()              [mémoire persistante]
       └─ renderEnrichedContext() → string formatée pour system prompt Claude
       └─ claude.chatStream(messages, key, { system: enriched })
```

**Catégorisation batch** : Era Context devient **primaire**, Claude
**fallback** :
1. `eraContext.listRecurringCharges()` — instant, gratuit, basé sur
   historique complet de l'utilisateur
2. Pour les transactions résiduelles ou si pas de token Era → fallback
   `claude.categorizeBatch()` (Haiku)
3. UI signale la source via toast ("via Era Context (gratuit)")

**Cache** : wrapper générique `eraRequest()` avec TTL 1h en mémoire (Map).
Évite les hits réseau répétés à chaque ouverture de Dashboard.

## Conséquences

**Positives** :
- Claude répond avec contexte réel (cash-flow, anomalies, prévisions, mémoire)
- Mémoire persistante (`recallHistory`) : Claude "se souvient" des
  préférences même après un refresh
- Coûts IA réduits : la majorité des catégorisations sont gratuites (Era)
- Pattern réutilisable : tout nouvel onglet peut appeler `buildEnrichedContext()`

**Négatives / ouvertes** :
- Dépendance API tierce additionnelle (Era Context). Mitigation : tous les
  endpoints sont en **fallback gracieux** (try/catch retourne `null`,
  l'orchestrator continue sans). L'app fonctionne sans token Era.
- Cache TTL 1h en mémoire perdu au refresh. Acceptable, mais une persistance
  IndexedDB serait un upgrade futur.
- Era Context API peut changer de schéma — le wrapper utilise Zod pour
  valider, et logue clairement quand le schéma diverge.

**Référence** : voir [PLAN_PHASE_4.md](../PLAN_PHASE_4.md) §1-§2 (Phase 4.B).
