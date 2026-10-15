# ADR — Chiffrement par défaut de la sauvegarde Drive, Phase 1 : création + mémorisation WebAuthn (2026-09-29)

## Contexte

Le mécanisme de chiffrement zéro-connaissance (AES-256-GCM, PBKDF2 600k itérations, `services/cloudBackup.ts`)
existe et est testé depuis longtemps, mais le chemin pour CRÉER une passphrase de sync avait été retiré en
juin (`GoogleDriveSyncCard` ne proposait plus que « retirer »). Décisions de Marc (28/09) : le MCP obtiendra
la phrase depuis Infisical (Phase 2, bloquée tant qu'Infisical n'existe pas pour l'agence) ; la phrase est
saisie une fois par appareil puis retenue de façon protégée.

## Décision — Phase 1 seulement (app web, aucune dépendance Infisical)

- **Écran de création rétabli** (`components/settings/PassphraseCreate.tsx`, 3 étapes) : saisie + confirmation
  (≥ 12 caractères, `MIN_PASSPHRASE_LENGTH`), avertissement plein écran obligatoire + carte imprimable/
  téléchargeable (fichier texte local, Blob, **aucune transmission réseau**), case « copie hors ligne »
  qui conditionne le bouton Activer (aucune exception).
- **Mémorisation par appareil** (`services/deviceKeyStore.ts`) : clé AES-256-GCM **non extractible** dans
  IndexedDB (même patron que `secureKeyStore.ts`, déjà audité) chiffre la phrase, stockée en `localStorage`.
- **Condition BLOQUANTE de pole-securite (28/09, avis donné AVANT tout code)** : verrou WebAuthn/biométrique
  à **CHAQUE usage** de la clé mémorisée — `navigator.credentials.get()`, `userVerification: "required"`,
  authentificateur de **PLATEFORME** uniquement (Face ID/Touch ID/Windows Hello, jamais une clé externe).
  Authentificateur indisponible/refusé → **échec fermé**, la phrase complète est redemandée, jamais un repli
  plus faible. Même exigence à la CRÉATION du credential (mémorisation refusée si la plateforme n'a pas
  d'authentificateur).
- **Filet non bloquant** (recommandation pole-securite) : expiration par inactivité ~30 jours sur la
  mémorisation — hygiène, PAS une protection contre un vol le jour même.
- **Révocation = rotation** : aucune révocation à distance possible par construction (la clé ne quitte jamais
  l'appareil). L'outil de Marc en cas de vol est de **changer la phrase** depuis un autre appareil, ce qui
  coupe tous les appareils mémorisés d'un coup — copie explicite à l'écran de création (condition
  pole-securite).
- **Déverrouillage automatique** (`PassphraseGate.tsx`) : sur un appareil mémorisé, tenté au montage (verrou
  WebAuthn + déchiffrement local, aucun réseau) avant d'afficher le formulaire ; tout échec retombe
  silencieusement sur la saisie manuelle existante.
- **Nettoyage des anciennes sauvegardes en clair** (`services/googleDrive/backupCleanup.ts`) : compte
  D'ABORD les `.bak.json` non chiffrés dans `appDataFolder`, ne supprime QUE sur confirmation explicite d'un
  second appel — jamais automatique. Un backup illisible n'est ni compté ni supprimé (prudence : jamais de
  suppression sur une supposition). Un backup déjà chiffré n'est jamais touché.

## Hors périmètre (Phase 1)

- Phase 2 (MCP + Infisical) : bloquée tant qu'Infisical n'existe pas pour l'agence — prérequis externe,
  signalé à pole-architecture/gérant, pas un blocage que ce lot peut lever.
- Phase 3 (bascule du défaut sur chiffré) : ne démarre qu'après Phase 2 stable en production plusieurs jours.
- Vérification automatisée « comptes d'éléments avant/après » (§5.4 du plan) : `summarizeForConflict`
  (déjà existant, `services/sync/syncSnapshot.ts`) fournit déjà ces comptes pour le modal de conflit ; la
  vérification post-activation reste un contrôle VISUEL de Marc (jamais une comparaison automatisée par
  l'agent sur des données financières, conformément au plan), obtenue en rappelant `pullNow()` (déjà testé)
  après activation.

## Conséquences

- Le défaut reste `enc:false` : rien ne bascule automatiquement, seule la CAPACITÉ de créer/activer une
  passphrase est ajoutée (aucune migration silencieuse).
- Aucun nouveau scope OAuth (réutilise `drive.appdata` déjà en place).
- Tests : `tests/services/passphraseCreate.test.ts`, `tests/services/deviceKeyStore.test.ts` (15 cas,
  disponibilité/mémorisation/déverrouillage/oubli, échec fermé sur chaque panne), `tests/services/cloudBackup.migration.test.ts`
  (nettoyage des sauvegardes en clair).
