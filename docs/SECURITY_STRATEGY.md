# Stratégie de sécurité — FinanceAI

> **Objectif** : Confidentialité totale des données financières. Le site
> `hubperso.com` est publiquement accessible donc **n'importe qui peut ouvrir
> l'app**. Il faut une authentification **obligatoire** avant tout accès aux
> données stockées (localStorage) ou aux clés API.
>
> **MAJ 2026-05-22 — Option A (Cloudflare Access) implémentée et validée.**
> L'app n'est plus publique : login Google obligatoire, restreint à
> `marc.richard4@gmail.com`. Détails dans [AUTH_SETUP.md](AUTH_SETUP.md).
> Le « risque principal non-mitigé » ci-dessous est désormais **mitigé**.

## 1. Modèle de menace

| Menace | Sévérité | Probabilité | Mitigation actuelle |
|--------|----------|-------------|---------------------|
| Visiteur anonyme accède au localStorage de Marc | 🔴 critique | impossible | localStorage est **par origine + navigateur** — un visiteur sur son navigateur a son propre store vide |
| Marc oublie de se déconnecter sur un PC partagé | 🔴 critique | élevée | Aucune (pas de session/logout) |
| Vol de l'appareil de Marc (laptop déverrouillé) | 🔴 critique | moyen | Verrouillage Windows uniquement |
| MITM sur Wi-Fi public | 🟡 moyen | faible | HTTPS Vercel (TLS 1.3) |
| Prompt injection via Claude tab | 🟡 moyen | moyen | Encadrement `<memory>` (Sprint 1 C4) |
| Exfiltration via XSS | 🔴 critique | très faible | CSP stricte sans `unsafe-inline` (Sprint 3 SH2) |
| Compromission GitHub repo | 🟡 moyen | très faible | Pas de secret commit (Sprint 1 C5) |

**Risque principal non-mitigé** : pas de gate authentique entre l'URL publique
et les données stockées. Anyone with the URL → page chargée → si le navigateur
a déjà persisté un store, il s'affiche.

## 2. Options évaluées

### Option A — Cloudflare Access + Google OAuth (RECOMMANDÉ)

**Comment** : Cloudflare Access (gratuit pour usage personnel jusqu'à 50 users)
en frontale du domaine `hubperso.com`. Toute requête HTTP doit présenter un
JWT valide signé par Cloudflare, sinon redirection vers Google OAuth.

**Architecture** :
```
Browser → Cloudflare Edge (Access policy)
              ├─ pas de JWT → redirige Google OAuth
              └─ JWT valide → forward vers Vercel origin
```

**Avantages** :
- ✅ **Zéro changement de code** côté React/Vite — l'auth est entièrement edge-side
- ✅ **Gratuit** (jusqu'à 50 users, Marc en a 1)
- ✅ MFA via Google OAuth (TOTP ou clé matérielle si configuré sur Google)
- ✅ Bloque l'URL **avant même** que le HTML/JS soit servi → le store ne se charge
  pas pour un visiteur non-auth
- ✅ Politique simple : "email exact = marc.richard4@gmail.com"
- ✅ Session expirable (24h par défaut, configurable)
- ✅ Logs d'accès dans Cloudflare Dashboard

**Inconvénients** :
- ⚠️ Nécessite que le domaine `hubperso.com` passe par Cloudflare DNS (et non
  uniquement par Vercel DNS). Vercel propose une intégration Cloudflare → OK.
- ⚠️ Si Marc partage un jour avec son conjoint(e), il faut ajouter l'email à
  la policy.

**Coût** : 0 $/mois (plan gratuit Cloudflare Access)

**Étapes d'implémentation** :
1. Vérifier que `hubperso.com` peut être déplacé vers Cloudflare DNS
2. Créer une application Cloudflare Access avec policy
   `email = marc.richard4@gmail.com`
3. Activer Google comme Identity Provider (IdP)
4. Configurer la durée de session (24h)
5. Tester : ouvrir une fenêtre privée → doit rediriger vers Google
6. Activer la 2FA sur le compte Google si pas déjà fait

**Documentation** : https://developers.cloudflare.com/cloudflare-one/policies/access/

### Option B — Auth app-level avec passphrase + chiffrement IndexedDB

**Comment** : Au boot de l'app, demander une passphrase. Dériver une clé
AES-256 (PBKDF2 600k itérations, déjà en place pour le backup). Le store
Zustand est lu/écrit chiffré dans IndexedDB. Sans passphrase → app vide.

**Avantages** :
- ✅ **Pas de dépendance** Cloudflare/Google
- ✅ Chiffre **aussi le localStorage** (defense-in-depth) — protection vol laptop
- ✅ Marc contrôle 100 % du flow

**Inconvénients** :
- ❌ **Le HTML/JS reste public** (n'importe qui peut télécharger le code et
  voir l'architecture / les routes / les clés Finnhub si dans le bundle)
- ❌ Implémentation complexe : intercepteur Zustand persist, IndexedDB
  encryption layer, écran de unlock, recovery, etc. (~500 lignes)
- ❌ Si Marc oublie la passphrase → perte totale (pas de recovery sans backup)
- ❌ Pas de MFA réel — juste un "savoir" (passphrase)
- ❌ Pas de session expirable simple

**Coût** : 0 $ mais dev important

### Option C — Vercel Password Protection (Pro plan)

**Comment** : Activer Password Protection sur le projet Vercel.

**Inconvénients** :
- ❌ **Plan Pro requis** (20 $/mois) — contre la contrainte "zéro abonnement"
- ❌ Pas de MFA, juste un mot de passe partagé

→ **Rejetée**.

### Option D — JWT signé côté Vercel Edge Functions + Google Sign-In

**Comment** : Page de login frontale (`/login`) qui ouvre Google Sign-In via
Google Identity Services. À la complétion, l'ID Token Google est envoyé à
une Vercel Edge Function qui le vérifie, génère un JWT court, et le pose
en cookie HttpOnly. Toute requête API doit présenter ce cookie.

**Avantages** :
- ✅ Pas de dépendance Cloudflare
- ✅ Gratuit (Vercel Edge Functions inclus dans free tier)
- ✅ Vraie session avec expiration

**Inconvénients** :
- ⚠️ Demande Vercel Edge Functions (1 ou 2 routes) + frontend Google Sign-In
- ⚠️ Le HTML reste accessible avant login (mais l'app est SPA — peut détecter
  "pas de cookie" et bloquer le rendu)
- ⚠️ Plus de code à maintenir que Option A

**Coût** : 0 $

## 3. Recommandation finale

**Option A (Cloudflare Access)** — Marc tu prendras le moins de risques :
- Aucune ligne de code à écrire ni maintenir
- Bloque l'URL avant même le HTML
- MFA via Google déjà configuré
- Gratuit
- Si tu veux ajouter conjoint plus tard : 1 ligne dans la policy Access

**Plan B fallback** : Si pour une raison X (DNS migration impossible), basculer
sur **Option D**.

## 4. Hardening complémentaire (à faire en plus de l'auth)

| # | Action | Statut | Priorité |
|---|--------|--------|----------|
| H1 | Chiffrer le localStorage avec passphrase au boot (Option B comme defense-in-depth) | À faire | Moyen |
| H2 | Activer Subresource Integrity (SRI) sur scripts CDN | À faire | Bas |
| H3 | Rotation manuelle des clés API tous les 6 mois | À faire | Moyen |
| H4 | Audit des dépendances npm `npm audit` mensuel | À automatiser | Bas |
| H5 | Backup chiffré automatique vers IndexedDB (Sprint 3B SH3 en cours) | En cours | Moyen |
| H6 | Logs d'accès Cloudflare → alerte sur tentative depuis IP inconnue | Avec Option A | Bas |
| H7 | Bouton "Verrouiller l'app" qui force re-auth | Avec Option A | Bas |

## 5. Plan d'action proposé

| Phase | Action | Effort | Quand |
|-------|--------|--------|-------|
| **Phase 1** | Vérifier faisabilité DNS Cloudflare sur hubperso.com | 15 min | Marc à confirmer |
| **Phase 2** | Mettre en place Cloudflare Access policy | 30 min | Après Phase 1 OK |
| **Phase 3** | Tester en fenêtre privée, ajuster durée session | 15 min | Phase 2 |
| **Phase 4** | Documenter dans le README + ajouter `docs/AUTH_SETUP.md` | 30 min | Phase 3 |
| **Phase 5** | Implémenter H1 (chiffrement localStorage passphrase) en bonus | 4 h | Optionnel |

Total Phase 1-4 : **~90 minutes** pour une app full-secure.

## 6. Validation post-déploiement

Checklist (état au 2026-05-22, Access activé) :

- [x] Ouvrir `hubperso.com` en fenêtre privée → redirige bien vers Google
- [x] Se connecter avec marc.richard4@gmail.com → app accessible
- [ ] Se connecter avec un autre Gmail → doit refuser (403) — à confirmer
- [ ] Attendre 24h+ → la session doit expirer et re-demander auth — à confirmer
- [ ] Inspecter response headers : `cf-access-jwt-assertion` présent — à confirmer
- [ ] Vérifier `View Source` sur `hubperso.com` non-auth : pas de HTML applicatif — à confirmer
- [ ] Lighthouse + axe-core toujours OK post-Access — à refaire
- [ ] PWA / SW toujours fonctionnels (whitelist /sw.js si nécessaire) — à confirmer
- [x] Section "auth" présente dans `MANUAL_TEST_CHECKLIST.md` (section 22) —
  à enrichir avec les cas du journal de debug de [AUTH_SETUP.md](AUTH_SETUP.md)
