// services/projection/modelAssumptions.ts
//
// [CONSTANTES-MOTEUR-NON-SOURCEES] — HYPOTHÈSES DE MODÈLE du moteur de projection.
//
// ⚠️ **Ce fichier n'est PAS `docs/FISCAL_REFERENCE.md`, et ne doit jamais le devenir.** La source
// unique fiscale porte des valeurs de LOI (ARC / Revenu Québec), datées et sourcées auprès de leur
// émetteur. Ce que l'on trouve ici est d'une autre nature : des choix de MODÉLISATION, qu'aucune
// autorité ne publie et que personne ne peut « vérifier auprès de la source ». Les y ranger leur
// prêterait l'autorité d'un texte de loi — c'est exactement la faute
// `ECRIRE-UN-CHIFFRE-FISCAL-SANS-LE-MESURER-FABRIQUE-SA-SOURCE`, prise par l'autre bout.
//
// Ce que ce module apporte à la place : chaque nombre est NOMMÉ, sa PORTÉE RÉELLE est mesurée, et
// son statut (défendable / limite assumée / décision en attente) est écrit. Un littéral anonyme au
// milieu d'une boucle moteur n'offre aucun des trois.
//
// ⚠️ Ces constantes ne sont volontairement PAS regroupées en un objet ni exportées en lot : chacune
// a une portée et un statut distincts, et un « objet d'hypothèses » invite à les traiter comme un
// bloc homogène — ce qu'elles ne sont pas (`DIAGNOSTIC-GROUPE-A-MOITIE-FAUX`).

/**
 * ⚠️ [SMITH-HELOC-TAUX-FIGE] — HISTORIQUE, gardé parce qu'il explique une DÉCISION.
 *
 * Jusqu'au 2026-08-24, le taux de la marge du levier Smith Manoeuvre était `SMITH_HELOC_ANNUAL_RATE
 * = 0.05` : un littéral FIGÉ, indépendant du dossier. Il pouvait donc passer SOUS le taux
 * hypothécaire du bien — une marge révolvante moins chère que le prêt de premier rang qu'elle
 * accompagne, ce qui est impossible dans la réalité et flatteur dans le modèle.
 *
 * Ce n'était pas un chiffre d'affichage : `useSmithManoeuvre` fait partie de l'espace de recherche de
 * stratégies (`strategySpace.ts`, `strategyConfig.ts`), donc ce taux décide de ce que l'application
 * RECOMMANDE. **Tableau de sensibilité mesuré** (30 ans, célibataire 8 000 $/mois, maison 500 k$,
 * hypothèque 5 %, rendement 6 %) — gain du levier sur le patrimoine net final selon le taux de marge :
 *
 * | Taux marge | Gain Smith |
 * |---|---|
 * | 3 %  | +533 577 $ |
 * | 5 %  | +489 760 $ |
 * | 8 %  | +326 361 $ |
 * | 10 % | +146 425 $ |
 *
 * Soit **343 335 $ d'amplitude**, et à 10 % la succession passait SOUS celle du scénario sans levier
 * (2 212 026 $ contre 2 212 234 $) : le conseil s'INVERSAIT.
 *
 * **Décision Marc du 2026-08-24 : « la marge suit l'hypothèque ».** Le taux est désormais calculé par
 * `smithHelocAnnualRate` ci-dessous. Effet MESURÉ du changement, à profil identique :
 *
 * | Hypothèque | Gain AVANT (marge 5 % figée) | Gain APRÈS (marge = hypo + 2 pts) |
 * |---|---|---|
 * | 3 %  | +639 889 $ | +639 889 $ (marge à 5 % : inchangé par construction) |
 * | 5 %  | +489 760 $ | **+413 769 $** |
 * | 8 %  | +275 001 $ | **+32 263 $** |
 *
 * Jusqu'à **242 738 $ d'avantage fantôme retiré** au taux le plus élevé — exactement là où le levier
 * est le plus risqué et où le modèle le vantait le plus.
 */

/**
 * [SMITH-HELOC-TAUX-FIGE] Écart appliqué AU-DESSUS du taux hypothécaire du bien pour obtenir le taux
 * de la marge (décision Marc, 2026-08-24 : « la marge suit l'hypothèque »).
 *
 * ⚠️ **La DIRECTION est structurelle, la MAGNITUDE est une hypothèse.** Une marge de crédit
 * hypothécaire est un produit *révolvant*, rappelable, et de rang postérieur au prêt de premier rang
 * qu'elle accompagne : elle se prête donc plus cher que lui. Ça, c'est un fait sur l'instrument, et
 * c'est ce qui rendait le 5 % figé faux DANS SA FORME — il pouvait passer sous le taux hypothécaire.
 * Les 2 points retenus, en revanche, ne sont PAS un écart de marché relevé quelque part : c'est un
 * choix de modèle, rond et volontairement conservateur. Le documenter autrement — en citant un
 * « prime + 0,5 » ou un écart historique — fabriquerait la source qu'on prétend citer
 * (`ECRIRE-UN-CHIFFRE-FISCAL-SANS-LE-MESURER-FABRIQUE-SA-SOURCE`).
 *
 * Le lecteur qui veut juger de ce choix a les DEUX tableaux du bloc historique ci-dessus : la
 * sensibilité du levier au taux de marge (3 / 5 / 8 / 10 %), et l'effet mesuré de ce lot.
 */
export const SMITH_HELOC_SPREAD_OVER_MORTGAGE = 0.02;

/**
 * [SMITH-HELOC-TAUX-FIGE] Plancher du taux de la marge.
 *
 * Un bien dont le taux hypothécaire est absent ou nul (saisie incomplète, bien détenu sans prêt)
 * donnerait sinon une marge quasi gratuite — donc un levier artificiellement gagnant, exactement le
 * biais que ce lot corrige. Le plancher rend ce cas conservateur au lieu de flatteur.
 */
export const SMITH_HELOC_RATE_FLOOR = 0.03;

/**
 * [SMITH-HELOC-TAUX-FIGE] Taux ANNUEL de la marge du levier Smith pour un bien donné.
 *
 * SOURCE UNIQUE — `realEstateMonth.ts` l'appelle, et rien d'autre ne recompose ce taux. Avant ce lot
 * il n'y avait pas de fonction du tout : un littéral figé, indépendant du dossier.
 *
 * ⚠️ Ce taux n'est pas un chiffre d'affichage. `useSmithManoeuvre` fait partie de l'espace de
 * recherche de stratégies (`strategySpace.ts`, `strategyConfig.ts`) : il décide de ce que
 * l'application RECOMMANDE. Le rendre dépendant du dossier était donc l'enjeu du ticket — un 5 % gelé
 * rendait le levier flatteur précisément quand les taux montent, c'est-à-dire quand il devient
 * dangereux.
 *
 * @param mortgageRatePct taux hypothécaire du bien, en POURCENTAGE (convention de `RealEstateGoal`).
 */
export const smithHelocAnnualRate = (mortgageRatePct: number | undefined): number => {
    const pct = Number.isFinite(mortgageRatePct) ? (mortgageRatePct as number) : 0;
    return Math.max(SMITH_HELOC_RATE_FLOOR, pct / 100 + SMITH_HELOC_SPREAD_OVER_MORTGAGE);
};

/**
 * Croissance annuelle supposée pour actualiser la cible FIRE dans le calcul du **CoastFIRE**
 * (`monthlyOutput.ts`) : « quel patrimoine faut-il AUJOURD'HUI pour atteindre la cible à la retraite
 * sans plus jamais cotiser ? ».
 *
 * ⚠️ **Incohérence connue** : cette croissance est indépendante de `projection.returnRate`. Deux
 * utilisateurs qui projettent 4 % et 9 % de rendement obtiennent le MÊME CoastFIRE, alors que la
 * question posée ne veut rien dire sans le rendement.
 *
 * ⚠️ **Portée MESURÉE : nulle aujourd'hui.** `CoastFIRE` est publié dans `ProjectionChartPoint` et
 * documenté dans `PROJECTION_OUTPUT_SCHEMA.md`, mais **aucun composant, aucun prompt IA, aucun outil
 * MCP, aucun export ne le lit** (vérifié par balayage du dépôt). Le corriger ne changerait donc
 * aucun chiffre vu par qui que ce soit — raison pour laquelle ce n'est pas fait ici : un correctif
 * qui bouge un champ que personne ne lit ne se distingue pas d'une régression, et la seule garde
 * existante (`monthlyOutput.test.ts`) n'exerce que la branche POST-retraite, où cette croissance
 * n'intervient pas. Le vrai ticket est `[COASTFIRE-CROISSANCE-FIGEE]`, qui doit d'abord trancher si
 * ce champ a un consommateur.
 */
export const COAST_FIRE_ASSUMED_ANNUAL_GROWTH = 0.05;

/**
 * Revenu mensuel supposé d'un emploi « barista » (temps partiel de complément) dans le calcul du
 * **BaristaFIRE** (`monthlyOutput.ts`) : la cible est réduite des dépenses que ce revenu couvre.
 *
 * ⚠️ Nombre purement conventionnel — aucune source, et il ne s'indexe pas (il reste 1 500 $ nominaux
 * en 2056, quand les dépenses auxquelles il se soustrait sont, elles, indexées par
 * `expenseMultiplier`). L'écart se creuse donc mécaniquement avec l'horizon.
 *
 * ⚠️ Même portée MESURÉE que `COAST_FIRE_ASSUMED_ANNUAL_GROWTH` : `BaristaFIRE` est publié et lu par
 * personne.
 */
export const BARISTA_ASSUMED_MONTHLY_INCOME = 1500;

/**
 * Multiple de dépenses annuelles donnant le capital cible — **règle des 4 %** (Trinity Study, 1998) :
 * on peut retirer 4 %/an d'un portefeuille sans l'épuiser, donc cible = dépenses annuelles × 25.
 *
 * SOURCE UNIQUE des DEUX sites qui en avaient chacun leur copie anonyme : la cible FIRE
 * (`projection.ts`) et la cible BaristaFIRE (`monthlyOutput.ts`). Seul le premier portait la
 * justification en commentaire ; le second était un `* 25` nu, donc impossible à relier à la règle
 * qu'il applique. Deux copies d'un même nombre divergent — ici elles n'avaient pas encore divergé,
 * et c'est le seul moment où la fusion est gratuite.
 */
export const FIRE_TARGET_MULTIPLE = 25;

/**
 * [ESTATE-LIFEEXPECTANCY-95-DUR] Espérance de vie PAR DÉFAUT (années), quand
 * `retirementGoal.lifeExpectancy` est absent ou inutilisable (non fini, ≤ 0).
 *
 * SOURCE UNIQUE d'un défaut qui vivait en QUATRE écritures : `types.ts` (commentaire « défaut 90 »),
 * `Retirement.tsx` (`?? 90`), `RetirementSettingsCard.tsx` (`?? 90` et `|| 90`) — et, DIVERGENT,
 * `estateCalculation.ts` qui posait `lifeExpectancy = 95` EN DUR sans jamais lire la saisie. Un
 * utilisateur réglé à 90 voyait « Héritage (90 ans) » à l'écran et 95 ans de rentes valorisés dans
 * le patrimoine successoral. Le moteur lit désormais la saisie et retombe sur CE défaut, le même que
 * l'écran affiche quand le champ est vide.
 *
 * ⚠️ La migration v4→v5 (`store/migrationsPersistees.ts`) écrit son propre `90` : c'est un RÉCIT
 * daté (ce qu'elle a écrit ce jour-là), pas un consommateur de ce défaut — il ne bouge pas avec lui.
 */
export const DEFAULT_LIFE_EXPECTANCY = 90;
