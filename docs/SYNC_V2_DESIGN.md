# Sync v2 — login Google unique + tout automatique + clés (design)

> **Statut** : conçu 2026-05-29 suite au retour de Marc sur la v1. **À valider avant code.**
> Remplace l'expérience de la v1 (`GOOGLE_DRIVE_SYNC_DESIGN.md`) ; le moteur (S1) et l'I/O Drive (S2)
> sont réutilisés tels quels. Supersede partiellement [ADR 007](adr/007-auth-cloudflare-access.md)
> (l'auth passe de « gate Cloudflare au bord » à « login Google dans l'app »).

## 1. Retour v1 → ce qui ne va pas

- ❌ **Deux logins** : Cloudflare-Google (accès app) **puis** in-app-Google (Drive). Marc veut **un seul**.
- ❌ **Pas automatique** : en navigation privée il fallait cliquer Connecter/Restaurer. Marc veut **auto, toujours**.
- ❌ **Clés API non synchronisées** (exclues pour sécu) → Marc veut **tout** retrouver, clés comprises.

## 2. Décisions (Marc, 2026-05-29)

| # | Décision |
|---|----------|
| V2-A | **Login Google in-app unique** : un seul « Se connecter avec Google » (scopes identité + `drive.appdata` en **un** consentement) sert d'auth ET de source du jeton Drive. Remplace le rôle de gate de Cloudflare Access. |
| V2-B | **Tout automatique** : restauration au login (pull auto), sauvegarde auto (push debouncé). Aucun clic manuel en usage normal. |
| V2-C | **Clés API synchronisées** : `apiKeys` incluses dans le blob (en clair, cohérent avec le choix « pas de chiffrement »). Risque assumé : lisibles via le compte Google. |

## 3. Nouveau flux

```
App publique (plus de gate Cloudflare) → au boot :
  token Google silencieux ? ──oui──> identité + jeton Drive → PULL auto (état + clés) → app prête
        │ non
        ▼
  Écran « Se connecter avec Google » (identité + drive.appdata, 1 consentement)
        → token → PULL auto → app prête
  Changements → PUSH auto (debounce) incluant les clés.
```

## 4. Sécurité (analyse — important)

- **L'app devient publiquement joignable** (on retire Cloudflare Access). Elle se protège **elle-même**
  via le login Google (selon le choix §6). Chaque utilisateur est **isolé** (ses données dans SON Drive
  + SON navigateur) → ouvrir l'accès n'expose jamais les données d'un autre.
- **Clé Anthropic (`dangerouslyAllowBrowser`)** : déjà saisie par chaque utilisateur (jamais dans le
  bundle). Sans Cloudflare, elle perd le « bouclier réseau » au repos, mais reste dans le navigateur de
  l'utilisateur. Défense principale = CSP stricte (déjà en place). Pas d'exposition cross-utilisateur.
- **Clés API synchronisées en clair** (V2-C) : lisibles via le compte Google de l'utilisateur. Risque
  accepté par Marc. Atténuation possible plus tard : passphrase optionnelle (chiffre tout le blob).
- **Anti-lock-out** : le gate n'est actif que si `VITE_GOOGLE_CLIENT_ID` est défini, ET il existe une
  **trappe de secours** (cf §6) pour ne jamais se retrouver enfermé dehors si Google tombe.

## 5. Rollout (ordre — pour éviter le double login transitoire)

1. **Écran de consentement OAuth** : passer en **Production** (publié) si usage multi-utilisateurs
   (scope `drive.appdata` = sensible → écran « app non vérifiée » possible, contournable pour usage
   restreint ; ou rester en **Test** + ajouter les utilisateurs, mais limite 100 users / re-login ~hebdo).
2. Déployer le gate in-app (ci-dessous). **Tant que Cloudflare Access est encore actif**, il y a 2 logins
   (transitoire, non bloquant).
3. **Marc retire l'application Cloudflare Access** sur `www.hubperso.com` (Zero Trust → Access →
   Applications → FinanceAI → Delete/Disable) → **il ne reste qu'un seul login Google (in-app)**.

## 6. À TRANCHER avant code — restriction d'accès

Sans Cloudflare, qui peut **ouvrir** l'app ?
- **(soft) App ouverte, login = pour la sync** : n'importe qui peut utiliser l'app (local), le login
  Google sert à retrouver SES données. Le plus sûr (zéro lock-out), colle au modèle multi-utilisateurs.
- **(hard) Gate dur** : rien n'est accessible sans login Google (remplace vraiment l'allowlist Cloudflare).
  + trappe de secours anti-lock-out. Plus restrictif mais plus proche du « ça se verrouille ».

## 7. Plan de build (batches isolés : branche → tsc+eslint+Vitest → merge → CI verte)

- **R1 — login in-app + auto-restore** : écran de connexion Google (identité + drive.appdata, 1 consentement),
  remplace la carte « Connecter » par un flux unique ; au login → pull auto ; au boot → token silencieux
  → pull auto si possible. Trappe de secours. Tests.
- **R2 — clés API dans la sync** : inclure `apiKeys` au payload (push) + les ré-appliquer via
  `secureKeyStore` au restore (pull). Tests round-trip.
- **R3 — docs + ADR 008** : MAJ SETUP/DESIGN, ADR 008 (auth in-app, supersede 007 §gate), étapes Marc
  (consent screen + retrait Cloudflare).

## 8. Réutilisé tel quel
- `syncEngine` (garde anti-perte), `driveAppData` (REST appData), `syncState`, `syncOrchestrator`
  (push/pull/conflit). On change surtout l'**auth** (gate in-app) + le **payload** (ajout des clés) +
  le **déclenchement** (auto au login/boot).
