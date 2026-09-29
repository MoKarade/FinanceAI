# ADR — Verrou d'écriture MCP : autorisation hors du chat, jamais atteignable par le modèle (2026-09-29)

## Contexte

Audit sécurité (pole-securite, 26/09) : le jeton de confirmation à deux temps (`[MCP-CONFIRM-TOKEN]`,
ADR 0023) empêche une écriture en UN SEUL appel, mais pas l'injection de consigne — un document
piégé (relevé, feuillet importé) peut faire enchaîner « aperçu » puis « confirme » au modèle, dans le
même tour, sans qu'un humain n'intervienne. Le canal de confirmation EST le canal compromis.

## Décision

Un verrou d'écriture supplémentaire, **désactivé par défaut**, activable **uniquement depuis l'app
web** (Réglages → Écritures MCP), jamais depuis la conversation claude.ai :

- État stocké dans `financeai-write-lock.json` (Google Drive `appDataFolder`, dossier déjà utilisé
  pour `financeai-sync.json`, aucun nouveau scope OAuth, aucun nouveau service).
- **Lecture SEULE côté serveur MCP** (`mcp/drive/writeLockStore.ts`) : ce module n'expose AUCUNE
  fonction de création/prolongation — le code pour déverrouiller depuis le MCP n'existe PAS. Aucun
  outil, aucun paramètre de schéma n'influence le verrou (test structurel).
- **Écriture SEULE côté app web** (`services/googleDrive/writeLock.ts`), via le bouton de la carte
  `WriteLockCard`.
- Vérifié dans `runApply` (`mcp/tools/_writeHelper.ts`) **AVANT** la logique d'aperçu/jeton de
  #1076 : un verrou fermé refuse même un `confirmToken` valide émis pendant une fenêtre désormais
  refermée. Les deux mécanismes se cumulent (défense en profondeur).
- **Échec fermé partout** : absence de fichier, erreur réseau, jeton OAuth expiré, JSON invalide,
  exception inattendue → toujours traité comme verrou FERMÉ, jamais un repli ouvert.
- Portée : le mécanisme est propre aux déploiements Drive-backed (claude.ai/Cloud Run, la seule
  forme exposée à un document externe). Une source d'état SANS ce mécanisme (fichier local,
  dev/tests) n'est pas un cas de fail-open — le verrou ne s'applique simplement pas à cette forme de
  déploiement, jamais atteinte par un document tiers.

## Conséquences

- Un document piégé, même s'il compromet totalement le modèle dans une session légitime, ne peut
  JAMAIS écrire tant que Marc n'a pas cliqué depuis Réglages — geste conscient, hors du chat, avec le
  contexte de ce qu'il autorise.
- Résidu accepté (documenté à l'écran) : si Marc active le verrou PUIS demande lui-même d'importer un
  document piégé sans le lire, le verrou n'y peut rien — il protège contre l'automatisation
  silencieuse, pas contre une décision consciente sur un contenu non vérifié. La fenêtre courte
  (15/30/60 min, jamais « toujours ouvert ») limite la surface.
- Ne protège PAS contre un serveur MCP lui-même compromis (code malveillant déployé, accès direct à
  l'infrastructure) — hors du scénario visé (contenu d'un document importé, pas compromission de
  l'infra, qui relève d'autres contrôles : déploiement, IAM, revue de code).

Tests : `tests/mcp/verrouEcriture.test.ts`, `tests/mcp/verrouEcritureIntegration.test.ts`,
`tests/services/writeLock.test.ts`.
