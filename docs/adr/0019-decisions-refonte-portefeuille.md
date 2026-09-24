# ADR — Refonte du portefeuille : les décisions de cadrage du Lot 0 (Marc, 2026-09-24)

**Statut** : accepté (réponses de Marc en session, le 2026-09-24). Les lots qui les appliquent
restent à livrer (section « 💼 Portefeuille » du `BACKLOG.md`).

## Contexte

Le Lot 0 (audit du portefeuille, plan des lots 0.5 à 4) a été remis à Marc **hors dépôt** : il
porte ses montants réels, et ce dépôt est public. Il se terminait par une vingtaine de questions.
Les réponses sont consignées ici **sans aucune donnée personnelle** : la date et la nature exactes
de l'acquisition des titres, les montants et la composition du portefeuille restent hors dépôt.

## Décisions

1. **Source de vérité du total et du départ du Futur** : la clôture officielle de chaque titre ×
   le taux de la Banque du Canada. Le total Fintable devient un CONTRÔLE, avec son écart expliqué
   ligne par ligne. Remplace la décision du 2026-09-17 (« la valeur Fintable, car la plus fiable »).
   Conséquence acceptée : le jour de la bascule, la « variation 7 j » du hub est faussée une fois.
2. **Sources de cours : gratuites.** Mesuré le 2026-09-24 (`[PTF-L05B-MESURE-SOURCES]`) : EODHD
   gratuit sert toutes les lignes à 0,00 % des ancres indépendantes, prix BRUT avant un
   fractionnement ; Yahoo en sert toutes sauf une et rend un prix AJUSTÉ avant un fractionnement.
   EODHD principal (historique mis en cache, quota de 20 appels/jour), Yahoo en secours seulement
   une fois son fractionnement géré. Rien de payant (aucune exception à `ADR 0008` n'est ouverte).
3. **Date d'acquisition** : celle du document juridique, pas celle du transfert entre courtiers.
   Les dates d'entrée dans les comptes du courtier suivent ses réceptions ; la sortie suit les
   avis de l'établissement d'origine.
4. **Coût** : le coût FISCAL fait foi, le coût du courtier est affiché à côté. Faute d'avis d'un
   fiscaliste, le coût fiscal est **provisoirement** la valeur de marché à la date d'acquisition,
   marqué « provisoire — à confirmer par un fiscaliste » et remplaçable par une saisie datée. Des
   droits payés à l'étranger n'entrent pas dans ce coût.
5. **Fixtures** : 100 % synthétiques dans le dépôt ; les vrais chiffres ne sont vérifiés que par un
   script privé, hors dépôt. Garde : `tests/confidentialitePortefeuille.test.ts`.
6. **Import** : le relevé PDF est déposé dans l'app et lu sur l'appareil. L'import depuis claude.ai
   (MCP) est voulu AUSSI — il exige d'abord que l'envoi de l'app vers Drive refuse d'écraser un
   fichier modifié entre-temps (`[SYNC-PUSH-SANS-OCC]`), sinon deux écrivains se marchent dessus.
7. **Virements vers le courtier** : reliés à un dépôt dans le compte du courtier par un lien CHOISI
   dans une liste, jamais deviné d'après un montant ou un libellé.
8. **Portée** : ni vue « simulation » avant la date d'acquisition, ni estimation en cours de
   séance (clôtures seulement) ; module fiscal plus tard, après l'avis d'un fiscaliste ; indice de
   référence MSCI World en CAD ; répartition des fonds par un instantané mensuel saisi et daté.
9. **Infrastructure** : Marc pose les paramètres GCP du déploiement continu du serveur MCP ; le
   cron Fintable est réparé, pas mis en pause.
10. **Petit lot immédiat** : les taux de la Banque du Canada lus aussi par le serveur
    (`[FX-SERVEUR-JAMAIS-RAFRAICHI]`) ; les symboles de cotation sont corrigés par l'import, pas à
    la main.

## Alternatives écartées

- **Total Fintable comme vérité** : une de ses lignes est mal valorisée et il ne donne pas le
  détail par titre, donc aucun écart ne s'explique.
- **Une source payante** : la mesure a montré qu'elle n'apporte rien sur ce portefeuille.
- **Afficher « coût non établi » jusqu'au fiscaliste** : aucun rendement affiché pendant des mois,
  pour une valeur provisoire que Marc a préféré voir, marquée comme telle.
