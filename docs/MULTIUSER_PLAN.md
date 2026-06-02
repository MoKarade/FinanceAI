# Plan multi-utilisateurs — FinanceAI

> **Statut : BROUILLON — préparé pour review de Marc (2026-06-02).**
> **Ne rien implémenter avant validation des décisions §1.** Destination confirmée par Marc :
> faire de FinanceAI un vrai produit multi-utilisateurs (pas juste l'outil perso de Marc).
> Sources : `CLAUDE_MEMORY.md` §7, `SYNC_V2_DESIGN.md`, `docs/adr/010`, `SNAPSHOT_2026-05-29.md`.

---

## 0. Point de départ (où on en est)

- **Solo : ~90 % fini. Multi-utilisateurs : ~72 %** (estimation `CLAUDE_MEMORY`).
- **Déjà en place (groundwork, livré « dark »)** — à confirmer en réel, mais codé + testé :
  - Sync Drive **par utilisateur** : `appDataFolder` = isolation native par compte Google (les données d'un user ne sont jamais visibles par un autre).
  - **Clés API chiffrées** dans le blob (`apiKeysEnc`/`keyCipher`, clé dérivée du `sub` Google) — *vérifié dans le code*.
  - **LoginGate in-app** derrière le flag `VITE_GOOGLE_GATE` (« déployer ≠ activer ») ; auth Google in-app = ADR-010.
  - Garde anti-perte (`decideOnLoad`), restauration en place (rehydrate, pas de reload), mode test **non persisté** (schema v7).
- **Ce qui manque pour que ça « fonctionne »** : (1) valider la sync en réel, (2) ouvrir/activer l'auth multi-user, (3) gérer la clé IA pour des tiers, (4) durcir le stockage par utilisateur, (5) onboarding d'inconnus, (6) conformité/sécurité multi-user.

---

## 1. Décisions à verrouiller AVANT de coder (Marc)

> Ce sont des bifurcations : elles changent le contenu des épics. À trancher en review.

| # | Question | Options | Reco |
|---|----------|---------|------|
| **D-1** | Modèle d'accès une fois Cloudflare retiré | **(soft)** app ouverte à tous, le login Google sert à retrouver SES données · **(hard)** rien d'accessible sans login Google (+ trappe anti-lock-out) | **soft** (colle au local-first multi-user, zéro lock-out) |
| **D-2** | Clé API Anthropic (IA) | **(BYO)** chaque user saisit SA clé (déjà le cas) · **(proxy)** backend Vercel Edge relaie avec une clé serveur + rate-limit | **BYO d'abord** (zéro coût/backend), proxy en option plus tard si on offre l'IA « incluse » |
| **D-3** | Chiffrement au repos des clés | garder `keyCipher` (dérivé du `sub`, **pas** zéro-knowledge) · ajouter **passphrase optionnelle** (H1, vrai zéro-knowledge) | garder `keyCipher`, passphrase **optionnelle** en P2 |
| **D-4** | Écran de consentement OAuth Google | rester en **Test** (≤ 100 users, re-login ~hebდo) · passer en **Production** (vérification Google, scope `drive.appdata` sensible) | **Test** pour bêta restreinte → Production quand on ouvre large |
| **D-5** | Périmètre des « utilisateurs » au lancement | cercle restreint (proches, bêta) · public ouvert | **bêta restreinte** d'abord (valide tout sans risque d'échelle) |

---

## 2. Épics & tâches

> Owner : **M** = Marc (je ne peux pas créer de credentials/toucher ses comptes), **C** = Claude.
> Effort : S (< 1 j), M (1-3 j), L (> 3 j). Chaque tâche a un critère d'acceptation.

### EPIC 1 — Prouver & fiabiliser la sync (P0, chemin critique)
| Tâche | Owner | Eff. | Dépend | Acceptation |
|---|---|---|---|---|
| T1.1 Créer `VITE_GOOGLE_CLIENT_ID` (OAuth client web) | **M** | S | — | Variable en place (Vercel + `.env`) ; carte sync visible |
| T1.2 Tester la sync en navigation privée / appareil neuf | M+C | M | T1.1 | Un user retrouve **toutes** ses données **et** ses clés, sans ressaisie, sans écrasement |
| T1.3 **Verrou anti-double-sync** au boot (gate + `runBootSync` sans lock → doublons) | C | M | — | 1 seule exécution sync au boot ; test de non-réentrance |
| T1.4 Unifier `computeIsEmpty`/`hasMeaningfulData` + purger commentaires « reload » périmés | C | S | — | Une seule notion de « vide » ; tests |
| T1.5 Tests des **chemins d'échec** sync (token KO, Drive indispo, quota dépassé) | C | M | — | Échecs gérés sans perte ni crash ; messages honnêtes |
| T1.6 Écran d'état/diagnostic de sync (dernière sync, erreurs) | C | S | T1.1 | L'utilisateur voit l'état de sa sauvegarde |

### EPIC 2 — Auth multi-utilisateurs (P0)
| Tâche | Owner | Eff. | Dépend | Acceptation |
|---|---|---|---|---|
| T2.1 Publier/configurer le consent screen (selon D-4) | **M** | S | D-4 | Login Google fonctionne pour des comptes tiers |
| T2.2 Activer/finir le `LoginGate` in-app (flag `VITE_GOOGLE_GATE`), selon D-1 | C | M | D-1 | N'importe quel compte Google entre ; isolation vérifiée |
| T2.3 Retirer/ajuster Cloudflare Access (ouvrir l'app) | **M** | S | T2.2 | Un seul login (Google in-app) ; plus d'allowlist email |
| T2.4 Trappe anti-lock-out + tests du gate | C | S | T2.2 | Jamais enfermé dehors si Google tombe ; tests |
| T2.5 Test d'**isolation multi-comptes** sur un même navigateur | C | M | T2.2 | User B ne lit jamais le store de User A |

### EPIC 3 — Clé IA & coûts (P0/P1, selon D-2)
| Tâche | Owner | Eff. | Dépend | Acceptation |
|---|---|---|---|---|
| T3.1 (BYO) Valider/documenter la saisie de clé par user ; empty state IA clair sans clé | C | S | D-2 | IA off proprement sans clé ; chaque user assume la sienne |
| T3.2 (proxy, si D-2=proxy) Vercel Edge relais Anthropic + rate-limit, **0 clé dans le bundle** | C | L | D-2 | Aucune clé partagée exposée ; coût attribuable/plafonné |

### EPIC 4 — Robustesse du stockage par utilisateur (P1)
| Tâche | Owner | Eff. | Dépend | Acceptation |
|---|---|---|---|---|
| T4.1 Migration `localStorage` → **IndexedDB** (quota + boot non bloquant) | C | L | — | Gros états tiennent ; boot ne bloque pas ; migration testée |
| T4.2 Gestion explicite quota/erreurs de stockage (pas de perte silencieuse) | C | M | T4.1 | Quota plein = message honnête + pas de corruption |

### EPIC 5 — Onboarding nouveaux utilisateurs (P1)
| Tâche | Owner | Eff. | Dépend | Acceptation |
|---|---|---|---|---|
| T5.1 Flux d'accueil (état vide → guidé) pour un inconnu | C | M | — | Un nouvel user sait quoi faire en < 2 min, sans fake data |
| T5.2 Mode démo/test clair, sans contaminer Drive (déjà sécurisé v7) | C | S | — | Démo isolée, jamais synchronisée |
| T5.3 (si public anglophone) i18n — **backlog**, hors-scope tant que FR | C | L | D-5 | — |

### EPIC 6 — Conformité & sécurité multi-user (P1/P2)
| Tâche | Owner | Eff. | Dépend | Acceptation |
|---|---|---|---|---|
| T6.1 Politique de confidentialité + droit à l'effacement (`deleteRemoteData` existe déjà) | M+C | S | — | Page confidentialité ; suppression user en 1 action |
| T6.2 Quick-wins sécu : sanitize input chat IA (H3), `console.error`→`logError` (H4), revue token `sessionStorage` (C2) | C | M | — | Audit sécu repassé au vert |
| T6.3 Passphrase optionnelle (H1, zéro-knowledge) — selon D-3 | C | L | D-3 | Option « chiffrer avec passphrase » ; récupération documentée |
| T6.4 Loi 25 (QC) — revoir le consentement analytics en contexte multi-user | C | S | — | Conforme pour des tiers |

### EPIC 7 — Observabilité & support (P2)
| Tâche | Owner | Eff. | Dépend | Acceptation |
|---|---|---|---|---|
| T7.1 Canal de remontée d'erreurs sans backend (export `errorLogger` / endpoint léger) | C | M | — | On peut diagnostiquer un bug user |
| T7.2 Brancher l'E2E Playwright en CI (déjà écrit, tourne en local) | C | S | — | Régressions UI attrapées en CI |

---

## 3. Séquencement (chemin critique)

```
D-1..D-5 (Marc, review)  ──>  EPIC 1 (prouver la sync)  ──>  EPIC 2 (auth ouverte)
                                      │                              │
                                      └──> EPIC 4 (stockage)         └──> EPIC 3 (clé IA)
                                                                            │
EPIC 5 (onboarding) + EPIC 6 (sécu/conformité) ── en parallèle ───────────┘
EPIC 7 (observabilité) ── quand le reste est stable
```

- **Phase 1 (débloquer)** : D-1..D-5 + EPIC 1. Sans une sync prouvée, rien d'autre ne tient.
- **Phase 2 (ouvrir)** : EPIC 2 + EPIC 3 + EPIC 6.2 (sécu). C'est le passage solo → multi.
- **Phase 3 (durcir & accueillir)** : EPIC 4 + EPIC 5 + EPIC 6 (reste).
- **Phase 4 (échelle)** : EPIC 7 + D-4 Production + (si besoin) proxy IA, passphrase.

**Plus gros gain produit une fois la plateforme ouverte** : impôt exact par conjoint (A1, initiative couple) — hors de ce plan d'infra, mais c'est là que va la valeur perçue ensuite.

---

## 4. Risques & mitigations

| Risque | Impact | Mitigation |
|---|---|---|
| Sync « marche en test mais pas en réel » (cache PWA suspecté) | Bloque tout | EPIC 1 d'abord, test version fraîche, écran de diagnostic |
| Double-sync sans verrou → doublons/écrasement Drive | Perte de données | T1.3 (verrou) avant d'ouvrir |
| Clé Anthropic exposée à des tiers | Coût/abus | D-2 : BYO par défaut ; proxy si IA incluse |
| `drive.appdata` = scope sensible → vérification Google | Friction onboarding | D-4 : bêta en Test, Production quand prêt |
| Lock-out si on durcit l'auth | Utilisateurs bloqués | Modèle soft (D-1) + trappe anti-lock-out (T2.4) |
| Quota `localStorage` sur gros états | Corruption/perte | EPIC 4 (IndexedDB) |

---

## 5. Hors-scope (pour l'instant)

- Backend complet / base de données (on reste local-first + Drive).
- i18n (tant que la cible est FR).
- Refonte des god-files, refonte graphs, A1 couple — chantiers produit séparés, à reprioriser après l'ouverture.

---

## 6. Prochaine action

Marc **review ce plan** : valide/ajuste les décisions §1 et l'ordre §3. Une fois D-1..D-5 tranchées, je transforme les tâches en lots isolés (branche → tsc+eslint+suite → PR), en commençant par EPIC 1.
