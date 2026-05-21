# Investigation — PWA inopérante sur hubperso.com

**Date** : 2026-05-21
**Branche** : `claude/fix-vite-mode-prod`
**Statut** : Fix proposé, en attente de validation preview Vercel

---

## 1. Symptôme initial

Le `docs/SESSION_HANDOVER.md` (PR #117) listait 5 items « à valider en prod » dont :

> Cache Storage `financeai-v2` peuplé (était vide avant fix #116)

Avant ce sprint, le SESSION_HANDOVER laissait penser que le bug était de la propagation CDN ou d'un cache stale côté navigateur. La vérification a révélé un problème beaucoup plus large.

---

## 2. État du repo au démarrage

| Check | Résultat |
|---|---|
| Branche locale | `main` synchronisé avec `origin/main` à `608af82` (Merge PR #117) |
| Working tree | Clean (juste `.claude/` untracked) |
| Commits récents | `608af82` PR #117 docs · `4e56dec` PR #116 Lighthouse fixes · `5e061ff` PR #115 docs P2 · etc. |
| Stabilisation post-#117 | **Aucune** — les commits `aa5d096/14ca392/...` listés dans le gitStatus initial datent de mai 14 (époque 46 tests), reliques historiques, pas un cycle caché |

---

## 3. Validation environnement local

PC dev de Marc (Windows, OneDrive\GitHub\FinanceAI) — Node n'était pas dans le PATH PowerShell au départ. Trouvé installé dans `C:\Program Files\nodejs\node.exe` (v24.16.0).

| Vérification | Résultat |
|---|---|
| `npm install` | ✅ 509 packages, 30s |
| `npm run typecheck` | ✅ Clean, 0 erreur en strict mode |
| `npm run build` | ✅ 25.55s, `dist/assets/index-IXHN2WGe.js` 528 KB / gzip 166 KB |
| `npm test -- --run` | ⚠️ **572/573** — 1 fail isolé |
| `grep "sw.js" dist/assets/index-*.js` | ✅ **1 occurrence** — code SW présent dans le bundle local |

### 3.1 Test isolé qui échoue

[`tests/services/aiOrchestrator.test.ts:101`](../tests/services/aiOrchestrator.test.ts#L101) attend `'10,000'`. Sur mon Node fr-CA, `(10000).toLocaleString()` produit `'10 000'` (espace insécable). Sur le CI ubuntu-latest en_US.UTF-8, produit `'10,000'`. **Test fragile aux locales** — pas une vraie régression, mais bug latent dans [`services/aiOrchestrator.ts:75-77`](../services/aiOrchestrator.ts#L75) : le system prompt envoyé à Claude varie selon la locale runtime de l'user.

Fix recommandé séparé : `.toLocaleString('fr-CA')` partout dans `aiOrchestrator.ts` + mettre à jour le test.

---

## 4. État de la production (hubperso.com)

Vérifications via Chrome DevTools MCP sur https://www.hubperso.com :

| Champ | Valeur |
|---|---|
| URL servie | `https://www.hubperso.com/` |
| Manifest | ✅ `/manifest.json` chargé (`fr-CA`, theme `#10b981`, display `standalone`) |
| Icon | ✅ `/icon.svg` 512×512 maskable |
| `/sw.js` | ✅ HTTP 200, 3171 octets, `cache-control: public, max-age=0, must-revalidate` |
| Bundle servi | `assets/index-BE1HuXLL.js` |
| Taille bundle | **743 670 octets** |
| `__GIT_SHA__` baked | `4e56dec` (Merge PR #116, 2026-05-21) |
| `__BUILD_DATE__` | `2026-05-21` |
| `__APP_VERSION__` | `3.0.0-alpha.0` |
| Version affichée dans l'UI | `v3.0.0-alpha.0 • 4e56dec` |
| Header `age` du HTML | `2141s` (35 min) — vieux cache CDN edge `yul1` (Montréal) |

### 4.1 Contenu du bundle prod — l'évidence

```
grep -c 'sw.js'              → 0 occurrence
grep -c 'serviceWorker'      → 0 occurrence
grep -c 'navigator.serviceWorker' → 0 occurrence
grep -c 'import.meta.env.PROD'    → 0 occurrence
```

Le bloc App.tsx:55-61 :
```ts
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
}
```

…a été **dead-code-éliminé** parce que `import.meta.env.PROD` a été inliné comme `false` lors du build Vercel. Vite + Terser ont ensuite éliminé `if (false && ...)`. D'où l'absence totale des chaînes `sw.js` et `serviceWorker`.

### 4.2 Test profil propre (élimination du polluant manuel)

J'avais registered manuellement le SW via la console JS plus tôt dans la session — cette registration persiste dans le navigateur. Pour valider l'état réel pour un nouvel utilisateur :

```js
// 1. Cleanup complet
await Promise.all((await navigator.serviceWorker.getRegistrations()).map(r => r.unregister()));
await Promise.all((await caches.keys()).map(k => caches.delete(k)));
// 2. Hard reload sans cache
location.href = '/?freshtest=1';
// 3. Attendre 3.5s puis vérifier
await new Promise(r => setTimeout(r, 3500));
console.log({
  swCount: (await navigator.serviceWorker.getRegistrations()).length,
  cacheCount: (await caches.keys()).length,
});
// → { swCount: 0, cacheCount: 0 }
```

**Confirmation** : sur un profil propre, hubperso.com **ne registre pas le SW au boot, ne crée pas de cache `financeai-v2`**. La PWA est totalement inopérante pour tout utilisateur réel.

---

## 5. Discriminant local vs Vercel

| Aspect | Build local (mon PC) | Build Vercel (prod) |
|---|---|---|
| Source code | `main` @ `608af82` (≡ `4e56dec` pour App.tsx) | `main` @ `4e56dec` |
| Node | v24.16.0 | 24.x |
| Vite | v6.4.2 | v6.4.2 (vu dans log) |
| Mode flag | `vite build` (mode prod par défaut) | `vite build` (idem) |
| Log dit "building for production" | oui | oui |
| Hash bundle | `index-IXHN2WGe.js` | `index-BE1HuXLL.js` |
| Taille bundle | **528 KB** | **744 KB** (+216 KB, +40%) |
| Contient `sw.js` | ✅ Oui (1×) | ❌ Non (0×) |
| Contient `serviceWorker` | ✅ Oui | ❌ Non |
| Contient `import.meta.env.PROD` non-inliné | non (correctement remplacé par `true`) | non (correctement remplacé… mais par `false`) |

Le code source identique produit deux bundles différents. **Vite ou son pipeline n'évalue pas `import.meta.env.PROD` de la même façon sur Vercel et en local**, malgré une config identique.

L'écart de taille +216 KB (+40%) est compatible avec l'hypothèse d'une minification/tree-shaking moins agressifs côté Vercel — comportement attendu en mode `development`.

---

## 6. Hypothèses testées et abandonnées

### 6.1 ❌ « Le redeploy n'a pas propagé sur le CDN »

Faux. Après redeploy production, le header `age` est revenu à `0` (HTML frais servi), mais le bundle reste `index-BE1HuXLL.js` (hash identique). Le CDN sert correctement le nouveau déploiement — c'est le déploiement lui-même qui produit toujours le même bundle cassé.

### 6.2 ❌ « Vercel utilise un build cache pollué »

Faux. Marc a fait un redeploy avec « Use existing Build Cache » décoché. Vercel a re-installé fresh (`npm install` complet, pas `up to date in 799ms`). Bundle produit toujours identique au précédent. Le build est déterministe sur Vercel — toujours pareil, toujours cassé.

### 6.3 ❌ « Le redeploy était sur la mauvaise branche »

Vrai pour la première tentative (Marc avait redeploy le préview de `claude/session-handover@77dfa9c`, URL `finance-ai-git-claude-session-handover-mokarades-projects.vercel.app`). Deuxième tentative correcte : Production environment, branche `main`, commit `4e56dec`. Bug persiste.

### 6.4 ❌ « Une env var Vercel force `NODE_ENV=development` »

Faux. Dashboard Vercel → Settings → Environment Variables — **vide** pour Production, Preview ET Development. Aucune override.

### 6.5 ❌ « Override Build Command sur Vercel »

Faux. Settings → Build and Deployment Settings — tous les overrides sont OFF. Framework Preset = Vite (auto-détecté), commande défaut.

### 6.6 ❌ « Ignored Build Step skip le build »

Inutile à débogguer parce que les redeploys manuels bypassent cette règle. La règle ne s'applique qu'aux pushs git. Mais utile à connaître : si le SHA est déjà déployé, un push commit identique ne déclenche pas de build. **C'est précisément pourquoi le fix doit modifier le code source** (le SHA change → Vercel ne peut plus skip).

### 6.7 ⚠️ « Node 24.x sur Vercel + Vite v6 incompatibilité »

Possible mais non démontré. Mon PC local tourne aussi sur Node v24.16.0 et produit le bundle correct. Donc le problème n'est pas la version Node seule, mais possiblement une interaction Node 24 × Vercel build infra × Vite v6. Plan B (si le fix `--mode production` ne suffit pas) : downgrader à Node 20 ou 22.

---

## 7. Diagnostic final

**`import.meta.env.PROD` s'évalue à `false` lors du build Vercel**, malgré :
- L'absence de toute env var custom Vercel
- Aucune override Build Command
- Le log Vercel disant `vite v6.4.2 building for production...`

Le mode Vite résolu au runtime du build ≠ le mode annoncé. Bug obscur dans la chaîne Vite v6 / Vercel build runner / Node 24.

**Conséquences directes** :
1. Code SW dead-code-éliminé → PWA inopérante (`navigator.serviceWorker` jamais appelé)
2. Bundle 40% plus gros → impact LCP/INP (mais Lighthouse 97 quand même, surprenant)
3. Le `silent catch` (`.catch(() => {})`) dans App.tsx:57 aurait pu masquer une erreur runtime, mais ici le code n'est même pas exécuté → ce n'est pas le silent failure qui sauve

**Impact côté utilisateur** :
- App **fonctionne quand même** (le SW n'est qu'optionnel)
- Mais : pas de cache offline, pas de précache des chunks Vite hashés, pas de bénéfice PWA
- Manifest installable correctement, mais expérience post-install dégradée

---

## 8. Fix proposé (PR ouverte)

**Branche** : `claude/fix-vite-mode-prod`
**Commit** : `465489e fix(build): force vite --mode production explicite`
**Diff** : 1 ligne dans `package.json`

```diff
- "build": "vite build",
+ "build": "vite build --mode production",
```

**Effets attendus** :
1. Vite résout le mode comme `production` de manière non-ambiguë.
2. `import.meta.env.PROD` est inliné comme `true`.
3. Le bloc App.tsx:55-61 survit au tree-shaking.
4. Le bundle prod contient `sw.js` et `serviceWorker`.
5. SW registered au boot, cache `financeai-v2` peuplé.

**Effet secondaire utile** : le hash du commit (`package.json` change) force Vercel à rebuilder (impossible de skipper un SHA jamais déployé).

### 8.1 Validation locale du fix

```
$ npm run build
✓ built in 9.80s
dist/assets/index-IXHN2WGe.js  528.45 kB  (identique au build précédent)
$ grep -c 'sw.js' dist/assets/index-IXHN2WGe.js
1
```

Localement, `vite build` et `vite build --mode production` produisent **strictement le même hash et le même contenu**, confirmant qu'en local Vite résout déjà correctement le mode. Le fix est un no-op local. Son utilité est purement côté Vercel où l'on suspecte une résolution différente.

### 8.2 Plan de validation post-merge

1. **Preview Vercel** (déclenché par le push de la branche) — vérifier que le bundle preview sur l'URL `finance-ai-git-claude-fix-vite-mode-prod-mokarades-projects.vercel.app` contient bien `sw.js`.
2. Si preview OK → merger dans `main`.
3. Vercel redéploie la prod automatiquement (nouveau SHA → impossible à skipper).
4. Vérifier hubperso.com sur profil propre :
   - Nouveau hash bundle
   - `sw.js` dans le bundle
   - `navigator.serviceWorker.getRegistrations().length > 0` au boot
   - `caches.keys()` contient `financeai-v2`

---

## 9. Plan B (si le fix `--mode production` ne suffit pas)

Trois leviers à actionner cumulativement :

### B.1 Ajouter `vercel.json` (force la config explicite)

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "installCommand": "npm install --no-audit --no-fund"
}
```

### B.2 Downgrader Node sur Vercel à 20.x

Settings → Build and Deployment → Node.js Version → 20.x.
Et matcher dans `package.json` :
```json
"engines": { "node": ">=20.0.0 <23" }
```

Justification : Netlify est à Node 20 (cf `netlify.toml`), c'est la version testée du repo. Node 24 a peut-être un comportement non-documenté sur Vercel.

### B.3 Purger le `.vite/` cache via Build Command custom

```json
"buildCommand": "rm -rf node_modules/.vite && npm run build"
```

Pour exclure tout cache Vite local éventuellement pollué.

---

## 10. Apprentissages et hygiène future

1. **Le `.catch(() => {})` silencieux était un piège** — pas la cause ici (le code n'était même pas dans le bundle), mais il aurait masqué n'importe quelle erreur runtime de registration SW. Convention à appliquer ailleurs : au minimum logger via `errorLogger.logError()` avant d'avaler.

2. **Le test fragile aux locales** ([aiOrchestrator.test.ts:101](../tests/services/aiOrchestrator.test.ts#L101)) est passé en CI parce que ubuntu-latest est en `en_US.UTF-8`. À fixer en passant : `.toLocaleString('fr-CA')` partout dans le service + mettre à jour le test. Cf TODO follow-up dédié.

3. **Vérification post-déploiement absente** : aucune assertion automatisée ne vérifie que le bundle prod contient bien le code SW. Possible action : ajouter un step Lighthouse CI déjà en place qui audite "Service Worker registered" comme bloquant — actuellement warn-only (cf [`.github/workflows/lighthouse.yml`](../.github/workflows/lighthouse.yml)).

4. **Différence Vercel ≠ Netlify** : ce repo build sur Netlify (le `netlify.toml` exists et est complet) ET sur Vercel. La prod canonique est Vercel mais Netlify pourrait servir de fallback / test indépendant. Maintenir les deux a un coût mais aide à isoler les bugs de plateforme comme celui-ci.

5. **`SESSION_HANDOVER §4` était insuffisamment précis** : « Cache Storage `financeai-v2` peuplé » comme item à valider, sans procédure de validation reproductible. Le nouveau check devrait être :
   ```js
   // sur profil propre, hard reload
   await Promise.all([
     navigator.serviceWorker.getRegistrations(),
     caches.keys(),
   ]).then(([sw, c]) => ({ swActive: sw.length > 0, cachePopulated: c.includes('financeai-v2') }))
   ```

---

## 11. Liens et références

- **Code SW App.tsx** : [App.tsx:54-61](../App.tsx#L54)
- **Service worker source** : [public/sw.js](../public/sw.js)
- **Manifest** : [public/manifest.json](../public/manifest.json)
- **Vite config** : [vite.config.ts](../vite.config.ts)
- **Netlify config (référence)** : [netlify.toml](../netlify.toml)
- **PR #113 (origine PWA)** : commit `4eb1084`
- **PR #116 (fix SW cache)** : commit `a30658e`
- **PR ce fix** : à ouvrir manuellement → https://github.com/MoKarade/FinanceAI/pull/new/claude/fix-vite-mode-prod
