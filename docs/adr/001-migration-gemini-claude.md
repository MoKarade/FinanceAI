# ADR-001 : Migration Gemini → Claude (Anthropic SDK)

**Date** : 2026-05
**Statut** : Acceptée

## Contexte

L'app utilisait `@google/genai` (Gemini) pour 5 capacités IA :
1. Chat conversationnel (`AiAssistant`)
2. Catégorisation transactions (batch)
3. Analyse budget (`BudgetAiModal`)
4. Vision documents fiscaux (`TaxCenter` — payslip OCR)
5. Suggestions objectifs financiers (`Planning`)

**Problèmes constatés** :
- Qualité variable sur les analyses fiscales (contexte Québec)
- Pas de streaming clean en SDK browser
- Vision API moins fiable pour les talons de paie scannés
- Gemini Pro coûteux pour la catégorisation batch (gros volumes)

**Opportunité** : Claude 4.6 (Sonnet/Haiku) offre :
- Meilleure qualité sur les analyses long-form en français
- Streaming SDK browser stable
- Vision API avec citations
- Haiku 4.5 ~5× moins cher que Sonnet pour catégorisation batch

## Décision

Migrer **tous** les usages IA vers `@anthropic-ai/sdk` en client-side
(`dangerouslyAllowBrowser: true`).

**Séparation des modèles** :

| Usage | Modèle | Justification |
|---|---|---|
| Chat (`AiAssistant`) | `claude-sonnet-4-6` | Qualité analyses + streaming |
| Catégorisation batch | `claude-haiku-4-5` | Volume + vitesse + coût |
| Vision payslip | `claude-sonnet-4-6` | Raisonnement complexe sur documents fiscaux |
| Budget AI | `claude-sonnet-4-6` | Analyses long-form |
| Goals Planning | `claude-sonnet-4-6` | Suggestions structurées |

**Migration en 5 PRs** (A1 → A5) :
- A1 — `services/claude.ts` créé, schema store v2 (ajout `apiKeys.anthropic`)
- A2 — `AiAssistant` migré (streaming)
- A3 — Budget + Transactions migrés
- A4 — TaxCenter Vision migré
- A5 — Cleanup final, `services/gemini.ts` supprimé, schema v3
  (suppression `apiKeys.gemini`)

## Conséquences

**Positives** :
- Code IA cohérent : un seul SDK, un seul provider
- Bundle plus léger (`ai-vendor` chunk : 289KB → 130KB, **-55%**)
- Schema versionné force la migration propre (pas de clés orphelines)
- Tests RTL maintenus à 100% pendant la migration (223/223 puis 225/225)

**Négatives / ouvertes** :
- `dangerouslyAllowBrowser: true` expose la clé API côté client. Acceptable
  pour une app perso, à revoir si l'app passe en multi-utilisateurs (ADR
  futur "BFF pour proxy IA" requis).
- Pas de billing centralisé : l'utilisateur paie sa propre clé Anthropic.
  Trade-off identique à l'ancienne config Gemini.

**Référence** : voir [HANDOVER.md](../HANDOVER.md) §2.8 et le CHANGELOG cycle 6.
