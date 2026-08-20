# ADR — Modèle du DIVORCE dans le moteur de projection (2026-08-13)

**Contexte.** L'audit 2026-08-12 a mesuré trois incohérences simultanées du divorce, toutes
confirmées contre le code avant correction :
1. le partage touchait les ACTIFS et l'hypothèque mais gardait **100 % des dettes non
   immobilières** — après avoir cédé tous les actifs, le patrimoine restait à −81 827 $ ;
2. le divorce était **fiscalement inerte** — Δ impôt = 0 $ exact sur 30 ans, alors que la
   différence entre 1 et 2 contribuables vaut ~187 k$ cumulés ;
3. le conjoint parti **continuait d'encaisser son salaire à vie** (~85 k$/an sur un couple à
   183 k$ brut). Cette erreur DOMINAIT la coupe de patrimoine.

Mesure de l'effet combiné (fixture couple 183 k$, dette 100 k$, horizon 30 ans, partage 50 %) :
un divorce coûtait **4,2 %** du patrimoine médian final et laissait la survie à **100 %**.

### Décision 1 — Les dettes non immobilières se partagent COMME les actifs
`activeDebts`, `liquidDebt` et `smithManoeuvreDebt` sont multipliés par le même facteur `keep`
que les actifs. **Choix de Marc, 2026-08-13.** Rationnel : c'est l'esprit du patrimoine familial
québécois — on partage la valeur NETTE, pas les actifs bruts. Alternatives écartées : garder
100 % des dettes (rendait le résultat absurde), ou un curseur séparé (un paramètre de plus à
comprendre pour un gain de fidélité marginal).

### Décision 2 — Le ménage passe à UNE tête, en réutilisant la plomberie du décès
Un drapeau dérivé `soloHousehold = survivorMode || divorced` alimente les 7 sites fiscaux dont
le sens est « un seul contribuable, pas de revenu de conjoint ».
⚠️ **Il ne remplace PAS `survivorMode` partout** : les prestations de survivant (RRQ réversible,
PSV, DB du conjoint décédé) n'existent pas pour un divorcé. `computeRetirementIncome` continue
donc de recevoir `survivorMode`, et reçoit séparément un compte de têtes réduit.
Modèle assumé : chacun garde SES rentes — le partage des gains RRQ au divorce, possible au
Québec, n'est pas modélisé (direction conservatrice).

### Décision 3 — Les dépenses du ménage restent à 100 %, ASSUMÉ
**Choix de Marc, 2026-08-13**, en connaissance de l'effet mesuré. Quand le ménage passe à une
tête, le moteur ne réduit PAS les dépenses de base : Marc conserve 100 % des dépenses du couple,
à vie, plus la pension alimentaire.

Conséquence, mesurée et acceptée : le patrimoine médian passe de 4 885 758 $ (sans divorce) à
**−621 625 $**, et la survie de 100 % à **0 %**. C'est une hypothèse **volontairement
pessimiste**, pas un oubli.

Alternatives proposées et écartées par Marc : un facteur « dépenses solo » à 65 % (usage courant
en planification — le loyer et les frais fixes ne se divisent pas par deux), à 50 %, ou un champ
de budget solo saisi à la main.

⚠️ **Le DÉCÈS a exactement le même comportement** (le bloc dépenses ne consulte pas non plus
`survivorMode`) : une veuve conserve les dépenses du couple. Pré-existant, cohérent avec cette
décision, et désormais explicite plutôt que tacite.
