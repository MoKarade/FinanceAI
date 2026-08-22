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
 * Taux annuel de la marge de crédit hypothécaire (HELOC) du levier **Smith Manoeuvre**.
 * Lu par `realEstateMonth.ts` : le capital remboursé est ré-emprunté, et cette marge capitalise
 * ses intérêts — lesquels alimentent `smithInterestDeductibleYear`, une déduction RÉELLE de
 * décembre (`taxDecember.ts`), et `smithManoeuvreDebt`, soustraite du patrimoine net
 * (`netWorth.ts`) et de la succession (`estateCalculation.ts`).
 *
 * ⚠️ **Portée MESURÉE — ce n'est pas un chiffre d'affichage, c'est une FONCTION OBJECTIF.**
 * `useSmithManoeuvre` fait partie de l'espace de recherche de stratégies (`strategySpace.ts`,
 * `strategyConfig.ts`) : l'optimiseur ACTIVE ou DÉSACTIVE le levier et classe le résultat. Ce taux
 * décide donc de ce que l'application RECOMMANDE, pas seulement de ce qu'elle montre.
 *
 * Mesuré sur 30 ans (célibataire, 8 000 $/mois brut, maison 500 k$, hypothèque 5 %, rendement 6 %),
 * gain du levier sur le patrimoine net final selon le taux de la marge :
 *
 * | Taux marge | Gain Smith |
 * |---|---|
 * | 3 %  | +533 577 $ |
 * | 5 %  | +489 760 $ |
 * | 8 %  | +326 361 $ |
 * | 10 % | +146 425 $ |
 *
 * Soit **343 335 $ d'amplitude** sur une plage de taux plausible — et à 10 % la succession passe
 * SOUS celle du scénario sans levier (mesuré : 2 212 026 $ contre 2 212 234 $), c'est-à-dire que le
 * conseil s'INVERSE.
 *
 * ⚠️ **LIMITE ASSUMÉE, décision produit en attente (`[SMITH-HELOC-TAUX-FIGE]`).** Ce taux est figé :
 * il ne suit ni `goal.mortgageRate`, ni l'environnement de taux, ni aucune saisie. Or une marge
 * hypothécaire canadienne est indexée sur le taux préférentiel, structurellement AU-DESSUS du prêt
 * hypothécaire qu'elle accompagne — un 5 % gelé est donc optimiste dès que les taux montent, et
 * c'est précisément là que le levier devient dangereux. Le corriger déplace de l'argent et re-base
 * les goldens : c'est un arbitrage de Marc, pas un correctif mécanique.
 */
export const SMITH_HELOC_ANNUAL_RATE = 0.05;

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
