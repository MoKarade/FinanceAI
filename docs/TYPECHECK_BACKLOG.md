# Backlog typecheck - Bugs preexistants a fixer pour sortir de l'exclude tsconfig

> Apres re-activation du typecheck CI (commit ~XXX), 4 fichiers sont temporairement
> exclus du tsconfig parce qu'ils contiennent des bugs de typage **preexistants**
> que personne n'avait detectes avant la mise en place de la CI strict.
>
> Ces bugs ne bloquent PAS l'app runtime (Vite build via esbuild passe sans verif TS),
> mais ils doivent etre fixes pour eviter la regression et reactiver la protection
> typecheck. Plan : 1-2 fichiers par sprint dedie.

## Etat actuel

Fichiers **fixes** (sortis de l'exclude) :
- ✅ `utils/tax.ts` (TS7005 breakdown implicit any[])
- ✅ `components/Retirement.tsx` (TS2367 comparaison CELIAPP impossible)
- ✅ `components/Settings.tsx` (TS2322 User[] vs [User, User] tuple)

Fichiers **exclus** (a fixer) :
- ❌ `utils/useFutureSimulation.ts` (1948 lignes, 22 `any`, imports types manquants)
- ❌ `components/Dashboard.tsx`
- ❌ `components/FutureProjection.tsx`
- ❌ `components/Investments.tsx`
- ❌ `components/Transactions.tsx`

## Fixes detailles par fichier

### components/Dashboard.tsx (~3 erreurs)

**TS2339 ligne 161** : `g.currentValue` et `g.mortgageBalance` sur `RealEstateGoal`.
```tsx
const currentRealEstateEquity = realEstateGoals.reduce(
  (sum, g) => sum + (g.currentValue || 0) - (g.mortgageBalance || 0), 0
);
```
Problem : `RealEstateGoal` (types.ts) n'a ni `currentValue` ni `mortgageBalance`.
Les vrais champs sont `price`, `downPayment`, `mortgageRate`, `amortization`.

**Fix options** :
1. (Meilleur) Ajouter `currentValue?: number` et `mortgageBalance?: number` au type
   `RealEstateGoal` dans `types.ts` - ils ont leur place dans le modele.
2. (Pragmatique) Caster : `((g as any).currentValue || 0) - ((g as any).mortgageBalance || 0)`.
3. (Refactor) Utiliser `g.price` comme proxy + calculer le mortgage restant
   via `runAmortization` de `services/realEstate.ts`.

**TS2339 ligne 416** : `ev.icon` sur `LifeEvent`.
```tsx
milestones.push({ ..., icon: ev.icon || '🎯', ... });
```
Problem : `LifeEvent` (types.ts) n'a pas `icon`.

**Fix** : Ajouter `icon?: string` au type `LifeEvent`, ou caster `(ev as any).icon`.

### components/FutureProjection.tsx (~10 erreurs)

**TS2322 lignes 180-182** : `config.users.reduce(...)` ou les params sont `never`.
Meme pattern que `services/portfolio.ts` deja fixe : `[User, User] | never[]` apres
fallback `|| []`.

**Fix** : ajouter une annotation explicite
```tsx
const baseNetAnnual = useMemo(() => (config?.users || []).reduce(
  (sum: number, u: User) => sum + ((u.netSalary || u.salary || 0) * 12), 0
), [config]);
```

**TS2322 ligne 276** : `baseGrossAnnual` typee `User` au lieu de `number` (cascade).
Se resout en fixant le `reduce` ci-dessus.

**TS7018 ligne 300** : `chartData` et `allResults` implicit any[].
```tsx
const { chartData = [], fireNumber = 0, aiNote = "", allResults = [] } = results || {};
```

**Fix** : caster `results` :
```tsx
const { chartData = [] as any[], fireNumber = 0, aiNote = "", allResults = [] as any[] } =
  (results || {}) as { chartData?: any[]; fireNumber?: number; aiNote?: string; allResults?: any[] };
```

**TS2339 ligne 304** : `aiNote` n'existe pas sur le type retour de `calculateFutureProjection`.

**Fix** : meme cast `as any` ou ajouter `aiNote?: string` au type retour dans
`utils/useFutureSimulation.ts`.

**TS2322 lignes 555, 561** : `isAnimationActive` n'existe pas sur Recharts `ReferenceDot`.

**Fix** : retirer la prop `isAnimationActive={false}` des 2 ReferenceDot (Recharts ne la
supporte pas pour ce composant - c'est juste sur Bar, Area, Line).

### components/Investments.tsx (~2 erreurs)

**TS7034/TS7005 ligne 301** : `let data = [];` implicit any[].

**Fix** : annoter `let data: any[] = [];` ou un type plus precis selon ce qui y est push.

### components/Transactions.tsx (~7 erreurs)

**TS7006 ligne 244** : params callback `count, total, msg, processedChunk` implicit any.

**Fix** : trouver la callback (un onProgress de batch IA probablement) et typer.

**TS2345 ligne 249** : `setTransactions((prev) => ...)` retourne `unknown[]` au lieu de `Transaction[]`.

**Fix** : annoter le retour : `setTransactions((prev: Transaction[]): Transaction[] => ...)`.

**TS7006 ligne 250** : `param p` implicit any.

## Procedure pour fix progressif

1. Choisir un fichier dans la liste "exclus".
2. Lire le fichier, appliquer les fixes ci-dessus.
3. Tester local : `npm run typecheck` sur ce fichier (ou retirer de l'exclude
   temporairement et lancer le typecheck complet).
4. Si OK : retirer le fichier de la liste `"exclude"` du `tsconfig.json` et commit.
5. Verifier que le CI passe avec le fichier inclus.
6. Repeter pour le suivant.

## Recommandation

Ordre suggere du plus simple au plus complexe :
1. `components/Investments.tsx` (1-2 lignes a annoter)
2. `components/Transactions.tsx` (5-7 annotations)
3. `components/Dashboard.tsx` (3 props inexistantes -> etendre RealEstateGoal/LifeEvent)
4. `components/FutureProjection.tsx` (~10 erreurs, le plus lourd)
5. `utils/useFutureSimulation.ts` (1948 lignes, gros chantier - sprint dedie)
