# ADR-004 : Design system primitives custom (vs shadcn/Radix)

**Date** : 2026-05
**Statut** : Acceptée

## Contexte

Avant la refonte UI 2026-05, chaque page avait ses propres patterns Tailwind
inline. Cards stylées différemment, KPI boxes recopiées 5 fois avec couleurs
hard-codées, scale typo incohérente (`text-[9px]`, `text-[10px]`,
`text-[11px]` cohabitent), pas de focus rings unifiés.

L'audit qualité 2026-05 a recommandé un **design system** explicite. Trois
voies envisagées :

1. **shadcn/ui** + Radix UI primitives (Headless UI accessibles)
2. **MUI / Mantine** (component lib complète)
3. **Primitives custom** Tailwind-only

## Décision

Voie 3 : **primitives custom** en Tailwind pur, basées sur des **tokens
sémantiques** définis dans `tailwind.config.js` + `index.css`.

**Primitives livrées** (toutes dans `components/ui/`) :

| Primitive | Rôle |
|---|---|
| `Button` | Variantes primary/ghost/danger/success, sizes sm/md, loading, fullWidth |
| `Badge` | Variantes success/warning/danger/info/neutral/primary, sizes sm/md |
| `Card` | Container standard avec `title` + `action` optionnels |
| `CollapsibleSection` | Section pliable avec icon/subtitle/badge, contrôlé/non-contrôlé |
| `KPIStat` | Card KPI avec icon/value/sublabel/trend, variants sémantiques |
| `StatGrid` | Wrapper grid responsive pour KPIStat (cols=2-5) |
| `PageHeader` | Header de page : icon + title + subtitle + actions + badge |
| `Pill` | Toggle group (radio bouton style segment control) |
| `SectionHeader` | Sous-titre de section avec accent visuel |
| `EmptyState` | Placeholder pour listes vides |
| `Modal` + `ConfirmModal` | Modale avec focus trap |
| `Toast` | Notifications éphémères |
| `Tooltip` | Tooltip clavier-accessible |
| `ErrorBoundary` | Boundary React standardisée |

**Tokens** (`tailwind.config.js`) :
- Couleurs sémantiques : `primary`, `success`, `warning`, `danger`, `info`, `secondary`
- Surfaces : `surface`, `surface-elevated`, `ink-50` à `ink-700`
- Scale typo : `text-display`, `text-h1/h2`, `text-body`, `text-meta`,
  `text-tiny` — pas de `text-[Npx]` ad-hoc
- Border-radius : `rounded-card`
- Focus : `focus-ring` utility CSS

**Pourquoi pas shadcn/Radix** :
- L'app est small-scope (1 utilisateur). Pas de besoin de a11y headless
  ultra-rigoureux (Radix). Le coût d'apprentissage et la dépendance Radix
  (~50KB+) ne se justifient pas.
- Tailwind pur garde la simplicité du `className`. Pas de surcouche
  d'abstraction (e.g., `<Button asChild>` avec slot).
- Les primitives sont **lisibles d'un coup d'œil** par n'importe quel agent
  LLM (50-80 lignes max chacune).

**Pourquoi pas MUI/Mantine** :
- Bundle prohibitif (~150-300 KB minified)
- Style "Material" / "Mantine" cassé par le thème dark custom
- Override Tailwind difficile sans modules CSS

## Conséquences

**Positives** :
- Bundle UI minimal (chaque primitive est en gzip < 1KB)
- Cohérence visuelle 100% : 9 pages refactorées (Phase C : C1-C7) avec le
  même pattern PageHeader + StatGrid + KPIStat + CollapsibleSection
- Tokens sémantiques permettent un re-skin futur (changer 1 var = changer
  toute l'app)
- Tests RTL stables (sélecteurs `getByRole` privilégiés)

**Négatives / ouvertes** :
- A11y à charge du développeur — pas de focus trap "gratuit" comme Radix.
  Mitigation : `Modal` implémente un focus trap maison, `Tooltip` gère le
  keyboard avec `aria-describedby`.
- Pas de `<Combobox>` ou `<Listbox>` complexe. Si besoin futur, on évaluera
  Radix juste pour ces cas (cohabitation possible).
- Form primitives (Input/Select) ne sont **pas encore** dans le système.
  Tracking dans `UI_REFOUNDATION_PLAN.md` pour un chantier futur si la
  douleur émerge.

**Référence** : voir [UI_REFOUNDATION_PLAN.md](../UI_REFOUNDATION_PLAN.md) §2.
