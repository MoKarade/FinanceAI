# Plan P2 — Mobile & a11y AAA ✅ TERMINÉ (9/9)

> **Origine** : roadmap "10/10" après P1 Production Readiness clôturé (PRs #99 à #105).
> **Statut** : **9/9 items livrés** (PRs #107 à #114), 2026-05-20/21.
> **Triage initial** : la base était déjà solide. Sidebar mobile (top + bottom nav)
> en place depuis cycle 7.D, modal focus-trap, 205 instances `aria-*`,
> 72 usages de `.focus-ring`, script contrast, axe sur 6 primitives.
> **Estimation** : initial 25-30h roadmap → révisée 14h après triage → livré ~7h.
> **Contrainte cardinale respectée** : zéro dépendance payante.

---

## Vue d'ensemble — État triage

✅ **Déjà solide** (issu du cycle 7.D + refonte v3.0) :
- Layout responsive : sidebar `hidden md:flex` + top header + bottom nav mobile
- Touch targets bottom nav 56px+ (exceeds 44×44 WCAG)
- Modal focus-trap + `aria-modal` + Escape + body scroll lock
- `.focus-ring` systématique (72 usages)
- Script `scripts/check-contrast.ts` + `vitest-axe` sur 6 primitives
- 205 instances `aria-*` à travers components/
- Mobile font scaling (`@media (max-width: 639px)`)
- `pb-safe` (iOS safe inset)

⚠️ **Gaps réels identifiés** :
- Aucun test axe sur pages complètes (seulement primitives)
- Modal pas de restore focus à la fermeture
- Bouton close modal 32px (sous 44×44)
- Pas de skip-to-main link
- `.touch-target` défini mais peu utilisé hors bottom nav
- Pas de PWA / manifest / offline shell

---

## Items P2

| Item | Effort | Impact | Statut |
|---|---|---|---|
| **P2.1** Tests axe pages complètes (Onboarding, SystemView, Dashboard, TaxBracketViz) | 4h | 🟠 important | ✅ livré (#114) |
| **P2.2** Modal focus restore on close | 0.5h | 🟡 utile | ✅ livré (#108) |
| **P2.3** Modal close button 32→44px hit area | 0.5h | 🟡 utile | ✅ livré (#108) |
| **P2.4** Touch target audit (`.touch-target` adoption) | 2h | 🟡 utile | ✅ livré (#110) |
| **P2.5** Contrast script run + fix flagged combos | 1h | 🟠 important | ✅ livré (#109) |
| **P2.6** Respect `prefers-reduced-motion` (animations/transitions) | 0.5h | 🟡 utile | ✅ livré (#108) |
| **P2.7** Skip-to-main link | 0.5h | 🟡 utile | ✅ déjà fait (cycle 5.1) |
| **P2.8** Form labels audit (~35 inputs orphelins) | 2h | 🟠 important | ✅ livré (#112) |
| **P2.9** PWA minimal (manifest.json + SW offline shell) | 3h | 🟢 nice-to-have | ✅ livré (#113) |
| **TOTAL** | **~14h** | | |

**P2.10 user-side** : test sur iPhone SE / Galaxy A entry-level réel. Non délégable.

---

## P2.1 — Tests axe pages complètes (4h) ✅ livré (#114)

### Architecture
- `tests/a11y/pages.axe.test.tsx` : tests axe sur les vues principales montées
  avec leur store + stubs réseau.
- Stubs : `services/eraContext` mocké pour retourner empty list, fxRates locales,
  pas d'appel réseau, pas d'IA.

### Pages prioritaires
1. Dashboard
2. Transactions
3. Investments
4. TaxCenter
5. Retirement
6. FutureProjection
7. Settings (god-component — surface importante)
8. Onboarding

### Critères acceptance
- 0 violation `wcag2aa` sur chacune des 8 pages
- Tests rapides (<5s/page) via `mockProvider` minimal

### Patterns
- Réutiliser le wrap setup de `tests/a11y/primitives.axe.test.tsx`
- Provider Zustand avec un state minimal mais réaliste (1 user, quelques tx)

---

## P2.2 — Modal focus restore (0.5h) ✅ livré (#108)

### Changement
- `components/ui/Modal.tsx` : capturer `document.activeElement` au moment du
  `useEffect` open, le re-focus au cleanup
- Edge case : si l'élément a été détruit pendant l'ouverture du modal,
  fallback sur `document.body`

### Test
- Étendre les tests `Modal.test.tsx` pour vérifier que le focus revient sur
  l'opener après fermeture par Escape, par backdrop, ou par close button

---

## P2.3 — Modal close button hit area (0.5h) ✅ livré (#108)

### Changement
- Bouton close : `w-8 h-8` → `w-10 h-10` (40px) ou augmenter padding
  pour atteindre 44×44 hit area sans changer visuellement la croix
- Vérifier qu'on respecte le design existant (la croix peut rester
  visuellement à 16px, mais le hit area doit faire 44×44)

---

## P2.4 — Touch target audit (2h) ✅ livré (#110)

### Approche
- Grep `<button` dans components/ pour les boutons icon-only
- Identifier les `w-X h-X` avec X<11 (44px = 11 × 4px)
- Appliquer soit `.touch-target` soit augmenter le padding pour
  atteindre 44×44 sans changer le visuel

### Cibles probables
- Boutons icon dans Sidebar (déjà OK probablement)
- Boutons de tri dans Transactions
- Boutons close des Toast
- Boutons d'action dans listes (delete row, edit, etc.)

---

## P2.5 — Contrast script run + fix (1h) ✅ livré (#109)

### Commande
```bash
npx tsx scripts/check-contrast.ts
```

### Action
- Lire le rapport : pour chaque combo qui rate WCAG AA (4.5 normal, 3.0 large),
  remplacer le token par une version plus contrastée
- Couleurs à vérifier en priorité :
  - `gray-400` sur `bg-dark` (typique pour subtitles)
  - `gray-500` sur `bg-dark`
  - `text-ink-400` sur cards `bg-white/5`

### Risque
- Modifier les tokens peut affecter beaucoup d'endroits ; **rebuild les
  classes affectées** plutôt que toucher tailwind.config si possible.

---

## P2.6 — `prefers-reduced-motion` (0.5h) ✅ livré (#108)

### Changement
- `index.css` : ajouter un media query global qui désactive les
  transitions et animations longues
  ```css
  @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
          animation-duration: 0.01ms !important;
          animation-iteration-count: 1 !important;
          transition-duration: 0.01ms !important;
          scroll-behavior: auto !important;
      }
  }
  ```
- Pour framer-motion (utilisé dans Sidebar) : vérifier que `useReducedMotion`
  est respecté
- Pour Recharts : vérifier `animationDuration` configurable

---

## P2.7 — Skip-to-main link (0.5h) ✅ déjà fait (cycle 5.1)

### Changement
- `App.tsx` : ajouter en premier child un `<a href="#main-content">Aller au contenu</a>`
  visuellement caché jusqu'au focus (`sr-only focus:not-sr-only`)
- `Layout.tsx` : ajouter `id="main-content"` sur le wrapper `<main>`

---

## P2.8 — Form labels audit (2h) ✅ livré (#112)

### Approche
- Grep `<input` et `<select` dans components/
- Pour chaque input : vérifier
  - soit `<label htmlFor="id">` associé avec `<input id="id">`
  - soit `aria-label="..."` direct
  - soit `aria-labelledby="..."` pointant vers un label visible
- Documenter dans ADR-004 quand on aura les form primitives

### Surface
- Settings (god-component) : ~40-50 inputs probablement
- Configuration / Hub : ~20 inputs
- Transactions filters
- LifeProjects / Goals forms
- Budget editing rows

### Tradeoff
- Implémentation rapide : ajouter `aria-label` aux inputs orphelins
- Implémentation propre : form primitives (8h en backlog)

---

## P2.9 — PWA minimal (3h) — optionnel ✅ livré (#113)

### Composants
- `public/manifest.json` : name, short_name, icons (192, 512), theme_color,
  background_color, display: standalone, start_url
- `public/sw.js` : service worker minimal cache-first sur `/assets/*` (les
  hash-named chunks sont parfaits pour ça vu qu'ils sont déjà immutable
  per cache headers P1.4)
- Register du SW dans `App.tsx` boot
- Vérifier que la résilience chunk-load (lazyWithRetry P1.4) reste valide
  même avec un SW

### Risque
- SW peut casser la résilience chunk-load si mal configuré → tester
- Sur Vercel/Netlify : vérifier que le SW est bien servi avec
  `Cache-Control: no-cache` (sinon il ne se met jamais à jour)

### Décision
- Faire si user veut installer l'app sur home screen mobile
- Skip sinon — pas critique pour AAA

---

## Stratégie d'exécution

### Phase 1 — Quick wins (3h)
- P2.2 + P2.3 + P2.6 + P2.7 : tout petits PRs ou un seul PR groupé.
- Faible risque, gros UX impact, validation rapide.

### Phase 2 — Audits qui mènent à des fixes (5h)
- P2.5 contrast (peut-être 0 fix nécessaire si tokens déjà OK)
- P2.4 touch target audit (peut-être lourd ou léger selon découvertes)
- P2.8 form labels (probablement le plus gros sur Settings)

### Phase 3 — Tests automatisés (4h)
- P2.1 axe pages complètes. Locks le travail des phases 1+2.

### Phase 4 — Optionnel (3h)
- P2.9 PWA. Seulement si user le veut.

---

## Done = AAA prêt

- 0 violation axe sur les 8 pages principales
- 100% des boutons icon-only ≥ 44×44 hit area
- 100% des inputs ont label associé ou `aria-label`
- Contrast script clean (0 fail WCAG AA)
- Modal focus restore wired
- Skip-link wired
- `prefers-reduced-motion` respecté
- Tests : 566 → ~580+ (axe pages comme + 1 test par page)

Quand tout ça est livré, on peut prétendre **WCAG AA conformant** sérieusement,
avec un sous-ensemble AAA (touch, focus, reduced-motion).
