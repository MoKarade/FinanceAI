# ADR — Assistant fusionné : un seul moteur de « prochaines actions » (`ASSISTANT-HUB`, 2026-07-23)
**Statut** : accepté (scope validé Marc par AskUserQuestion, 2026-07-23).

**Contexte** : deux surfaces concurrentes de recommandations — l'onglet ACTIONS (widget Haiku dédié,
cache localStorage 1h, prompt « EXACTEMENT 3 actions » → remplissage fabriqué sur profil sain, source
du retour Marc « signaux peu pertinents/périmés/pas actionnables ») et le chat (tool
`get_next_best_actions` → `computeFinancialSignals`, pur, toujours frais). Risque n°1 : deux avis
contradictoires sur la même page. Et l'onglet ASSISTANT n'était pas dans la nav (introuvable).

**Décision** : fusion dans `Tab.ASSISTANT` (visible dans la nav, position de l'ancien ACTIONS) :
cartes = `computeFinancialSignals` (0-5 signaux à seuils, zéro LLM, zéro cache) via
`hooks/useFinancialSignals` + `AiChatSignalCards`, clic → message contextualisé au chat partagé.
Retrait complet du widget Haiku + `getNextBestActions`/schémas de services/claude.ts + enum
`Tab.ACTIONS` (redirect deep-link `#ACTIONS`). Gate = `anthropicKey` seul (le chat peut servir à se
faire guider dans la configuration — pas de mur salaire).

**Pourquoi** : une seule source de vérité « quoi faire ensuite » (déjà partagée avec claude.ai via le
MCP) ; suppression d'un appel Haiku récurrent (coût, latence, staleness 1h) sans perte — la prose IA
s'obtient au clic, toujours cohérente avec ce que le modèle voit.

**Trade-offs** : plus de prose pré-générée sur les cartes (observation factuelle brute) ; nombre de
cartes variable 0-5 (honnête) au lieu de « toujours 3 » (fabriqué) — choix délibéré, pas un manque.
Mode discret : clic DÉSACTIVÉ (le montant est cuit dans l'observation — une redaction regex serait
fragile, même classe de risque que le blur CSS interdit).

**Alternatives rejetées** : garder le widget Haiku déplacé (2 moteurs, risque n°1 non résolu) ;
reformulation privacy-safe par signal (désynchronisation silencieuse à chaque évolution) ; publier
les signaux en contexte d'écran Tier 2 (circulaire — le tool le fait à la demande — et casserait le
prefix-cache sur l'onglet le plus utilisé du chat).
