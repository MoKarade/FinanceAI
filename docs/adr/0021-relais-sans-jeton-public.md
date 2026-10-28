# ADR — Relais IA : le jeton public est supprimé, remplacé par des freins honnêtes (Marc via pole-securite, 2026-09-25)

**Statut** : accepté et livré (code + tests). Remplace la partie « jeton de relais » du P0-PROXY.

## Contexte

Le relais (`api/_lib/relay.ts`) exigeait l'en-tête `x-financeai-proxy` égal à `PROXY_ACCESS_TOKEN`. Le client
l'envoyait depuis `VITE_PROXY_ACCESS_TOKEN`, donc **le jeton était dans le bundle public**. Avec la passerelle IA
locale (le GPU du PC de Marc), un appelant qui lisait le bundle pouvait consommer le GPU ; le correctif S5 (clé
Anthropic vérifiée) a fermé le pire, mais le jeton restait un faux sentiment de sécurité.

## Décision

1. Suppression du jeton (client, relais, dev Vite). Aucune variable `PROXY_ACCESS_TOKEN` n'est plus lue.
2. Freins, dans `api/_lib/garde.ts` : Origin (frein, falsifiable hors navigateur), débit par IP et par empreinte de
   clé, budget de vérification de clé par IP, corps ≤ 200 Ko, `max_tokens` local ≤ 8192.
3. Mémo de vérification de clé : négatif court, borné, éviction par ancienneté, empreinte salée.
4. Test de bundle : échoue si une valeur posée dans `VITE_PROXY_ACCESS_TOKEN` se retrouve dans le build.

## Conséquences

- Le débit en mémoire est un frein **faible** sur Vercel sans état (chaque instance a son compteur). Pas de stockage
  partagé : il ajouterait une dépendance et une panne ; s'il est retenu un jour, il échoue fermé (`BACKLOG`).
- Le relais accepte désormais tout appel muni d'une Origin autorisée : la sécurité repose sur la clé de l'appelant
  (qui paie ses propres appels) et, pour le local, sur la vérification de cette clé.
- Alternative écartée : garder un jeton « serveur seulement » — inutilisable sans le donner au navigateur.

## Addendum — routage local réservé à la clé de Marc (2026-09-25)

Sans jeton, la barrière du GPU était « n'importe quelle clé Anthropic valide ». App SOLO : le routage LOCAL n'est servi
qu'à la clé de Marc. Autorisation = empreinte salée dans `RELAIS_CLES_LOCALES` (sans appel réseau) OU clé valide chez
Anthropic dont l'en-tête `anthropic-organization-id` de count_tokens égale `RELAIS_ORG_LOCALE`. Aucune des deux variables
→ pas de routage local (échec fermé) ; toute autre clé continue chez Anthropic. L'agent ne voit jamais la clé :
`scripts/empreinteCleRelais.mjs` est lancé par Marc. [À vérifier] que count_tokens renvoie bien l'en-tête d'organisation.
Limite : le nettoyage de documentation ne réécrit pas l'historique git public.
