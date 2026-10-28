# ADR — Refonte de l'onglet Futur pour le téléphone : adaptation EN PLACE, direction « courbe d'abord » (Marc, 2026-09-10)

## Contexte

Marc, 2026-09-10 : « full refonte de l'onglet futur pour le téléphone, actuellement c'est inutilisable ». Le retour
précédent (2026-08-12, « trop petit trop cramped ») avait été traité par `[FUTUR-MOBILE-LAYOUT]` (feuille de bas
d'écran pour l'infobulle figée, courbe à 55 dvh, cibles 44 px sur le zoom) — la plainte porte donc sur ce qui RESTE.
Mesuré à 390×844 sur `main` (7cb74e44) : en-tête de ~100 px avant le contenu, jusqu'à 6 boutons de période qui ne
tiennent pas sur une ligne, 16 pastilles de légende (36 px) AVANT la courbe, curseurs de 4 px de haut, 65 cibles
tactiles sous 44 px sur les quatre sous-onglets. `FutureProjection.tsx` fait 2 207 lignes et porte deux dettes
structurelles ouvertes (`[GODFILE-FUTUREPROJECTION]`, `[A11Y-SUBTABS-FUTUR]`) que le BACKLOG interdit de mener en
parallèle d'un autre chantier sur ce fichier.

Cadrage par `/new-feature` (product-manager puis architect), maquettes 390×844 publiées
(https://claude.ai/code/artifact/260843dd-1ee9-4a39-b1cb-ce4095c328ec), puis seize questions posées à Marc en quatre
lots, toutes répondues le 2026-09-10.

## Décision

1. **Direction A — courbe d'abord, sous-onglets conservés** (Marc). Les quatre sous-onglets restent, en pastilles
   compactes ; en-tête compact d'une ligne ; la courbe précède les KPI (2×2 compacts) ; légende repliée dans un tiroir
   « Séries » dont le compte reste visible ; feuille du jour aux trois quarts avec Veille/Lendemain ; hypothèses en
   curseur + champ numérique synchronisé, ordre Mode → macro → rendements → sections repliées ; bouton « Recalculer »
   collant au-dessus de la navigation ; amorçage en puces de leviers 44 px + gros bouton.
2. **Horizon COMPLET sur téléphone** (Marc, contre la recommandation d'une fenêtre de 15 ans) : ni `projection.years`
   ni la fenêtre de zoom ne changent selon l'appareil. Le pincement reste le seul zoom.
3. **Sélecteur de période = menu déroulant natif** (Marc, sur conseil de l'architecte) : `<select>` avec tous les
   présets, « Aujourd'hui » compris, plutôt que des pastilles ou un popover maison.
4. **Adaptation EN PLACE, pas de coquille mobile dédiée** (architecte, retenu) : `FutureProjection.tsx` est UN arbre
   d'état (révélation, `chartData`/`displayData`, zoom, séries masquées, reconstruction du passé, contexte IA). Une
   `FutureMobile.tsx` séparée exigerait soit de le DUPLIQUER (divergence au premier correctif — la classe de bug la plus
   documentée du dépôt), soit de l'extraire en hook partagé, ce qui EST le refactor du god-file, hors périmètre. On
   extrait donc des composants-FEUILLES purs (`seriesConfig`, `useHiddenSeries`, `FuturePeriodSelector`,
   `FutureLegendDrawer`, `ReturnRateField`, champs macro) branchés sur `useViewportBelowSm` déjà en place, avec un
   rendu desktop bit-identique.
5. **Zéro changement visuel desktop** (Marc) ; **six PR incrémentales, filet d'abord** (Marc) ; une PR est finie
   quand le projet Playwright `mobile-chrome` est vert ET que des captures 390×844 sont jointes à la PR (Marc).

## Pourquoi

- Le seul précédent qui a rendu Futur utilisable au téléphone (`[FUTUR-MOBILE-LAYOUT]`) a procédé en place, via
  `isNarrowViewport`, sans coquille — et il tient.
- Une coquille dupliquée ferait diverger deux arbres d'état sur l'écran money-critical de l'app ; une coquille sur
  hook partagé absorberait par la bande un refactor que le BACKLOG séquence explicitement après l'ARIA des sous-onglets.
- Marc a écarté la fenêtre mobile de 15 ans : un même écran ne doit pas raconter deux trajectoires selon l'appareil.

## Trade-offs

- `FutureProjection.tsx` grossit encore un peu avant sa découpe (bornée : composants extraits, pas de logique inline).
- Le `<select>` natif est moins visuel que des pastilles ; c'est un contrôle secondaire, l'accessibilité gagne.
- Sans fenêtre mobile, les pastilles d'événements restent illisibles à l'horizon complet sans pincer
  (`[FUTUR-STACK-ZOOM-AWARE]` reste le ticket qui les traite).

## Alternatives rejetées

- **Direction B** (une seule page qui défile, courbe collante) : moins de navigation mais réorganise tout le fichier.
- **Coquille `FutureMobile.tsx`** : voir Décision 4.
- **Fenêtre de vue mobile réduite (15 ans)** : rejetée par Marc.
- **Steppers − / +** à la place des curseurs : rejetés par Marc au profit de curseur + champ numérique.
- **Trois pastilles + « Plus »** pour la période : accordéon disproportionné pour trois options, un `<select>` fait mieux.
