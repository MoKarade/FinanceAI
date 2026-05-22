# Actions manuelles — Marc

> Liste de tout ce que **Claude ne peut pas faire** et qui requiert ton
> intervention. Classé par priorité. Coche au fur et à mesure.
> Dernière MAJ : 2026-05-22.

---

## 🔴 P0 — Sécurité (à faire avant exposition publique large)

### A1 — Activer Cloudflare Access (auth Google + MFA) ✅ FAIT (2026-05-22)
**Statut** : implémenté et validé en production.
**Doc complète** : [AUTH_SETUP.md](AUTH_SETUP.md) (config réelle + journal de debug)
+ [ADR 007](adr/007-auth-cloudflare-access.md)

Résultat : seul `marc.richard4@gmail.com` accède à l'app via Google OAuth,
session 24h. `hubperso.com` redirige (301) vers `www.hubperso.com` qui impose
Access.

- [x] DNS Cloudflare (domaine acheté chez Cloudflare Registrar → NS déjà OK)
- [x] Application Access Self-hosted sur `www.hubperso.com`
- [x] Policy `Allow` si `email == marc.richard4@gmail.com`
- [x] Identity Provider Google OAuth
- [x] Session 24h
- [x] Redirect Rule apex `hubperso.com` → `www.hubperso.com`
- [x] Testé en fenêtre privée → login Google requis

> ⚠️ Reste à surveiller : si la PWA ne s'installe plus, whitelister `/sw.js` et
> `/manifest.json` dans Access (policy Bypass). Non observé à ce jour.

### A2 — Rotation des clés API (si jamais exposées)
**Pourquoi** : les clés Anthropic/Finnhub/Era étaient en clair dans
localStorage (`app_api_keys`) jusqu'au fix V1 d'hier. Si tu as utilisé l'app
sur un PC partagé, considère-les compromises.
- [ ] Régénérer la clé Anthropic sur console.anthropic.com
- [ ] Régénérer la clé Finnhub sur finnhub.io
- [ ] Re-saisir les nouvelles clés dans Configuration → Clés API
- [ ] (Le fix V1 purge automatiquement l'ancienne clef localStorage au prochain boot)

---

## 🟡 P1 — Validations à faire toi-même (Claude ne peut pas)

### A3 — Valider TB4 : réactivité des sliders Future
**Pourquoi** : mon automation browser ne peut pas drag un slider de façon
fiable (React 19 ignore les events synthétiques). Toi oui.
- [ ] Ouvrir l'onglet **Future** (Alt+6)
- [ ] Basculer en mode **Sandbox** (toggle en haut)
- [ ] Drag le slider **Dépenses** de 4000 → 15000
- [ ] Vérifier que **Patrimoine projeté** et **Taux de succès** changent
- [ ] Drag le slider **CELI (rendement)** de 7% → 15%
- [ ] Vérifier que le Patrimoine projeté **augmente**
- [ ] **Si les valeurs ne bougent PAS** → me le dire, c'est un vrai bug à fixer

### A4 — Valider TB3 : cards scénarios à 0.00M$
**Pourquoi** : j'ai vu les 7 cards scénarios afficher `0.00M$` alors que le
KPI principal était 1.69M$. À confirmer visuellement.
- [ ] Ouvrir **Future**, attendre le calcul Monte Carlo
- [ ] Regarder les 7 cards de scénarios (BASE, Liberté 55, etc.)
- [ ] **Si elles affichent toutes `0.00M$`** → confirmer, je fixe le worker
- [ ] **Si elles affichent des vraies valeurs** → c'était un état transitoire, OK

### A5 — Lancer la checklist manuelle complète (163 tests)
**Pourquoi** : j'ai validé ~12 tests via browser, le reste demande un œil humain.
**Doc** : [MANUAL_TEST_CHECKLIST.md](MANUAL_TEST_CHECKLIST.md)
- [ ] Activer le mode test (Configuration → Mode test → Activer)
- [ ] Parcourir les 19 sections dans l'ordre
- [ ] Noter toute case rouge / valeur fausse / crash
- [ ] Me transmettre la liste de ce qui ne passe pas
- [ ] Désactiver le mode test à la fin (vérifier que tes vraies données reviennent)

### A6 — Tester sur ton mobile
**Pourquoi** : je ne peux pas tester sur ton téléphone réel.
- [ ] Ouvrir hubperso.com sur ton mobile
- [ ] Vérifier que le graph Future s'affiche bien (responsive 380px)
- [ ] Tester l'installation PWA (banner "Installer FinanceAI" en bas)
- [ ] Vérifier la navigation entre onglets au doigt
- [ ] Vérifier qu'aucun élément ne déborde de l'écran

---

## 🟢 P2 — Décisions à prendre (je code selon ton choix)

### A7 — Backend proxy pour la clé Anthropic (V2 sécurité)
**Contexte** : actuellement la clé Anthropic est utilisée directement dans le
navigateur (`dangerouslyAllowBrowser: true`), visible dans DevTools → Network.
Un attaquant XSS pourrait l'exfiltrer.
**Options** :
- [ ] (a) Créer une Vercel Edge Function qui proxie les appels Claude (la clé
  reste serveur) — ~3-4h dev, supprime le risque
- [ ] (b) Ne rien faire si Cloudflare Access (A1) est en place (XSS bloqué en amont)
- **Ton choix** : _______

### A8 — Chiffrement localStorage avec passphrase (H1)
**Contexte** : tes données sont en clair dans localStorage. Vol de laptop
déverrouillé = accès direct.
**Options** :
- [ ] (a) Implémenter un déverrouillage par passphrase au boot (chiffre tout
  le store AES-256) — ~4-5h, mais perte totale si passphrase oubliée
- [ ] (b) Compter sur le verrouillage Windows + Cloudflare Access (suffisant
  pour usage perso)
- **Ton choix** : _______

### A9 — Refactor coûts enfants (B2)
**Contexte** : `getAnnualChildCost` (UI) n'inclut pas RQAP/clawback/commuting
que le moteur applique. Donc le coût brut affiché diffère légèrement du net.
**Options** :
- [ ] (a) Laisser tel quel (documenté, le net vient de chartData)
- [ ] (b) Aligner totalement getAnnualChildCost avec le moteur — ~1h
- **Ton choix** : _______

---

## 📋 P3 — Tâches infra (optionnel)

### A10 — Vérifier le déploiement Vercel
- [ ] Confirmer que Vercel auto-deploy sur push `main` fonctionne toujours
- [ ] Vérifier le build le plus récent sur vercel.com dashboard
- [ ] (Le SW se met à jour automatiquement, mais un hard reload force le rebuild)

### A11 — Backup de tes vraies données
**Avant** de faire les tests A3-A6 sur tes vraies données :
- [ ] Configuration → Export → mot de passe → télécharger le `.json` chiffré
- [ ] Garder ce backup en lieu sûr (le mot de passe dans Bitwarden/1Password)

---

## Récapitulatif rapide

| # | Action | Priorité | Effort | Bloquant ? |
|---|--------|----------|--------|------------|
| A1 | Cloudflare Access auth | ✅ FAIT | — | — |
| A2 | Rotation clés API | 🔴 P0 | 15 min | Si PC partagé |
| A3 | Valider sliders Future | 🟡 P1 | 5 min | Non |
| A4 | Valider cards scénarios | 🟡 P1 | 2 min | Non |
| A5 | Checklist 163 tests | 🟡 P1 | 30 min | Non |
| A6 | Test mobile | 🟡 P1 | 10 min | Non |
| A7 | Décision backend proxy | 🟢 P2 | décision | Non |
| A8 | Décision chiffrement | 🟢 P2 | décision | Non |
| A9 | Décision coûts enfants | 🟢 P2 | décision | Non |
| A10 | Vérif Vercel | 🟢 P3 | 5 min | Non |
| A11 | Backup avant tests | 🟢 P3 | 2 min | Recommandé |

**A1 (auth) est fait** ✅ — l'app est sécurisée. Le plus urgent maintenant :
A2 (rotation clés si PC partagé), puis A11 (backup) avant A3/A4 (valider les 2
bugs trouvés) — ça me dira si je dois fixer TB3/TB4 ou si tout est vert.
