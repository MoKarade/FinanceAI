# ADR 010 — Authentification : login Google in-app (gate) remplace Cloudflare Access

**Date** : 2026-05-29
**Statut** : Acceptée — implémentée « dark » (inactive tant que `VITE_GOOGLE_GATE` n'est pas mis)
**Décideurs** : Marc (user)
**Remplace partiellement** : [ADR 007](007-auth-cloudflare-access.md) — le *gate* d'accès passe du bord Cloudflare au login Google in-app.

## Contexte

ADR 007 protège `www.hubperso.com` via **Cloudflare Access** (Google OAuth au bord). Avec la sync v2
(données dans le Drive de l'utilisateur), cela impose **deux logins** : Cloudflare-Google pour ouvrir
l'app, **puis** un 2ᵉ login Google in-app pour obtenir le jeton Drive. Retour de Marc : il veut **un
seul login** qui serve à la fois d'accès ET de source du jeton Drive, et une **restauration
automatique** (y compris en navigation privée). Cf [`docs/SYNC_V2_DESIGN.md`](../SYNC_V2_DESIGN.md).

FinanceAI est aussi **multi-utilisateurs** : chacun doit pouvoir se connecter avec SON Google et
retrouver SES données. L'allow-list d'emails de Cloudflare Access est peu adaptée à ça.

## Décision

Mettre en place un **gate de login Google in-app** qui remplace le rôle de gate de Cloudflare Access :

- `components/auth/LoginGate.tsx` enveloppe l'app (`index.tsx`). Un seul « Se connecter avec Google »
  (identité + `drive.appdata` en **un** consentement) sert d'auth ET de source du jeton Drive.
- Au boot : reprise **silencieuse** (`gateSilentResume` — zéro clic si session Google active +
  consentement déjà donné), sinon écran de login. La connexion déclenche la restauration auto (pull).
- **Livré « dark »** : actif uniquement si `VITE_GOOGLE_GATE` **et** `VITE_GOOGLE_CLIENT_ID` sont
  présents. Découpler *capacité* (Client ID) et *activation* (flag du gate) garantit « déployer ≠
  activer » — le comportement prod reste inchangé tant que le flag est absent.
- **Trappe anti-lockout** : `?nogate=1` ou « continuer sans me connecter » → on ne se retrouve jamais
  enfermé dehors si Google tombe.
- Robustesse : `gisAuth` durci (`error_callback` + timeout) → un échec de jeton silencieux ne fige
  plus le boot.

### Rollout (ordre, pour éviter le double login transitoire)

1. Écran de consentement OAuth en **Production** (scope `drive.appdata` = sensible).
2. Mettre `VITE_GOOGLE_GATE=1` (Vercel) + **tester** : login → restauration, et trappe `?nogate=1`.
3. **Seulement après validation** : retirer l'application Cloudflare Access sur `www.hubperso.com`
   (Zero Trust → Access → Applications → FinanceAI → Delete) → il ne reste qu'**un seul login**.

## Conséquences

### Positives
- ✅ **Un seul login** (accès + sync) + **restauration automatique** → l'expérience demandée par Marc.
- ✅ **Multi-utilisateurs natif** : chacun avec son Google, données isolées (son Drive + son navigateur).
- ✅ Toujours **gratuit**, plus de dépendance edge obligatoire.
- ✅ **Anti-lockout** intégré.

### Négatives / ouvertes
- ⚠️ Sans Cloudflare, **le HTML/JS applicatif redevient public** : le gate est client-side (il bloque
  l'UI, pas le téléchargement du bundle). C'est un recul vs « blocage avant le HTML » d'ADR 007.
  Atténuations : isolation par utilisateur (aucune donnée d'autrui exposée), CSP stricte déjà en place,
  clé Anthropic fournie par chaque utilisateur (jamais dans le bundle). Assumé pour le multi-utilisateurs.
- ⚠️ Plus de SEO-blocking ni de logs d'accès edge une fois Cloudflare Access retiré.
- ⚠️ Gate actif → SW / handlers d'erreurs globaux ne tournent qu'après login (écran de login minimal) ;
  à raffiner si besoin.

## Alternatives considérées
- **Garder Cloudflare + 2 logins** — rejeté (Marc veut un seul login).
- **Gate « soft »** (app ouverte, login seulement pour la sync) — envisagé ; Marc a choisi le **gate
  dur** (login obligatoire) + trappe anti-lockout (cf SYNC_V2_DESIGN §6).
- **Auth backend (JWT/cookie)** — rejeté (zéro backend, zéro abonnement).

## Références
- [`docs/SYNC_V2_DESIGN.md`](../SYNC_V2_DESIGN.md) — design v2 complet
- [ADR 007](007-auth-cloudflare-access.md) — auth Cloudflare Access (gate partiellement remplacé)
- Code : `services/sync/authGate.ts`, `components/auth/LoginGate.tsx`, `services/sync/syncOrchestrator.ts` (`gateSilentResume`)
