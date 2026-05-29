# Design — Sync v2 (synchronisation des clés API)

> **Statut** : conçu + approuvé par Marc le 2026-05-29. Implémenté en R1 (commit `0980b7c`).
> **Suite de** : [`GOOGLE_DRIVE_SYNC_DESIGN.md`](GOOGLE_DRIVE_SYNC_DESIGN.md) (sync v1 — D1→D4).
> **Besoin** (mots de Marc) : « quand je restaure sur un autre appareil, je veux **tout**
> retrouver d'un seul login Google — y compris mes clés API, sans avoir à les ressaisir. »

---

## 1. Contexte

La sync v1 sauvegardait l'état applicatif (`financeai-storage`) dans le Drive de l'utilisateur,
mais **excluait volontairement les clés API** (Anthropic, Finnhub) : un credential actif est un
risque de facture/abus s'il fuite, jugé « pire que les données ». Conséquence : sur un nouvel
appareil (ou en navigation privée), l'utilisateur retrouvait ses données **mais devait ressaisir
ses clés** — friction directement contraire au besoin « tout retrouver d'un seul login ».

La sync v1 a aussi tranché, en **D3**, qu'il n'y a **pas de chiffrement applicatif** : le blob
est en clair dans `appDataFolder`, lisible via le compte Google. Toute donnée ajoutée à la
sauvegarde hérite donc de cette propriété.

## 2. Décisions (ADR condensé)

La ronde v2 (R1) se décompose en trois décisions liées. La référence `V2-C` dans le code
(`services/sync/syncOrchestrator.ts`, `syncTypes.ts`) pointe ici.

| # | Décision | Pourquoi | Alternatives rejetées |
|---|----------|----------|------------------------|
| V2-A | **L'enveloppe porte un champ optionnel `apiKeys`** (`{ anthropic, finnhub }`) | Transporter les clés sans casser le format v1 : le champ absent = ancien blob, lu sans erreur | Bumper `schemaVersion` + migration (lourd pour un ajout additif) |
| V2-B | **Restauration au `pull` via `saveApiKeys`**, avant le reload | Les clés sont réécrites dans le coffre (`secureKeyStore`, chiffré au repos local) → survivent au reload, rechargées au boot. Best-effort : si le coffre est indispo, les données sont quand même restaurées | Écrire les clés en clair dans le store rehydraté (contournerait le coffre local) |
| **V2-C** | **Les clés API sont incluses dans la sauvegarde Drive, EN CLAIR** | Cohérent avec **D3** (pas de chiffrement applicatif) ; sert le besoin « tout retrouver d'un seul login ». Un seul endroit à protéger : le compte Google de l'utilisateur | Chiffrer **uniquement** les clés (incohérent : le reste resterait en clair) ; garder les clés hors sync (= friction v1, rejeté par Marc) |

> ⚠️ **Conséquence assumée de V2-C** (renforce la note D3) : les clés Anthropic/Finnhub sont
> désormais **lisibles par quiconque a accès au compte Google** de l'utilisateur, et techniquement
> par Google. C'est un credential actif (risque de facture/abus). Marc assume ce risque au profit
> du confort. **Le texte de la carte UI doit le dire honnêtement** (cf §4).

## 3. Ce qui change vs v1

- **Payload inchangé** : le snapshot `financeai-storage` reste **sans `apiKeys`** (le `partialize`
  du store les exclut déjà, + `stripApiKeys` en ceinture-bretelles). Les clés voyagent **à côté**,
  dans le champ dédié `apiKeys` de l'enveloppe — jamais dans le payload.
- **Push** : `pushNow` lit les clés courantes du store et ne les inclut que s'il y en a au moins une
  (`hasAnyKey`) → pas d'objet de clés vides dans le blob.
- **Pull** : `pullNow` lit `drive.apiKeys`, les réapplique via `saveApiKeys` (best-effort) **avant**
  le reload, puis écrit le payload et recharge.
- **Hash** : le hash de détection de changement couvre désormais `{ payload, apiKeys }` → changer une
  clé déclenche aussi une sauvegarde.

## 4. Impact UI (honnêteté — point sensible confidentialité)

Le message d'avertissement de `GoogleDriveSyncCard` **doit refléter V2-C**. Avant R1 il affirmait
« Les clés API ne sont jamais synchronisées (à ressaisir sur chaque appareil) » — devenu **faux** et
trompeur. Texte corrigé : les clés API (Anthropic, Finnhub) **sont incluses** dans la sauvegarde,
**en clair**, donc lisibles via le compte Google.

Docs alignés : `GOOGLE_DRIVE_SETUP.md` (§ sécurité), `GOOGLE_DRIVE_SYNC_DESIGN.md` (§5 + §11),
`SESSION_HANDOVER.md`, `CHANGELOG.md` (entrée R1).

## 5. Compatibilité & sécurité

- **Rétro-compatible v1** : un blob écrit par v1 (sans `apiKeys`) est lu sans erreur ; au prochain
  push, les clés courantes y sont ajoutées.
- **Coffre local inchangé** : au repos sur l'appareil, les clés restent chiffrées (AES-256-GCM,
  `secureKeyStore`). V2-C ne concerne que **la copie dans Drive**, en clair.
- **Durcissement futur** : le champ `enc` de l'enveloppe (réservé en v1) reste la voie pour une
  passphrase optionnelle (zéro-knowledge) qui chiffrerait payload **et** clés — toujours en backlog.

## 6. Tests

- `syncEngine` : `buildEnvelope` inclut `apiKeys` quand fournies, l'omet sinon (rétro-compat).
- Orchestrateur : `getLocalPayload` lit les clés du store ; le hash couvre payload + clés.
- (Pull/restore validés en intégration légère + manuellement par Marc une fois le Client ID en place.)
