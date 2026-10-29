# Onglet « Apps » (navigation entre les apps du parc)

**À quoi ça sert** : depuis FinanceAI, un onglet « Apps » (replié, en haut à droite) se déplie en un lien par autre app du parc (Hub, DriveAI, BatchChef, CarAI, JobAI, MemoryAI). Un clic ouvre l'app dans le même onglet.

**La règle** : la vérité de la liste est `Hubperso/lib/sources.ts` (`APPS`, champ `accueil`). `utils/appsDuParc.ts` en est une **copie figée**, jamais lue à l'exécution : aucun `fetch`. Ajouter ou changer une app = modifier la source, puis recopier.

**Code** : `components/NavApps.tsx` (`<details>` natif, zéro état, zéro donnée financière), classes `.nav-apps*` en fin de `index.css` (variables du dépôt, cibles ≥ 44 px). Id courant : `financeai` (absente de la liste affichée). Tests : `tests/navApps.test.tsx`, `tests/appsDuParc.test.ts`.

**Qui le voit** : l'app n'est servie qu'au propriétaire (`middleware.ts`, session du hub). L'onglet est monté dans `App.tsx` une fois l'app affichée : ni sur l'écran de passphrase (coffre verrouillé), ni pendant l'accueil (onboarding).
