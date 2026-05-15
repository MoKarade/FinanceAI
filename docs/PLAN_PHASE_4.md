# Plan Phase 4 — Migration Claude + Era Context (2026-05)

> **Statut** : Plan détaillé, prêt à exécuter par PRs.
> **Pré-requis** : Phase 3 complète (cf. UI_REFOUNDATION_PLAN.md), backend wiring complet, AI Assistant streaming livré.
> **Objectif** : Remplacer Gemini partout par Claude + utiliser Era Context pour booster la qualité des insights.

---

## §0 — État des lieux

### Gemini — où il est utilisé (audit 2026-05)

**61 occurrences réparties dans 13 fichiers :**

| Fichier | Usage | Fonction Gemini consommée |
|---|---|---|
| `services/gemini.ts` | Wrapper SDK | `GoogleGenAI` direct |
| `components/AiAssistant.tsx` | Chat conversationnel (streaming) | `generateContentStream` |
| `components/Budget.tsx` + `budget/BudgetAiModal.tsx` | Diagnostic IA du budget | `analyzeBudgetAI()` |
| `components/Transactions.tsx` | Catégorisation batch | `categorizeBatch()` |
| `components/TaxCenter.tsx` | Analyse OCR de documents fiscaux | `analyzeDocuments()` (vision) |
| `components/Planning.tsx` | Suggestions d'objectifs financiers | wrapper Gemini |
| `components/Onboarding.tsx` | Step "Clés API" | UI de saisie clé |
| `components/Settings.tsx` | Card "Clés API" | UI de saisie clé |
| `components/GuideModal.tsx` / `SystemView.tsx` / `BackupPanel.tsx` | Mention textuelle | Doc/info |
| `components/TabRouter.tsx` | Prop `apiKey={state.apiKeys.gemini}` | Routing |

**Store** (`store/useFinanceStore.ts`) :
- `apiKeys: { eraContext: string; gemini: string }` — schéma à migrer

**Package** (`package.json`) :
- Dépendance : `@google/genai` (~289KB ai-vendor chunk)
- Cible : `@anthropic-ai/sdk` (taille à vérifier, généralement ~100-200KB)

### Era Context — ce qui est utilisé vs disponible

**Aujourd'hui** (`services/eraContext.ts`, 126L) — utilise UNIQUEMENT :
- `fetchTransactions()` — pull des transactions via REST

**Disponible mais non-utilisé** (cf. MCP server description) :
- **Knowledge** : `remember`, `recall_history`, `defer_question` — mémoire persistante
- **Insights** : `analyze_spending`, `forecast_spending`, `compare_spending_periods`, `get_cash_flow`, `get_daily_financial_summary`
- **Transactions** : `search_transactions`, `manage_categories`, `manage_automation_rules`
- **Accounts** : `check_account_balance`, `list_financial_accounts`

**Verdict** : on utilise <10% de ce qu'Era Context offre. Énorme potentiel de qualité d'insights.

---

## §1 — Vision cible

### Architecture proposée

```
┌────────────────────────────────────────────────────────────┐
│                       Frontend (FinanceAI)                  │
│                                                             │
│  ┌─────────────────────┐   ┌──────────────────────────┐    │
│  │  services/claude.ts │   │  services/eraContext.ts  │    │
│  │  (Anthropic SDK)    │   │  (REST + Insights)       │    │
│  └─────────┬───────────┘   └────────┬─────────────────┘    │
│            │                         │                      │
│            └─────────┬───────────────┘                      │
│                      │                                      │
│              services/aiOrchestrator.ts                     │
│      (compose Era Context insights → Claude prompts)        │
│                      │                                      │
│  ┌───────────────────┴────────────────────────────┐        │
│  │  Consumers: AiAssistant / Budget AI / Tax /     │        │
│  │             Transactions / Planning              │        │
│  └─────────────────────────────────────────────────┘        │
└────────────────────────────────────────────────────────────┘
```

### Bénéfices visés

| Avant | Après |
|---|---|
| Gemini reçoit des données brutes (transactions, budget) | Claude reçoit des **insights pré-traités** par Era Context (cash-flow, forecasts, anomalies) |
| Le modèle "réinvente la roue" à chaque appel | Era Context fait le calcul, Claude fait l'interprétation et le conseil |
| Pas de mémoire entre sessions | Era Context `remember()` persiste les préférences (objectifs, aversion risque, etc.) |
| Catégorisation par modèle (lent, ~3s/batch) | Catégorisation via Era Context rules (instant) + fallback Claude |
| Réponses génériques | Réponses qui citent les chiffres réels du compte |

---

## §2 — Plan d'exécution (8 PRs)

### ✅ Phase 4.A — TERMINÉE (mai 2026)

Toutes les PR A1-A5 mergées. Migration Gemini → Claude **complète** :
- `services/gemini.ts` supprimé
- `@google/genai` retiré du `package.json`
- 0 référence à Gemini dans le code app
- `apiKeys.gemini` retiré du store (schema v3)
- UI Onboarding + Settings + SystemView mises à jour ("Anthropic Claude")
- Tests: 223/223 passants tout du long

### Phase 4.A — Détails historiques

#### PR #1 : `services/claude.ts` + types
- **Effort** : M
- Crée `services/claude.ts` avec :
  - `chat(messages, apiKey)` — équivalent generateContent
  - `chatStream(messages, apiKey)` — équivalent generateContentStream
  - `analyzeBudget(payload, apiKey)` — port de analyzeBudgetAI
  - `categorizeBatch(txs, apiKey, ...)` — port de categorizeBatch
  - `analyzeDocuments(images, apiKey)` — port via Vision API
  - `suggestGoals(profile, apiKey)` — port pour Planning
- Installe `@anthropic-ai/sdk`
- Garde `services/gemini.ts` en place pour rétrocompat (deprecated)
- Ajoute `apiKeys.anthropic` au store (à côté de `gemini`, sans le retirer)
- Schema versioning du store : v1 → v2 (migrer `gemini` → `anthropic` si user n'a que Gemini)

#### PR #2 : Migration AiAssistant
- **Effort** : S
- Switch `AiAssistant.tsx` sur `services/claude.ts`
- Garde le streaming (Anthropic SDK supporte `messages.stream()`)
- Garde les 4 prompts suggérés
- Modèle : `claude-sonnet-4-6` (équilibre qualité/coût pour le chat)

#### PR #3 : Migration BudgetAiModal + Transactions
- **Effort** : M
- `BudgetAiModal` → `claude.analyzeBudget()`
- `Transactions` → `claude.categorizeBatch()` (modèle haiku-4-5 pour la vitesse)
- Tests RTL maintenus

#### PR #4 : Migration TaxCenter (vision)
- **Effort** : M
- `TaxCenter` → `claude.analyzeDocuments()` via Vision API
- Conserve l'upload multi-fichiers
- Modèle : `claude-sonnet-4-6` (vision + raisonnement)

#### PR #5 : Migration Planning + cleanup
- **Effort** : S
- Planning → `claude.suggestGoals()`
- Supprime `services/gemini.ts` et la dépendance `@google/genai`
- Supprime le champ `apiKeys.gemini` du store (migration final)
- Renomme labels Onboarding/Settings : "Gemini" → "Claude (Anthropic)"

### Phase 4.B — Era Context comme moteur de qualité

#### PR #6 : `services/eraContext.ts` étendu — insights API
- **Effort** : M
- Ajoute :
  - `getCashFlow(period)` — last 30/90 days
  - `analyzeSpending(period)` — breakdown par catégorie + comparison
  - `forecastSpending(months)` — prédiction 1-3 mois
  - `searchTransactions(query)` — recherche libre
  - `getDailyFinancialSummary()` — snapshot quotidien
- Cache léger (1h TTL) sur les fetchers via Map() en mémoire
- Tests unitaires des wrappers (mock fetch)

#### PR #7 : `services/aiOrchestrator.ts` — compositeur
- **Effort** : M
- Hook `useEnrichedContext()` qui combine :
  - Données brutes du store (assets, budget, projection)
  - Insights Era Context (cash-flow, forecasts)
  - Memory Era Context (`recall_history`)
- Passe le tout à Claude via `chat()` / `chatStream()`
- Le pattern remplace `generateContext()` actuel de chaque consumer
- Bonus : commande "remember-this" qui appelle `eraContext.remember(fact)`
  pour mémoriser des préférences mentionnées en chat

#### PR #8 : Era Context comme catégoriseur primaire
- **Effort** : M
- `Transactions.tsx` :
  1. Appelle `eraContext.applyAutomationRules(txs)` en premier (instant, gratuit)
  2. Pour les transactions non-catégorisées, fallback sur `claude.categorizeBatch()`
  3. Permet à l'utilisateur de "promote en règle" via Era Context :
     `eraContext.createAutomationRule({pattern, category})`
- Nette amélioration UX : la majorité des transactions sont catégorisées
  instantanément, l'IA ne sert qu'aux ambiguïtés.

---

## §3 — Décisions à prendre avant kickoff

### Q1 : Modèle Claude par usage
- **Chat conversationnel** : `claude-sonnet-4-6` (équilibre)
- **Catégorisation batch** : `claude-haiku-4-5` (vitesse, gros volumes)
- **Analyse vision (TaxCenter)** : `claude-sonnet-4-6` (raisonnement complexe)
- **Suggestions Planning** : `claude-sonnet-4-6`

### Q2 : Stratégie de migration du store
- Option A : Schema v2 qui copie `apiKeys.gemini` → `apiKeys.anthropic`
  (l'utilisateur garde sa clé Gemini, mais le code n'utilise plus Gemini)
- Option B : Schema v2 qui supprime `gemini` et expose un message
  "Migrate your API key to Anthropic" sur l'app
- **Recommandation** : Option A pour PR #1, puis Option B au PR #5 (cleanup final)

### Q3 : Gestion CORS / API key client-side
- Anthropic SDK supporte client-side avec `dangerouslyAllowBrowser: true`
  mais c'est un anti-pattern (clé exposée).
- **Idéal** : backend proxy (Cloudflare Worker, Vercel Function).
  Mais FinanceAI n'a pas de backend. Décision à prendre :
  - Option 1 : Garder client-side avec warning explicite
    (user est conscient, le reste de l'app est aussi client-side)
  - Option 2 : Ajouter un proxy minimal (Cloudflare Worker gratuit, ~50L de code)
- **Recommandation** : Option 1 pour le MVP, Option 2 plus tard si besoin.

### Q4 : Cleanup vs rétrocompat
- Quand supprimer `services/gemini.ts` et `@google/genai` ?
- Migration progressive PRs #1-#5, suppression au PR #5.
- Risque : si l'utilisateur a une vieille clé Gemini sauvée, comportement
  doit être clair (UI "Migrer vers Anthropic").

### Q5 : Era Context — token utilisateur ou app token ?
- L'utilisateur fournit déjà son token Era Context dans Onboarding.
- Le token a-t-il accès à toutes les API insights/knowledge ?
- À vérifier avec doc Era Context. Si pas, il faut une upgrade
  ou un autre token.

---

## §4 — Risques et mitigations

| Risque | Probabilité | Mitigation |
|---|---|---|
| Anthropic SDK + bundle size > Gemini | Moyenne | Bench les 2 — si > 50KB+ de différence, tree-shaking aggressif |
| Client-side API key (CORS) | Haute | Documenter clairement + envisager proxy Cloudflare Worker plus tard |
| Régression UX sur catégorisation (vitesse) | Moyenne | Era Context rules first, Claude fallback (PR #8) — devrait être plus rapide |
| Era Context insights API n'inclut pas tout | Faible | Wrappers tolérants (try/catch) avec fallback "donnée non dispo" |
| User a investi dans une clé Gemini, ne veut pas migrer | Moyenne | UI claire : "Gemini déprécié, basculez sur Anthropic — voici le lien pour la clé" |
| Coût Anthropic > Gemini pour le même usage | Moyenne | Mesurer en bench. Sonnet 4.6 ~3x Gemini 2.0 Flash mais qualité supérieure |

---

## §5 — Critères de succès

L'agent considère la migration "terminée" quand :

- [ ] `@google/genai` n'est plus dans `package.json`
- [ ] `services/gemini.ts` est supprimé
- [ ] 0 occurrence de "Gemini" dans le code (sauf doc historique)
- [ ] AiAssistant streaming fonctionne avec Claude (Sonnet 4.6)
- [ ] BudgetAiModal, Transactions categorize, TaxCenter vision : tous sur Claude
- [ ] Era Context fournit insights cash-flow + forecast au minimum
- [ ] Tests : tous verts (au moins 223/223 préservés)
- [ ] Bundle initial : pas plus de +30KB vs avant migration
- [ ] Onboarding labels mis à jour ("Anthropic" au lieu de "Google AI")
- [ ] Doc `WIRING_NOTES.md` mise à jour avec les nouveaux flux

---

## §6 — Ce qui n'est PAS dans ce plan

- **Backend proxy CORS** (peut venir plus tard si Option 1 pose problème)
- **Multi-modèle dynamique** (laisser à l'utilisateur le choix Sonnet vs Haiku)
- **MCP tool use direct depuis Claude** (Era Context expose des MCP tools, mais
  l'intégration avec un client browser est complexe — phase ultérieure)
- **Support OpenAI/autres providers** (focus 100% Anthropic pour ce plan)
- **Bank sync via Plaid** (Era Context fait déjà ce job)

---

## §7 — Ordre suggéré

```
A1 services/claude.ts          ┐
A2 AiAssistant migration       ├─ Phase A: migration mécanique
A3 Budget + Transactions       │  (3-4 semaines)
A4 TaxCenter vision            │
A5 Planning + cleanup          ┘

B6 Era Context insights API    ┐
B7 aiOrchestrator              ├─ Phase B: qualité boost
B8 Era Context categorizer     ┘  (2-3 semaines)
```

A1 doit être fait en premier (débloque tout). A2-A5 sont indépendants
et peuvent partir en parallèle si on veut. B6-B8 viennent après A.

---

## §8 — Validation utilisateur requise avant kickoff

Trois décisions :

1. **Choix modèles Claude** (Q1) — Sonnet partout sauf Haiku pour catégorisation, OK ?
2. **CORS / backend proxy** (Q3) — On reste client-side avec `dangerouslyAllowBrowser`, OK ?
3. **Stratégie cleanup** (Q4) — Suppression Gemini en PR #5 (final), OK ?

Si OK sur les trois, on lance A1 immédiatement.
