# ADR — IA locale : le relais BYOK route un maximum d'appels vers la passerelle Ollama de l'Atelier (Marc, 2026-09-23)

**Statut** : accepté et livré (code) ; activation = variables Vercel (`docs/A_FAIRE_MOI.md`, O4).

## Contexte

Marc, 2026-09-23 : « continue avec financeai … faire passer un max par ollama ». Son Atelier (dépôt
`MoKarade/atelier`) fait tourner une **passerelle IA locale** sur son PC : elle parle le format de l'API
Anthropic (`POST /v1/messages`), traduit vers Ollama (`gpt-oss-atelier` = gpt-oss 20B), exige une clé par app,
ne journalise aucun contenu, et est exposée par un tunnel Cloudflare (`https://ia.hubperso.com`).

FinanceAI appelle Claude depuis le navigateur avec la clé BYOK de Marc ; un relais serveur (`api/_lib/relay.ts`,
P0-PROXY) existait mais n'avait jamais été allumé.

## Décision

1. Le **relais** est le seul point de routage : il voit chaque appel texte, garde la clé BYOK côté client, et
   peut basculer. Aucun changement des appels existants (`services/claude.ts`, `agentLoop`).
2. **Éligible à l'IA locale** : modèle Haiku ou Sonnet (`IA_LOCALE_MODELES`), contenu texte ou outils « custom ».
   **Restent sur Claude** : Opus (choix explicite du meilleur modèle), images/PDF (gpt-oss n'a pas la vision),
   outils serveur, `tool_choice` forcé (non pris en charge par Ollama).
3. **Bascule automatique** sur Anthropic si la passerelle est éteinte, en erreur, occupée (529) ou trop lente.
   Sonde `/sante` mémorisée 30 s : PC éteint = aucun délai ajouté aux appels suivants.
4. **Clé BYOK jamais envoyée à la passerelle** ; clé dédiée `IA_LOCALE_CLE`, variable serveur uniquement.
5. Fonction en **runtime Node.js** : Edge impose un début de réponse en 25 s, incompatible avec « essai local
   non-flux puis bascule ». `supportsCancellation` garde l'Annuler chaîné.
6. **Coût honnête** : la réponse locale porte `model: gpt-oss-atelier` ; `agentLoop` ne compte pas ce tour
   comme facturé (`isLocalModel`).

## Conséquences

- Coût : les appels éligibles ne coûtent plus rien quand le PC est allumé ; sinon, comme avant.
- Confidentialité : les prompts éligibles vont au PC de Marc (via Cloudflare, chiffré) au lieu d'Anthropic.
- Qualité : gpt-oss-20b est en dessous de Haiku/Sonnet (banc Atelier : 80 % sur une catégorisation
  synthétique, enum pas toujours respecté en appel d'outil). Les ceintures existantes restent (allowlist de
  catégories, validation zod des tools). Revenir en arrière : retirer `IA_LOCALE_CLE` (relais sans IA locale) ou
  `VITE_CLAUDE_TRANSPORT` (tout en direct, comportement d'avant).
- Latence : réponse locale rapide une fois le modèle chargé ; premier appel après inactivité ≈ 5 à 25 s (chargement).
