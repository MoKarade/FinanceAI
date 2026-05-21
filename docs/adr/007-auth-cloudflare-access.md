# ADR 007 — Authentification via Cloudflare Access + Google OAuth

**Date** : 2026-05-21
**Statut** : Proposé (config externe en attente)
**Décideurs** : Marc (user)

## Contexte

FinanceAI est déployé sur https://www.hubperso.com (Vercel). **Le site est
publiquement accessible** — n'importe qui avec l'URL peut charger l'app.
Bien que les données utilisateur soient stockées dans le localStorage du
navigateur (donc isolées par origine + appareil), il existe plusieurs
risques :

1. **PC partagé / appareil oublié** : un autre utilisateur du même PC voit
   les données de Marc dans son navigateur
2. **Lecture du code source** : `View Source` expose la structure de l'app,
   les routes, les noms des champs sensibles
3. **Reconnaissance** : moteur de recherche peut indexer l'URL, on perd le
   bénéfice de "security through obscurity"
4. **Aucun audit trail** : impossible de savoir si quelqu'un d'autre a
   essayé d'accéder à l'app

Audit : 7 risques évalués dans [`docs/SECURITY_STRATEGY.md`](../SECURITY_STRATEGY.md).

## Décision

**Mettre en place Cloudflare Access en frontale du domaine
`hubperso.com`**, avec authentification Google OAuth + MFA, policy
restreinte à `marc.richard4@gmail.com`.

### Architecture

```
Browser → Cloudflare Edge (Access policy check)
              ├─ pas de JWT valide → redirige vers Google OAuth
              └─ JWT valide → forward vers Vercel origin
```

Toute requête HTTP doit présenter un JWT Cloudflare signé. Sans JWT, le
HTML applicatif n'est même pas servi — l'utilisateur voit la page de
connexion Google de Cloudflare.

### Configuration

1. Migrer le DNS de `hubperso.com` vers Cloudflare (vs Vercel DNS actuel)
2. Activer Cloudflare Access (plan **gratuit** jusqu'à 50 users)
3. Configurer une "Application" Access avec :
   - Domaine : `hubperso.com`
   - Policy : `Allow if email = marc.richard4@gmail.com`
   - Identity Provider : Google
   - Session duration : 24h
4. Activer 2FA sur le compte Google (MFA hardware ou TOTP)

## Conséquences

### Positives

- ✅ **Zéro code** côté application — l'auth est entièrement edge-side
- ✅ **Gratuit** (plan Free Access ≤ 50 users)
- ✅ Bloque l'URL **avant même** que le HTML/JS soit servi → SEO impossible,
  reconnaissance bloquée
- ✅ MFA via Google OAuth (TOTP, clé matérielle, push)
- ✅ **Logs d'accès** dans Cloudflare Dashboard (tentatives, IPs, etc.)
- ✅ Session expirable 24h — re-auth régulière sans friction excessive
- ✅ Si ajout conjoint(e) un jour : 1 ligne à modifier dans la policy
- ✅ Compatible PWA / SW (Access whitelist `/sw.js` si besoin)

### Négatives

- ⚠️ **Nécessite migration DNS** vers Cloudflare (vs Vercel actuel). 1 fois,
  ~15 min, réversible
- ⚠️ Dépendance opérationnelle à Cloudflare (mais avec mode "bypass"
  configurable en cas de pépin)
- ⚠️ Latence supplémentaire ~50ms à chaque requête (négligeable)

## Alternatives considérées

### A. Auth app-level avec passphrase + chiffrement IndexedDB

Demander une passphrase au boot, dériver une clé AES-256, chiffrer le
store Zustand dans IndexedDB.

❌ **Rejetée** : ne bloque PAS le HTML/JS public, complexe à implémenter
(~500 lignes), pas de MFA réel (juste un savoir), pas de recovery si
passphrase oubliée.

### B. Vercel Password Protection (Pro plan)

❌ **Rejetée** : nécessite plan Pro (20 $/mois) → viole la contrainte
"zéro abonnement".

### C. JWT signé côté Vercel Edge Functions + Google Sign-In

Page de login `/login`, Google Identity Services, Vercel Edge Function
qui vérifie l'ID Token et émet un cookie HttpOnly.

❌ **Rejetée** : plus de code à maintenir, le HTML reste public avant
login, complexité auth/refresh tokens.

### D. Cloudflare Access (ADR retenue)

✅ **Acceptée** : meilleur ratio sécurité/effort. 90 min config, 0 code.

## Statut d'implémentation

- ✅ ADR rédigé
- ✅ Plan détaillé dans [`docs/SECURITY_STRATEGY.md`](../SECURITY_STRATEGY.md)
  (5 phases, checklist validation 8 tests)
- 🔲 **Config externe** : Marc doit valider la migration DNS Cloudflare
  puis configurer la policy
- 🔲 Documentation post-implémentation : créer `docs/AUTH_SETUP.md` avec
  les étapes exactes
- 🔲 Ajouter section "Sécurité" au `docs/MANUAL_TEST_CHECKLIST.md`
  (5 tests post-Access)

## Hardening complémentaire (post Access)

| # | Action | Statut |
|---|--------|--------|
| H1 | Chiffrer le localStorage avec passphrase au boot (defense-in-depth) | À évaluer |
| H2 | Activer Subresource Integrity (SRI) sur scripts CDN | À faire |
| H3 | Rotation manuelle des clés API tous les 6 mois | Process à documenter |
| H4 | `npm audit` mensuel (CI) | À automatiser |
| H5 | Backup chiffré automatique IndexedDB (Sprint 3B SH3) | En cours |
| H6 | Alerte Cloudflare sur tentative depuis IP inconnue | Avec Access |
| H7 | Bouton "Verrouiller l'app" qui force re-auth | Avec Access |

## Références

- [docs/SECURITY_STRATEGY.md](../SECURITY_STRATEGY.md) — analyse complète et plan
- https://developers.cloudflare.com/cloudflare-one/policies/access/ — doc Cloudflare
- ADR 006 (no-fake) — autre angle de la sécurité applicative
