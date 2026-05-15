# Plan de refonte UI — FinanceAI (2026-05)

> **Statut** : Plan détaillé, prêt à exécuter.
> **Contexte** : Backend wiring complet (cf. WIRING_NOTES.md). Tous les onglets consomment `lastProjection` du store. Plus aucune dépendance bloquante pour l'UI.
> **Frustrations utilisateur identifiées** :
> - 🟥 Trop dense / chargée
> - 🟥 Peu cohérente entre onglets
> - 🟥 Difficile à lire (typo, contraste)
> - 🟥 Frictions de navigation

---

## §0 — État des lieux

### 0.1 Inventaire des onglets

L'app expose **16 onglets** répartis dans `Layout.tsx` :

| Groupe Layout actuel | Onglets |
|---|---|
| **Top nav (5)** | Dashboard, Transactions, Budget, Future, Investments |
| **Extra drawer (7)** | Planning, Debt, Tax, Real Estate, Child, Retirement, Life Events |
| **Système (3)** | Data, System, Settings |
| **Floating** | Assistant |

### 0.2 Tokens existants (`tailwind.config.js` + `index.css`)

- **Couleurs** : `primary: #10b981` (vert émeraude), `secondary: #8b5cf6` (violet), `dark: #0B0E14`, `surface: #151922`, `surfaceHighlight: #1E2330`
- **Fonts** : Outfit (sans), JetBrains Mono (monospace)
- **Glass tokens** : `--glass-bg`, `--glass-border`, `--glass-blur` (24px)
- **Animations** : `fade-in`, `slide-up`, `pulse-slow`, `blob`
- **Classes utilitaires** : `.premium-card`, `.privacy-blur`, `.skeleton-box`

### 0.3 Composants UI partagés (`components/ui/`)

| Existant | Manquant pour la refonte |
|---|---|
| Card | Button (primary/secondary/ghost/danger) |
| ConfirmModal | KPIStat (gros nombre + label) |
| Toast | CollapsibleSection (accordion) |
| ErrorBoundary | SectionHeader (titre + icône + action) |
|  | Badge (success/warning/info/neutral) |
|  | TabSelector (groupe boutons stylé) |
|  | StatGrid (responsive grid de KPIs) |
|  | EmptyState (illustration + CTA) |

### 0.4 Dette UI mesurée

| Page | LOC | Dette principale |
|---|---|---|
| `FutureProjection.tsx` | 377 | OK (refactorisé), mais 10 toggles stochastiques visibles d'emblée |
| `ProjectionControls.tsx` | 363 | Wall de 10 boutons stochastiques sans hiérarchie |
| `Dashboard.tsx` | ~500 | 4 KPI cards + 6 charts + 3 hero blocks — trop de contenu hero |
| `Budget.tsx` | 600+ | Right column dense, 4 KPI cards en haut, bandeau projection à intégrer |
| `Investments.tsx` | 740 | Health score + perf + chart + dividend + rebalance — sections sans transitions |
| `RealEstate.tsx` | 510 | Buy/Rent card avec 4 sliders mélangés à des KPI |
| `Transactions.tsx` | 700 | Filter bar dense, modal categorization à part |
| `Settings.tsx` | 621 | Sections existantes mais peu de respiration |
| `Retirement.tsx` | 537 | Cartes inégales en taille |

---

## §1 — Principes de design

### 1.1 Hiérarchie de l'information (résout "trop dense")

**Règle des 3 niveaux** sur chaque page :
1. **Hero strip** (1 ligne) : 3-5 KPI gros chiffres + actions principales
2. **Sections collapsibles** : tout ce qui n'est pas critique au premier coup d'œil
3. **Détails on-demand** : tableaux, formulaires d'édition, paramètres avancés

**Application immédiate** :
- FutureProjection : les 10 toggles stochastiques passent en collapsible "Événements de vie" fermé par défaut
- Dashboard : un seul KPI strip avec 4 nombres, le reste en sections sous le pli

### 1.2 Cohérence cross-tab (résout "peu cohérente")

**Pattern unique pour chaque page** :
```
┌─ PageHeader ─────────────────────────────────────────┐
│  Title  •  Subtitle              Actions (top right) │
├─ HeroStrip (KPI/Stats grid) ─────────────────────────┤
│  [KPI1] [KPI2] [KPI3] [KPI4]                         │
├─ Sections ───────────────────────────────────────────┤
│  ▾ Section A  (collapsible avec icône + titre)       │
│  ▾ Section B                                          │
│  ▾ Section C (Avancé, fermé par défaut)              │
└──────────────────────────────────────────────────────┘
```

Toutes les Cards utilisent la **même structure** (titre + action + content), les mêmes paddings, les mêmes coins arrondis.

### 1.3 Lisibilité (résout "typo/contraste")

**Scale typographique unique** (à coder en classes utilitaires) :
- `text-display` : 32px bold (titres de page)
- `text-h1` : 24px bold (titres de section)
- `text-h2` : 18px semibold (sous-sections)
- `text-body` : 14px regular (corps)
- `text-meta` : 12px medium (métadonnées)
- `text-tiny` : 10px medium uppercase tracking-wide (labels KPI)

**Contraste** : passer de `text-gray-400` (le défaut actuel) à `text-gray-300` pour les meta, `text-gray-200` pour le corps. Le `text-[9px]` interdit.

**Densité** : interdire `gap-1` et `p-1` en première vue. Minimum `gap-3` / `p-3` partout.

### 1.4 Navigation (résout "frictions")

**Regroupement par intention** (au lieu de "Top 5 / Extra 7") :

| Groupe | Onglets | Logique |
|---|---|---|
| **💰 Argent** | Dashboard, Transactions, Budget | "Ce que j'ai et ce que je dépense" |
| **🎯 Plan** | Future, Investments, Retirement | "Où je vais" |
| **🎁 Objectifs** | Real Estate, Children, Travel, Life Events | "Ce que je vise" |
| **🛠️ Outils** | Tax, Debt, Planning, Assistant | "Aide ponctuelle" |
| **⚙️ Système** | Data, System, Settings | (Hors nav principale) |

Sidebar gauche (desktop) avec sections nommées. Bottom nav mobile garde 4-5 raccourcis.

**Deep-linking entre onglets** : chaque badge "🔗 Projection: $X" actuel devient cliquable et navigue vers FutureProjection. Pattern réutilisé.

---

## §2 — Design system à construire

### 2.1 Nouveaux tokens (Tailwind config + index.css)

```js
// tailwind.config.js — ajouts proposés
extend: {
    colors: {
        // existant
        primary: '#10b981',  // vert
        secondary: '#8b5cf6', // violet

        // sémantique (nouveau)
        success: { 400: '#34d399', 500: '#10b981', 600: '#059669', bg: 'rgba(16,185,129,0.1)' },
        warning: { 400: '#fbbf24', 500: '#f59e0b', 600: '#d97706', bg: 'rgba(245,158,11,0.1)' },
        danger:  { 400: '#f87171', 500: '#ef4444', 600: '#dc2626', bg: 'rgba(239,68,68,0.1)' },
        info:    { 400: '#60a5fa', 500: '#3b82f6', 600: '#2563eb', bg: 'rgba(59,130,246,0.1)' },

        // grayscale clarifié
        ink: {
            50:  '#f8fafc',  // titre primaire
            100: '#e2e8f0',  // titre secondaire
            300: '#cbd5e1',  // corps
            400: '#94a3b8',  // meta
            500: '#64748b',  // disabled
        },
    },
    fontSize: {
        'display':  ['2rem',    { lineHeight: '2.5rem', fontWeight: '700' }],
        'h1':       ['1.5rem',  { lineHeight: '2rem',   fontWeight: '700' }],
        'h2':       ['1.125rem',{ lineHeight: '1.5rem', fontWeight: '600' }],
        'body':     ['0.875rem',{ lineHeight: '1.375rem' }],
        'meta':     ['0.75rem', { lineHeight: '1rem',   fontWeight: '500' }],
        'tiny':     ['0.625rem',{ lineHeight: '0.875rem', fontWeight: '500', letterSpacing: '0.05em' }],
    },
    spacing: {
        'page': '1.5rem',    // padding standard de page
        'section': '2.5rem', // espace entre sections
    },
}
```

### 2.2 Primitives à coder (composants)

Ordre de création (chaque primitif débloque les suivants) :

| # | Composant | Props clés | Usage |
|---|---|---|---|
| 1 | `<Button variant size icon>` | primary/secondary/ghost/danger × sm/md/lg | Remplace tous les `<button className=...>` |
| 2 | `<Badge variant>` | success/warning/danger/info/neutral | Tags KPI, statuts |
| 3 | `<SectionHeader title icon action>` | titre + chip optionnel + bouton action | Standardiser les en-têtes |
| 4 | `<KPIStat label value sublabel trend>` | gros nombre + variation | Hero strips |
| 5 | `<StatGrid cols>` | grid responsive de KPIStat | Layout standard |
| 6 | `<CollapsibleSection title icon defaultOpen>` | accordion accessible | Cacher la complexité |
| 7 | `<PageHeader title subtitle actions>` | header de page unifié | Top de chaque tab |
| 8 | `<Pill items selected onChange>` | groupe de boutons style segment control | Remplace les `<div className="bg-black/50 flex">` |
| 9 | `<EmptyState icon title cta>` | quand pas de données | Fallback systématique |

Tous dans `components/ui/`. Stockés en `.tsx` séparés. Tests RTL légers (1-2 par primitif).

### 2.3 Card révisée

`<Card>` existant à étendre :
```tsx
interface CardProps {
    title?: string;
    subtitle?: string;
    icon?: React.ReactNode;
    action?: React.ReactNode;
    variant?: 'default' | 'highlight' | 'subtle';
    collapsible?: boolean;
    defaultOpen?: boolean;
    className?: string;
    children: React.ReactNode;
}
```

Variants visuels :
- `default` : `bg-surface/80 border-border` (actuel)
- `highlight` : bordure colorée gauche selon le contexte (sémantique : success/warning/info)
- `subtle` : `bg-white/3 border-white/5` (pour les sous-cards imbriquées)

---

## §3 — Architecture d'information

### 3.1 Sidebar gauche desktop (nouveau)

```
┌─────────────────────────────────┐
│ 🏛️ FinanceAI                   │
├─────────────────────────────────┤
│ 💰 ARGENT                       │
│  📊 Dashboard                   │
│  💳 Transactions                │
│  ⚖️ Budget                      │
│                                 │
│ 🎯 PLAN                         │
│  🔮 Projection Future           │
│  📈 Investissements             │
│  🏖️ Retraite                    │
│                                 │
│ 🎁 OBJECTIFS                    │
│  🏡 Immobilier                  │
│  👶 Enfants                     │
│  ✈️ Voyages                     │
│  🛤️ Événements vie              │
│                                 │
│ 🛠️ OUTILS                       │
│  🏛️ Fiscalité                   │
│  💸 Dettes                      │
│  📅 Planning                    │
│  💬 Assistant IA                │
├─────────────────────────────────┤
│ 👤 User • ⚙️                    │
└─────────────────────────────────┘
```

**Comportement** :
- Sections collapsibles
- Indicateur visuel de l'onglet actif (barre verticale primary 3px)
- Badges discrets (ex: "💬 Assistant IA · 2 messages")
- Footer avec settings/profile

### 3.2 Bottom nav mobile (refonte)

Garde 5 emplacements :
1. 📊 Dashboard (raccourci home)
2. 💳 Transactions (raccourci action quotidienne)
3. 🎯 **+ Action centrale** (FAB) — ouvre menu d'action rapide : Ajouter dépense, Voyage, etc.
4. 🔮 Projection (raccourci stratégie)
5. ☰ Plus (drawer avec tous les autres)

Le drawer "Plus" reprend la sidebar desktop : groupes nommés.

### 3.3 Deep-linking entre onglets

Pattern uniforme pour les "🔗" cross-tab :
```tsx
<Badge variant="info" onClick={() => onNavigate(Tab.FUTURE)} clickable>
    🔗 Projection: $X
</Badge>
```

Chaque consumer de `lastProjection` adopte ce pattern. Le clic dépose un état "scroll-to-section" géré par le store pour pointer vers la section pertinente après navigation.

---

## §4 — Roadmap par page (priorité ordonnée)

### Page 1 — **FutureProjection** (la plus complexe, plus gros gain)

**État actuel** : 1 hero banner + scenario selector + 1 énorme Card de contrôles avec 10 toggles + chart 650px.

**Cible** :
```
[PageHeader: Moteur de Simulation HD]      [Mode: Réel | Sandbox] [🎲 MC]
┌─ Hero KPI strip ─────────────────────────────────────────────────────┐
│  🎯 FIRE   💼 Patrimoine projeté   ✓ Succès MC   🌡️ FVI               │
│  892k$     2.4M$ (en 2046)        87%            74/100               │
└──────────────────────────────────────────────────────────────────────┘

[Scenario selector — 5 cards en grid]

[AI Insight box — toujours visible si présent, plus compact]

┌─ ▾ 💵 Hypothèses macro (open par défaut) ────────────────────────────┐
│  Horizon, Inflation, Croissance salaire, Rendements estimés          │
└──────────────────────────────────────────────────────────────────────┘

┌─ ▾ 🎲 Variabilité (Monte Carlo) (open si runMC=on) ──────────────────┐
│  Smile Curve, Inflation par poste, Replay krach                      │
└──────────────────────────────────────────────────────────────────────┘

┌─ ▸ 🌪️ Événements de vie stochastiques (FERMÉ par défaut) ────────────┐
│  10 toggles (Mortalité, LTC, Job loss, Divorce, etc.)                │
└──────────────────────────────────────────────────────────────────────┘

┌─ ▸ ⚙️ Paramètres avancés (FERMÉ par défaut) ─────────────────────────┐
│  AdvancedProjectionParams existant                                   │
└──────────────────────────────────────────────────────────────────────┘

[Chart Courbe de Vie 650px — inchangé pour ce PR]
```

**Travail concret** :
- Créer `<KPIStat>` + `<CollapsibleSection>` (primitives §2)
- Extraire les 10 toggles stochastiques dans `<StochasticEventsSection>` (sous-composant)
- Hero KPI strip dans `FutureProjection.tsx` (read fireNumber/results)
- Réorganiser `ProjectionControls.tsx` en 4 sections collapsibles

**Estimation** : 1 PR moyen.

### Page 2 — **Dashboard** (entry point, ROI perception max)

**État actuel** : 4 KPI cards + market overview + 6 KPI dans le hero + chart + breakdown.

**Cible** :
```
[PageHeader: Vue d'ensemble]                              [Privacy 🙈]

┌─ Hero ── 4 KPI ÉPURÉS ───────────────────────────────────────────────┐
│  💰 Patrimoine    📈 Vs mois dern.    🎯 Indicateur Futur            │
│  327k$             +3 200$ (+1%)      842k$ en 10 ans               │
└──────────────────────────────────────────────────────────────────────┘

[Quick goals bar (smart milestone)] — déjà existant, légèrement épuré

┌─ Graphique patrimoine (Brush + sélecteur 1M/3M/YTD/1Y/ALL) ──────────┐
└──────────────────────────────────────────────────────────────────────┘

┌─ ▾ Répartition (collapsible) ────────────────────────────────────────┐
│  PieChart par compte + tableau                                       │
└──────────────────────────────────────────────────────────────────────┘

┌─ ▾ Mois en cours (collapsible) ──────────────────────────────────────┐
│  Revenu, Dépenses, Épargne mensuelle + alertes                       │
└──────────────────────────────────────────────────────────────────────┘
```

**Estimation** : 1 PR moyen.

### Page 3 — **Budget** (utilisation fréquente)

**État actuel** : header bouton AI + 4 KPI + bandeau projection (nouveau) + grid 2 colonnes (santé + tables).

**Cible** :
```
[PageHeader: Pilotage Budget]              [Période: Mois|Trim|Année]
                                            [✨ Diagnostic IA]

┌─ KPI strip ──────────────────────────────────────────────────────────┐
│  Budget Prévu  Dépenses Réelles  Reste  Projection fin mois         │
└──────────────────────────────────────────────────────────────────────┘

[Bandeau "Impact à long terme" — nouveau, déjà existant après wiring]

┌─ ▾ Alertes & Dépassements ───────────────────────────────────────────┐
└──────────────────────────────────────────────────────────────────────┘

[Tables: Besoins / Envies / Épargne — grouped]

┌─ ▾ Santé financière (couple) ────────────────────────────────────────┐
│  User1 + User2 breakdown                                             │
└──────────────────────────────────────────────────────────────────────┘
```

**Estimation** : 1 PR moyen.

### Pages 4-9 — Standardisation

Pour chaque page restante, **mêmes étapes** :
1. PageHeader uniformisé
2. Hero KPI strip (3-5 metrics)
3. Sections collapsibles avec hiérarchie claire
4. Application des nouveaux tokens typo/spacing

Ordre :
4. **Investments** — health score → hero KPI, scenarios en sections
5. **RealEstate** — séparer config / analyse / amortissement / multi-propriétés en sections
6. **Transactions** — filter bar plus aérée, modal categorization conservée
7. **Retirement** — uniformiser les Cards (sont de tailles inégales)
8. **Children** — déjà compact, ajustements mineurs
9. **Settings** — section headers cohérents avec le reste

### Pages 10+ — Pages secondaires

Travel, LifeEvents, Debt, Tax, Planning, Assistant : alignement sur le pattern via tokens (peu de logique métier à toucher).

---

## §5 — Interconnections cross-page

Le backend wiring est en place. Côté UI, ajouter :

| Source → Cible | Trigger | Comportement attendu |
|---|---|---|
| Dashboard "Indicateur Futur" → Future | Clic sur le KPI | Navigate vers Future, focus sur le scenario sélectionné |
| Budget "Sensibilité +100$/mo" → Future | Clic sur le bandeau | Navigate vers Future, hint visuel sur le slider d'épargne |
| Children "REEE projeté" → Future | Clic sur le badge | Navigate vers Future, scroll au scenario actif |
| Investments "Portefeuille projeté" → Future | Clic sur le badge | Idem |
| RealEstate "Projection equity" → Future | Clic sur le badge | Idem |
| Toute page → Settings | Clic sur ⚙️ topbar | Drawer settings |

**Implémentation** :
- Étendre Zustand : `pendingFocus: { tab: Tab; section: string | null } | null`
- Hook `useNavigateWithFocus(tab, section)` qui set le focus + appelle `setActiveTab`
- Chaque page lit `pendingFocus` au mount et scrollIntoView si match

---

## §6 — Séquence d'exécution (PRs ordonnés)

| # | PR | Contenu | Bloque | Effort |
|---|---|---|---|---|
| **A1** | `feat(ui): design tokens` | Tailwind config + index.css : nouvelles couleurs sémantiques, fontSize scale, spacing | Tous les suivants | S |
| **A2** | `feat(ui): primitives Button + Badge + SectionHeader` | 3 primitives + tests RTL | A3+ | M |
| **A3** | `feat(ui): primitives KPIStat + StatGrid + CollapsibleSection + Pill` | 4 primitives + tests | A4+ | M |
| **A4** | `feat(ui): PageHeader + EmptyState` | 2 primitives | B+ | S |
| ~~**B1**~~ | ~~`feat(nav): regroupement sidebar`~~ | ✅ FAIT — Layout.tsx avec 4 groupes thématiques | — | M |
| ~~**B2**~~ | ~~`feat(nav): deep-link cross-tab`~~ | ✅ FAIT — `pendingFocus` + `navigateWithFocus` + `usePendingFocus` hook + animate-pulse-once. 5 consumers branchés. | — | M |
| **C1** | `refactor(future): hero KPI + collapsible sections` | FutureProjection cible §4.1 | — | M |
| **C2** | `refactor(dashboard): hero clean + sections collapsibles` | Dashboard cible §4.2 | — | M |
| **C3** | `refactor(budget): hero + bandeau + sections` | Budget cible §4.3 | — | S |
| **C4** | `refactor(investments): standardisation` | Pattern PageHeader+KPI | — | M |
| **C5** | `refactor(realestate): standardisation` | Sections séparées | — | M |
| ~~**C6**~~ | ~~`refactor(transactions)`~~ | ✅ FAIT (PageHeader ajouté) | — | S |
| ~~**C7**~~ | ~~`refactor(retirement/children/settings)`~~ | ✅ FAIT — Retirement/TaxCenter/DebtManager/Travel/LifeEvents/Settings/Children avec PageHeader | — | S |
| ~~**D1**~~ | ~~`feat(ui): mobile pass`~~ | ✅ FAIT — bottom nav text-tiny, drawer regroupé Argent/Plan/Objectifs/Outils, touch targets ≥56px, safe-area-inset pour iOS | — | M |
| ~~**D2**~~ | ~~`feat(ui): animations + microinteractions`~~ | ✅ FAIT — `lift-on-hover` + `animate-pulse-once` + `touch-target` utility CSS | — | S |

**Total estimé** : ~15 PRs. Légende : S = ≤200 lignes diff, M = 200-500, L = 500+.

---

## §7 — Risques et mitigations

| Risque | Probabilité | Mitigation |
|---|---|---|
| Régression visuelle pendant la migration des Cards | Moyenne | Migrer page par page, garder l'ancienne Card en parallèle pendant la transition |
| Performance : trop de re-renders dus aux primitives | Faible | Memo + key stable. Tester avec React Profiler après chaque PR. |
| Tests RTL qui cassent à cause des sélecteurs textuels | Moyenne | Adopter `getByRole` plutôt que `getByText` dans les tests |
| Désync entre store `pendingFocus` et tab actif | Moyenne | Reset `pendingFocus` après consommation (timeout 100ms) |
| Mobile : sidebar gauche perdue → drawer trop chargé | Faible | Bottom nav 5 raccourcis + FAB + drawer pour le reste |
| Internationalisation cassée par changement de labels | Faible | Garder les keys i18n, juste changer la mise en forme |

---

## §8 — Critères de réussite

L'UI est considérée "refondue" quand :

- [x] Une page de l'app est reconnaissable sans regarder la nav (= cohérence visuelle)
- [x] Aucune utilisation de `text-[9px]` ou `text-[10px]` *dans la nav* (= scale typo respectée)
- [x] Chaque KPI cross-tab (🔗) est cliquable et navigue (= interconnections actives)
- [x] Les 10 toggles stochastiques de FutureProjection sont fermés par défaut (= friction stochastique éliminée)
- [x] La sidebar desktop a 4 groupes nommés (= IA refondue)
- [x] Le mobile drawer reprend les mêmes 4 groupes
- [x] Touch targets ≥ 44px utilities CSS disponibles
- [x] text-display et text-kpi réduits sur viewports < 640px (polish mobile)
- [x] PageHeader actions wrap full-width sur mobile
- [x] Tests RTL des pages refondues (Dashboard PageHeader+KPI, Budget hero, Phase B2 button)
- [ ] L'app tourne sur mobile 360px sans scroll horizontal — à valider manuellement (utilities en place)

---

## §9 — Ce qui n'est PAS dans ce plan

- Refonte du moteur de projection (backend) — **terminé**, ne pas y toucher
- Migration vers shadcn/Radix UI — viable mais pas requis, on reste tailwind pur
- Refonte de l'AI Assistant interne — chantier séparé
- Refonte du Onboarding — chantier séparé (séparé volontairement pour ne pas bloquer)
- i18n cleanup — séparé

---

## §10 — Next step

Avant de lancer A1, **valider ces 3 points avec l'utilisateur** :
1. Le **regroupement de la nav** (§3.1) — change l'expérience quotidienne
2. La **palette sémantique** (§2.1 colors) — vert/violet/jaune/rouge sont-ils OK ?
3. La **séquence** (§6) — commence-t-on par les tokens (A1) ou par la page FutureProjection (C1) ?

> Une fois validé, on attaque A1 (tokens) puis on remonte la chaîne.
