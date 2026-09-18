# BACKLOG — FinanceAI (actionnable)

> Liste de ce qui RESTE à faire — refonte complète 2026-07-31 (demande Marc) : chaque item
> vérifié contre le code réel (2 agents, preuve fichier:ligne) avant d'entrer ici.
> Tâches finies + validées → [`docs/BACKLOG_ARCHIVE.md`](BACKLOG_ARCHIVE.md) (créé 2026-07-31).
> Historique ancien : [`docs/HISTORIQUE.md`](HISTORIQUE.md). Actions humaines : [`docs/A_FAIRE_MOI.md`](A_FAIRE_MOI.md).

## Convention (règles Marc 2026-07-31, NON négociables)
- **CHAQUE tâche a une case `- [ ]`** — aucune puce de tâche sans case. Une note/décision sans
  travail à faire n'est pas une tâche : elle va en archive ou dans `docs/adr/`.
- **Tenu à jour à CHAQUE push** : cocher les items livrés dans la PR même, ajouter les découvertes.
- **Archivage** : un item coché + validé (mergé sur main, gate vert) DÉMÉNAGE vers
  `BACKLOG_ARCHIVE.md` (avec date + PR) au plus tard à la PR suivante — le BACKLOG ne garde que le vivant.
- Chaque item Claude-faisable porte un **`[ID]`**. Claude coche lui-même au merge.
- Légende : 🔧 Claude · 🧭 décision Marc requise · 👤 action humaine (Marc) · ⏳ gros chantier ·
  (S/M/L) = effort. Les tests manuels (section 👤) n'ont pas d'`[ID]`.

---

## 📈 Infobulle et courbes du Futur (18/09/2026, demandé par Marc)

> Demande : « je veux voir la courbe de la dette même dans le passé et je vois pas les transactions
> dans l'infobulle on dirait ça manque des transactions, fais une grosse grosse passe sur les
> infobulles y a des irritants ». Réponses en clic : **tout afficher avec défilement**, dette en
> **orange plein sous zéro**, périmètre **le graphe Futur d'abord**.

- [x] 🔧 **`[FUTUR-COURBE-DETTE]`** (S) **LIVRÉ le 18/09/2026** — la dette hors hypothèque
  (`DettesNonImmo`, déjà publiée par le moteur ET par la reconstruction du passé) devient une série
  du graphe, tracée **NÉGATIVE** (aire orange `#ea580c` sous zéro), avec son entrée de légende.
  ⚠️ **La prémisse de Marc a été MESURÉE avant d'être suivie** : « il y a bien une courbe rouge en
  dessous de zéro donc je veux que ce soit celle-ci qui continue si c'est bien celle de la dette ».
  Ce n'en était pas : cette courbe est `ImpotLatent`. La suivre aurait fait passer un impôt
  hypothétique pour sa dette réelle. Couleur ET forme distinctes, verrouillées par test.
  ⚠️ `detteSousZero` rend `null` (jamais `0`) quand le champ est absent ou non fini — `0` se lirait
  « aucune dette », la valeur la plus crédible donc la pire.
- [x] 🔧 **`[FUTUR-MOUVEMENTS-TOUS]`** (S) **LIVRÉ le 18/09/2026** — le plafond de 6 mouvements par
  journée est retiré. **Mesuré sur les vraies transactions de Marc** (1er août → 18 septembre) :
  9 journées dépassaient 6, la pire le 31 août avec 18 mouvements (12 cachés), et la liste gardait
  les six PREMIERS rencontrés, pas les plus gros — Anthropic (−321,93 $) et Global Exchange
  (−307,40 $) étaient cachés pendant qu'un « Frais de service » de 15,95 $ restait affiché.
  Le conteneur de l'infobulle défile déjà (`max-h` + `overflow-y-auto`) : aucune place à gagner.
  Le test de limite du plafond est **INVERSÉ** au même endroit, avec sa mesure.
  ⚠️ `movementsTotal` survit : il compte AUSSI les transactions sans description, donc
  « +N autres » ne parle plus que d'elles.

- [x] 🔧 **`[INFOBULLE-DETTE-NW-NON-FINI]`** (S) **LIVRÉ le 18/09/2026, avec `[FUTUR-PANNEAU-FIXE]`**
  — routé la veille comme « préexistant, hors périmètre », corrigé ici parce qu'il est devenu du
  chemin **NOMINAL** : la colonne « Par compte » du panneau consomme `detteReductrice`.
  Le défaut : `Number(point.NetWorth) || 0` rabattait un `NaN`/`Infinity` sur **zéro**, et la
  soustraction rendait alors la somme **TOTALE des actifs** sous le libellé « Dettes (hors
  hypothèque) » — un chiffre faux et parfaitement crédible, dans les deux surfaces, sans trace.
  **Correctif = le TYPE** (`number | null`), qui a fait ÉNUMÉRER les deux consommateurs par le
  compilateur : tous deux gataient sur `> 0.5` et auraient masqué `null` en silence.
  ⚠️ **Les DEUX moitiés sont fermées**, et la seconde est plus discrète : une clé d'actif PRÉSENTE
  mais non finie rend la SOMME amputée, donc la dette **surévaluée** du montant du compte illisible
  — l'erreur va dans l'autre sens. Une clé ABSENTE reste légitime (« pas de compte de ce type »,
  pas « donnée perdue »).
  Le REFUS est **dit à l'écran** dans les deux surfaces, jamais une ligne silencieusement masquée.
  ⚠️ Poser le `logError` DANS `comptes.ts` élargirait le contrat de mock de tous les tests qui
  montent `FutureProjection` (`UN-IMPORT-DANS-LA-COUCHE-SERVICES-ELARGIT-LE-CONTRAT-DE-MOCK…`,
  2 occurrences) — à mesurer avant, pas à supposer.
  ⚠️ Jumeau FAIBLE, à décider dans le même lot : `detteSousZero`
  (`components/future/detteSerie.ts`) ne distingue pas non plus « absent » (silence LÉGITIME) de
  « présent mais non fini » (corruption, à tracer) — mais son échec est SÛR (trou visuel honnête,
  jamais un chiffre faux), donc il ne justifie pas à lui seul un lot.

- [x] 🔧 **`[FUTUR-COURBE-DETTE-PREFIXE-PASSE]`** (S) **LIVRÉ le 18/09/2026** — trouvé par le panel
  APRÈS un gate ciblé vert : `buildPastPrefix` CALCULAIT la dette du mois (avec tout son gating par
  `startDate` et par l'amortissement) et ne la PUBLIAIT pas — elle ne servait qu'à produire
  `NetWorth`. Le jour où la dette est devenue une COURBE, ce producteur est devenu le seul du passé
  à ne rien publier, donc `detteSousZero` y lisait `undefined` : **trou silencieux dans la courbe,
  indiscernable d'une dette à zéro, exactement là où Marc a demandé à la voir**. Chemin étroit mais
  réel (repli MENSUEL, et le tout premier point d'ancrage de la courbe quotidienne). Garde de
  TRAVERSÉE (producteur → `detteSousZero`) + contrôle négatif (patrimoine inconnu ⇒ aucune dette
  affirmée). La grandeur publiée est la MÊME variable que celle retranchée du patrimoine, jamais une
  seconde dérivation.
- [x] 🔧 **`[FUTUR-COURBE-DETTE-TABLE-A11Y]`** (S) **LIVRÉ le 18/09/2026** — la table de données
  `sr-only` (alternative texte au graphe, dont l'`aria-label` promet « les mêmes données ») n'avait
  pas reçu la colonne de la nouvelle série : un utilisateur de lecteur d'écran obtenait une table où
  la valeur nette ne se RECOMPOSE PAS par somme des comptes. Garde **DÉRIVÉE** de
  `FUTURE_LEGEND_ITEMS` (toute série en AIRE doit avoir sa colonne) — une garde qui recopierait
  `dataColumns` serait circulaire et ne verrait aucun oubli.

- [ ] 🔧 **`[FUTUR-COURBE-DETTE-RENDU-NON-GARDE]`** (XS) — angle mort ASSUMÉ de
  `tests/components/futureCourbeDette.test.ts` : elle teste le module `detteSerie` et la config de
  légende, **jamais le rendu Recharts réel**. Un `connectNulls` retiré par erreur sur l'`<Area>` de
  la dette relierait les trous sans qu'aucun test ne rougisse — et un trou relié affirme une
  continuité que la donnée n'a pas.

- [x] 🔧 **`[FUTUR-PANNEAU-FIXE]`** (L) **LIVRÉ le 18/09/2026** — l'infobulle flottante est
  remplacée par un **panneau FIXE sous le graphe**, choix de Marc en clic et en texte libre :
  « j'aimerais que ce soit un panneau fixe en dessous du graphe et pareil sur le téléphone mais je
  veux que ça reste lisible. Je veux pouvoir choisir le lendemain ou la veille ».
  **Cadré avec lui, en trois lots de questions** : colonnes sur PC / onglets sur téléphone · le
  graphe garde sa taille (la page défile) · état initial **aujourd'hui** · ordre **net → flux →
  comptes → mouvements** · survol = aperçu, clic = épingle · l'infobulle flottante disparaît · sur
  téléphone, **flèches à PAS RÉGLABLE (jour / mois / année)** — les trois premières propositions
  (tape + flèches, curseur sous le graphe, flèches seules) ont toutes été refusées.
  ⚠️ Marc a coché les QUATRE irritants **et** les quatre « ce que je regarde en premier » : le
  problème était l'**ORGANISATION**, pas le volume — **aucune section n'a été supprimée**.
  ⚠️ L'irritant n°1 (« elle disparaît / bouge quand je veux la lire ») est STRUCTUREL à un objet
  qui suit le curseur : pour lire une infobulle il faut bouger la souris vers elle, et la bouger la
  change. Seul l'endroit où elle vit le corrige.
  **TROIS états, pas deux** : l'infobulle n'existait que pendant un survol ou un gel ; un panneau
  fixe est toujours là et a besoin d'un troisième état — ce qu'il montre au repos.
  `choisirJourAffiche` en fait une fonction pure (épingle > survol > ancre) et l'ORIGINE est écrite
  à l'écran.

---

## 🚗 Dette — elle suit maintenant les VRAIS virements (18/09/2026, demandé par Marc)

- [x] 🔧 **`[DETTE-VIREMENTS-REELS]`** (M) **LIVRÉ le 18/09/2026** (demande de Marc :
  « ca marfhe pas pour la dette je vais faire simple pour toi je veux que chaque fois que je paie
  toyota ca enleve ca de la dette, faut que ma dette soit lié a chaque fois que je fais un virement
  du bon montant a toyota » ; sémantique choisie par lui en clic : **« suivre les vrais virements,
  point »** — la dette ne descend QUE sur un virement réellement importé, aucun chiffre inventé).
  **CE QUI EXISTAIT ET POURQUOI ÇA NE SUFFISAIT PAS** : le passé du bail descendait par une GRILLE
  MODÉLISÉE (`startDate` + k × cadence, versement dérivé de `minimumPayment`). C'est un modèle : il
  continue de descendre les semaines où rien n'a été prélevé, et il place des versements que les
  transactions ne connaissent pas.
  **MESURÉ sur ses vraies transactions** (8 × `Toyota Financial` −234,67 $ les 28 juil., 5, 11, 18,
  25 août, 1er, 9 et 15 sept.) : série au mois **48 811,36 | 48 576,69 | 47 403,34** (virements
  réels) contre **49 046,02 | 48 576,68 | 47 403,34** (grille). L'écart est concentré en JUILLET —
  **234,66 $**, soit exactement un versement que le modèle inventait ; août et septembre coïncident
  au cent près. Un modèle qui s'accorde avec la mesure là où on regarde reste un modèle.
  **CONTRÔLE NÉGATIF, dans les données** : `Ste Foy Toyota Quebec` −500,00 $ et −779,79 $ (le
  CONCESSIONNAIRE, juillet) — un appariement lâche (« le libellé contient toyota ») aurait retiré
  **1 279,79 $** de la dette pour des achats qui n'en remboursent rien. L'appariement est EXACT.
  **LIVRÉ** : champ `Debt.paymentPayee` (choisi dans une LISTE de marchands, jamais retapé, et
  déclaré dans `CHAMPS_TEXTE` du même geste) ; `sourceVersements` devient la décision UNIQUE
  « d'où viennent les versements » (virements réels **>** grille) ; une dette liée ne retombe
  JAMAIS sur la grille, pas même en repli ; `transactions` devient **REQUIS** sur toute la chaîne
  (solde du jour, série au mois et au jour, porte du moteur, total dû, bandeau) — 94 sites énumérés
  par le compilateur.
  ⚠️ **CONSÉQUENCE ASSUMÉE, et elle est écrite à l'écran** : avant le plus ancien virement importé
  (28 juillet pour Marc, alors que le bail commence le 14), la dette reste PLATE. L'app ne sait rien
  de ce qui a été payé avant que ses transactions ne commencent — c'est le prix exact de « aucun
  chiffre inventé, jamais ».
  ⚠️ **RESTE UN GESTE À MARC** : ouvrir la dette « bZ », choisir « Toyota Financial » dans
  « Virements qui remboursent cette dette », puis Enregistrer. Le lien ne se devine pas.

---

## 💸 Reste du panel `[DETTE-VIREMENTS-REELS]` (18/09/2026) — mesuré, NON corrigé (hors périmètre)

- [ ] 🔧 **`[PDF-DETTES-SOLDE-BRUT]`** (S) — **le rapport PDF ne se recompose pas avec lui-même.**
  `components/app/exportPdfEcran.ts` somme `state.debts.reduce((s, d) => s + d.balance, 0)` et
  `services/pdfReport.ts` remplit chaque ligne (`balance`, `monthsToZero`) depuis `d.balance` —
  aucun des deux ne passe par `soldeDetteAujourdhui`. Le même document affiche pourtant un
  patrimoine net CORRECT (il vient de `computePresentNetWorth`, corrigé). **Mesuré sur le bail de
  Marc : PDF 47 168,67 $ contre écran 45 525,98 $, soit 1 642,69 $, +234,67 $ par semaine.**
  Un document exporté et partagé où `actifs − dettes ≠ valeur nette`, sans avertissement.
  ⚠️ Pré-existant (`[DETTE-SOLDE-INSTANTANE-FIGE]`, 17/09) ; `[DETTE-VIREMENTS-REELS]` en élargit
  la magnitude, il ne le crée pas. Routé plutôt que corrigé : deux fichiers qu'aucun des deux lots
  ne touche.

- [ ] 🔧 **`[PASSE-MOIS-DEUX-INSTANTS]`** (M) — **la série MENSUELLE du passé mêle la fin d'un mois
  et le début d'un autre.** `services/history/buildPastPrefix.ts` : `cashByMi` porte le cash à la
  **FIN** du mois (contrat de `reconstructCashHistory`) pendant que le supplément de dette porte le
  solde au **1er** du mois (`amortirVersementsFixes` échantillonne `premierDuMois`). **Mesuré au
  point `2026-08` : liquidités 20 469,34 $ (= cash au 1er septembre) contre dette 46 699,33 $
  (= dette au 1er août) — un mois d'écart.** Chaque point mensuel du passé sous-estime donc la
  valeur nette d'environ un mois de versements (**≈ 1 016,90 $** ici), et le raccord passé→futur
  montre une marche de 938,69 $ que `fluxPeriodeAnnulee` (469,34 $) n'explique pas.
  ⚠️ **PRÉ-EXISTANT, prouvé** : rejoué avec la grille modélisée (donc sans `paymentPayee`, le
  comportement d'avant le lot), les valeurs sont IDENTIQUES — cohérent avec la bit-identité mesurée
  sur les huit personas. La série au JOUR, elle, est exacte. ⚠️ Avant de « corriger », trancher
  lequel des deux instants la série mensuelle PROMET : déplacer l'un sans l'autre ne fait que
  changer de côté l'écart d'un mois.

- [ ] 🔧 **`[DETTE-TX-POSTDATEE-ASYMETRIE]`** (S) — miroir, beaucoup plus petit, du défaut
  `isTransfer` corrigé dans le lot : `paiementsReelsDette` REFUSE une transaction datée APRÈS
  aujourd'hui (justifié : elle ne décrit pas un solde du jour) pendant que `computeCashLedger`, lui,
  la compte sans regarder la date. **Mesuré : valeur nette 234,67 $ trop BASSE par transaction
  post-datée.** Le correctif n'est pas forcément côté dette — c'est l'ASYMÉTRIE qui est le défaut, et
  c'est peut-être le cash qui a tort.

- [ ] 🔧 **`[DETTE-TX-DATEE-AU-MOIS-JETEE]`** (S) — une transaction datée au MOIS seul
  (`2026-09`) est écartée des virements par `jourMs` (qui exige ≥ 10 caractères) **sans compteur ni
  avertissement**, alors que le registre du cash les COMPTE et les ANNONCE (`undatedTotal`, affiché
  dans le bandeau de la vue au jour). **Mesuré : 234,67 $ de dette non déduite par occurrence** ⇒
  patrimoine sous-évalué. Le remède est un compteur PUBLIÉ (même patron qu'`undatedTotal`), pas un
  `continue` muet — refuser en silence est le mode de panne que ce dépôt a déjà payé trois fois.

- [ ] 🔧 **`[DETTE-PAYEE-RESIDU-INVISIBLE]`** (XS) — changer le `kind` d'une dette liée, ou lui
  donner un taux non nul, MASQUE le sélecteur de marchand sans effacer `paymentPayee` : le champ
  survit à l'enregistrement (`saveEdit` fusionne `{...d, ...draft}`), reste invisible, et le lien se
  réactive en silence si le taux revient à zéro. Effet conservateur aujourd'hui (aucune déduction
  n'a lieu), donc XS — mais un champ posé qu'aucun écran ne montre est exactement ce que
  `[DETTE-BALANCEASOF-INVISIBLE]` a coûté la veille.

---

## ♿ Trouvé par le panel du lot `[DETTE-VIREMENTS-REELS]` (18/09/2026) — RE-MESURÉ avant d'être écrit

- [ ] 🔧 **`[CONTRAST-SCAN-CLASSNAME-CALCULE]`** (M) — **le scan de contraste ne voit que les
  `className="…"` LITTÉRAUX, et son angle mort couvre 130 sites.** Il est DÉCLARÉ en tête de
  `scripts/lib/ctaContrast.ts` (« ⚠️ ANGLE MORT ASSUMÉ ») — donc il se lit comme un détail déjà
  tranché, et personne n'en avait jamais mesuré la TAILLE (`AUDITER-LE-FILTRE-AUTANT-QUE-LA-LISTE`).
  **MESURÉ le 18/09/2026** : `130 sites dans 48 fichiers` de `components/` portent un token de
  couleur (`text-…-400`, `bg-…-600`…) à l'intérieur d'un `className={…}` calculé. Aucun n'entre
  dans l'inventaire de `npm run check-contrast`, qui rend pourtant `exit 0`.
  ⚠️ **Le remède évident est presque INERTE, et c'est le point du ticket** : « étendre le scan aux
  ternaires de deux chaînes littérales complètes » (ce que le panel proposait) couvre **7 sites sur
  130**, soit 5 %. Re-mesuré autrement : si le scan récolte TOUT fragment littéral de l'expression
  (chaînes `'…'`/`"…"` **et** le texte brut d'un gabarit hors des `${…}`), il couvre **127 sites sur
  130** — les 3 restants construisent le nom de classe par interpolation
  (`FutureProjection.tsx`, `Layout.tsx`, `ui/Toast.tsx`) et resteront hors de portée, à déclarer.
  ⚠️ **Rejouer l'outil élargi AVANT de croire qu'il n'y a rien** : les offenders révélés sont le vrai
  périmètre, et ils n'ont aucune raison de ressembler à ce ticket-ci.
  · *Déclencheur de ce ticket* : la phrase de statut du solde dans `DebtManager` (la ligne qui
    choisit entre `text-amber-400` et `text-ink-400` selon `alerte`), mesurée À LA MAIN faute d'outil — **10,43** sur le fond réel `#1a1a1a` et **11,94** sur `bg-dark`
    pour `amber-400`, **5,78** / **6,62** pour `ink-400` : les quatre passent AA largement, donc le
    lot n'a PAS de défaut de contraste. C'est l'outil qui ne pouvait pas le dire.

- [ ] 🔧 **`[A11Y-DETTE-CIBLES-TACTILES]`** (S) — **aucun champ du formulaire de dette n'atteint
  44 px de haut**, et ce n'est pas une régression du lot. Mesuré : les `<input>`/`<select>` de
  `DebtManager.tsx` et `DebtKindFields.tsx` font ≈ **26 px** (`text-meta` 16 px + `py-1` 8 px +
  2 px de bordures), soit **−41 %** du seuil WCAG 2.5.5. La LARGEUR n'est pas en cause (le
  `<label className="flex flex-col">` étire les champs bien au-delà de 44 px) — mesurer par AXE,
  jamais en agrégat (`UNE-GARDE-QUI-REDUIT-DEUX-DIMENSIONS-A-UNE-MESURE-LE-MAUVAIS-OBJET`).
  `.touch-target` (44×44, `index.css`) existe et sert dans `Investments`, `Planning`,
  `Transactions`, `budget/BudgetGroupTable` — **jamais** dans ces deux fichiers, sans justification
  écrite. ⚠️ Le correctif cohérent porte sur le formulaire ENTIER : ne corriger que les deux champs
  neufs créerait une incohérence visuelle sans raison écrite.

- [ ] 🔧 **`[A11Y-DETTE-FOCUS-EDITION]`** (S) — `startEdit` (`DebtManager.tsx`) insère le panneau
  d'édition sans y déplacer le focus. Pour un utilisateur clavier ou lecteur d'écran, la branche
  ALERTE de `phraseStatutSolde` (« Solde jamais daté… », « Vérifie le marchand choisi ») n'est donc
  pas garantie d'être annoncée à l'ouverture : il faut naviguer jusqu'à elle. Pré-existant (le
  panneau date de `[DETTE-DATES]`), révélé par le lot qui a donné à cette ligne quelque chose
  d'important à dire. ⚠️ `tabIndex = -1` sur le conteneur est obligatoire : `focus()` sur un `<div>`
  non focalisable est un no-op SILENCIEUX, et le test interroge `document.activeElement`, jamais la
  présence de l'appel.
  ⚠️ **Ce qui a été EXAMINÉ et n'est PAS un défaut**, écrit pour qu'on ne le reprenne pas : la phrase
  de `phraseStatutSolde` **ne doit pas** devenir une région live. Elle se calcule sur la dette
  PERSISTÉE, pas sur le brouillon — elle ne réagit à aucune saisie dans ce formulaire, et ne peut
  changer qu'à une synchro en arrière-plan. L'annoncer interromprait la frappe pour un contenu
  descriptif. Le `role="status"` du refus de saisie, lui, réagit DIRECTEMENT à l'utilisateur : c'est
  ça, un message de statut au sens WCAG 4.1.3.

---

## 🔗 Carte du hub — ce que FinanceAI publie (14/09/2026)

- [x] 🔧 **`[MCP-DEPLOY-SILENCIEUX]`** Le serveur MCP n'était plus déployé depuis au moins
  27 jours, et rien ne le disait. **Garde livrée le 15/09** (S) ; 👤 **le déploiement reste
  à faire par Marc** (voir la dernière puce).
  **CE QUI A ÉTÉ MESURÉ, pas supposé** — le hub reçoit un `/hub/summary` qui contient encore
  « Investissements », « Dette totale » et « Espace CELI dispo », soit le trio remplacé par
  les trois lignes de placements le **2026-08-19** (`b7c6e35`, `4ea10c4` — PR #657 et #660).
  Donc la révision Cloud Run en ligne est ANTÉRIEURE au 19/08. Et c'est bien Cloud Run que le
  hub interroge : l'app Vercel n'expose AUCUNE route `/hub/summary` (son `vercel.json`
  réécrit `/(.*)` vers `/index.html`), donc un appel à `finance.hubperso.com/hub/summary`
  rendrait du HTML et le widget afficherait « réponse invalide ». Il affiche `ok`.
  **177 commits** touchant `mcp/`, `services/`, `utils/`, `types.ts`, `constants.ts` et le
  `Dockerfile` sont en attente depuis `v0.11.0` (19/08), dont deux qui coûtent cher :
  · `/vehicule/bail` — livré le 14/09 POUR une demande de Marc (« ce que j'ai payé par
    rapport au prix total du prêt »), et donc indisponible à CarAI qui doit le consommer ;
  · `/fintable-sync` — jamais exposé, constat déjà écrit dans le HANDOVER du **2026-07-30**.
  **POURQUOI SEPT SEMAINES DE SILENCE** : `deploy-mcp.yml` porte `if: vars.GCP_PROJECT_ID
  != ''`, jamais satisfait, donc le job est `skipped` à CHAQUE push. Un job ignoré ne réveille
  personne, et la coche verte du push disait le contraire de la vérité. Le HANDOVER le disait ;
  personne ne lit un HANDOVER quand rien n'est rouge.
  **LIVRÉ** : un second job, `alerte-non-deploye`, dont la garde est la NÉGATION exacte de
  celle du déploiement — l'un des deux tourne toujours, jamais les deux. Il ne déploie rien :
  il REFUSE le vert. Son message MESURE la dette à l'exécution (`git rev-list` depuis le
  dernier changement de `MCP_SERVER_VERSION`) plutôt que de porter un chiffre écrit en dur qui
  rotirait — vérifié en exécutant le script extrait du YAML : « 177 commit(s) … (v0.11.0,
  2026-08-19) », et la branche « ampleur non mesurable » exercée séparément.
  ⚠️ **Il restera ROUGE à chaque commit du serveur tant que la CI n'est pas câblée, et c'est
  assumé** : à chaque fois, c'est vrai — ce commit-là n'est pas déployé. Un rouge toujours
  vrai et toujours actionnable n'est pas du bruit, c'est une dette qu'on ne peut plus oublier.
  ⚠️ **Ce qu'il ne peut PAS faire** : détecter un écart ouvert APRÈS le 19/08 par la version.
  `MCP_SERVER_VERSION` n'a pas bougé en 177 commits, donc comparer `/health` à `main` serait
  une sonde incapable de tirer. Le job juge donc la CONFIGURATION (« rien ne peut partir »),
  qui est toujours exacte, et non l'ÉTAT (« l'écart fait N jours »), qu'il ne sait pas mesurer
  sans le jeton du hub.

- [ ] 👤 **Déployer le serveur MCP** — décision de Marc (15/09) : `mcp/deploy.sh` à la main
  maintenant. Les 177 commits partent d'un coup, dont `/vehicule/bail` que CarAI attend.
  L'écart se recreusera au commit suivant tant que `GCP_PROJECT_ID` + `GCP_WIF_PROVIDER` +
  `GCP_DEPLOY_SA` ne sont pas posés (`mcp/README.md` § Déploiement continu).

- [x] 🔧 **`[HUB-V13]`** Contrat re-pinné sur `v1.3.0`, puis quatre champs neufs publiés.
  **Fait le 14/09** (S).
  · `primary` sur « Valeur nette » — le hub déduisait le gros chiffre de la position 0, ce qui
    marchait tant que personne ne réordonnait la liste, alors que cet ordre est un arbitrage qui a
    DÉJÀ changé une fois (les placements ont pris trois places).
  · `recommendation` depuis `signals[0]`, **gratuitement** : `computeFinancialSignals` est déjà
    appelé pour les alertes et rend ses signaux triés par priorité. Le `label` porte l'ACTION, le
    `why` le constat. Un test analyse `mcp/financialSignals.ts` et exige une action pour CHAQUE
    identifiant réel — un signal ajouté sans action publierait son constat comme un conseil.
  · `details` : la fraîcheur DÉCOMPOSÉE (push Drive et clôture de marché, séparément) et la
    ventilation des placements par compte, postes à zéro omis.
  · `expectedMaxAgeSec` **dérivé de `MAX_STALE_DAYS + 1 j`, et volontairement LÂCHE** — voir le
    `CLAUDE.md` §7. ⚠️ Ne pas le resserrer vers 6 h : `dataAsOf` mêle deux horloges, et un seuil
    de 6 h crierait « figée » chaque fin de semaine alors que la bourse est fermée. Le contrôle
    quotidien est `STALE_THRESHOLD_MS` → `status: 'degraded'`, qui existe déjà.
  6 mutations jouées, 6 attrapées. 30 tests sur `hubSummary` (+13).
- [ ] 🔧 **`[HUB-LIQ]`** Ventiler les LIQUIDITÉS par compte dans `details` (S). Prévu au plan du
  jour, **écarté après lecture du code** : `computeCurrentLiquidity` délègue à `computeCashLedger`,
  qui accumule un solde UNIQUE (`initialBalances` + transactions) sans clé de compte. Il n'existe
  donc aucune ventilation à extraire — la publier demanderait un grand livre par compte, c'est-à-dire
  du travail neuf et non demandé. La ventilation des PLACEMENTS (`computeAssetBreakdown`) a été
  publiée à la place : elle existe déjà, elle est convertie en CAD, et c'est elle qui explique les
  signaux d'espace CELI/REER.
- [ ] 🔧 **`[HUB-RENDU]`** Le hub ne REND pas encore `details`, `primary` ni `recommendation` (son
  lot 2). Rien à faire dans ce dépôt : entrée gardée pour que « publié » ne se lise pas « affiché ».

---

## 📱 Refonte de l'onglet Futur pour le TÉLÉPHONE (Marc, 2026-09-10 — « actuellement c'est inutilisable »)

> Cadrage fait le 2026-09-10 (`/new-feature` : product-manager → architect → 16 questions posées à Marc, toutes
> répondues). Maquettes 390×844 : https://claude.ai/code/artifact/260843dd-1ee9-4a39-b1cb-ce4095c328ec
> (sources : `scratchpad/futur-mobile/*.dc.html`, valeurs d'EXEMPLE). Décisions verrouillées :
> [`docs/adr/0016-refonte-futur-mobile.md`](adr/0016-refonte-futur-mobile.md). **Direction A** (courbe d'abord,
> sous-onglets conservés), adaptation EN PLACE du composant existant (pas de coquille mobile dédiée), **zéro
> changement visuel desktop**, 6 PR incrémentales, filet d'abord, chaque PR livrée avec captures 390×844.
> ⚠️ Ni `[GODFILE-FUTUREPROJECTION]` ni `[A11Y-SUBTABS-FUTUR]` ne sont pris ici : les extractions de ce chantier
> sont des composants-FEUILLES purs (rendu desktop bit-identique), jamais l'arbre d'état ni les panneaux.

- [ ] 🔧 **`[A11Y-LEGEND-TOUTREAFFICHER-FOCUS-PERDU]`** (S) — DÉCOUVERT en revue a11y de PR3, PRÉ-EXISTANT (déjà
  dans `origin/main` avant toute la refonte mobile, vérifié : `git show 8bc6faa7:components/FutureProjection.tsx`
  portait déjà `showAllSeries` vidant `hiddenSeries`). Le bouton « Tout réafficher » (`FutureLegendDrawer.tsx`,
  variantes `inline` ET `drawer`) se DÉMONTE à chaque clic (`hiddenSeries.size` retombe à 0, la condition
  `hiddenSeries.size > 0 && (...)` rend `false`) — le focus clavier retombe sur `<body>`, perte de contexte pour
  un utilisateur clavier/lecteur d'écran. Le MÊME fichier documente et corrige exactement ce mécanisme sur un
  bouton voisin (`revealedRef.current?.focus()` après démontage du bouton Calculer, `FutureProjection.tsx:609`)
  — le correctif est donc déjà connu : renvoyer le focus sur le bouton de bascule du tiroir (stable) après
  `showAllSeries()`. Non corrigé dans PR3 (bug pré-existant, hors périmètre sans feu vert explicite).
- [ ] 🔧 **`[FUTUR-MOBILE-RETURNRATEFIELD-DETTE]`** (XS) — 5 points mineurs relevés par les revues silent-failure-hunter/
  a11y-auditor/code-reviewer de PR4, aucun bloquant, routés plutôt que corrigés hors périmètre : (1) `changedHypothesesCount`
  compare par `JSON.stringify` — sensible à l'ordre des clés d'un objet imbriqué (`returnRates`), inatteignable aujourd'hui
  (tous les producteurs respectent le même ordre littéral) mais sans filet si un futur producteur en change ; (2) un champ
  composite (`returnRates`) ne compte que pour UNE hypothèse modifiée même si plusieurs sous-valeurs changent — choix
  assumé, à documenter comme tel plutôt que découvert plus tard ; (3) `ReturnRateField` n'a pas de mécanisme de masquage
  mode-discret (`isPrivacyMode`/`maskedSliderAria`), contrairement à `FluxMensuelsFields`/`ValeurMaxMaisonField` du même
  lot — `ltcMonthlyCost` ($/mois) qui y passe désormais hérite silencieusement du même défaut PRÉ-EXISTANT que sur desktop
  (`ProjectionControls.tsx:407-412`, jamais dans `PrivateAmount`) ; (4) `check-contrast` est aveugle aux classes passées en
  template literal (`colorClassName`) et aux fonds `rgba` (`bg-black/30`) — trou d'outillage, contraste mesuré MANUELLEMENT
  conforme (6,83–12,14:1) mais une future couleur mal choisie sur ce composant ne serait jamais détectée automatiquement ;
  (5) `numberId` de `ReturnRateField` se dérive de `slugify(label)` sans vérification d'unicité — aucune collision
  aujourd'hui (tous les libellés mobiles sont distincts), mais un `id` optionnel avec fallback silencieux est fragile.
  ⚠️ Deux points PRÉ-EXISTANTS (non aggravés par PR4, juste étendus de 3 à 6 sections / repris tels quels) : les curseurs
  `<input type="range">` n'ont pas de zone tactile ≥44 px garantie par CSS (seul le champ numérique jumeau l'a) — vaut un
  ticket séparé puisque PR4 est justement la refonte tactile ; et les 6 `CollapsibleSection` de l'onglet Hypothèses mobile
  sont en `headingLevel` par défaut (h3) directement sous le `<h1>` « Projection », sans `<h2>` intermédiaire (motif déjà
  présent sur les 3 sections desktop, ce lot le double sur la surface mobile).
- [x] 🔧 **`[FUTUR-MOBILE-PR5]`** ✅ **LIVRÉ (2026-09-11, PR mergée sur `main`)** — dernière PR de la refonte
  mobile de l'onglet Futur (6/6). Amorçage (`StrategyOptimizerPanel.tsx`) : leviers en puces `min-h-[44px]`,
  CTA « Trouver la meilleure stratégie » `min-h-[56px]`, lien « voir directement ta projection actuelle »
  `min-h-[44px]` — MOBILE UNIQUEMENT (`useViewportBelowSm`), desktop inchangé. Plan d'action
  (`ActionPlanDrilldown.tsx`) : « Pourquoi ? » 14 px → `min-h-[44px]` ; case « Marquer comme fait » enveloppée
  dans un conteneur `min-h/min-w-[44px]` SANS grossir la case elle-même (14 px visuels conservés). Historique
  (`FutureHistorySection.tsx`) : pastilles de compte + « Total » `min-h-[44px]`. Feuille du jour
  (`FutureDetailModal.tsx`) : sur mobile, dialogue centré → feuille ancrée en bas (`h-[75vh]`, `rounded-t-2xl`,
  poignée décorative) au lieu de `max-h-[90vh]` centré (desktop inchangé) ; contenu CONDENSÉ d'entrée (Veille/
  Lendemain déjà existant, « Variation nette (mois) » = `point.diffNW` déjà PUBLIÉ par le moteur — AUCUNE
  soustraction locale ajoutée —, répartition par compte déjà existante, « N événements ce mois-ci » remplace la
  liste complète) ; bouton « Détail complet » (`min-h-[44px]`) déplie la liste exhaustive des événements +
  catégories du mois + ventilation du jour + transactions, gardées inchangées sur desktop (`showFull` vaut
  toujours `true` sans `matchMedia`, donc les 5 suites préexistantes de ce composant restent vertes SANS
  modification). ⚠️ Le double `pb-24` (`Layout.tsx:492` + `FutureProjection.tsx:1414`, ligne du ticket 1376
  périmée) est CONFIRMÉ empilé (192 px cumulés sous l'onglet Futur mobile) mais ne bloque AUCUN critère
  d'acceptation de ce lot (la feuille du jour est en `position:fixed`, indifférente au padding d'un ancêtre) —
  laissé tel quel, pas de ticket séparé ouvert faute d'un défaut concret à pointer. Ratchet
  `[FUTUR-MOBILE-PR0]` re-mesuré (dette RÉDUITE par ce lot, pas grossie) : **76 → 59** (re-mesuré 2× à
  l'identique), `PLAFOND_CIBLES_TROP_PETITES` abaissé dans la MÊME PR
  (`UN-PLAFOND-DE-RATCHET-QUI-A-CESSE-DE-SUIVRE-SON-COMPTE-N-EST-PLUS-UNE-PROTECTION`). Tests : 16 unitaires
  (FutureDetailModal feuille condensée + contrôle négatif desktop, ActionPlanDrilldown/StrategyOptimizerPanel/
  FutureHistorySection cibles tactiles mobile vs desktop) + 6 e2e neufs
  (`e2e/futureMobilePlanHistoryDetail.spec.ts`, mesure en PIXELS réels 390×844) — 0 régression sur les e2e
  mobiles PR0-PR4 rejouées (19/19) + suite ciblée FutureDetailModal/FutureHistorySection/FutureProjection/a11y
  (228/228). `[FUTUR-MOBILE-RETURNRATEFIELD-DETTE]` reste ouvert, hors périmètre de ce lot.

## 🔒 Sécurité des dépendances

- [x] 🔧 **`[SEC-HONO-PLANCHER]`** ✅ **LIVRÉ le 2026-09-14** — trois avis **modérés** sur
  `hono`, dépendance **transitive** de production : GHSA-gqvv-2mrq-wpjv (`toSSG()` écrit
  hors du répertoire de sortie — correctif incomplet de CVE-2026-39408),
  GHSA-g6gw-c38x-mqfc (épuisement mémoire par imbrication en notation pointée dans
  `parseBody()`), GHSA-crvj-82cr-hjcx (le parseur de requête lit les paramètres **après** le
  fragment d'URL, d'où des différentiels de clé de cache et d'interprétation par un proxy).
  Trouvés en vérifiant la constellation après une RCE critique sur Next ailleurs — FinanceAI
  n'a **pas** de Next, donc pas cet avis-là.
  ⚠️ **`npm audit fix` ÉCHOUE sur ce dépôt**, sur un bug interne de npm
  (« Cannot read properties of null (reading 'edgesOut') »), **reproduit sur un arbre
  fraîchement installé par `npm ci`**. Le plancher passe donc par `overrides` — pas par
  commodité, parce que la commande automatique ne fonctionne pas ici.
  Posé en `overrides` et NON en dépendance directe : ce dépôt n'importe pas `hono`, l'ajouter
  aux `dependencies` laisserait croire le contraire. `hono` arrive par `@hono/node-server`
  (`^4`) ET par `@modelcontextprotocol/sdk` (`^4.11.4`) — les deux acceptent `^4`, donc le
  plancher les satisfait sans rien casser. Résolu en 4.13.7,
  `npm audit --omit=dev` : 0 vulnérabilité.
  État de la constellation au 14/09 : Hubperso ✅, CarAI ✅, JobAI ✅ (RCE Next critique),
  BatchChef déjà sain, DriveAI sain, FinanceAI ✅ (celui-ci).

## 🔬 Audit financier 2026-09-07 — findings VÉRIFIÉS et re-mesurés (rapport : `docs/AUDIT_FINANCIER_2026-09-07.md`)

> Passe n°4 (commit `3f657d7d`, demande Marc « lance une grosse analyse, check tous les problèmes corrigés et
> mets à jour la doc »). Cœur sain : 0 écart fiscal de valeur, conservation 0,02 $, 233/239 corrections
> archivées encore en place, 10/10 de juillet fermés. Chaque ticket ci-dessous a été relu au `fichier:ligne` et
> ses chiffres re-mesurés par moi — jamais recopiés d'un agent. Lots proposés (rapport §10) : ✅ 213 = XS/S sans
> décision (16 tickets livrés le 2026-09-07) · ✅ 214 = W5 publication (3 tickets, 2026-09-07) · 215 = gate REER per-conjoint · le reste attend Marc.

- [x] 🔴 **`[ENG-W5-BUSINESS-NON-PUBLIE]`** ✅ **LIVRÉ au lot 214 (2026-09-07)** — `Entreprise` publié par `monthlyOutput` (stock), `NET_WORTH_DAILY_ASSETS`, `FIELD_KIND`, `CURVE_FIELDS`, aire + infobulle + table + drill-down, source unique `computePrivateBusinessValue` ; garde structurelle `netWorthPublie.test.ts` (7 cas : chaque terme du sign-map a son champ, identité publiée < 0,1 $, liste quotidienne DÉRIVÉE du sign-map, `CURVE_FIELDS` ⊇ actifs publiés) ; `NetWorth` bit-identique. Perturbations : champ retiré → 6 rouges ; liste quotidienne sans `Entreprise` → 2 rouges (dérivation + dent de scie **901 171 $** mesurée) ; `CURVE_FIELDS` sans → 1 rouge → à déménager vers BACKLOG_ARCHIVE à la prochaine PR. Contexte d'origine : (M, CRITIQUE — sans décision, ne déplace PAS un dollar de `NetWorth`) —
  la valeur d'une entreprise privée (W5.7) est un terme de `computeRawNetWorth` (`services/projection/netWorth.ts:33,51,68`,
  `projection.ts:232,523,2506`) mais **aucun champ de `chartData` ne la porte** (`monthlyOutput.ts:293-301`) ;
  absente de `NET_WORTH_DAILY_ASSETS` (`dailyLedger.ts:153-155`) et des `ASSET_KEYS` des trois harnais de
  conservation. **Mesuré** (fixture `w5OffBalance.test.ts`, `estimatedValue: 900 000`) :
  `NetWorth − Σ 8 actifs publiés + DettesNonImmo` = **900 000 $ exactement** aux mois 0, 12, 120, 300 ; 0 $ sans
  entreprise. Conséquences : décomposition du patrimoine qui ne somme pas, grand livre quotidien en dents de scie
  (la valeur ne revient qu'à la borne mensuelle), marche au raccord passé→futur. Invisible aux 5 747 tests parce
  qu'un invariant de cohérence ne voit pas ce qui est ABSENT et que la seule fixture W5 du harnais pose
  `estimatedValue: 0` (`projection.moneyConservation.test.ts:162`). **Correctif** : publier `Entreprise` dans
  `monthlyOutput` ; l'ajouter à `NET_WORTH_DAILY_ASSETS`, aux trois `ASSET_KEYS`, au `FIELD_KIND` (stock) ; fixture
  du harnais à `estimatedValue > 0` ; et la **garde structurelle qui manquait** : tout terme `+1`/`−1` de
  `NET_WORTH_SIGN` a un champ publié dans `chartData` (perturbation : retirer `Entreprise` de la sortie → rouge).
  Preuve de non-déplacement : `NetWorth` bit-identique avant/après sur les 7 personas.
- [x] 🔴 **`[ENG-W5-BUSINESS-DIVORCE-NON-PARTAGE]`** ✅ **LIVRÉ le 2026-09-14 (PR #954, 2 commits)** —
  DÉCISION Marc (Q16, répondue en clic) : **partager comme le reste** (× `keep`), hypothèse
  « société d'acquêts par défaut » — le modèle ne distingue nulle part ailleurs les biens propres.
  **Commit 1** : `privateBusinessValue` passé de `const` à `let`, `*= keep` ajouté dans le callback
  de partage juste après `realEstateEquity` (même traitement : valeur SOMMÉE dans
  `computeRawNetWorth`, pas un compte à registre `withdrawalXXX`). **Commit 2 (revue #954, trouvé
  par 2 agents indépendants)** : le commit 1 partageait la VALEUR mais pas le REVENU — `applyW5Effects`
  lisait le tableau brut `privateBusinesses` (jamais muté) pour le dividende mensuel via
  `ownershipPct`, donc le ménage restant touchait et se faisait imposer 100 % du dividende annuel
  indéfiniment pendant que son équité tombait à `keep` (`PARTAGER-LE-MONTANT-PAS-SES-REFLETS`).
  Corrigé par `businessStates` (copie mutable, même patron que `rentalStates`), `ownershipPct *= keep`
  au divorce, `applyW5Effects` consomme désormais `businessStates`. Garde
  `tests/services/divorceBusinessShare.test.ts` (6 cas : valeur ET dividende), discriminants
  confirmés sur les DEUX commits séparément (`git stash`/`git apply -R`, écarts exacts mesurés :
  900 000 $ pile pour la valeur, dividende 5 000 $ → 1 250 $/mois pour le revenu) → à déménager vers
  `BACKLOG_ARCHIVE.md` à la prochaine PR. Contexte d'origine (trouvé par le panel
  du lot 214, PRÉ-EXISTANT depuis le 2026-08-19, rendu VISIBLE par la publication d'`Entreprise`) :
  `services/projection.ts` calculait `privateBusinessValue` en `const` AVANT la boucle, et le
  partage du divorce (`*= keep` sur `liquid`, `celi`, `celiapp`, `reer`, `nonReg`, `crypto`, `reee`,
  `realEstateEquity`, `mortgageBalance`, les immeubles locatifs, `liquidDebt`, `smithManoeuvreDebt`…)
  ne la touchait JAMAIS. Mesuré (couple, divorce certain au mois 12, `divorceSplitPct: 75`,
  entreprise 900 000 $) : `Entreprise` 900 000 → 900 000, `finalNetWorth` **+900 000 $** exactement
  par rapport au scénario sans entreprise — corrigé, l'écart tombe à 225 000 $ (la part conservée).
  Même classe que `[ENG-W5-RENTAL-OFFBALANCE]` (immeubles oubliés au divorce, corrigé le 2026-08-13) :
  le JUMEAU n'avait pas été traité (`MODULE-ECRIT-HORS-CHECKLIST`).
- [ ] 🟡 **`[ENG-DIVORCE-RENTAL-INCOME-UNSPLIT]`** (S, MOYEN money-critical, trouvé en revue de la PR
  #954 par le silent-failure-hunter — même classe que le dividende d'entreprise ci-dessus, PAS
  introduit par ce lot) — `applyW5Effects` calcule le NOI locatif encaissé/imposé depuis le tableau
  BRUT `containers.rentalProperties` (`monthlyRent`, `monthlyExpenses`, `vacancyPct`), jamais depuis
  `rentalStates` — la copie mutable qui, elle, EST partagée au divorce (`currentValue`, `mortgage`,
  `monthlyPayment` `*= keep`, corrigé par `[ENG-W5-RENTAL-OFFBALANCE]` le 2026-08-13). Résultat : le
  BILAN d'un immeuble locatif suit le partage, le LOYER NET encaissé et imposé ne le suit pas — le
  ménage restant continue de toucher et payer l'impôt sur 100 % du loyer net indéfiniment. Même
  correctif que `businessStates` ci-dessus : faire lire `applyW5Effects` sur une version scalée de
  `monthlyRent`/`monthlyExpenses` (ou dériver le NOI depuis `rentalStates` si les deux registres
  peuvent porter la même info), mesurer l'écart cumulé avant de livrer.
- [ ] 🟢 **`[ENG-DIVORCE-CRYPTOACB-UNSPLIT]`** (XS, FAIBLE, trouvé en revue de la PR #954 par
  financial-integrity, PAS introduit par ce lot) — `crypto *= keep` est appliqué au divorce
  (`services/projection.ts`) mais `cryptoACB` (le prix de base pour le calcul du gain en capital à
  la vente) ne l'est pas, contrairement à `nonRegACB` qui suit bien `nonReg *= keep` une ligne plus
  haut. Le PBR crypto resterait au niveau d'avant-divorce sur une position réduite de moitié ou plus
  — sous-estimation potentielle de l'impôt sur un retrait crypto post-divorce. Correctif suggéré :
  `cryptoACB *= keep;` juste après `crypto *= keep;`, avec un test discriminant à écart d'âge/position
  non nul (mesurer l'écart avant de livrer, comme pour tout correctif money-critical).
- [x] 🟠 **`[PAST-NW-BUSINESS-SANS-PRODUCTEUR]`** ✅ **LIVRÉ au lot 214 (2026-09-07)** — `privateBusinessValue` porté dans `BuildPastPrefixInput` et `BuildDailyPastInput`, écrit aux deux sites (plate), `FutureProjection` le calcule depuis le store par la même règle que le moteur, `dailyCurve` recouvre `Entreprise` ; +2 cas `buildPastPrefix.test.ts`, +2 `dailyPastLedger.test.ts` ; perturbation (5e argument omis) → 1 rouge → à déménager vers BACKLOG_ARCHIVE à la prochaine PR. Contexte d'origine : (S, ÉLEVÉ — livrer AVEC le précédent) — `services/history/pastNetWorth.ts:61`
  accepte `privateBusinessValue = 0` par défaut et son seul appelant `buildPastPrefix.ts:154` passe quatre
  arguments ; `dailyPastLedger.ts:333` écrit `privateBusinessValue: 0` en toutes lettres. La JSDoc promet « valeur
  COURANTE, plate sur le passé » : aucun producteur ne tient la promesse → marche de la valeur entière au raccord.
  **Correctif** : porter la valeur dans `BuildPastPrefixInput`, l'écrire aux DEUX sites (même convention = plate,
  intention écrite), garde « aucune marche au raccord » avec contrôle négatif (sans entreprise → inchangé).
- [x] 🟡 **`[HARNAIS-CONSERVATION-W5-VIDE]`** ✅ **LIVRÉ au lot 214 (2026-09-07)** — fixture à 900 000 $ ; PREUVE de discrimination : champ non publié + fixture à 0 → 22 verts (harnais AVEUGLE), champ non publié + fixture à 900 000 → INV-1 rouge sur 100 % des points → à déménager vers BACKLOG_ARCHIVE à la prochaine PR. Contexte d'origine : (XS, MOYEN — même lot) — la seule fixture W5 des harnais de
  conservation pose `estimatedValue: 0` ; le fuzz ne sème jamais `privateBusinesses`. Passer à une valeur > 0 :
  le harnais DOIT rougir avant le correctif du ticket 🔴 (c'est la preuve de discrimination), vert après.
- [x] 🟠 **`[FISC-RRSP-ROOM-GATE-MENAGE]`** ✅ **LIVRÉ au lot 215 (2026-09-07)** — le pool de droits REER reste utilisable tant qu'UN conjoint peut encore détenir un REER (≤ 71 ans), et n'est remis à zéro que quand plus aucun ne le peut ; l'âge courant par conjoint est HISSÉ en helper de module (`ageCourantUtilisateur`, source unique avec le gate FERR). ⚠️ Le correctif prescrit par l'audit (« borne ≤ 71 appliquée à CHAQUE `roomUser` ») était FAUX sur la loi : les droits naissent du revenu gagné quel que soit l'âge, et un particulier de 72+ cotise à un REER de CONJOINT avec ses propres droits — le cas 60/73 reste donc à 21 600 $ (inchangé), seul 72/57 change (0 $ + reset → 21 600 $, pas de reset). **Mesuré** (couple 68/53, conjoint 2 à 120 k$, 25 ans, AUTO_MARGINAL, DÉTERMINISTE) : droits disponibles à l'année 5 **0 $ → 531 092 $**, Σ cotisations REER 210 420 → 479 096 $, patrimoine final 714 087 → 713 043 $ (−1 044 $) ; Σ PSV 316 184 → 202 735 $ (**−113 449 $ de récupération**), Σ FluxImpots 2 040 → −32 180 $ — la stratégie utilise les droits, les retraits FERR obligatoires gonflent le revenu et la PSV est récupérée : un droit rendu disponible n'est pas un gain. En Monte Carlo graine 0 (mes premiers chiffres, régime non nommé) : 533 978 $ / 469 782 $ / 673 441 → 663 395 $. 60/73 et 55/55 **bit-identiques** ; 8 personas bit-identiques sauf `REERMax` de `couple-confort` à 50 ans (droits, pas un dollar de patrimoine). Gardes : 6 cas unitaires (`taxJanuary.test.ts`, dont conjoint sans âge ignoré et ménage à une tête) + garde de CHAÎNE `rrspRoomGateMenage.test.ts` sur `REERMax − REER` ; perturbations (gate remis sur `ctx.age`) → 1 rouge unitaire (le discriminant seul), 1 rouge chaîne. « Aucun golden n'a bougé » EXPLIQUÉ : aucune fixture du dépôt ne faisait saturer la contrainte. Résiduel noté : une cotisation faite avec les droits d'un conjoint de 72+ est attribuée par `shares` au registre per-conjoint, pas au REER de conjoint du plus jeune → `[REER-CONJOINT-ATTRIBUTION-72]` → à déménager vers BACKLOG_ARCHIVE à la prochaine PR. Contexte d'origine : (S, ÉLEVÉ **money-critical**, contenu — sans décision produit) —
  `services/projection/taxJanuary.ts:219-226` calcule les droits REER PAR conjoint (`roomUsers.reduce`), puis
  `:373-374` les ferme par `ctx.age`, l'âge du PREMIER utilisateur seul (`rrspRoomDelta: ctx.age <= 71 ? … : 0`,
  `rrspRoomReset: ctx.age > 71`). **Mesuré** (`processJanuaryReset`, conjoint 2 actif à 120 k$) : 71/56 →
  21 600 $ ; **72/57 → 0 $ ET remise à zéro des droits accumulés** ; 60/73 → 21 600 $ (le conjoint de 73 ans
  génère des droits qu'il ne peut plus cotiser). Atteignable : âge de retraite saisissable jusqu'à 75
  (`RetirementSettingsCard.tsx:37`). Même classe que le gate FERR d'août (« valeur per-conjoint gardée par une
  grandeur de MÉNAGE »). **Correctif** : borne `≤ 71` appliquée à CHAQUE `roomUser` dans la réduction ; reset
  seulement si TOUS ont dépassé 71. Gardes : les trois cas ci-dessus + contrôle « même âge → inchangé ».
  ⚠️ Mesure avant/après sur un couple à ÉCART d'âge (`UN-COUPLE-DU-MEME-AGE-EPINGLE-LE-REGISTRE-PER-CONJOINT`) ;
  goldens rouges à LIRE un par un (pas re-baser).
- [ ] 🟡 **`[REER-CONJOINT-ATTRIBUTION-72]`** (S, MOYEN — résiduel du lot 215, RECLASSÉ par les deux revues : estimations d'AGENT sur une copie patchée (cotisations réservées aux conjoints ≤ 71 ans) = **+13 789 $ (+2,1 %)** de patrimoine surévalué sur 68/53 (60 227 $ de cotisations attribuées au slot du 72+ après ses 72 ans), et **−195 415 $ (−7,5 %)** sur 60/73 — défaut PRÉ-EXISTANT que le lot 215 n'a pas créé (60/73 est bit-identique) mais que son nouveau cas de test « le conjoint de 73 ans génère des droits » BÉNIT ; 55/55 → 0 $ exactement — [À vérifier] par une mesure à moi avant de coder) — quand un conjoint de 72 ans ou plus
  génère des droits (revenu gagné) et que le ménage cotise, le moteur verse dans le pool `reer` et le registre
  per-conjoint attribue la cotisation par `shares` (clé salariale), donc en partie au REER du conjoint de 72+ — qui ne
  peut plus en détenir. En droit, c'est une cotisation à un REER de CONJOINT : elle va au REER du plus jeune. Effet :
  conversion FERR trop tôt d'une part qui devrait vivre chez le plus jeune. Non mesuré (aucune fixture ne cotise avec
  un conjoint de 72+ actif) ; mesurer sur 60/73 avec cotisations avant de coder.
- [ ] 🟡 **`[ALLOC-REER-72-RECUPERATION-PSV]`** (M, MOYEN produit, 🧭 plan-first — touche une FONCTION OBJECTIF, trouvé
  par le projection-validator du lot 215, nouvellement ATTEIGNABLE) — `AUTO_MARGINAL` cotise au REER pour un ménage dont
  un conjoint a 72+ (les droits existent, lot 215) alors que les retraits FERR obligatoires qui suivent déclenchent la
  récupération de la PSV : sur 68/53 (déterministe) la stratégie détruit **113 449 $ de PSV** pour gagner 34 220 $ de
  remboursements d'impôt. Le gate est juste ; c'est l'allocateur qui n'a jamais eu à arbitrer dans ce régime. Question
  produit : la décision de cotiser doit-elle intégrer la récupération PSV attendue (taux effectif marginal 15 % de plus
  au-dessus du seuil) ? Plan à poser à Marc — c'est le classement des stratégies qui bougerait.
- [ ] 🟢 **`[REER-GROWTH-FANTOME-MOIS-VIDE]`** (XS, FAIBLE, pré-existant — projection-validator du lot 215) —
  `MarketGrowthREER` est PUBLIÉ (−7,64 $ mesuré sur 68/53 au mois 238 ; 61,18 $ sur 60/73 au mois 159) le mois où le
  REER est vidé à exactement 0 : une croissance annoncée, jamais réalisée → résiduel INV-2 de quelques dollars, aux
  mêmes valeurs AVANT et APRÈS le lot (le lot déplace le mois, pas le mécanisme). Correctif : ne publier que la
  croissance effectivement créditée au solde.
- [ ] 🟡 **`[RRSP-EARNED-INCOME-LOYER-BRUT]`** (S, MOYEN, pré-existant — trouvé par la revue fiscale du lot 215) —
  `services/projection/realEstateMonth.ts` (`ajouterParProprietaire(state.rentalEarnedParProprietaire, …, rentalIncome)`)
  verse le loyer BRUT au revenu gagné pour les droits REER, alors que la LIR 146(1) retient le revenu de location NET
  (intérêts, taxes, entretien déduits). Avant le lot 215 le pool était fermé dès 72 ans ; désormais un propriétaire de
  72+ avec conjoint plus jeune accumule des droits sur une assiette surévaluée. Non mesuré. Correctif : passer le loyer
  net des charges déjà calculées dans le même module (`immoCharges`, `immoInterest`) — vérifier d'abord que ces charges
  sont bien celles du bien loué, pas de la résidence.
- [ ] 🟡 **`[AGE-USER0-SANS-AGE-VAUT-30]`** (XS, MOYEN, pré-existant — revue fiscale du lot 215) — `services/projection.ts`
  `const currentAge = user1?.age || 30` : un premier utilisateur saisi par `birthYear` SEUL (sans `age`) est traité à
  30 ans pour toute la projection — donc gate des droits REER ouvert à vie, FERR jamais, PSV/RRQ décalés. Le conjoint,
  lui, a un repli `birthYear` (`ageCourantUtilisateur`). Correctif : même repli pour user0 (`startYear − birthYear`),
  et un `0`/`NaN` ne doit pas retomber sur 30 en silence (`||` efface la saisie). Vérifier d'abord quels producteurs
  peuvent écrire un user sans `age` (onboarding, MCP, import).
- [x] 🟠 **`[DEBT-BALANCE-NAN-SILENCIEUX]`** ✅ **LIVRÉ au lot 213 (2026-09-07)** — `computeTotalDebt` journalise (throttle par dette), `refusChampNonFini` refuse solde/taux/minimum non finis à l'ajout ET à l'édition (région live), la simulation affiche « — » au lieu de « 0,1 ans » ; 3 cas `portfolio.test.ts` + 6 cas `DebtManager.saisieNonFinie.test.tsx` ; perturbations : trace retirée → 2 rouges (et `moneyConservation` reste VERT : c'est bien la nouvelle garde qui discrimine), refus d'édition retiré → 1 rouge → à déménager vers BACKLOG_ARCHIVE à la prochaine PR. Contexte d'origine : (S, ÉLEVÉ — sans décision) — `components/DebtManager.tsx:56-78`
  (`saveEdit`) n'a que `refusOrigineIncoherente`, qui rend `null` pour un non-fini (`DebtKindFields.tsx:44`) :
  un solde VIDÉ (`parseFloat('')` = `NaN`, `:190`) s'enregistre ; `handleAdd` (`:41-50`) refuse `balance` mais
  pas `interestRate`/`minimumPayment` (`:155-159`). Puis `services/portfolio.ts:216-219` (`computeTotalDebt`)
  rabat le `NaN` sur 0 SANS trace — ses voisins `assetValueCad` et `computeCurrentLiquidity` ont le
  `logErrorThrottled` (`PATRON-APPLIQUE-A-COTE-MAIS-PAS-ICI`). Cinq consommateurs (Total dû, `FutureHistorySection`,
  `portfolio.ts:236`, `financialSnapshot.ts`, `healthScore.ts`). `projection.moneyConservation.test.ts:519-521`
  CERTIFIE le silence (`toBe(0)` sans assertion de trace). **Mesuré** : un taux `NaN` affiche « Liberté dans
  **0,1 ans** » (1,3 ans pour la même dette à 20 %) — la simulation locale (`:85-111`) s'arrête au 1er mois
  (`NaN > 0` est faux). **Correctif** : (a) `logErrorThrottled` dans `computeTotalDebt` ; (b) refus UI d'un champ
  non fini à l'ajout ET à l'édition ; (c) test INVERSÉ (le `NaN` est tracé) ; (d) « — » quand la simulation
  n'est pas finie.
- [x] 🟠 **`[AI-PRIVACY-CONSEILS-NON-GATES]`** ✅ **LIVRÉ au lot 213 (2026-09-07)** — garde à l'instant du geste dans les trois cartes (`MESSAGE_IA_MODE_DISCRET`, source unique dans `services/messageErreurIa.ts`) ; `conseilsIaModeDiscret.test.tsx` 3 × (mode discret → service jamais appelé + message ; contrôle mode normal → appelé) ; perturbation (garde du couple retirée) → 1 rouge → à déménager vers BACKLOG_ARCHIVE à la prochaine PR. Contexte d'origine : (S, ÉLEVÉ — extension d'une décision PRISE, sans nouvelle décision) —
  la décision Marc 2026-09-05 « masquer : en mode discret, les montants ne partent pas non plus vers l'assistant »
  est appliquée au chat (`useAiChat.ts:171`), au diagnostic Budget (`BudgetAiModal.tsx:99`) et aux cartes de
  signaux — PAS aux trois cartes de conseil : `components/tax/CoupleOptimizationCard.tsx:90` (brut/net des deux
  conjoints, prompt `services/claude.ts:798-800`), `components/realestate/RealEstateAdviceCard.tsx:41` (prix, mise
  de fonds, mensualité, loyer, `claude.ts:719-724`), rééquilibrage `Investments.tsx:1071` (`Δ` en dollars,
  `claude.ts:888`). 0 lecture de `isPrivacyMode` dans les deux cartes. Cause : `amountPrivacyScan.test.ts:82` ne
  scanne que `components/` et `promptCad` vit dans `services/claude.ts`. **Correctif** : la même PAIRE de gardes
  que `tests/components/budgetAiModalModeDiscret.test.tsx` (égress au service + ouvreur avec message), ×3, chacune
  avec son contrôle (mode normal → l'appel part).
- [x] 🟠 **`[AI-STOPREASON-JETE]`** ✅ **LIVRÉ au lot 213 (2026-09-07)** — `VisionTronqueeError` levée sur `stop_reason === 'max_tokens'` aux deux appels Vision, cause `tronque` dans `messageErreurIa` (« trop long … réimporte en plusieurs parties ») ; JUMELLE trouvée par la revue : `VisionReponseInvalideError` (JSON invalide ou `stop_reason: 'refusal'`) — l'`Error` nu d'avant tombait dans « réseau », donc « vérifie ton accès Internet » sur une requête qui avait abouti ; `claude.visionTronquee.test.ts` 7 cas sur le vrai module (SDK simulé) ; perturbation → 1 rouge → à déménager vers BACKLOG_ARCHIVE à la prochaine PR. Contexte d'origine : (S, ÉLEVÉ — sans décision) — `services/claude.ts` ne lit `stop_reason` nulle part
  (seul `services/aiTools/agentLoop.ts:289-301` le fait). `analyzeBankStatement` (non-stream, `max_tokens` 16 000)
  tronqué → JSON invalide → `[]` → `components/import/ImportBankStatement.tsx:64` « Aucune transaction reconnue » :
  FAUX, le relevé a été lu et coupé. **Correctif** : lire `response.stop_reason` aux deux appels Vision
  (`analyzePayslip`, `analyzeBankStatement`), rendre une cause `tronque`, message dédié à l'écran (« relevé trop
  long, coupe-le en deux »). Garde : réponse simulée `stop_reason: 'max_tokens'` → cause `tronque`, pas `[]`.
- [ ] 🟡 **`[TAXESTIMATE-DIVIDENDES-ORDINAIRES]`** (S, MOYEN, 🧭 sur quelle surface s'aligner) — `services/taxEstimate.ts:33-35`
  estime les dividendes (2 % du non-enregistré) puis les impose comme du revenu ORDINAIRE dans l'onglet Impôts et
  `get_tax_situation` ; le moteur passe par `calculateDividendTax` (majoration + CID). **Mesuré** sur 10 000 $
  de dividendes déterminés : ordinaire 2 569 / 3 678 / 5 047 $ contre majoration + CID progressif 200 / 1 895 /
  3 727 $ (bases 40 k / 100 k / 250 k$) — surestimation de 2 369 à 1 320 $. Conservateur, mais deux surfaces
  donnent deux chiffres pour la même hypothèse.
- [ ] 🟡 **`[FISC-PROXY-45-BONUS-RSU-NON-DOCUMENTE]`** (XS docs livrées au lot 212 · reste : XS ratchet + 🧭 assiette) —
  `services/projection/activeIncome.ts:186-187` `(bonus + rsu + side) * 0.55` : proxy 45 % absent de
  `FISCAL_REFERENCE.md` (table d'écart mesurée ajoutée en §9 au lot 212 : **+1 931 $** sur-imposé à 40 k$ …
  **−547 $** sous-imposé à 250 k$ sur 10 000 $ — l'écart change de SIGNE, la FORME est fausse), clé de ratchet
  `(activeIncome.ts, 0.55)` FUSIONNÉE avec le taux AE 55 %, montant hors assiette de décembre et hors registres
  (`totalTaxesPaid` sous-compte). Reste : nommer la constante (clé de ratchet distincte, XS) ; passer par
  l'assiette réelle = déplace de l'argent → plan-first.
- [x] 🟡 **`[AITOOLS-DISPATCH-ERR-NON-SCRUB]`** ✅ **LIVRÉ au lot 213 (2026-09-07)** — `sanitizePromptText(…, 300)` ; `dispatchScrub.test.ts` 3 cas ; perturbation → 2 rouges → à déménager vers BACKLOG_ARCHIVE à la prochaine PR. Contexte d'origine : (XS, MOYEN) — `services/aiTools/dispatch.ts:48` renvoie `err.message`
  brut au modèle ; `agentLoop.ts:152` scrubbe déjà (`sanitizePromptText(…, 300)`). Même scrub.
- [ ] 🟡 **`[AI-VISION-SANS-ANNULATION]`** (S, MOYEN, 🧭 UX) — `analyzePayslip`/`analyzeBankStatement` :
  `makeTimeoutSignal(undefined, 90_000)`, aucun `signal` en paramètre, pas de bouton Annuler pendant 90 s.
- [ ] 🟡 **`[AI-CONSEILS-SANS-ANNULATION]`** (XS/carte, MOYEN, 🧭 UX) — les trois cartes de conseil
  (couple, immobilier, rééquilibrage) n'ont pas d'`AbortController` (25 s sans issue).
- [x] 🟡 **`[MCP-FIREAGE-DUP]`** ✅ **LIVRÉ au lot 213 (2026-09-07)** — copie retirée, import de `mcp/whatIf.ts` → à déménager vers BACKLOG_ARCHIVE à la prochaine PR. Contexte d'origine : (XS, MOYEN) — `mcp/tools/getRetirementOutlook.spec.ts:24-26` recopie `fireAgeOf`
  de `mcp/whatIf.ts:514-517` (déjà importé par `getProjection.spec.ts`, `simulateWhatIf.spec.ts`). Importer.
- [x] 🟡 **`[FISC-GUARD-SCOPE-MONTHLYEVENTS]`** ✅ **LIVRÉ au lot 213 (2026-09-07)** — `REAL_ESTATE_SALE_NET_FACTOR` (2 sites), module au périmètre du ratchet, 7 clés inventoriées (mesuré : 8 littéraux) ; perturbation (`0.93` nu) → ratchet rouge → à déménager vers BACKLOG_ARCHIVE à la prochaine PR. Contexte d'origine : (XS, MOYEN) — `services/projection/monthlyEvents.ts:222,239`
  `* 0.95` (produit net d'une vente, coût de disposition documenté FISCAL_REFERENCE §8) sans constante nommée,
  dans un module ni dans `FISCAL_MODULES` ni dans `FISCAL_MODULES_HORS_PERIMETRE` (`fiscalConstGuardV2.ts`).
  Nommer (`REAL_ESTATE_SALE_NET_FACTOR`), ajouter le module au périmètre, entrée d'inventaire.
- [x] 🟡 **`[TEST-GAP-LIFETIMETAX]`** ✅ **LIVRÉ au lot 213 (2026-09-07)** — `lifetimeTax.test.ts` 4 cas (somme, anti-vacuité par terme, non-finis, absent) ; perturbation (terme oublié) → 3 rouges → à déménager vers BACKLOG_ARCHIVE à la prochaine PR. Contexte d'origine : (XS, MOYEN) — `services/projection/lifetimeTax.ts` (35 lignes) est le seul des
  57 sous-modules sans import direct depuis `tests/` (mesuré 2026-09-07) ; consommé par `monteCarlo.ts` et
  `strategySearch.ts` (classement). Test direct : somme, terme non fini, `null`.
- [x] 🟡 **`[BUDGET-CATEGORY-INCOME-SIGN-GARDE-PERDUE]`** ✅ **LIVRÉ au lot 213 (2026-09-07)** — 2 cas dans `budget.test.ts` (crédit sur un poste, par conjoint) ; perturbation (`Math.abs`) → 1 rouge → à déménager vers BACKLOG_ARCHIVE à la prochaine PR. Contexte d'origine : (XS, MOYEN) — le correctif #749 tient (`utils/budget.ts`
  via `spendAmountOf`) mais ses tests vivaient dans `PlanningGoals.test.tsx`/`monthlyActuals.test.ts`, supprimés
  avec les Objectifs (lot 29, #755) : l'agrégation d'un CRÉDIT n'est plus assertée. Un cas dans
  `tests/utils/budget.test.ts` (remboursement positif dans `computeBudgetParity`/`computeActualByOwner`).
- [x] 🟢 **`[PROMPT-PALIERS-EN-DUR]`** ✅ **LIVRÉ au lot 213 (2026-09-07)** — taux dérivés de `FED_BRACKETS`/`QC_BRACKETS` ; `claude.promptPaliers.test.ts` 3 cas ; perturbation (15 en dur) → 1 rouge → à déménager vers BACKLOG_ARCHIVE à la prochaine PR. Contexte d'origine : (XS, FAIBLE) — `services/claude.ts:140` recopie les paliers 2026 dans le
  prompt système (exacts aujourd'hui, hors ratchet) : dériver de `bracketsForYear()` ou déclarer au ratchet.
- [x] 🟢 **`[RATCHET-JSDOC-PERIME]`** ✅ **LIVRÉ au lot 213 (2026-09-07)** — JSDoc réécrite (scanné depuis le 2026-09-01) → à déménager vers BACKLOG_ARCHIVE à la prochaine PR. Contexte d'origine : (XS, FAIBLE) — `utils/fiscalConstGuardV2.ts:630-636` déclare encore
  `services/projection.ts` « trou connu et assumé » alors qu'il est scanné depuis le 2026-09-01.
- [x] 🟢 **`[FISC-FED-CREDITRATE-15-COMMENTAIRE]`** ✅ **LIVRÉ au lot 213 (2026-09-07)** — commentaire de `utils/tax.ts` requalifié CONTESTÉ, valeur inchangée → à déménager vers BACKLOG_ARCHIVE à la prochaine PR. Contexte d'origine : (XS, FAIBLE — docs §1 requalifiée au lot 212) — le commentaire
  `utils/tax.ts:184-186` affirme encore « gelé à 15 % par l'ARC … politique C-4 » sans source, contredit par la
  recherche relayée du 2026-09-05 (14,5 % / 14 % + compensatoire). Réécrire « CONTESTÉ, voir
  `[FISC-FED-CREDITRATE-15]` » — le chiffre ne bouge pas sans source.
- [ ] 🟢 **`[FMT-COMPACT-AXE-A-LA-MAIN]`** (S, FAIBLE, 🧭 membre déviant possible) — 5 axes `${(v/1000).toFixed(0)}k`
  sans `$` (`ChildPlanning.tsx:477,561`, `realestate/MultiPropertyComparison.tsx:107`,
  `projection/futureDetail/DrillDownCompte.tsx:212`, `FutureProjection.tsx:1804`), invisibles à
  `formatMonetaireSourceUnique` (motif exige `$`) ; mode discret OK (`maskedTick`). `formatCompactCAD` rend
  « 850 k$ » : re-mesurer la largeur d'axe (50 px) avant de migrer — un axe court peut être un choix.
- [x] 🟢 **`[KNIP-PAIRETEXTE-EXPORT]`** ✅ **LIVRÉ au lot 213 (2026-09-07)** — export retiré → à déménager vers BACKLOG_ARCHIVE à la prochaine PR. Contexte d'origine : (XS, FAIBLE — seule régression des 239 corrigés) — `scripts/lib/ctaContrast.ts:180`
  `PaireTexte` exporté sans consommateur (lot 208). Retirer l'export.
- [x] 🟢 **`[AI-CATEGORIZE-HISTORY-PARAM-MORT]`** ✅ **LIVRÉ au lot 213 (2026-09-07)** — paramètre retiré ; 2 appelants + 5 fichiers de test énumérés par le compilateur — `importReleveManuel` lui PASSAIT `withTransfers`, un paramètre mort que les appelants nourrissent a l'air vivant → à déménager vers BACKLOG_ARCHIVE à la prochaine PR. Contexte d'origine : (XS, FAIBLE) — `categorizeBatch(…, _history = [])`
  (`services/claude.ts:407`) : paramètre jamais lu. Retirer (compilateur énumère les appelants).
- [x] 🟢 **`[IMPORT-BROKER-BACKUP-SANS-LOGERROR]`** ✅ **LIVRÉ au lot 213 (2026-09-07)** — `logError` aux 4 `catch` (source `storage`) → à déménager vers BACKLOG_ARCHIVE à la prochaine PR. Contexte d'origine : (XS, FAIBLE) — `components/investments/ImportBrokerPositions.tsx:46`
  (`catch { setError(…) }`) et `components/settings/BackupPanel.tsx:152,184,210` : message à l'écran sans
  `logError` — une panne répétée n'apparaît dans aucun journal.
- [x] 🟢 **`[A11Y-INK500-TINY-X2]`** ✅ **LIVRÉ au lot 213 (2026-09-07)** — `text-ink-400` aux deux sites → à déménager vers BACKLOG_ARCHIVE à la prochaine PR. Contexte d'origine : (XS, FAIBLE, WCAG 1.4.3) — `components/setup/PageSetupGate.tsx:284`
  (« ou importer ») et `FutureProjection.tsx:1651` (indice survol/clic/molette) en `text-tiny text-ink-500` :
  `ink-500` mesure 3,86 à 4,33 (AA-large seulement), `ink-400` 5,90 à 6,62 → `text-ink-400`.
- [x] 🟢 **`[A11Y-HEALTH-DONUT-ARIA-HIDDEN]`** ✅ **LIVRÉ au lot 213 (2026-09-07)** — `aria-hidden` sur le `<svg>` → à déménager vers BACKLOG_ARCHIVE à la prochaine PR. Contexte d'origine : (XS, FAIBLE, WCAG 1.1.1) — `components/dashboard/HealthIndicator.tsx:136`
  `<svg>` du donut sans `aria-hidden` (le score est déjà en texte à côté).

## 🟢 Décisions Marc du 2026-09-05 — tickets nés des réponses (détail des questions : `docs/A_FAIRE_MOI.md`)

- [ ] ⏸️ **`[FUTUR-ANNOTATIONS]`** (M — réponse A12 du 2026-09-05 ; **plan P6 / question Q14 dans `docs/A_FAIRE_MOI.md`, à valider avant de coder** — lot 211, 2026-09-06 : le moteur publie `isRetired`, `pensionRRQ`, `pensionPSV` et les séries par compte, mais PAS la bascule de stratégie par mois) — annoter la courbe Futur avec les événements
  cités : âge de retraite, épuisement d'un compte, début RRQ/PSV, bascule de stratégie — **en bref**
  (marqueur + libellé court), chaque type d'annotation **désactivable en décochant** (préférence
  persistée). Réutiliser le mécanisme des pastilles d'événements existant (rang après écrêtage, cf.
  `UN-RANG-CALCULE-AVANT-L-ECRETAGE-SURVIT-A-SES-VOISINS`) — ne pas en écrire un second.
## 🧭 Vague Budget/Transactions/Investissements (Marc, 2026-08-21)

> Retours de Marc en bloc, non cadrés — chaque item à cadrer (questions groupées) avant de coder,
> par ticket ou par petit paquet cohérent.

- [ ] **`[BUDGET-CHARGES-FIXES-REFONTE]`** (L) — « Charges fixes et abonnements » ne fonctionne pas
  assez bien : Marc veut une analyse BEAUCOUP plus approfondie et une interface plus interactive
  et utile (refonte, pas un correctif ponctuel).
  🧭 **Cadrage round 1 (2026-08-27)** : Marc a coché les TROIS irritants proposés (aucun exclu) —
  détection imprécise (faux positifs/négatifs de l'heuristique + IA), manque d'analyse dans le
  temps (tendances de prix, évolution de la facture totale), interface peu interactive (liste +
  calendrier statiques). Portée confirmée large — les trois angles sont à couvrir, pas un sous-
  ensemble. **Prochaine étape avant de coder** : batch de cadrage DÉTAILLÉ (mockup/wireframe
  léger si utile) sur CHAQUE axe — ex. quels signaux concrets manquent à la détection, quelles
  vues d'analyse précises (graphique de tendance ? comparaison mois-à-mois ? projection
  d'impact ?), quelle interactivité voulue (filtrage, regroupement, drill-down). Effort L : ne
  pas coder avant d'avoir cette DoD précise.
- [ ] ⏸️ **`[ENG-GOALS-HORS-TOTALEXPENSES]`** (S — **DÉCIDÉ par Marc le 2026-09-03 : ATTENDRE l'affichage du SWR** — rien à faire tant qu'aucun lot ne branche le SWR à l'écran ; ce ticket se rouvre DANS le lot qui l'affichera · mécanisme confirmé, correctif évident = RÉGRESSION, limite épinglée par `tests/services/goalsHorsTotalExpenses.test.ts` au lot 110) — un tirage d'objectif n'entre PAS dans
  `totalExpenses` : l'argent sort de `liquid`, est publié en `withdrawalLiquid`, le patrimoine
  baisse — mais le registre de REPORTING l'ignore.
  ⚠️ **Mécanisme CONFIRMÉ** (le ticket le disait « probable ») : `addExpense: (_n) => {}` est un
  no-op DÉLIBÉRÉ dans le `goalMutator`, commenté « déjà soustrait du compte ciblé ».
  ⚠️⚠️ **LE CORRECTIF ÉVIDENT EST UNE RÉGRESSION MONEY-CRITICAL.** Rendre ce `addExpense` effectif
  paraît être « le » correctif ; il soustrairait le montant une SECONDE fois du flux réel, parce que
  `monthlyExpenses` n'est PAS un registre de reporting — il alimente directement
  `monthlyCashflow = monthlyIncome − monthlyExpenses`. Le seul correctif correct est un
  accumulateur de REPORTING **distinct** de celui qui pilote la trésorerie.
  ⚠️ **Qui LIT `totalExpenses`** (la question que le ticket posait) : un seul vrai lecteur, le calcul
  du **SWR** (taux de retrait sécuritaire) dans `monteCarlo.ts`. Et ce champ n'a **aucun consommateur
  d'interface** — vérifié par grep sur `components/`. Coût aujourd'hui : **nul à l'écran**. Le risque
  est pour DEMAIN : un lot qui brancherait le SWR publierait un taux **sous-estimé**, donc un plan
  qui a l'air plus sûr qu'il ne l'est.
- [ ] **`[INVEST-PORTFOLIO-DATA-CORRECTION]`** (S, 👤 données réelles de Marc à appliquer) —
  remplacer/corriger les positions du portefeuille pour correspondre EXACTEMENT à l'historique
  d'achat suivant (fourni par Marc, toutes les transactions en **CAD**) :
  - Amundi MSCI Em Asia UCITS ETF – USD (C) (OTCMKTS:ANDXF) : 12 déc. 2025, 180 actions à 52,43 $ CAD
  - Amundi MSCI World Swap UCITS ETF EUR Acc (EPA:CW8) : 12 déc. 2025, 42 actions à 601,42 $ CAD
  - Broadcom Inc (NASDAQ:AVGO) : 12 déc. 2025, 25 actions à 360,48 $ CAD
  - Gold Bullion Securities Limited (BIT:GBS) : 12 déc. 2025, 115 actions à 334,61 $ CAD
  - Howmet Aerospace Inc (NYSE:HWM) : 12 déc. 2025, 38 actions à 198,62 $ CAD
  - KLA Corp (ETR:KLA) : 12 déc. 2025, 6 actions à 1 018,09 $ CAD ; puis 12 juin 2026, 54 actions à 213,60 $ CAD
  - NVIDIA Corp (NASDAQ:NVDA) : 12 déc. 2025, 90 actions à 175,29 $ CAD
  - Palantir Technologies Inc (NASDAQ:PLTR) : 12 déc. 2025, 55 actions à 183,86 $ CAD
  - Safran SA (EPA:SAF) : 12 déc. 2025, 20 actions à 291,30 $ CAD
  - Space Exploration Technologies Corp (NASDAQ:SPCX) : 15 juin 2026, 19,44 actions à 172,80 $ CAD
  - Taiwan Semiconductor Mnfg Co Ltd (NYSE:TSM) : 12 déc. 2025, 20 actions à 292,46 $ CAD
  - Visa Inc (NYSE:V) : 12 déc. 2025, 21 actions à 348,37 $ CAD
  ⚠️ Vérifier d'abord l'écart avec les positions actuelles avant d'écraser quoi que ce soit (ne pas
  dupliquer si déjà en partie correct).
  ⚠️ [INVEST-COURS-EXACT-TOUTES-ACTIONS livré] `ETR:` (Xetra) et `BIT:` (Milan) ont désormais un
  cours exact. `OTCMKTS:ANDXF` reste un gap de COUVERTURE (forfait gratuit Finnhub/Yahoo, pas un
  bug de routage) : ce titre pourrait rester sans cours exact — vérifier après saisie, et si besoin
  entrer son jumeau coté en bourse standard (l'ETF Amundi existe probablement aussi en `EPA:`/`ETR:`).

---

## 🎯 PLAN VERS ZÉRO (analyse PM du 2026-08-19 — demande Marc : « fais tout jusqu'à ce que le backlog soit fini »)

> **Le chiffre honnête** : 230 items ouverts ≠ 230 PR. Après le ménage (vague 0, faite) et le tri
> des blocages, il reste **~46-50 PR livrables**, dont ~30 items qui resteront ouverts quoi qu'il
> arrive parce qu'ils attendent une réponse ou une action de Marc (→ `docs/A_FAIRE_MOI.md`).
>
> **Règle de groupement** : un lot = une PR = un FICHIER ou un domaine. Plusieurs PR sur le même
> fichier, ce sont des rebases et des occasions de se contredire.
>
> ⚠️ **Les cases de CE bloc sont un compteur d'avancement du PLAN, pas des tâches.** Ne PAS les
> déménager vers l'archive en les cochant (règle « item fini → archive ») : le plan perdrait sa
> raison d'être. Elles se cochent au fur et à mesure et RESTENT ici jusqu'à ce que le backlog soit
> vide, moment où le bloc entier part à l'archive.

- [x] **Vague 0 — Ménage** (2026-08-19, sans code) : 14 doublons fermés, `[DEBT-FROM-CONTRACT]` et
  `[PASSE-REEL-DETTE-*]` confirmés VIVANTS contre l'avis du PM (`docs/adr/` précisé).
- [ ] **Vague 1 — L'argent faux d'abord.** Un chiffre financier faux affiché avec assurance est le
  pire risque de cette app ; il passe avant l'a11y, la perf et la dette.
  **1a** ✅ `[CASH-NAN-SILENT]` **livré 2026-08-19** (source unique `services/startingCash.ts`) — c'est le point d'entrée de TOUTE la projection,
  s'il est faux tout ce qui en découle l'est aussi.
  **1b** ✅ *partiel 2026-08-19* — livrés : `[CELIAPP-DOUBLE-RECHARGE]`, `[RAMQ-ACTIF-HORS-RETRAITS]`,
  `[DOC-CELIAPP-REPORT-PERIMEE]`. RESTE dans ce lot (`[FISC-BAND-AGE-CREDITS]`,
  `[FISC-DIV-DERIVED-BASES]`, `[ENG-GK-THRESHOLD-KNIFE]`, `[ENG-TTP-UNSETTLED-PROPAGATE]`,
  `[RAMQ-ACTIF-HORS-RETRAITS]`, puis `[DOC-CELIAPP-REPORT-PERIMEE]`) — même fichier, même risque de
  re-baser des goldens : 6 PR séparées se re-baseraient l'une l'autre.
  **1c** ✅ *TERMINÉE 2026-08-19* — `[MC-BANDES-CROISEES]`, puis `[ENG-MC-CONSERVATION-BLIND]` +
  `[ENG-INV-FLUXFORM-COVERAGE]`. Les deux extensions de couverture ont trouvé un défaut chacune :
  `[ENG-FERR-NETTRANSFER-MUET]` (corrigé, 131 566 $ en DÉTERMINISTE) et `[ENG-DIVORCE-FLUX-MUET]`
  (ouvert, MC seulement, impact utilisateur nul aujourd'hui).
  **1d** ✅ *TERMINÉE 2026-08-19* — livrés : `[REVENUS-NON-VENTILES-AFFICHAGE]`,
  `[JOUR-BILAN-ROMPU-SOUS-HYPOTHEQUE]`, `[NW-PRESENT-DEUX-PERIMETRES]` (fermé SANS code : un seul
  site de recomposition, et il reçoit `netWorth` en prop), `[ENG-APRIL-REFUND-NONREG-UNPUBLISHED]`,
  `[ENG-W5-RENTAL-OFFBALANCE]`, `[ENG-W5-BUSINESS-OFFBALANCE]`. **Sorti du lot** :
  `[ENG-LIQUIDDEBT-NEVER-REPAID]` → bloqué sur un taux de découvert à SOURCER + un choix produit,
  routé vers `docs/A_FAIRE_MOI.md`.
  **1e** ✅ *TERMINÉE 2026-08-19* — `[COUPLE-CTX-FAKE-ZERO]` + `[TOOL-TAXSITUATION-FAKE-ZERO]`
  (⚠️ diagnostic groupé à moitié FAUX : le second ne publiait pas un 0, il EFFAÇAIT le conjoint —
  deux correctifs opposés), puis les cinq XS `[SILENT-STOCKFORM-PRICEHINT]`, `[SYSVIEW-DBSIZE-ZERO]`,
  `[DEAD-PARSETX-SILENT-DROP]`, `[SILENT-PWA-PROMPT]`, `[SILENT-HEALTHWEIGHTS-FIELD]`.
  **1f** Valeurs fiscales sans source NON gatées (`[RQAP-CAP-98K]`, `[W5-PROXY-NON-SOURCE]`,
  `[ESTATE-NPV-07]`, `[MIGRATE-GROSS-135]`, `[FISC-GUARD-SCOPE]` — ce dernier **en premier**,
  élargir le ratchet AVANT révèle le vrai périmètre).
- [ ] **Vague 3 — `formatCAD`** ⚠️ **AVANT la vague 4** : les deux touchent les mêmes fichiers
  (`ProjectionTooltip`, `GoalSeekerCard`…). **3a** livrer le scan-garde d'abord — il n'existe pas et
  ses offenders SONT le périmètre. **3b** corriger ce qu'il révèle, par dossier
  (`services/projection/*` en premier, 80 % du volume). Puis `[FORMATCAD-OR-ZERO]`, classe distincte.
- [ ] **Vague 4 — a11y.** **4a Étendre les outils-garde D'ABORD** (`[A11Y-CONTRAST-ANGLE-MORT-541]`,
  `[A11Y-CONTRAST-TOOL-GAP-CTA]` ; ✅ `[A11Y-PRIVACY-SCAN-GLOBAL]` livré au lot 59) — coder les fixes
  avant donnerait un périmètre DEVINÉ, pas mesuré. La garde du mode discret l'a confirmé une fois de
  plus : son ticket annonçait 38 sites, la mesure alias-aware en a trouvé d'autres et en a réfuté. **4b** mode discret formulaires · **4c** contraste · **4d** clavier /
  focus / cibles tactiles (indépendant des outils, peut partir en parallèle) ·
  **4e** `[A11Y-SUBTABS-FUTUR]` ⚠️ **APRÈS** la vague 8b (même fichier, 2 026 lignes).
- [ ] **Vague 5 — IA/Anthropic** : un seul lot, une seule surface (`services/claude.ts` + `mcp/`).
- [x] **Vague 6 — Performance** ✅ **SOLDÉE le 2026-09-04** : ✅ `[PERF-ENGINE-DATELABEL-INTL]` +
  ✅ `[PERF-ENGINE-ISOSTRING-HOTLOOP]` (2026-08-21) · ✅ `[PERF-MARKETDATA-DYNIMPORT-INERTE]`
  (lot 133) · ✅ `[PERF-ENGINE-TOFIXED-ROUND]` (lot 131, fuzz ~1M valeurs). Reste de perf ailleurs :
  `[PERF-BOOT]` (différé sciemment, provider-aware).
- [ ] **Vague 7 — Fintable/sync** : ✅ `[FINTABLE-INVESTMENTS-MUET]` (PR #830) · ✅ `[FINTABLE-SOURCE-TAG]` (lot 130). Reste : `[FINTABLE-BACKFILL-HISTORY]` (prérequis Marc), `[DEFAULTS-DRIFT…]` fermé caduque.
- [ ] **Vague 8 — Dette technique** : **8a** god-fonctions moteur · **8b** god-files UI, UN fichier à
  la fois · **8c** primitives et tokens · **8d** casts/dépréciations/exports morts ·
  **8e** garde-fous structurels (`[STORE-RENAME-NO-GUARD]`, `[SVC-STORE-COUPLING]`,
  `[ENGINE-IMPLICIT-ORDER]` — des TESTS d'ordre, pas un refactor de l'orchestrateur) ·
  **8f** divers · **8g** dépendances · **8h** tests.
- [ ] **Vague 9 — Chat/contexte d'écran** · **Vague 10 — Gros chantiers** (en DERNIER : les plus
  risqués en régression, à faire quand le reste est stable) · **Vague 11 — `[PASSE-REEL]` restant**.

---

## Plan d'exécution (vagues — PM + analyses code/fiscal 2026-07-31)

> Synthèse des 3 analyses (PM : ordre/valeur · code-analyzer : 15 findings nouveaux ·
> financial-integrity : 8 findings nouveaux MESURÉS + requalifications). Rapports condensés en
> scratchpad de session ; détail par item dans les sections ci-dessous.
> ✅ TOUTES les questions Marc sont répondues (2026-07-31, section 🧭) — plus aucune vague gatée
> sur lui. Restent gatés sur des SOURCES EXTERNES : FISC-GIS-COUPLE-RATE (table Service Canada),
> FISC-LINE361 (Annexe B), FISC-FED-CREDITRATE-15 (source ARC primaire).

- [ ] **V5 — Fiscal débloqué (Marc : Q1 ok, Q2 fix, Q3 go)** : ~~`[FISC-BRACKET-REALINDEX]`~~ ✅ #556 +
  ~~`[FISC-WHT-92PCT]`~~ ✅ #558 (archivé) + `[FISC-SOLO-INVEST-SPLIT]` (Q3 — ⚠️ **DÉPRIORISÉ,
  mesuré 0 $ sur le profil de Marc**, cf ci-dessous) +
  `[FISC-GIS-COUPLE-RATE]` (table Service Canada requise) + `[FISC-LINE361-PERCONJOINT-REDUC]`
  (Annexe B d'abord) + `[FISC-FED-CREDITRATE-15]` (source ARC).
- [ ] **V6 — Fiscal non gaté** : ~~`[FISC-DTC-ABATEMENT-ORDER]`~~ + ~~`[FISC-STACK-GAINS-DIV]`~~
  ✅ #564 (archivés — CID validé contre les tables RQ/ARC : 40,11 % / 48,70 %). RESTE :
  `[FISC-REEE-GRANT-CLAWBACK]` (⚠️ **mesuré 0 $ sur le profil de Marc** : `reee: 0`, aucun objectif
  d'études → dormant, actif seulement s'il ajoute un enfant ; confirmé contre le code —
  `childrenReee.ts:327` verse 100 % du solde, les trackers SCEE/IQEE existent mais ne sont jamais
  décrémentés → modélisation en 3 poches nécessaire, plan-first) + ~~`[FISC-TAXDEC-INCR]`~~
  ✅ **LIVRÉ 2026-08-20, PR #676** ((a) codé, (b) déjà fait #564, (c) statu quo documenté — archivé).
- [ ] **V7 — Sécurité serveur + sync** — **2/4 livrés** (PR #566) :
  ✅ `[FINTABLE-SYNC-STALE-BASE]` + ✅ `[MCP-CLOUDRUN-AUTH-HARDENING]` (archivés).
  ✅ `[MCP-CHARTDATA-SUM-GUARD]` (#567) + ✅ `[FISC-CONST-GUARD-V2]` (#568). **V7 TERMINÉE (4/4).**
- [ ] **V7bis — RÉEE (demande explicite Marc 2026-08-05)** : `[FISC-REEE-GRANT-CLAWBACK]`, plan-first.
  ⚠️ Marc a tranché CONTRE la reco « différer » : des enfants sont donc au programme. Ne pas
  re-proposer de reporter.
- [ ] **`[FISC-REEE-GRANT-CLAWBACK]`** (L — ⚠️ **TENTÉ ET REVERTÉ le 2026-08-05**, PR #566) — le bug
  d'ORIGINE est réel et confirmé : à la fermeture (25 ans), `childrenReee.ts` verse 100 % du solde
  résiduel avec un forfait de 20 % sur le TOUT → les subventions SCEE/IQEE non utilisées (jusqu'à
  10 800 $/enfant) deviennent du patrimoine au lieu d'être REMBOURSÉES, et les cotisations (argent
  déjà imposé) sont taxées. Deux erreurs de sens OPPOSÉ.
  ⚠️ **Une modélisation en 3 poches DÉRIVÉES a été implémentée puis RETIRÉE** : le panel
  financial-integrity l'a mesurée PIRE que le bug sur deux cas courants. À refaire avec ce périmètre,
  qui est maintenant CONNU et CHIFFRÉ — ne pas repartir de zéro :
  - ⛔ **Solde d'ouverture** (`projection.ts:148`, `reee` depuis `liveCSVBalances.REEE`) : les poches
    démarraient à 0, donc 100 % d'un RÉEE EXISTANT était classé « revenu accumulé » et imposé à ~70 %.
    **Mesuré −31 193 $** (couple 183 600 $, enfant de 23 ans, RÉEE d'ouverture 60 000 $). Correctif :
    amorcer les poches (champ « dont cotisations / dont subventions », ou défaut conservateur = tout
    en cotisations plafonné à 50 000 $ — imposer du capital est la pire des deux erreurs).
  - ⛔ **Multi-enfants** : `_childReee` (`projection.ts:1214`) est un solde MÉNAGE unique alors que les
    poches sont PAR enfant, et la fermeture fait `reeeNewBalance = 0`. **Mesuré +7 890 $ d'impôt
    fantôme** (aînée 23 ans + cadette 6 ans) : le solde de la CADETTE est liquidé et imposé à la
    fermeture de l'aînée, ses subventions versées au lieu d'être remboursées, et ses poches survivent
    à un solde 0 → sous-imposition symétrique plus tard. Correctif : solde par enfant, OU poches
    ménage avec proratisation à la fermeture (+ transfert entre frères/sœurs, qui dans la vraie vie
    évite tout remboursement de SCEE).
  - ⚠️ **Base du taux marginal** : le PRA est imposable au SEUL SOUSCRIPTEUR. Le code utilisait
    `householdGross` (2 salaires), NON indexé (dollars an-0 dans un barème indexé) et aveugle à
    `isRetired`. **Mesuré sur un PRA de 50 000 $ en 2051** : code 32 759 $ (65,5 %) · souscripteur
    indexé 30 607 $ (61,2 %) · retraité à 60 k$ 24 646 $ (49,3 %). La référence existe déjà dans le
    dépôt : `latentTax.ts:58-64` (leçon `[FISC-BRACKET-REALINDEX]`), idem `projection.ts:902-904`.
  - ⚠️ **Dérivés à auditer** : `latentTax.ts` ne couvre PAS le RÉEE, et `netWorth.ts:59` /
    `estateCalculation.ts:135` le comptent à 100 %. Passer le prélèvement effectif de 20 % à ~70 %
    multiplie par ~3,5 l'écart entre le patrimoine affiché et l'impôt que le moteur percevra.
  - ⚠️ **Invariant manquant** : `subventions + cotisations ≤ solde` n'est pas tenu quand le solde
    baisse hors des flux suivis (`projection.ts:793` `reee *= keep` au divorce, marché baissier).
  - ⛔ **CONSERVATION DE FLUX cassée** (projection-validator, mesuré) : `grantsRepaid` n'alimentait
    AUCUN registre — il n'existait que dans une chaîne de log. Résiduel `unexplained` de
    **−10 799,99 $** sur le mois de fermeture (0,00 $ avant), soit exactement SCEE 7 200 + IQEE 3 600.
    ⚠️ Nuance MESURÉE : la face ENTRANTE n'était déjà pas enregistrée (+125 $/mois en rattrapage puis
    +62,50 $/mois, dans l'ANCIEN code aussi) — l'ancien modèle créait donc 10 800 $ nets sans cause
    visible. Le nouveau est plus juste EN CUMUL mais concentre tout sur un mois. Correctif : router
    `grantsRepaid` par un registre visible (`taxDiversAdd`, ou une série `ReeeGrantClawback`), et par
    SYMÉTRIE enregistrer les subventions ENTRANTES.
  - ⚠️ **Espaces mixtes** (projection-validator, mesuré) : `householdGross` n'est jamais indexé par
    `simSalaryGrowth` alors que le barème l'est → **−2 613,69 $** d'impôt sous-évalué en 2051.
    ⚠️ Cette erreur est de sens OPPOSÉ à celle de l'assiette ménage (+6 469 $) : elles se masquent
    partiellement — exactement le piège que le correctif reprochait à l'ancien forfait.
  - ⚠️ **Registres d'affichage** : la branche fermeture n'incrémente ni `withdrawalREEEAdd`, ni
    `reeePayoutAdd`, ni `contribLiquidAdd` (mesuré `ReeePayout = 0` pour 68 547,88 $ versés), alors
    que la branche études alimente les quatre. Pré-existant, mais aggravé.
  - ⚠️ **Croissance du RÉEE au `activeCashRate`** (`growthApplication.ts:51`), pas à un taux de
    placement. Pré-existant et anodin avant — mais la poche PRA EST le cumul de cette croissance,
    donc ce taux porte désormais un montant d'IMPÔT.
  - 🧪 **Deux tests discriminants déjà identifiés** : (1) conservation avec enfants, `maxResid < 1`
    (passait avant, échouait après) ; (2) « un RÉEE d'ouverture de 60 000 $ ajoute > 60 000 $ au
    patrimoine final » (ancien +88 010 $, nouveau +28 984 $).
  - ⚠️ **Ordre de puisage PAE** : la part SCEE d'un retrait d'études est PRORATISÉE
    (`PAE × C/(C+I)`, règlement CESP), pas « subventions d'abord » comme implémenté.
  - ⚠️ **Couverture** : `projection.moneyConservation.test.ts` tourne avec `childGoals: []` → aucun
    test de conservation n'exerce un remboursement de subventions.
  - 📄 **À documenter quoi qu'il arrive** : surtaxe PRA de 20 % = 12 % féd (T1172 / LIR 204.94) + 8 %
    impôt spécial QC — la valeur est JUSTE mais n'était pas sourcée ; roulement PRA → REER
    (50 000 $ à vie, déductible ET exonéré de la surtaxe) NON modélisé ; fermeture à 25 ans du
    bénéficiaire ≠ échéance légale du régime (fin de la 35ᵉ année).
- [ ] **`[FISC-REEE-EAP-STUDENT-TAX]`** (M, hypothèse ASSUMÉE, choix Marc 2026-08-05) — le retrait
  d'études est imposable dans les mains de l'ÉTUDIANT, pas du souscripteur. Le moteur le laisse à
  ~0 $ (réaliste : BPA + crédits de scolarité couvrent un étudiant sans autre revenu) mais c'est une
  hypothèse, PAS un calcul. Le coder exigerait un TROISIÈME contribuable dans le moteur.
- [x] ~~**`[FISC-RRSP-ROOM-PER-USER]`**~~ ✅ **LIVRÉ 2026-08-20, PR #679** (détail : section
  datée en tête de `docs/BACKLOG_ARCHIVE.md`).
- [ ] **V8 — Features demandées** — ✅ `[GOAL-DEADLINE-UI]` + ✅ `[PH4C-SAVINGS-NATURE]` (#569) +
  ✅ `[SUBS-TAB]` volet « ignorer » (#570), ~~volet EMPLACEMENT~~ (FERMÉ 2026-09-05 : la liste reste dans Budget). RESTENT : `[CHAT-PAGE-CONTEXT-V2]` (file explicite Marc) ·
  `[ASSET-CURRENCY-BACKFILL]` (gaté : rien à coder tant que le log `services/portfolio.ts:60-62`
  n'apparaît pas chez Marc).
- [ ] **V8bis — `[FUTUR-DAILY]` granularité QUOTIDIENNE (demande explicite Marc 2026-08-06)** —
  « quotidien sur tout, je veux voir le détail si je zoom beaucoup », futur ET passé, avec le détail
  par compte. ⚠️ Marc a tranché CONTRE ma reco (je proposais le quotidien seulement là où l'app a de
  vraies dates). Décision prise, **ne pas re-proposer de restreindre**.
  **Conception retenue** : le moteur RESTE mensuel (source de vérité, `projection.ts` intouché — le
  passer au jour = ~11 000 itérations × chaque tirage MC, et rejouer au jour une fiscalité qui n'a
  que des événements ANNUELS). Un module RAFFINE la fenêtre zoomée à la demande.
  **Invariant money-critical** : la série quotidienne passe EXACTEMENT par les points mensuels, par
  construction. Deux granularités qui divergeraient = deux soldes pour la même date selon le zoom.
  **LIVRÉ pour l'essentiel (PR #581→#587, mergées 2026-08-11/12)** — les étapes cochées sont
  ARCHIVÉES avec leur contexte dans `docs/BACKLOG_ARCHIVE.md` (section 2026-08-12). Ci-dessous :
  le RESTE VIVANT du chantier, uniquement.
- [ ] **V10 — A11y** (1-2 PR) : `[A11Y-INK500]` + `[FUT-TOUCH-TARGETS]` +
  `[A11Y-BORDER-PROMINENCE-SWEEP]`. ⚠️ `[D6-KBD]` + `[A11Y-FUTUR-MILESTONES-KEYBOARD]` archivés
  (2026-08-12, PR #598, #599).
- [ ] **V11 — Dette structurée** (fond, par lots) : ✅ `[GODFILE-APPLYDOCUMENT]` (#879) →
  ✅ `[GODFILE-MCPHTTP]` (#880) →
  `[DETTE-GODFILES]` (Budget/FutureProjection/…) + `[DETTE-UI-PRIMITIVES]` + `[CA-07]` + `[T4]`.
- [ ] **V12 — Gros chantiers (tous GO Marc 2026-07-31, plan-first chacun)** :
  `[IA-NAV-CONSOLIDATE]` (GO — préparer un GROS batch de questions de cadrage d'abord) →
  `[UI-TABS-RICH]`+`[IA-NAV-LABELS]` ; `[PH4-BUD]` refonte Budget (GO — « faut tout refaire »,
  batch de questions d'abord) ; `[CIX-*]` (critère défini : bascule couple↔solo fiable →
  CIX-B → CIX-F → CIX-A1B en priorité) ; ~~`[MCP-WHATIF-DATED-DEBT]`~~ ✅ **livré par `[DETTE-DATES]` (2026-08-19)** — le moteur honore `Debt.startDate` (phaseDette : pas de paiement ni de solde avant la date), constaté au lot 129 ;
  `[P0-IDB]` (si quota le justifie).
- [x] **V3' — Nettoyage décidé** ✅ **SOLDÉ le 2026-09-04 (lot 128)** — tout était déjà réglé ou
  l'est maintenant : `futureProvince`/`futureProvinceMoveYear` RETIRÉS et `rsuYearsRemaining` doté
  de son éditeur (PR #729, `[PH3-c-bis]` — le « retire » initial de Marc a été supersédé par la
  mesure : le champ était LU par le moteur, +1,38 M$ de patrimoine fantôme sans lui) ;
  SEC-DRIVE-ENCRYPT-DEFAULT fermé (`[Q-DRIVE-ENCRYPT]`, Marc : « non ») ; .mcpb fermé ;
  `[DETTE-RE-SALE-PURGE]` livré au lot 128.

---

- [ ] **`[A11Y-RESERVE-CHIP-PROMINENCE]`** (XS, **REQUALIFIÉ 2026-09-02 : design, pas conformité**)
  — ⚠️ **Ses chiffres sont JUSTES, re-mesurés** (composition alpha sur `surfaceHighlight #15181E`,
  palette Tailwind par défaut) : fond `bg-amber-500/10` → **1,17**, bordure `border-amber-500/30` →
  **1,83**, texte → **8,82** (alerte) et **10,86** (réel). Le ticket annonçait ≈1,15 / ≈1,8 / ≈9–10.
  Une mesure qui CONFIRME se publie autant qu'une réfutation.
  ⚠️ **Mais sa conclusion ne suit pas.** Il veut étendre `check-contrast` pour imposer le seuil
  non-texte 3:1 (WCAG 1.4.11) à ces pastilles. Or 1.4.11 vise l'information que la COULEUR SEULE
  porte : ici l'état est écrit en toutes lettres DANS la pastille (« Réel », « Projeté »,
  « ~ prix estimé »), à 8,8 et 10,9 de contraste, et la couleur ne porte rien de plus. Le seuil ne
  s'applique pas — construire ce contrôle produirait un scanner qui crie sur du code conforme
  (`UN-SCANNER-QUI-CRIE-SUR-DU-CODE-VIVANT-APPREND-A-ETRE-IGNORE`, et
  `UNE-REGLE-GENERALE-A-UN-DOMAINE-DE-VALIDITE`).
  **Ce qui reste** : la phrase du ticket lui-même — « l'effet *saute aux yeux* est affaibli » — sur
  la seule pastille d'ALERTE. C'est un choix de DESIGN (quelle prominence pour une réserve ?), donc
  à trancher avec Marc, pas à décider seul par une règle qui ne s'applique pas.
  ⚠️ Note d'outillage, vraie et indépendante : `scripts/lib/ctaContrast.ts` ÉCARTE explicitement les
  fonds translucides (`bg-…/10`) et ne résout que les tokens de `tailwind.config.js` — les classes de
  la palette Tailwind par défaut lui sont invisibles. Réel, mais à ne PAS élargir pour ce ticket-ci :
  la composition alpha dépend du fond de l'ANCÊTRE, qu'un scan par ligne ne connaît pas
  (`LE-CONTEXTE-D-UN-DEFAUT-CSS-VIT-CHEZ-L-ANCETRE`).

- [x] ~~**`[ENG-GK-THRESHOLD-KNIFE]`**~~ ✅ **LIVRÉ 2026-08-21** (bande de lissage −4 %/−6 % —
  détail : section datée en tête de `docs/BACKLOG_ARCHIVE.md`, réf PR au merge).
- [x] ~~**`[FISC-DIV-DERIVED-BASES]`**~~ ✅ **LIVRÉ 2026-08-21** (FSS +70 $/ménage, récupération
  PSV +1 552,50 $/an mesurés — détail en tête d'archive, réf PR au merge). Le voisin **clamp du
  CID** reste OUVERT et documenté (mesuré 0 $ avant comme après sur le profil du panel) :
- [x] ~~**`[FISC-BAND-AGE-CREDITS]`**~~ ✅ **DOUBLON — LIVRÉ par #676** (`[FISC-TAXDEC-INCR]`,
  2026-08-20) : mêmes bandes §2/§3 sans ageOpts, mêmes chiffres (675,56 $ à 60 k$). Le panel #564
  et le triage 2026-06-16 avaient nommé le même défaut sous deux IDs. Constaté au lot vague 1b.
  ⚠️ Non introduit par #564 (identique sur origin/main). Fix : passer `ageOpts` aux deux bornes —
  attention, ça re-basera des goldens retraités (mesurer avant).
- [x] ~~**`[FISC-PENSION-CREDIT-REAL]`**~~ ✅ **LIVRÉ 2026-08-20** (détail : section datée en
  tête de `docs/BACKLOG_ARCHIVE.md` — réf PR au merge).
- [ ] **`[PROJ-NW-FALAISE-REER]`** (M, **ÉLEVÉ** [DIAGNOSTIQUÉ 2026-08-21 — décision produit
  ✅ **DÉCISION Marc 2026-09-05 (en session)** : **(b) plancher de préservation CELI** (X mois de dépenses, X fixé par MESURE — 24 proposé). Plan-first : chiffrer X, re-base des goldens SCIEMMENT, mesurer le classement des stratégies avant/après.
  routée A_FAIRE_MOI]) — reproduit et EXPLIQUÉ : ±1 000 $ de REER d'ouverture → **−112 k$** de NW
  final (couple 72/72, 30 ans, AUTO_MARGINAL ; bifurcation au mois 143). **Mécanisme prouvé**
  (`cashflowAllocation.ts:182-236`) : `runningGross` inclut le FERR minimum forcé (∝ REER
  initial) → le remplissage « Palier 14 % » (`bracket1Top`, MUR dur) se plafonne plus bas → le
  solde du shortfall passe à la cascade standard dont le 1er bucket AUTO_MARGINAL est **CELI** →
  le CELI s'épuise des années plus tôt → une fois mort, tout sort du REER au marginal PLEIN →
  spirale composée. La politique est LOCALEMENT optimale (éviter la tranche suivante) et
  GLOBALEMENT perdante (mesuré : le run qui « préserve » son REER finit 112 k$ plus pauvre).
  **Pas un bug d'arithmétique — une politique myope + un seuil dur.** Options routées à Marc
  (A_FAIRE_MOI) : (a) lisser le mur (retrait partiel au-delà du palier), (b) plancher de
  préservation CELI (basculer sur le REER au-delà du palier quand CELI < X mois de dépenses),
  (c) statu quo documenté (la sensibilité est réelle mais le modèle l'amplifie). ⚠️ Tout
  correctif re-base des goldens et peut changer le CLASSEMENT des stratégies. ⚠️ D'ici là, toute
  mesure d'impact « NW » d'un retraité à gros REER près d'un seuil de palier est non
  représentative (la falaise domine).
- [ ] **`[FISC-REEE-GRANT-CLAWBACK]`** (S, [Probable] — V6) — à la fermeture du REEE,
  ✅ **DÉCISION Marc 2026-09-05 (en session)** : **GO pour retenter** (voir le ticket L du même ID plus haut) ; Marc ne peut pas séparer cotisations/subventions sur son REEE réel → part subvention DÉRIVÉE des règles SCEE/IQEE sur l'historique de cotisation, hypothèse écrite et affichée.
  `liquidDelta += reeeNewBalance` verse 100 % du solde aux liquidités : les subventions SCEE/IQEE
  non utilisées (jusqu'à ~10 800 $/enfant) doivent être REMBOURSÉES au gouvernement → patrimoine
  surévalué. (Découvert en re-validant FISC-REEE-AIP-MODEL — défaut plus gros que le taux.)
- [ ] **`[FISC-FED-CREDITRATE-15]`** (S vérif, 🧭 source ARC requise) — `FED_NONREFUNDABLE_RATE`
  ⚠️ Depuis le lot 210 (`[FISC-DON-FEDRATE-DUP]`), `DONATION_CREDIT_RATES.fed.first` LIT cette constante : corriger ICI corrige aussi le 1er palier du crédit pour dons (même terme statutaire, LIR 118.1(3)). Le crédit compensatoire C-4, s'il ne couvre pas les dons de la même façon, se décide à ce moment-là — pas de seconde copie à ré-introduire.
  ✅ **DÉCISION Marc 2026-09-05 (en session)** : recherche relayée : **14,5 % (2025), 14 % (2026)** + un **crédit compensatoire** 2025-2030 qui garde 15 % pour la part des crédits au-delà du 1er palier (58 523 $ en 2026) — correctif à DEUX étages ; il MANQUE la formule exacte du compensatoire (capture ARC demandée).
  15 % vs 1er palier fédéral 14 % (C-4) : seule affirmation du doc SANS source (profil
  TP1G-VIVANT-SEUL : chiffre non sourcé = suspect). Si faux : ~165 $/pers/an. Re-sourcer AVANT tout changement.
- [ ] 🟠 **`[DETTE-AUTO-BAIL-TOYOTA]`** (M, money-critical, **BLOCAGE 1 TRANCHÉ ET ÉCRIT ; reste le type/les dates, saisissables dans l'écran**) —
  le véhicule de Marc est sous **BAIL** (« Offre de Location », Ste-Foy Toyota, 2026-07-14), pas sous
  prêt. Contrat LU et vérifié par l'arithmétique : coût capitalisé **48 405,23 $**, **190,02 $/sem +
  28,45 $ de taxes = 218,47 $/sem**, terme **48 MOIS**, taux **6,59 %**, valeur résiduelle
  **17 746,40 $**, 28 000 km/an. ⚠️ Le terme est en MOIS et non en semaines : sur 208 semaines le versé
  avant taxes (39 524 $) colle à dépréciation + intérêt (39 378 $) à **+0,4 %**, contre **+18,9 %** pour
  un terme de 60 mois — vérification arithmétique, pas une lecture d'image.
  ⚠️ **BLOCAGE 1** : ses prélèvements réels sont de **234,67 $/semaine** (7 mesurés, hebdomadaires,
  du 2026-07-28 au 2026-09-09), soit **+16,20 $/sem, +7,4 %, 842 $/an** de plus que le contrat. Le
  document est une OFFRE — le bail signé a pu changer. **Ne pas choisir à sa place** : 946,70 $/mois
  contre 1 016,90 $/mois sur 4 ans.
  ⚠️ **BLOCAGE 2** : `KIND_AMORTISSANT['auto-lease'] = false` — le moteur REFUSE d'amortir un bail,
  **par décision écrite** (« n'amortit pas un SOLDE »). La demande de Marc (« qu'elle diminue à chaque
  virement ») est légitime mais porte sur une AUTRE grandeur : soit l'**engagement restant**
  (versements restants × montant), soit le **solde capitalisé** qui descend vers la **résiduelle**, pas
  vers zéro. Les deux donnent un patrimoine net différent.
  ⚠️ Sa saisie actuelle est fausse sur les deux chiffres (**50 000 $ à 5,69 %**, un rond qui ne figure
  nulle part au contrat) et son bilan ne porte **aucun véhicule à l'actif** — défendable pour un bail,
  mais c'est un choix à rendre délibéré.
  ⚠️ `apply_debt` (MCP) ne peut écrire **ni `kind`, ni `startDate`, ni `originalBalance`, ni
  `termEndDate`** — exactement les champs que la demande réclame. Ils existent dans Réglages → Dettes.
  ✅ **TRANCHÉ 2026-09-14** : Marc confirme que **234,67 $/sem est la vérité** (« j'ai des offres en
  plus ») — le contrat est bien une offre. **Total du bail : 48 811,36 $** sur 208 versements
  (+3 369,60 $ au-dessus du contrat), **66 557,76 $** s'il rachète à la résiduelle. Écrit par
  `apply_debt` (sauvegarde horodatée, réversible) : solde **50 000 → 47 168,67 $** (versements
  restants), paiement **220 → 1 016,90 $/mois**, taux **5,69 → 0 %**, prêteur renseigné.
  ⚠️ **0 % est MESURÉ, pas un avis** : le solde écrit est la somme des versements restants, qui
  contiennent déjà l'intérêt ; ressaisir les 6,59 % du contrat donne **54 mois / 54 591,90 $** contre
  **46,4 mois / 47 168,67 $** réels — **+7 mois et +7 423 $ de versements fantômes**.
  ⚠️ **Le plus gros écart n'était pas le contrat** : `minimumPayment` valait **220 $/mois** pour une
  auto à **1 016,90 $/mois**. Effet mesuré : patrimoine net 212 609 → 215 440 $, cashflow mensuel
  **2 370 → 1 534 $**.
  ⚠️ **RESTE** (hors de portée du MCP, à faire dans Réglages → Dettes) : type = **bail auto**, début
  = **2026-07-14**, fin de terme = **2030-07-14**. Et la **valeur résiduelle de 17 746,40 $** n'existe
  dans aucun champ du modèle — un rachat de bail reste à cadrer.
  Détail et tableau du contrat dans `docs/A_FAIRE_MOI.md`. ⚠️ Dépôt PUBLIC : NIV, adresse, téléphone,
  n° de contrat et nom du vendeur délibérément NON consignés.
- [x] 🔴 **`[TX-EXCLUES-INTROUVABLES]`** (S, **signalé par Marc le 15/09**) — **Fait le 15/09** (PR #967).
  — Marc, juste après avoir exclu des calculs ses 44 lignes du Brésil comme je le lui avais
  demandé : **« je vois plus aucune transactions du bresil »**. Rien n'était perdu — le marquage
  est PUR et ne fait que poser un drapeau — mais `showDuplicates` est un état de COMPOSANT
  (`useState(false)`), donc remis à faux à chaque montage, et son **seul** `setShowDuplicates(true)`
  vivait dans `handleMarkDuplicates`. Mesuré sur le code d'avant : **2 occurrences** de
  `setShowDuplicates` dans tout le fichier — la déclaration et cet appel. Donc au rechargement les
  lignes exclues disparaissaient de la liste et **aucun geste ne pouvait les rappeler** ; le seul
  recours était « Annuler tous les marquages », qui DÉFAIT le travail au lieu de le montrer.
  ✅ Livré : bouton **« N exclue(s) — afficher / masquer »** dans la barre de filtres, rendu dès
  qu'il y a une exclusion. Un écran qui masque doit DIRE ce qu'il masque, sinon il est
  indiscernable d'une perte de données.

- [ ] 🔴 **`[FINTABLE-MONTANT-EN-DEVISE-ORIGINALE]`** (M, money-critical, **MESURÉ sur les VRAIES
  données de Marc**) — Fintable livre le montant d'une transaction dans sa **devise d'ORIGINE** tout
  en étiquetant `currency: "CAD"` (la devise du COMPTE). Le filtre de devise du mapper
  (`tx.currency.toUpperCase() !== baseCurrency` → `skippedForeignCurrency`) est donc **structurellement
  aveugle** : il lit l'étiquette, jamais la valeur, et n'a jamais pu tirer une seule fois.
  ⚠️ **MESURÉ** (voyage au Brésil de Marc, 44 transactions appariées une à une à son relevé de carte,
  qui fait foi en CAD) : **3 875,43 $ importés contre 1 338,12 $ réellement facturés — +2 537,31 $,
  soit +189,6 % de dépenses fantômes**. 39 transactions en BRL SURÉVALUÉES (ratio mesuré **3,567 à
  3,624**) et 5 en USD **SOUS-évaluées** (ratio **1,417 à 1,427**) — le défaut va donc dans les DEUX
  sens, et un « ça gonfle les dépenses » serait déjà une description fausse.
  ⚠️ **Contrôle négatif dans les mêmes données** : 3 marchands brésiliens (Netuno Tours, Farm Ipanema,
  Fresh E Good) tombent au CENT près sur le relevé — cohérent avec une conversion au terminal (DCC),
  donc facturés en CAD à l'origine. Le défaut suit bien la devise d'ORIGINE, pas le pays.
  ⚠️ **Aucun correctif par le contenu du payload n'est possible** : le schéma Fintable enregistré
  (`FtRawTransaction`) ne porte ni montant facturé, ni devise d'origine, ni taux. Une heuristique sur
  la `description` (« RIO DE JANEIRBRA ») est exclue — `TEXT-HEURISTIC-OVER-USER-TEXT`, et ici elle
  piloterait un MONTANT. Le seul recoupement indépendant disponible est le **SOLDE du compte**, que
  Fintable donne bien en CAD : la somme des transactions importées ne peut pas s'écarter durablement
  du mouvement de solde. C'est la piste à cadrer.
  ⚠️ **Dette de données** : les 44 transactions déjà importées sont fausses dans l'état de Marc. Il
  n'existe **aucun outil MCP** qui modifie ou supprime une transaction existante (`apply_bank_statement`
  ne fait qu'AJOUTER, avec dédup sur date+montant+marchand : ré-importer le bon montant créerait un
  DOUBLON, pas une correction). Le seul levier est `isDuplicate`, qui exclut une ligne de TOUS les
  calculs et se pose à la main dans l'écran Transactions. Procédure et décision dans `docs/A_FAIRE_MOI.md`.
  ✅ **Débloqué le 14/09 par `[TX-SELECTION-SANS-ACTION]`** : ce levier était INATTEIGNABLE pour cette
  classe (voir ci-dessous) ; il l'est désormais en quatre gestes.
  ✅ **Dette de DONNÉES réparée le 15/09** (feu vert de Marc) : **36 lignes réimportées, 1 067,03 $**
  aux montants du relevé. ⚠️ Ce n'est pas 44 ni 1 338,12 $, et l'écart est une MESURE, pas un
  arrondi : **4 originaux n'avaient jamais été exclus** (`A.saily`, `Smartcar Mountain`,
  `Duty Free New Departur`, `*BRUTTITO TERMINAL` — tous les quatre SOUS-évalués, donc invisibles à
  qui cherchait des dépenses gonflées), et les réimporter aurait compté la dépense DEUX fois ;
  **4 billets de métro** du 31/08 sont des doublons d'import confirmés par Marc (« 2 vrais achetés »).
  Reste 262,37 $ suspendus à 4 clics de Marc — procédure au bas de `docs/A_FAIRE_MOI.md`.
  ⚠️ **La dette de CODE reste entière** : le mapper importe toujours le montant en devise d'origine.
  ✅ **Volet PRÉVENTION livré le 15/09 (`[FINTABLE-CHAMPS-INCONNUS]`)** — pas le correctif du
  montant, la condition pour savoir s'il est possible : `decodeTransaction` reconstruit la
  transaction CHAMP PAR CHAMP, donc **tout ce que l'API envoie hors de `FtRawTransaction` était jeté
  sans trace** — et ce contrat a été écrit d'après la DOC, jamais d'après un payload observé.
  Personne ne pouvait donc répondre à « l'API dit-elle la devise RÉELLE quelque part ? ». Le
  snapshot publie désormais `unknownTransactionKeys` (union triée, champ REQUIS) et le rapport de
  sync le DIT, en nommant les champs. 11 gardes, 3 perturbations séparées.
  ⚠️ **Prochain pas, et il dépend d'une mesure que je ne peux pas prendre** : la doc Fintable est
  inatteignable depuis le conteneur (403 au CONNECT, `EGRESS_BLOCKED` sur `fintable.io`) et les
  pages publiques de couverture montrent **PLAID** et **FINICITY** comme providers — chez Plaid une
  transaction porte `iso_currency_code`. Si un champ de ce genre arrive, le correctif devient EXACT.
  Question posée à Marc dans `docs/A_FAIRE_MOI.md` (une commande, ou la prochaine passe de sync).
  ⚠️ **Le recoupement par le SOLDE** (seule grandeur indépendante, bien donnée en CAD) reste la
  piste de secours — mais il EXIGE `[FINTABLE-BASCULE-GLOBALE-JETTE-LE-COMPTE-LENT]` d'abord : tant
  que la bascule jette les transactions de la carte, l'écart serait permanent, donc l'alarme morte.
  ✅ **Ce prérequis est livré le 2026-09-16** — ⚠️ mais il n'est EFFECTIF pour un compte qu'une fois
  ce compte connu sous son libellé (sinon il reste sur le repli global). Avant d'écrire le
  recoupement par le solde, **vérifier que le rapport de sync ne nomme plus la carte** : sinon
  l'alarme naîtrait morte pour la même raison, une marche plus bas.
- [x] 🔧 **`[TX-SELECTION-SANS-ACTION]`** (S, **MESURÉ**) — Marc : « j'arrive pas à les marquer en
  doublon ». **Il avait raison, et ce n'était pas une maladresse.** Recensé dans le code : le SEUL
  point d'entrée vers `isDuplicate` était `DuplicatesPanel`, qui ne rend QUE les groupes trouvés par
  `findDuplicateGroups`. Une ligne au montant faux est le doublon de **rien** — donc elle ne pouvait
  apparaître dans aucun groupe, et la marque était inatteignable pour la CLASSE entière « ligne
  unique dont le montant est faux ». Le seul levier par ligne qui restait était le ⇄ « virement »
  (`toggleTransfer`), qui neutralise bien la ligne mais **étiquette une vraie dépense en virement
  interne** — et qu'il aurait fallu cliquer **44 fois**.
  ⚠️ La capacité existait déjà dans le modèle : `markTransactionsAsDuplicate` est **PUR** et accepte
  n'importe quels ids ; la sélection multiple existait déjà dans l'écran (case par ligne, plage au
  Maj-clic, « tout cocher » de la page). Il manquait le **FIL** entre les deux — variante de
  `CHAMP-DANS-LE-TYPE-INATTEIGNABLE-DANS-L-UI` appliquée à un MUTATEUR, pas à un champ. Et la
  sélection n'affichait AUCUN libellé disant ce qu'elle permettait : elle ne servait qu'à
  re-catégoriser.
  **Livré** : barre d'actions sur la sélection (« N sélectionnée(s) » · « Sélectionner les N
  filtrées » · « Exclure des calculs » · « Désélectionner »). ⚠️ « Sélectionner les N **filtrées** »
  et non « de la page » : la page fait 50 lignes et les 44 de Marc s'étalent au-delà — une sélection
  bornée à la page laisserait le cas réel hors de portée. **Fait le 14/09** (PR #964).
  ⚠️ **L'ADR 0009 §3 n'a PAS été rouverte**, et c'est le point : son repli (« le chemin sûr existant :
  marquer `isDuplicate` ») était mesurément FERMÉ pour cette classe. Le correctif ouvre le repli
  qu'elle nommait, au lieu de me donner le droit d'écrire sur une transaction existante.
- [ ] 🟡 **`[E2E-CIBLE-44-SOUS-PIXEL]`** (XS, **MESURÉ, découvert en passant sur la PR #974**) — six
  assertions E2E comparent une `boundingBox()` de Playwright à la borne WCAG **exacte** `>= 44`
  (`e2e/futureMobileProjectionScreen.spec.ts`, `e2e/futureMobileLegendDrawer.spec.ts` — recensé, pas
  cité). Or une boîte de rendu est FRACTIONNAIRE : mesuré en CI le 2026-09-16,
  **`43.99999237060547`** contre `>= 44`, soit un écart de **7,6 × 10⁻⁶ px**. Le même check était
  VERT sur le head précédent, dont l'unique écart était une ligne de `CLAUDE.md` : c'est donc une
  variance de rendu du runner, pas une régression. ⚠️ Le correctif n'est PAS de baisser l'exigence
  (44 px est une règle WCAG, et une garde qui descend sous sa règle ne garde plus rien) : c'est de
  comparer la grandeur ARRONDIE, ou d'admettre un ε explicite et commenté. ⚠️ Et il se fait sur les
  SIX sites, pas sur celui qui a rougi — les cinq autres portent le même défaut et n'ont pas encore
  eu la malchance de tomber du mauvais côté. Non corrigé dans #974 : défaut préexistant, sans rapport
  avec le lot, et le corriger aurait élargi la PR.
- [x] 🔴 **`[FINTABLE-SOLDE-CARTE-SIGNE-INVERSE]`** (S, money-critical, ✅ **CORRECTIF LIVRÉ le
  2026-09-16**) — `owed = Math.max(0, −solde)` remplace `Math.abs`, le commentaire inversé est
  corrigé, et l'avertissement de mesure est MORT (sa garde INVERSÉE au même endroit). Une carte en
  CRÉDIT ne fabrique plus de dette fantôme ; une carte à ZÉRO n'émet plus un payload que `applyDebt`
  rejette, elle DIT que la dette garde sa valeur précédente. 17 gardes, **3 perturbations aux
  signatures DISTINCTES** : `Math.abs` restauré → 1 rouge (la dette fantôme, et elle SEULE) ; montant
  interpolé → 3 rouges (producteur + les DEUX orchestrateurs, donc la chaîne est prouvée) ; zéro qui
  n'abandonne plus → 2 rouges. ⚠️ Le `surplus` n'alimente PAS encore les liquidités — c'est l'étape 2
  de `[FINTABLE-CARTE-DETTE-AUTO]`, qui bute sur `applyCashBalance` (refus d'une cible négative) :
  dit dans le code et dans le message, plutôt que fait à moitié. ⚠️ Piège commis DANS ma propre
  garde : compter les citations par sous-chaîne nue (`Dette acc_1`) comptait aussi `Dette acc_10` —
  un PRÉFIXE. Délimité par les guillemets que le message écrit lui-même
  (`UN-RECENSEUR-SE-VERIFIE-AUTANT-QUE-LE-CODE-QU-IL-RECENSE`). Contexte d'origine : — le mapper suppose « solde de carte POSITIF =
  montant dû » (`const owed = Math.abs(account.balance)`, `mapSnapshot.ts`, commenté « un solde
  négatif signifie un crédit en ta faveur »). Marc, interrogé le 2026-09-14 : sur Fintable, **devoir
  500 $ s'affiche `-500`** — soit l'inverse. Conséquences, si confirmé : (a) tu DOIS 500 $ → la dette
  est juste (`Math.abs` sauve la grandeur **par accident**) mais l'avertissement « crédit en ta
  faveur » se déclenche **à chaque passe, sur le cas NOMINAL** ; (b) tu as 200 $ EN TROP → **dette
  fantôme de 200 $, sans aucun avertissement**.
  ⚠️ **Le « patrimoine net faux de 400 $ » que ce ticket annonçait est SURESTIMÉ — mesuré le
  2026-09-16 : l'écart réparable est de 200 $, pas 400 $.** La dette inventée (200 $) se corrige
  par le signe ; la créance de 200 $ envers l'émetteur, elle, n'est représentable par AUCUNE
  convention — `applyDebt` refuse tout solde `<= 0` (`mcp/ingest/applyDocument/debt.ts:50`), donc
  l'app n'a aujourd'hui aucun canal pour une carte en crédit. Annoncer 400 $ promettait une
  réparation dont la moitié n'existe pas (classe `UN-TICKET-QUI-N-ANNONCE-QU-UN-MONTANT-NE-DIT-PAS-SA-GRAVITE`,
  vue à l'envers : ici le montant SUR-promet).
  ✅ **Étape 1 livrée** : `signeSolde` (fonction pure, 4 états — `absent` couvre le `NaN`, jamais
  rabattu sur `zéro`), `soldesDetteSignes` au rapport du mapper, et UN avertissement agrégé qui
  publie **le SIGNE, jamais le MONTANT** (le rapport est `cat`é en clair dans les journaux GitHub
  Actions, cf. PR #531). Câblé et gardé dans les DEUX orchestrateurs. **Aucun dollar ne bouge.**
  ⚠️⚠️ **La PRÉCONDITION du ticket était FAUSSE** : il annonçait la mesure « inatteignable pour Marc :
  aucune de ses cartes n'a de `debtName` (c'est tout l'objet de `[FINTABLE-CARTE-SANS-DETTE]`) ».
  Re-mesuré sur le code réel : faux depuis **PR #956** — le ticket CITÉ avait été livré deux jours
  plus tôt, et un `debtName` vide est désormais un état légitime qui laisse le compte ROUTÉ. Son
  compte atteint bien `case 'debt'` ; il en sort trois lignes plus bas. La prémisse réfutée n'a pas
  annulé le lot, elle en a fixé la seule contrainte : publier le signe **AVANT toutes les sorties du
  bloc**. Leçon `UNE-PRECONDITION-CITEE-PAR-UN-TICKET-VIEILLIT-PLUS-VITE-QUE-SON-DEFAUT`.
  ✅✅ **MESURE OBTENUE le 2026-09-16, à la première passe.** Rapport publié : « Desjardins Cash
  Back Mastercard (5020) » → **positif**. Marc, sur cette passe : **« c'est en ma faveur »**. La
  convention de Fintable est donc **`négatif = dû`, `positif = en ta faveur`** — l'hypothèse écrite
  en commentaire depuis toujours (« positif = montant DÛ ») est **RÉFUTÉE**.
  ⚠️ **Une seule observation a suffi parce que c'est la seule qui pouvait trancher** : sous
  `Math.abs`, le cas NOMINAL rend le même résultat dans les deux conventions (`|−500| = |+500|`),
  donc mille passes normales n'apprennent rien. Seule la branche RARE (carte en CRÉDIT) les sépare,
  et c'est celle qui s'est présentée. ⚠️ Portée exacte : la mesure **réfute** « positif = dû » ;
  elle est *compatible* avec « négatif = dû » sans le prouver positivement (il faudrait une passe
  où Marc doit de l'argent). Aucune décision n'attend ça — le plan de `[FINTABLE-CARTE-DETTE-AUTO]`
  étape 2 est **déjà écrit dans ce sens** (`dû = max(0, −solde)`) : la mesure le CONFIRME au lieu
  de le casser, et une mesure qui confirme se publie autant qu'une réfutation.
  ✅ **Aucun dollar n'est faux aujourd'hui** : aucune dette n'est associée à cette carte (rapport :
  « Dettes mises à jour : aucune »), donc la dette fantôme de 200 $ n'a **jamais été écrite**.
  ⏸️ **Reste, et c'est un lot de CODE money-critical (plan + GO de Marc)** : (a) `owed` dérivé du
  SIGNE et non de `Math.abs` ; (b) le **commentaire de `mapSnapshot.ts:271-273` est FAUX** (« un
  solde négatif signifie un crédit en ta faveur ») — un commentaire inversé dans du money-critical
  est un piège pour la prochaine session ; (c) l'avertissement de mesure doit **cesser** (il a fait
  son travail ; permanent, il deviendrait mort) et le garde-fou `signeSoldeDette.test.ts` porte sa
  consigne de RETRAIT, à INVERSER et non à supprimer (`UN-INVENTAIRE-DE-DETTE-DOIT-SAVOIR-MOURIR`).
- [ ] 🟠 **`[FINTABLE-RAPPORT-EN-CLAIR-DANS-UN-JOURNAL-PUBLIC]`** (M, vie privée, **DÉCOUVERT au
  panel de la PR #975, préexistant — NON corrigé dans ce lot**) — `.github/workflows/fintable-sync.yml`
  fait `cat /tmp/fintable_sync_out`, donc le corps JSON complet de `/fintable-sync`
  (`{ ok: true, report }`) atterrit en clair dans les journaux GitHub Actions d'un dépôt **PUBLIC**.
  Le commentaire du workflow juste au-dessus affirme « peut contenir des COMPTEURS … mais **jamais de
  montant ni de libellé** » : **vérifié, c'est FAUX**, et ça l'était avant ce lot —
  `cashAnchorDelta` est un montant, `debtsUpdated` des noms de dettes, `comptesSansPositions[].label`
  des libellés, et 15 sites de `mapSnapshot.ts` interpolent `account.label`/`role.debtName` dans les
  avertissements ; un payload de dette rejeté pousse même `formatCAD(...)` dans `warnings`
  (`applyDocument/debt.ts:110-112` → `syncCore.ts:221`). Le commentaire est donc un **alibi** : il
  fait croire à une garantie qui n'existe pas. ⚠️ Même surface côté app : `SystemView.tsx:348` rend
  `report.warnings` **sans gate de mode discret** (classe `DECISION-PRIVACY-UNE-SEULE-SORTIE`).
  ⚠️ Ce lot-ci retient délibérément le montant du solde, mais rend la publication du LIBELLÉ de
  chaque carte **quotidienne et inconditionnelle** — il n'ouvre pas la classe, il l'alimente.
  **Deux moitiés distinctes** : (a) corriger le commentaire mensonger et décider ce que le workflow
  a le droit de `cat`er ; (b) passer `report.warnings` au mode discret dans `SystemView`.
- [ ] 🟡 **`[FINTABLE-CARTE-SOLDEE-GARDE-LA-DETTE-D-HIER]`** (S, money-critical, **MOITIÉ VISIBLE
  LIVRÉE le 2026-09-16 — reste la moitié qui CORRIGE**) ✅ Le mapper n'émet plus le payload voué au
  rejet : il s'abstient et **DIT** que la dette garde sa valeur précédente, en nommant le compte. Un
  « Payload non appliqué » cryptique sur un état parfaitement NORMAL est remplacé par une phrase
  vraie. ⏸️ **Reste le vrai correctif** : ramener la dette à zéro exige un canal que l'app n'a pas
  (`applyDebt` refuse `<= 0`) — c'est une décision produit, pas un oubli. Contexte d'origine : — une carte **remboursée à zéro** donne `owed = 0`, or `applyDebt`
  refuse tout solde `<= 0` (`mcp/ingest/applyDocument/debt.ts:50`) et **rejette le payload** : la
  dette garde donc la valeur de la veille, et le patrimoine net porte une dette déjà payée jusqu'au
  prochain solde non nul. Pas silencieux (`syncCore.ts:221` pousse un avertissement), mais faux.
  ⚠️ C'est exactement la branche que `signeSolde` étiquette `'zéro'` : si la mesure de
  `[FINTABLE-SOLDE-CARTE-SIGNE-INVERSE]` rapporte `'zéro'`, l'étape 2 doit savoir que ce chemin ne
  met déjà **rien** à jour. ⚠️ Même refus (`<= 0`) : l'app n'a **aucun canal** pour une carte en
  CRÉDIT — c'est ce qui borne à 200 $ (et non 400 $) l'écart réparable du ticket ci-dessus.
- [ ] 🧭 **`[FINTABLE-CARTE-DETTE-AUTO]`** (M, **PLAN POSÉ ET CONFIRMÉ PAR LA MESURE du 2026-09-16
  — EN ATTENTE DU GO DE MARC**) ⚠️ Le plan ci-dessous suppose `négatif = dû` : c'est **exactement ce
  que la mesure a établi** (cf. `[FINTABLE-SOLDE-CARTE-SIGNE-INVERSE]`). Rien à recadrer. — la carte de
  crédit n'est pas une dette : c'est un **solde à DEUX SENS**. Marc, 2026-09-14 : « parfois mon crédit
  fait que j'ai de l'argent en plus et parfois de l'argent en moins », et il a choisi que le surplus
  **compte comme des liquidités** (et non une dette à 0 $, que je recommandais) — choix assumé, le plus
  exact et le plus coûteux : il fait de la carte un compte à solde SIGNÉ dont les deux moitiés vont dans
  deux registres. Plan en trois étapes dans `docs/A_FAIRE_MOI.md` : (1) MESURER le signe sans rien
  déplacer (cf. ticket ci-dessus) ; (2) `dû = max(0, −solde)` → dette, `surplus = max(0, +solde)` →
  cible de liquidités, les deux **mutuellement exclusifs** et remis à zéro ensemble à chaque bascule
  (`PARTAGER-LE-MONTANT-PAS-SES-REFLETS` : deux registres oubliés avaient coûté 75 957 $) ; (3) la
  création automatique. ⚠️ **Obstacle mesuré sur l'étape 2** : `applyCashBalance` **refuse** une cible
  de liquidités négative (`targetCad < 0` → `throw`), ce qui **rejette le payload entier** — la cible
  reste positive tant que le compte chèque domine, mais c'est une condition à écrire dans un test, pas
  une garantie. ⚠️ **Il manque encore UN chiffre** : le paiement minimum, qu'`applyDebt` exige pour
  CRÉER une dette et dont **aucun défaut n'existe dans le dépôt** (`debtAmortization` exige `> 0`) ; le
  taux est déjà tranché (19,99 %).
- [x] 🔴 **`[FX-OBSERVATION-COHORTE]`** (M, money-critical, ✅ **LIVRÉ le 2026-09-17**) — la cause
  RACINE de `[FX-TAUX-JAMAIS-ARRIVES]`, trouvée par une mesure de Marc (il a ouvert l'URL de l'API
  et envoyé la réponse). `services/finance.ts` lisait `data.observations[0]` ; sur un **groupe**,
  `recent=1` rend la dernière observation de **chaque série**, groupée par COHORTE — la réponse
  réelle du 2026-09-16 commence par `{ d: "2019-12-31", FXVNDCAD: … }` (dong vietnamien, série
  abandonnée), et `FXUSDCAD`/`FXEURCAD` vivaient dans l'entrée SUIVANTE. Les deux replis tiraient
  donc ENSEMBLE, à chaque lecture, depuis toujours. **Mesuré** : USD 1,4000 (repli) contre **1,3947**
  réel = −0,38 % ; EUR 1,4700 contre **1,6073** = **+9,34 %**, soit **+5 426 $** sur la seule
  position GBS.PA de Marc — et ses 12 positions sont toutes en USD ou EUR.
  **Livré** : `services/fx/observationsBdc.ts` (pur, partagé navigateur + MCP) choisit l'observation
  **par SÉRIE** et la plus récente ; refus d'une observation de plus de **10 jours** (seuil DÉRIVÉ —
  **5 j** de fermeture légitime au maximum, contre 140 j et 2 452 j pour les séries abandonnées de la
  vraie réponse) ; cause `'perimee'` distincte de `'partiel'` ; et **la date de l'observation
  publiée à l'écran**, tenue cohérente avec la provenance PAR CONSTRUCTION dans `updateFxRates`.
  ⚠️ Les trois fixtures FX du dépôt étaient écrites à la main et encodaient la forme supposée : la
  garde part désormais de la réponse RÉELLE (`tests/fixtures/bdcFxRatesDaily.json`).
- [x] 🔴 **`[HUB-TOTAL-AMPUTE]`** (M, money-critical) — livré le 2026-09-17. Marc : « corrige sur
  hubperso, j'ai pas le même montant que dans l'onglet Futur, et c'est pareil pas équivalent à ce
  que j'ai sur Fintable ». `buildMarketData` laisse tomber (`continue`) un titre DÉTENU dont la
  queue de chandelles est périmée de plus de 7 j sans quote fraîche : le `TOTAL` reste fini et
  plausible, simplement AMPUTÉ, et aucun des trois refus de `computePortfolioSessionMetrics` ne le
  voyait (ils jugent la fraîcheur et le figement, jamais le PÉRIMÈTRE).
  📏 **Mesuré sur l'état réel** : hubperso publiait **217 767 $** quand la somme des titres valait
  **245 687 $** — **−27 920 $ (−11,4 %)** —, sur la MÊME carte qu'une valeur nette qui, elle, les
  comptait (227 388 − 28 870 + 47 169 = 245 687). Et « Variation 7 jours **+38,2 %** » : un titre
  absent de la borne passée et présent à la borne récente, lu comme un gain de 60 229 $.
  ✅ `omittedKeys` (`[date, symbole]`, peuplé à TOUTE date — `staleTailSymbols` ne couvre que
  `lastAxisDate`, donc jamais la borne passée d'une variation) + **refus 4** : séance amputée → on
  ne publie rien ; borne amputée → variation refusée. Trois gardes, deux perturbations séparées
  (1 rouge chacune, le bon).
  ⚠️ **Conséquence visible** : tant qu'un titre manque, la carte du hub perd ses trois lignes de
  placements. C'est l'arbitrage des trois autres refus — on publie MOINS, jamais autre chose.
- [x] 🟠 **`[DETTE-INVISIBLE-INFOBULLE]`** (S) — livré le 2026-09-17, signalé par Marc. La
  répartition « Par compte » de l'infobulle Futur ne listait que des comptes POSITIFS : 260 898 $
  d'actifs affichés pour 214 918 $ de valeur nette, et aucune ligne pour les 45 980 $ d'écart (son
  bail auto). ✅ Ligne « Dettes (hors hypothèque) » signée, conditionnelle ; dérivation extraite du
  « Détail complet » et PARTAGÉE (`detteReductrice`), par soustraction `Σ actifs − NetWorth` et non
  depuis `DettesNonImmo` (pas publié sur toutes les courbes). 3 gardes dont 2 contrôles négatifs.
- [x] 🟠 **`[HUB-SPARKLINE-VARIATION-DE-VARIATION]`** ✅ Livré le 2026-09-17. Mesuré en LISANT le dépôt Hubperso : le hub dérive l'évolution 7 j de la VALEUR de chaque métrique, et indexe l'historique par le LIBELLÉ. D'où DEUX défauts, tous deux de notre côté — un libellé daté (`Placements (16 sept.)`) remettait la série à zéro chaque séance (« pas encore d'historique » à perpétuité sous une valeur publiée), et publier une variation comme métrique donnait « −430,6 % sur 7 j ». Libellé stabilisé, variations déplacées dans `details` (rendu sans série dérivée). Le ticket d'origine disait — les
  sparklines de la carte hub affichent **« −430,6 % sur 7 j »** sous « Variation de la séance » et
  **« −908,4 % sur 7 j »** sous « Variation 7 jours ». Ce sont des variations **d'une variation** :
  une grandeur qui change de SIGNE n'a pas de pourcentage d'évolution qui veuille dire quelque chose
  (diviser par une base proche de zéro, ou négative, produit ces nombres). Même famille que
  `UN-CHIFFRE-JUSTE-PEUT-ETRE-ILLISIBLE` : le chiffre n'est pas faux, il est **inexploitable**.
  ⚠️ Recenser d'abord QUELLES métriques sont des variations (donc sans % d'évolution légitime) et
  lesquelles sont des NIVEAUX (où le % a un sens) — la correction est probablement de ne pas publier
  de `trend` pour les premières, pas de borner l'affichage. ⚠️ La même carte affiche « pas encore
  d'historique » sous Placements **tout en publiant une valeur** : à trancher dans le même lot.

- [ ] 🟡 **`[DEBT-CADENCE-FUTUR-MENSUEL]`** (XS, noté 2026-09-17) — `[DEBT-CADENCE-REELLE]` fait
  descendre la dette au JOUR du prélèvement dans le PASSÉ ; la boucle du FUTUR, elle, paie une fois
  par mois (`effectiveMinimum`). Sans conséquence sur la courbe (le futur est mensuel de bout en
  bout) et aucun dollar ne bouge — mais l'asymétrie est ÉCRITE ici plutôt que découverte plus tard.
  ⚠️ Ne PAS « corriger » sans mesurer : passer le futur au jour multiplierait par ~30 le coût de la
  boucle pour un gain d'affichage nul.

- [ ] 🔴 **`[FINTABLE-AUTORITE-PARTOUT]`** (L, money-critical, **DEMANDE MARC 2026-09-17**) —
  « je veux que toutes les valeurs soient cohérentes de partout entre elles et que ce soit la valeur
  Fintable, car la plus fiable ». Aujourd'hui QUATRE producteurs répondent à « combien valent mes
  placements ? » (mesuré : Accueil 245 687 $ · Fintable réel 242 287 $ · Futur mois 0 231 849 $ ·
  hub 217 767 $), et un seul consulte Fintable (`appliquerAutoriteCourtier`, uniquement le mois 0).
  **Réponses de cadrage de Marc** : total incomplet → *« si trop gros écart, marquer qu'il y a une
  erreur d'import ; si pas trop long, dernière valeur Fintable affichée »* ; variations → *« garder
  l'historique nous »*.
  - [x] **Étape 0 — PRÉREQUIS.** ✅ Livré le 2026-09-17. Le montant NATIF (`amountNative` +
    `currency`) est désormais persisté à côté de son reflet converti, et la lecture
    (`relireSoldeCourtier`) reconvertit **au taux du jour**. Un compte écarté faute de taux à la
    synchro redevient convertible dès que le vrai taux est connu, sans attendre la synchro suivante.
    ⚠️ L'ORDRE DES BRANCHES EST LE CORRECTIF : le montant natif gagne sur un `missingRate` PERSISTÉ,
    qui décrit ce qu'on savait à la synchro et non ce qu'on sait maintenant ; le tester d'abord
    aurait rendu la reconversion inatteignable dans le cas exact qui l'a motivée. ⚠️ `estimated` est
    dérivé de `fxFaitAutorite` (source unique) et non du booléen `fxRatesEstimated` : lire le booléen
    aurait refusé les taux SAISIS À LA MAIN par Marc, c'est-à-dire le recours prévu quand la Banque
    du Canada ne répond pas. ⚠️ Deux tests de LIMITE inversés au même endroit avec leur histoire.
    Recoupe `[FX-CARTE-ECART-DIRE-LA-RESYNCHRO]`, qui devient sans objet pour le CALCUL (reste la
    phrase à l'écran).
  - [ ] **Étape 1 — source unique.** Un module qui rend la **dernière valeur Fintable connue** —
    lue dans `fintableBrokerHistory` (déjà produit, daté, par compte et par jour, 730 j de rétention,
    branché sur les DEUX chemins de synchro), **jamais l'instantané écrasé** — avec sa DATE et son
    ÉCART contre la somme des titres. ⚠️ Le producteur existe et son en-tête dit lui-même « ce lot ne
    change rien aujourd'hui » : c'est le CONSOMMATEUR qui manque, et c'est exactement la demande.
  - [ ] **Étape 2 — les deux garde-fous demandés.** (a) *« pas trop long »* → **48 h**, DÉRIVÉ : le
    cron Fintable tourne tous les jours à 10 h UTC (`.github/workflows/fintable-sync.yml`), donc
    au-delà de 48 h la synchro a échoué au moins deux fois. (b) *« trop gros écart → erreur
    d'import »* → seuil **À MESURER AVANT D'ÊTRE ÉCRIT** : une seule observation (1,4 %, 3 400 $ le
    2026-09-17) n'est pas une distribution. Le dériver de la volatilité quotidienne réelle du
    portefeuille de Marc, calculable depuis sa propre reconstruction — un seuil au jugé crierait un
    jour de marché agité, ou jamais (`UN-SEUIL-ECRIT-AVANT-SA-MESURE-EST-UN-CHIFFRE-INVENTE`).
  - [x] **Étape 3 — brancher** ✅ Livré le 2026-09-17, sur la forme CORRIGÉE (partager la DÉCISION,
    jamais la BASE). `decideRegimesRepris` extraite et partagée ; `placementsFaisantAutorite`
    l'applique à la base de l'ÉCRAN ; `jumeauxPorteursDepuisActifs` rend le refus `famille-mixte`
    atteignable des deux côtés. Branché sur `computeInvestmentsValue`/`computeGrossAssets`/
    `computePresentNetWorth` (paramètre REQUIS, 19 sites énumérés par le compilateur). La vue
    d'ensemble se recompose : valeur nette = liquidités + placements − dettes.
    ⚠️ Reste de l'ancienne rédaction, conservée parce qu'elle explique POURQUOI la forme a changé :
  - [ ] ~~**Étape 3 (rédaction d'origine)** — brancher~~ Accueil/Investissements, valeur nette, hub et MCP sur cette source
    unique. Le mois 0 du Futur y est déjà : ne pas créer une SECONDE règle à côté.
    **CONCEPTION RÉSOLUE le 2026-09-17, à implémenter telle quelle :**
    - Le point d'injection est `computeInvestmentsValue` (`services/portfolio.ts`), et c'est une
      BONNE nouvelle : `computePresentNetWorth`, `computeGrossAssets` et `buildFinancialOverview`
      l'appellent tous les trois. Les brancher déplace donc le chiffre « Investissements » ET la
      valeur nette **ensemble** — sans recréer la contradiction interne à la carte du hub qui a
      ouvert cette session.
    - **La formule est une identité, pas une nouvelle règle** : `placements_autorité =
      Σ titres + écart_appliqué`. En effet `écart = Σ(total courtier − titres)` sur les seuls
      paniers repris, donc `Σ titres + écart = titres_des_paniers_NON_repris + courtier_des_repris`.
      C'est exactement ce que le mois 0 calcule déjà.
    - ⚠️ **Prendre l'écart de `appliquerAutoriteCourtier` (`ecartTotal`), JAMAIS `reco.totalGapCad`.**
      Les deux se ressemblent et diffèrent : `appliquerAutoriteCourtier` REFUSE certains paniers
      (`famille-mixte`, `total-partiel`…). Utiliser le second donnerait deux réponses à une seule
      question — l'écran et le moteur divergeraient, ce que le commentaire de `buildSimulationParams`
      interdit en toutes lettres.
    - ⚠️ **OBSTACLE À TRANCHER AVANT DE CODER** : `appliquerAutoriteCourtier` a besoin des soldes
      PAR PANIER, produits par `derivePortfolioStartingBalances` — qui vit dans
      `services/projection/buildSimulationParams.ts`. L'importer depuis `financialSnapshot.ts`
      tirerait le constructeur de paramètres de projection dans le chemin de l'ACCUEIL, donc dans le
      bundle de boot (règle §2 du `CLAUDE.md`). Deux issues : (a) extraire
      `derivePortfolioStartingBalances` dans son propre petit module et le ré-exporter pour
      compatibilité ; (b) mesurer le coût réel avant de décider. **Ne pas trancher ça à la va-vite :
      c'est un arbitrage de frontière de bundle, pas un détail d'import.**
    - ⚠️ `holdingsCadByRegime` n'est PAS un substitut : il replie CELIAPP sur CELI et REEE sur REER,
      alors que les soldes de départ les gardent séparés — asymétrie déjà connue et routée.
    - ⚠️⚠️ **CORRECTION DE LA CONCEPTION, 2026-09-17 (après le merge de la PR #981) : la formule
      « Σ titres + écart_moteur » est SUBTILEMENT FAUSSE, et elle l'est exactement là où ce ticket
      fait mal.** `écart_moteur` est mesuré sur la base du MOTEUR (`derivePortfolioStartingBalances`,
      détention DATÉE via `holdingsAt`) ; `Σ titres` est la base de l'ACCUEIL (`computeInvestmentsValue`,
      `a.quantity` courante). Additionner l'un à l'autre n'est une identité que si les deux bases
      coïncident — la seule hypothèse que personne n'a mesurée. Dès qu'un titre a un `quantity`
      désynchronisé de la somme de ses achats, l'écart importe la divergence dans le chiffre de
      l'Accueil, en silence et sans rien de non fini.
    - ✅ **LA FORME JUSTE : partager la DÉCISION, jamais la BASE.** `appliquerAutoriteCourtier` fait
      DEUX choses qu'on confond parce qu'elles sortent de la même fonction : (1) elle DÉCIDE quels
      paniers sont repris (`regimesAppliques` / `regimesRefuses`), (2) elle CALCULE un écart sur la
      base qu'on lui a donnée. Seule la (1) doit être unique. L'Accueil doit donc faire
      `Σ titres + Σ_{régime ∈ regimesAppliques} (brokerTotalCad[régime] − holdingsCadByRegime[régime])`,
      c'est-à-dire appliquer la MÊME liste de paniers à sa PROPRE base. Un panier repris vaut alors
      exactement le total du courtier des deux côtés — donc l'écran et le moteur ne peuvent plus
      diverger sur un panier repris —, et un panier refusé garde de chaque côté la base que son écran
      affiche déjà. Variante de `AVANT-D-UNIFIER-N-COPIES-SEPARER-CE-QUI-EST-PARTAGE-DE-CE-QUI-NE-L-EST-PAS`
      (la vitesse se partage, l'ancre non).
    - ⚠️⚠️ **Et c'est ce qui CONDAMNE l'option (b) ci-dessous, par une raison plus forte que « deux
      règles » : sur la base de l'Accueil, le refus `famille-mixte` est STRUCTURELLEMENT
      INATTEIGNABLE.** `holdingsCadByRegime` dérive de `BUCKET_OF`, qui replie CELIAPP→`TOTAL_CELI`
      et REEE→`TOTAL_REER` ; les jumeaux n'existent donc jamais comme entrées séparées, et le test
      `Number(sortie['CELIAPP'] ?? 0) !== 0` est faux par construction. Ré-appliquer l'autorité sur
      cette base ferait donc APPLIQUER à l'écran un panier que le moteur REFUSE — le double comptage
      du CELIAPP (mesuré 91 500 $ pour 66 500 $ réels) réintroduit sur l'Accueil, pendant que le
      moteur, lui, refuse correctement. Une garde qui ne peut pas TIRER, au sens exact de
      `UNE-GARDE-QUI-NE-PEUT-PAS-TIRER-N-EST-PAS-UNE-PROTECTION` — à prouver par perturbation avant
      de livrer.
    - ✅ **Les DEUX obstacles bloquants sont LEVÉS** (PR #981, `b7634f46`) : (a) le bundle —
      `derivePortfolioStartingBalances` vit désormais dans `services/projection/startingBalancesFromAssets.ts`
      (dépendances légères, ré-exporté depuis `buildSimulationParams` pour compatibilité) ;
      (b) l'ordonnancement — `[FUTUR-MOIS0-CLOTURE-SANS-AGE]` est corrigé, donc la reconstruction et
      les prix courants ne diffèrent plus par une clôture périmée.
    - 📏 **LA MESURE QUI RESTE, et elle est maintenant FACILE** : le correctif du mois 0 ayant aligné
      les PRIX, tout écart résiduel entre `computeInvestmentsValue(assets, fx)` et
      `Σ derivePortfolioStartingBalances(assets, fx)` est **exactement** la divergence de QUANTITÉ
      (`a.quantity` contre la somme des achats). À mesurer sur l'état RÉEL de Marc avant de livrer —
      pas sur une fixture, qui aura toujours les deux en phase. Point de repère du 2026-09-17 :
      `get_holdings` rend **245 687 $**, 12 positions, **100 % NON-ENREG** (aucun CELI, aucun crypto)
      — donc sur SON état le refus `famille-mixte` n'est pas atteignable non plus, et la mesure porte
      sur un seul panier.
    - ⚠️⚠️ **OBSTACLE D'ORDONNANCEMENT, trouvé le 2026-09-17 en câblant : cette étape DÉPEND de
      `[FUTUR-MOIS0-CLOTURE-SANS-AGE]`.** `appliquerAutoriteCourtier` s'applique aux soldes issus de
      la RECONSTRUCTION (derniers closes datés, sans borne d'âge), alors que l'Accueil affiche
      `computeInvestmentsValue` (prix COURANTS). Les deux bases diffèrent de **13 838 $** sur l'état
      réel. Conséquence : brancher l'Accueil sur la sortie de l'autorité ferait TOMBER son chiffre de
      245 687 $ à ~231 849 $ partout où Fintable ne s'applique pas — on importerait le défaut des
      clôtures périmées sur l'écran d'accueil pour régler un problème de cohérence. **Le gain de
      cohérence coûterait une régression de justesse.**
      Deux ordres possibles, à trancher : (a) corriger d'abord `[FUTUR-MOIS0-CLOTURE-SANS-AGE]` pour
      que la reconstruction et les prix courants coïncident, puis brancher — ordre PRÉFÉRÉ, une seule
      base ensuite ; (b) faire porter l'autorité sur `holdingsCadByRegime` (base prix courants), ce
      qui oblige à réimplémenter les REFUS de `appliquerAutoriteCourtier` sur cette base — donc deux
      règles pour une question, ce que le reste de ce ticket interdit.
    - 📏 **Périmètre RECENSÉ (mesuré, pas estimé)** : « partout » vaut **4 sites** —
      `services/financialSnapshot.ts` (×2 : patrimoine net et `investments`, donc Accueil + hub +
      MCP), `utils/useDerivedFinancials.ts` (écrans de l'app), `utils/healthScore.ts`.
      ⚠️ `healthScore` ne reçoit que `(assets, fxRates)`, pas l'état : le brancher élargirait sa
      signature. Comme il produit un SCORE et non un montant que Marc compare, il peut rester sur la
      somme des titres — mais il faut l'ÉCRIRE, sinon c'est une incohérence de plus, silencieuse.
  - [ ] **Étape 4 — variations** (séance, 7 j, 30 j) : elles restent calculées sur NOTRE
    reconstruction (Fintable n'a aucun historique), avec leur base NOMMÉE à l'écran — sinon deux
    chiffres voisins ne se recomposent pas et rien ne le dit.
  - ⚠️ **Contrainte de source, irréductible** : Fintable rend le TOTAL d'un compte, jamais ses
    positions. La liste des titres continuera de sommer à autre chose ; l'écart s'AFFICHE, jamais ne
    se lisse — lisser fabriquerait un portefeuille que Marc n'a pas.
  - ⚠️ **Le passé reste reconstruit** à partir des titres (aucun historique Fintable avant le
    2026-09-16) : la marche au raccord est déjà nommée par `mentionAutoriteCourtier`.
- [x] 🟡 **`[HUB-REFUS-4-SANS-DIAGNOSTIC]`** ✅ LIVRÉ le 2026-09-17 (demande Marc). Le refus porte
  désormais sa CAUSE : `computePortfolioSessionMetrics` rendait `null` pour CINQ situations, donc le
  hub ne pouvait rien dire d'autre que rien (`UN-SERVICE-QUI-REND-LA-MEME-VALEUR-POUR-N-SITUATIONS-REND-SON-ECRAN-MUET`).
  Union `ok`/`refus` + section « Pourquoi les placements manquent » qui NOMME les titres écartés.
  ⚠️ On publie le fait et les symboles, jamais un montant — s'il y avait un montant digne de foi, il
  n'y aurait pas de refus. ⚠️ `inventaire-illisible` reste sans test, et c'est ÉCRIT : la branche est
  structurellement inatteignable de l'extérieur (les clés sont fabriquées par `encodeOmittedKey`) —
  un filet pour un futur changement de format, pas une fixture absurde. ⚠️ Contrôle négatif : quand
  les placements sortent, la section n'existe PAS.
- [ ] 🟡 ~~`[HUB-REFUS-4-SANS-DIAGNOSTIC]`~~ *(entrée d'origine, conservée pour l'historique)* (XS, **DÉCOUVERT au panel du 2026-09-17**) — quand le
  refus 4 s'active, la carte du hub perd ses trois lignes de placements sans dire QUEL titre est en
  cause ni depuis quand. L'app le dit déjà (`HistoryCoverageNote` depuis `staleTailSymbols`), le hub
  non. Piste : publier le ou les symboles responsables dans `details`, le champ qui porte déjà la
  fraîcheur décomposée. Un silence actionnable vaut mieux qu'un silence mystérieux.
- [ ] 🟡 **`[HIST-CREUX-EN-MILIEU-DE-SERIE]`** (S, **DÉCOUVERT au panel du 2026-09-17**) — les graphes
  « Performance comparée » et « Évolution détaillée » peuvent afficher un CREUX à une date
  intermédiaire (trou > 7 j dans l'historique d'un titre au milieu de la série), que l'utilisateur
  lit comme une vraie baisse de marché. `omittedKeys` est désormais exposé par `usePortfolioHistory`,
  mais `HistoryCoverageNote` ne liste que les symboles en QUEUE — jamais les dates amputées en
  milieu de série. Correctif : une note jumelle qui nomme ces dates.
- [x] 🟠 **`[FUTUR-MOIS0-CLOTURE-SANS-AGE]`** ✅ LIVRÉ le 2026-09-17, dans la version ÉTROITE
  (dernier point seulement — le remède large aurait réécrit le passé au prix du jour, cf. plus bas).
  La fraîcheur de la cotation est VÉRIFIÉE (`priceUpdatedAt`, transmis par les DEUX mappers), et un
  prix substitué ne compte plus comme « vrai prix » : `coverage` baisse, donc l'avertissement
  « partiellement estimé » peut enfin tirer. ⚠️ La péremption se mesure contre AUJOURD'HUI, jamais
  contre `t` (le dernier `t` est la FIN du mois courant, donc jusqu'à ~30 j dans le futur — jugé
  depuis lui, un close d'hier paraissait périmé). Attrapé par un contrôle négatif. ⚠️ **Aucun golden
  n'a bougé, et c'est EXPLIQUÉ** : mesuré, aucun persona ni fixture du dépôt ne porte
  `priceUpdatedAt` — zéro rouge mesure l'absence de COUVERTURE, pas l'absence d'effet. D'où une
  garde qui TRAVERSE jusqu'au mois 0. Détail historique ci-dessous.
- [ ] 🟠 ~~`[FUTUR-MOIS0-CLOTURE-SANS-AGE]`~~ *(entrée d'origine, conservée pour son historique)* (M, money-critical, **MESURÉ le 2026-09-17**) — le
  mois 0 de la projection (`reconstructPortfolioHistory` → `deriveStartingBalancesFromHistory` →
  `liveCSVBalances`) appelle `priceAt(a, t)` **sans `maxStaleDays`**, là où `buildMarketData` passe
  **7**. C'est le seul écran du dépôt qui accepte une clôture d'un âge QUELCONQUE comme valeur du
  jour, et il ne retombe sur `currentPrice` que si le titre n'a AUCUN historique. Mesuré sur l'état
  ⚠️⚠️ **Enrichi par le panel du 2026-09-17** : le défaut n'est pas seulement le prix périmé, c'est
  que **rien ne le signale**. `priceAt` sans borne rend `histPrice !== null` même pour un close
  vieux de plusieurs années, donc cette valeur compte dans `valueWithRealPrice` et **`coverage`
  reste ≈ 1,0** — l'avertissement « partiellement estimé aux prix actuels » (affiché sous
  `coverage < 0,99`) ne tire JAMAIS. Le cas RARE (aucun historique) est couvert, le cas COURANT (flux
  de prix interrompu) est traité comme sain. Même défaut dans `reconstructPortfolioHistoryDaily`,
  qui alimente le patrimoine net du PASSÉ à l'écran.
  réel : Futur au 17/09 = **231 849 $** de placements contre **245 687 $** de titres au prix live,
  soit **−13 838 $ (−5,6 %)** au point de départ de toute la projection. ⚠️ Le correctif re-basera
  des goldens (il déplace le mois 0) : plan-first. ⚠️ Et il faut décider ce que devient un titre
  périmé SANS quote fraîche — l'omettre au mois 0 rejouerait `[HUB-TOTAL-AMPUTE]` un cran plus bas.
  ⚠️⚠️ **LE REMÈDE ÉVIDENT EST FAUX POUR LE PASSÉ PROFOND — mesuré le 2026-09-17 EN LE CÂBLANT.**
  Borner la péremption à TOUTE date ferait retomber un titre à l'historique interrompu sur son
  `currentPrice`, c'est-à-dire appliquer le prix D'AUJOURD'HUI à une date PASSÉE : la courbe du passé
  serait réécrite au prix du jour. Pour une date passée, le dernier close connu EST la meilleure
  estimation — le report indéfini y est JUSTE. Le défaut est donc plus ÉTROIT que ce ticket ne le
  disait : il porte sur le **DERNIER point** (celui qui sert de mois 0), où un close périmé est
  préféré à une cotation FRAÎCHE qui existe. C'est là, et seulement là, qu'il faut préférer
  `currentPrice` — en faisant baisser `coverage` en conséquence, pour que l'avertissement
  « partiellement estimé » puisse enfin tirer.
  ⚠️ Et deux philosophies de péremption coexistent dans le dépôt : `buildMarketData` borne à toutes
  les dates ET OMET au-delà ; la reconstruction reporte indéfiniment. Les aligner est une DÉCISION
  (`AVANT-D-UNIFIER-N-COPIES-SEPARER-CE-QUI-EST-PARTAGE-DE-CE-QUI-NE-L-EST-PAS`), pas un nettoyage.
- [ ] 🟠 **`[FX-AUTORITE-SANS-FRAICHEUR]`** (M, money-critical, **DÉCOUVERT au panel du 2026-09-17**)
  — `fxFaitAutorite(source)` ne lit QUE la provenance : ni `fxRates.lastFetched`, ni
  `fxObservationDate`. Le lot `[FX-OBSERVATION-COHORTE]` vient d'inventer la notion « trop vieux
  pour être le taux du jour » et ne l'applique qu'à la lecture ENTRANTE. Or `decisionEcritureFx`
  garantit qu'un état `'api'` persisté n'est jamais remplacé par une lecture sans autorité : si le
  réseau reste coupé des semaines, le taux d'origine garde **indéfiniment** le droit d'écrire le
  mois 0 de la projection, badge vert compris. ⚠️ **Et le seuil actuel porte DEUX questions** :
  « cette série est-elle morte ? » (10 j y répondent : VND 2 452 j, RUB/SAR 140 j) et « ce taux
  peut-il écrire un total de 231 882 $ ? » — à laquelle 10 j ne répondent pas, USD/CAD bougeant
  couramment de 1 à 2 % sur dix jours (ordre de grandeur 1 000–2 000 $ sur 72 040 USD). Piste :
  `fxFaitAutorite` prend l'ÉTAT et non la seule `source`, avec un `AGE_MAX_POUR_AUTORITE` distinct
  et DÉRIVÉ d'une volatilité mesurée — jamais deviné. ⚠️ La limite est écrite dans
  `services/fx/observationsBdc.ts` plutôt que laissée à découvrir.
- [ ] 🟡 **`[FX-CACHE-CORROMPU-MUET]`** (XS, **DÉCOUVERT au panel du 2026-09-17**) — dans
  `services/finance.ts`, un `fx_rates_cache` corrompu lu DANS la fenêtre de 24 h tombe dans un
  `catch { }` sans trace, alors que la branche JUMELLE du même fichier (le dernier recours)
  journalise exactement la même corruption. Une corruption RÉCURRENTE de cette clé reste donc
  invisible tant que le fetch réseau réussit ensuite — c'est-à-dire le cas normal
  (`PATRON-APPLIQUE-A-COTE-MAIS-PAS-ICI`). Correctif : le même `logError` qu'à la ligne jumelle.
  ⚠️ Préexistant au lot, signalé et NON corrigé : hors du périmètre demandé.
- [ ] 🟡 **`[FX-CARTE-ECART-DIRE-LA-RESYNCHRO]`** (XS, **DÉCOUVERT au panel du 2026-09-17**) — la
  conversion du solde courtier est faite **au moment de la synchro Fintable** et persistée telle
  quelle (`toPersistableBrokerBalances`). Donc un compte en devise étrangère écarté « faute de
  taux » le RESTE, avec son écart affiché, jusqu'à la prochaine synchro — même une fois les vrais
  taux obtenus. Rien à l'écran ne le dit. Correctif : une phrase dans `BrokerReconciliationCard`
  là où l'écart est affiché. Aucun changement de calcul.
- [ ] 🟡 **`[FX-PLACEHOLDER-PROPOSE-LE-REPLI]`** (XS, **DÉCOUVERT le 2026-09-17**) — le champ de
  saisie manuelle de `FxRatesCard` affiche en `placeholder` la valeur COURANTE, donc **exactement
  `1.4000` / `1.4700`** quand le taux vient du repli — c'est-à-dire précisément la situation où la
  saisie sert. Les retaper blanchirait le littéral du dépôt en taux `'manuel'`, qui a le droit
  d'écrire un total de compte (`fxFaitAutorite`). ⚠️ **Rien n'est cassé aujourd'hui** : les champs
  sont vides et `lireTauxSaisi('')` refuse, donc il faut un geste délibéré. Mais un écran qui propose
  en exemple la valeur dont il faut sortir travaille contre son propre but. Piste : ne mettre le
  `placeholder` que quand la source FAIT AUTORITÉ, sinon un exemple neutre (`ex. 1,3850`).
- [ ] 🟠 **`[FINTABLE-AUTORITE-FAMILLE-CELIAPP-REEE]`** (M, money-critical, **DÉCOUVERT au panel du
  2026-09-16, décision produit requise**) — la base de comparaison replie **CELIAPP sur CELI** et
  **REEE sur REER** (`BUCKET_OF`, « même famille fiscale », décision écrite), pendant que les soldes
  de départ les gardent SÉPARÉS. Écrire le total courtier « CELI » — comparé à CELI + CELIAPP — dans
  le seul panier `CELI` compterait le CELIAPP **deux fois** (mesuré : 91 500 $ pour 66 500 $ réels).
  ⚠️ **Le lot REFUSE d'appliquer ces paniers** tant que le jumeau porte une valeur : c'est sûr, mais
  ça prive Marc de l'autorité sur ses CELI/REER dès qu'il a un CELIAPP ou un REEE.
  🧭 **Décision Marc** : (a) mettre le jumeau à zéro en appliquant la famille — mais ça range de
  l'argent CELIAPP dans le CELI, donc ça change son **régime fiscal**, pas un arrondi ; (b) cesser de
  replier côté comparaison — mais l'écart affiché par la carte change aussi ; (c) demander un rôle
  Fintable par régime FIN (l'UI n'en offre que trois). Les deux moitiés sont liées.
- [ ] 🟡 **`[PROJ-DEUX-MOIS-ZERO]`** (S, **DÉCOUVERT au panel du 2026-09-16**) — `Retirement.tsx`
  construit un **second** `liveCSVBalances` qui ne passe PAS par l'autorité du courtier : le
  chercheur d'objectif de l'écran Retraite démarre donc d'un mois 0 différent de la courbe Futur, de
  l'écart exact. Divergence **préexistante**, ÉLARGIE par le lot d'autorité. ⚠️ Et le patrimoine net
  de l'Accueil / Investissements somme toujours les titres saisis — la demande du 30/07 reste à
  moitié livrée, ce que la note de version DIT maintenant au lieu de le laisser croire.
- [ ] 🟡 **`[GARDE-FUTURESEED-PERIMEE]`** (XS, **DÉCOUVERT au panel du 2026-09-16**) —
  `tests/services/futureSeedContinuity.test.ts` affirme « ce test exerce EXACTEMENT la fonction que
  le composant exécute désormais ». C'est devenu FAUX : le composant exécute maintenant
  `appliquerAutoriteCourtier(deriveStartingBalancesFromHistory(...), …)`. La garde anti-falaise ne
  couvre plus le point d'injection (`GARDE-AU-PRODUCTEUR-NE-PROUVE-PAS-LA-CHAINE`). Corriger la
  PHRASE ou étendre la garde — mais ne pas la laisser affirmer ce qu'elle ne fait plus.
- [ ] 🟠 **`[FX-PASSE-TAUX-PLAT]`** (M, money-critical, **DÉCOUVERT le 2026-09-16, routé sur choix
  explicite de Marc**) — `reconstructPortfolioHistory` convertit **TOUS** les points passés au taux
  d'AUJOURD'HUI (`fxToCad(a.currency, fx)`, un facteur unique), donc la courbe du passé est fausse de
  tout ce que le change a bougé — et repose en plus sur le repli en dur tant que `[FX-TAUX-JAMAIS-ARRIVES]`
  n'a pas abouti chez Marc. ⚠️ **Le champ prévu pour ça EXISTE et n'est ni écrit ni lu par personne** :
  `Asset.priceHistory[].fxRate` (grep : 0 occurrence en production) — `UN-CHAMP-TYPE-SANS-PRODUCTEUR`.
  La Banque du Canada publie ses séries DATÉES et le domaine est déjà autorisé par la CSP.
  ⚠️ Marc a choisi l'accumulation de l'historique Fintable plutôt que ce correctif-là : le reprendre
  demande son GO, pas une décision de reprise de session.
- [ ] 🟠 **`[FINTABLE-ECART-FANTOME-DEUX-DATES-DE-TAUX]`** (M, money-critical, **DÉCOUVERT au panel
  du 2026-09-16, OUVERT PAR CE LOT — mesuré, borné, non corrigé**) — le solde courtier converti est
  FIGÉ au taux de l'écriture (`toPersistableBrokerBalances`), tandis que l'autre côté de la
  réconciliation (`holdingsCadByRegime` → `assetValueCad`) est recalculé au taux COURANT à chaque
  rendu. `gapCad` compare donc deux dates de taux, et invente un écart là où il n'y en a pas.
  **MESURÉ par le panel** (72 040 USD au courtier, titres strictement équivalents, écart VRAI = 0) :
  taux identique → **0,00 $** (contrôle négatif) ; 1,37 → 1,42 → **−3 602 $** ; 1,37 → 1,32 →
  **+3 602 $**. ⚠️ **Borné à la carte de réconciliation** : l'énumération complète des lecteurs de
  `fintableBrokerBalances` ne donne qu'UN consommateur de production, et ni le patrimoine net ni la
  projection ne le lisent. Pas un dollar faux au bilan — un écart inventé sur l'écran dont c'est la
  seule raison d'être, qui pousserait Marc à « corriger » des titres corrects.
  ⚠️ **Atténué dans l'immédiat** par le durcissement du même panel : un taux ESTIMÉ
  (`fxRatesEstimated`, le cas par DÉFAUT) ne convertit plus du tout, donc l'écart fantôme ne peut
  naître que sur des taux réels. Il n'est pas fermé pour autant.
  **Correctif** : persister le taux et sa date avec le solde (`rateUsed`, `rateAt`) et convertir les
  DEUX côtés au même taux — ou ne pas figer du tout (persister la devise native et convertir au
  rendu). Le second est plus juste et plus simple, mais `balanceCad` cesse alors d'être un nom
  honnête : c'est une décision de contrat, pas un correctif mécanique.
- [ ] 🟡 **`[FINTABLE-SIGNE-RECIDIVE-NON-DETECTEE]`** (S, **DÉCOUVERT au panel du 2026-09-16**) —
  `soldesDetteSignes` est calculé par le mapper et lu par PERSONNE en production : `FintableSyncReport`
  ne déclare pas ce champ, et les deux orchestrateurs construisent leur rapport champ par champ sans
  le recopier. ⚠️ Mon commentaire affirmait qu'il est « la seule trace qui permettra de re-vérifier la
  convention si Fintable change d'avis » — **faux**, corrigé dans le même lot : écrire une capacité
  inexistante dans un commentaire est le défaut que ce lot dénonce, commis dans le lot qui le corrige.
  ⚠️ L'information UTILISATEUR, elle, atteint bien l'écran (« EN TA FAVEUR », « carte soldée ») : ce
  qui manque est la détection AUTOMATIQUE d'une récidive, pas l'information de Marc.
  **Décision requise avant de câbler** : le rapport part en clair dans un journal PUBLIC. Publier des
  signes quotidiennement pour une détection sans consommateur est un coût de vie privée sans
  contrepartie — d'où le routage plutôt que le câblage.
- [x] 🔴 **`[FINTABLE-BASCULE-GLOBALE-JETTE-LE-COMPTE-LENT]`** (M, money-critical, **FAIT le
  2026-09-16 — et VALIDÉ EN PRODUCTION le jour même**)
  ✅✅ **Le plancher dérivé a été mis à l'épreuve pour de vrai, quelques heures après le merge.** Marc
  a lancé « Rattraper l'historique » sur un état **NON vierge** : **1 478 transactions ajoutées**,
  dont 588 antérieures à juillet 2025 (7 597 → 7 601 lignes après l'import de correction du même
  jour). C'est exactement le scénario que le panel avait nommé comme le seul coûteux — reculer sous
  la date des lignes entrées par un AUTRE canal peut les rejouer en double, et la dédup ne rattrape
  rien puisque sa clé contient le `payee`, justement ce qui diffère. **Mesuré après coup sur l'état
  réel** : les deux `Sodexo` du 2026-09-09 réécrites À LA MAIN la veille (3,77 $ chacune, dont une
  désambiguïsée `(2/2)`) sont **intactes**, et leurs originaux à 13,50 $ ne sont **pas revenus**.
  **0 doublon sur les 36 lignes du Brésil.** Le cas n'était pas théorique : il s'est produit, et la
  protection a tenu. Une mesure qui CONFIRME se publie autant qu'une réfutation.
  Contexte d'origine — la bascule anti-doublon est GLOBALE (`deriveCutoverDate` : date de la transaction
  la plus récente, **tous comptes confondus**) alors que les comptes ne postent PAS à la même
  vitesse. Le compte chèque poste le jour même et pousse la bascule chaque jour ; la carte de crédit
  poste avec quelques jours de retard (et `pending: false` est FORCÉ par contrat, donc seules les
  transactions POSTÉES sont exposées) — elle arrive donc systématiquement DERRIÈRE la bascule que le
  chèque vient d'avancer, et `tx.date <= transactionsAfter` la jette. **Chaque jour, indéfiniment.**
  ⚠️ **MESURÉ** (12 passes quotidiennes, chèque sans décalage + carte à 3 jours de décalage) :
  **12/12 transactions de chèque reçues, 0/9 transactions de carte** — les 9 écartées « avant la
  bascule ». **Contrôle négatif** (même scénario, décalage de la carte ramené à **0 jour**) :
  **12/12 carte reçues, 0 écartée**. Le décalage de postage EST la variable ; le mécanisme est prouvé
  dans les deux sens. Explique le symptôme rapporté par Marc le 2026-09-14 (« je reçois pas les
  transactions de carte de crédit ») alors que son dry-run prouve que Fintable en LIVRE 293.
  ⚠️ Le rattrapage (`[FINTABLE-BACKFILL-HISTORY]`, déjà livré) ne referme rien durablement : dès la
  passe suivante la carte se refait jeter — c'est un correctif ponctuel sur un défaut permanent.
  Fix proposé : bascule **PAR COMPTE** — le max des dates déjà connues POUR CE COMPTE, la donnée
  existe déjà (`Transaction.accountName`, persisté par transaction depuis `[TX-TRANSFERS]`, et écrit
  par le mapper Fintable). Un compte jamais vu retombe sur la bascule globale (comportement
  d'aujourd'hui) plutôt que sur `null`, sinon un compte nouvellement routé rapatrierait tout son
  historique sans dédoublonnage. Touche `deriveCutoverDate` + `syncCore` + les DEUX orchestrateurs
  (navigateur ET cron) → plan-first, gardes discriminantes exigées des deux côtés.
  ✅ **LIVRÉ le 2026-09-16** — et la mesure a corrigé **le remède que ce ticket prescrivait** :
  `deriveCutoverDatesByAccount` + `cutoverByAccount` (plafonné par compte) + `transactionsAfterByAccount`
  au mapper + **`requestDateFrom`** (la borne de la REQUÊTE devient la plus ANCIENNE des bornes —
  sans elle l'API ne rend même pas les lignes du compte lent et tout le reste est INERTE). Câblé et
  gardé dans les deux orchestrateurs. 17 gardes, 5 perturbations séparées.
  ⚠️⚠️ **Le repli prescrit ci-dessus (« compte jamais vu → bascule globale ») est un INTERBLOCAGE**,
  mesuré : le compte lent ne peut jamais poser sa PREMIÈRE transaction, donc sa borne reste absente
  pour toujours. **0/9 avant · 0/9 avec le repli seul · 9/9 dès qu'une transaction de la carte est
  connue sous son libellé** (contrôle négatif à décalage nul : 12/12 partout). Le repli est GARDÉ —
  l'ouvrir à `null` rapatrierait l'historique sans dédoublonnage, et rejouerait les 44 lignes du
  Brésil aux MAUVAIS montants (`applyBankStatement` déduplique par `date|montant|payee`, or les
  montants ont été corrigés à la main le 15/09) — mais il est désormais **NOMMÉ** dans le rapport
  de sync, avec le seul geste qui débloque : « Rattraper l'historique », UNE fois.
  ⚠️⚠️⚠️ **Le panel a trouvé TROIS défauts APRÈS gate vert et CI verte, tous à moi** — dont un
  money-critical : une borne par compte ne voit que les lignes portant SON libellé, donc reculer
  sous la date de lignes entrées par un autre canal (CSV `'Importé'`, MCP sans `accountName`, sync
  d'avant le 05/09) faisait ÉCRIRE des doublons que la bascule globale bloquait — **3 écrits,
  mesuré sur `applyPayloadsIsolated`**. Corrigé par un PLANCHER dérivé (date la plus récente des
  lignes rattachables à aucun compte routé), calculé après la lecture du snapshot. Les deux autres :
  clé normalisée d'un seul côté (interblocage PERMANENT sur un libellé espacé, 0/9 même après
  rattrapage) et compte non listé par l'API jamais nommé. 28 gardes, 8 perturbations séparées.
- [ ] **`[FINTABLE-BACKFILL-HISTORY]`** (M, ⭐ demandé par Marc 2026-08-05 : « avec la version
  ✅ **DÉCISION Marc 2026-09-05 (en session)** : Marc pense que son plan offre plus de 30 jours → à MESURER chez lui (`npm run fintable:dry -- --days 365`, compte de transactions rendues, montants masqués) ; je ne peux pas appeler fintable.io d'ici (403).
  payante je devrai pouvoir importer beaucoup plus de transactions de fintable ») — ⚠️ **En l'état,
  il n'en importera AUCUNE de plus** : `deriveCutoverDate` (`services/fintable/deriveCutoverDate.ts`)
  fixe la bascule à la date de la transaction la PLUS RÉCENTE, et le mapper ne prend que ce qui est
  APRÈS (`transactionsAfter`). C'est la garde anti-doublon voulue (Marc a ~2 019 transactions dont
  18 mois saisis à la main), mais elle interdit aussi tout RATTRAPAGE d'historique : un plan payant
  qui exposerait 12-24 mois au lieu des 30 jours mesurés le 2026-07-29 ne changerait rien.
  Fix : passe de backfill SÉPARÉE de la sync courante — fenêtre explicite (ex. « importer depuis
  telle date »), application via `applyPayloadsIsolated`, puis dédoublonnage contre l'existant avec
  `findDuplicateGroups` (`services/transactions/duplicateDetection.ts`, DÉJÀ écrit et testé) et
  revue humaine des groupes douteux avant écriture. ⚠️ Money-critical : un doublon de transaction
  fausse le budget réel ET la moyenne 12 mois. Ne JAMAIS écrire sans dédoublonnage.
  Prérequis : confirmer avec Marc la profondeur réellement offerte par son plan (mesurer, ne pas
  supposer — 90 j demandés / 30 rendus au dernier test).
- [ ] **`[ENG-REERBYUSER-RETRAIT-INERTE]`** (XS, ARBITRAGE — découvert en auditant les gardes
  per-conjoint) — le terme `withdrawal` de `stepReerByUser` est **ratio-neutre par construction** :
  retirer au prorata du solde multiplie chaque part par le même facteur, et `reconcileToPool` efface
  la trace du montant. VÉRIFIÉ à 1 $, 1 000 $, 70 000 $, 300 000 $ et 899 999 $ : répartition
  identique au **neuvième chiffre**. Seule porte de sortie : `w ≥ Σ prev` (repli sur `shares`).
  Conséquence : les EXCLUSIONS ajoutées à ce terme au fil des lots (`ferrWithdrawalMois`,
  `divorceReerWithdrawalMois`) sont **justes mais quasi sans effet** — mesuré en retirant celle de la
  FERR : **0 $ à âge égal, −141,22 $ à 15 ans d'écart, −1 641,85 $ à 27 ans** (pool 1 755 229,60 $,
  soit 0,09 %), avec **53 tests verts**.
  ⚠️ **Décision pour Marc, ne pas trancher seul** : (a) les GARDER telles quelles — elles sont
  correctes et documentent une intention, mais elles coûtent de la lecture et ont déjà fait croire
  deux fois à un enjeu qu'elles n'ont pas ; ou (b) les retirer et écrire une seule fois, dans
  `perUserBalances.ts`, que le terme est ratio-neutre. ⚠️ Ne PAS choisir (b) sans traiter le cas
  dégénéré : c'est le seul endroit où la double soustraction change quelque chose.
  Caractérisation verrouillée par `tests/services/stepReerByUserProprietes.test.ts`.
- [ ] **`[P0-IDB]`** (L, ⏳) — migrer la persistance localStorage → IndexedDB (quota ~5 Mo + parsing
  synchrone au boot). ⚠️ Migration schéma persist v7 — vigilance corruption.
- [ ] **`[ASSET-CURRENCY-BACKFILL]`** (S, attente signal) — backfill devise legacy SEULEMENT si le
  log `services/portfolio.ts:60-62` apparaît chez Marc. Ne rien coder avant.
## 💬 Chat / IA

- [ ] **`[CHAT-PAGE-CONTEXT-V2]`** (M, file Marc « chat conscient de la page ») — instrumenter les
  autres onglets (Investissements : filtres/compte ; Futur : scénario + année survolée ; Impôts :
  année ; Dettes ; Transactions : recherche/filtres). L'union `ViewContextDetail`
  (`services/aiChat/viewContext.ts:49`) n'a qu'UN membre (Budget).
  ⚠️ **CADRAGE MESURÉ 2026-08-05 — le ticket sous-estime le prérequis.** « Un petit detail typé +
  publisher par onglet » suppose que le pipeline accepte un 2ᵉ membre tel quel. Ce n'est PAS le cas :
  `describeViewContextForPrompt` (`viewContext.ts:~134`) déréférence DIRECTEMENT les champs de
  `BudgetViewDetail` (`d.totalSpent`, `d.totalBudgetTarget`, `d.totalRealIncome`, `d.topCategories`,
  `d.personFilterLabel`, `d.cards`) sans jamais tester `d.kind`. Ajouter un membre à l'union CASSE
  le typecheck sur ce bloc — et le « corriger » à la va-vite sur une surface qui alimente un PROMPT
  serait dangereux : ce code porte 3 findings de sécurité (assainissement du texte utilisateur,
  encadrement `<DONNEES>`, troncature JAMAIS muette).
  ⇒ **Lot 1 = généraliser le constructeur AVANT tout onglet** : dispatch sur `kind`, chaque membre
  rendant ses propres lignes, en conservant les 3 garanties ci-dessus PAR MEMBRE (un nouveau membre
  ne doit pas pouvoir oublier l'assainissement). Puis 1 onglet pour valider la forme, puis les autres
  au fil de l'eau. ⚠️ Ne PAS enregistrer le scope sans l'ajouter à `SCOPE_TO_TAB` (`viewContext.ts:~110`) :
  sans ça, `viewContextMatchesTab` renvoie faux et la page publie dans le vide, en silence.
- [ ] **`[CHAT-PAGE-CONTEXT-V3]`** (M, évaluer AVANT) — état fin volatile (modal ouvert, tooltip figé
  du Futur, ligne sélectionnée) — fragile ; juger la valeur réelle avant de coder.

## 📈 Investissements & historique

- [ ] **`[A11Y-BORDER-PROMINENCE-SWEEP]`** (M, 🧭 **décision d'apparence — MESURÉ 2026-08-25**) —
  ⚠️ **Le ticket disait « S » et annonçait 28 sites. Mesuré : 255 occurrences de `border-white/10`
  dans `components/`**, dont **31 sur un `<input>`/`<select>`/`<textarea>`** (les vraies frontières
  de contrôle visées par WCAG 1.4.11) et **224 décoratives** (séparateurs, bordures de cartes — que
  1.4.11 n'exige PAS à 3:1). Seulement **2** des 31 portent un `focus:border-*`.
  **Contrastes mesurés** (blanc composé sur les fonds de la palette) :

  | Bordure | sur `dark` | sur `surface` | sur `surfaceHighlight` |
  |---|---|---|---|
  | `border-white/10` (actuel) | **1,25** | **1,29** | **1,32** |
  | `border-white/20` | 1,75 | 1,83 | 1,88 |
  | `border-white/30` | 2,58 | 2,67 | 2,70 |
  | **exigence WCAG 1.4.11** | **3,00** | **3,00** | **3,00** |

  ⚠️ **Le réflexe évident — monter l'opacité de 10 à 20 puis 30 — NE PEUT PAS marcher** : il faut
  **`white/34` minimum** (3,01 / 3,07 / 3,14), soit plus du TRIPLE de l'actuel. Un jeton opaque de la
  palette passe avec marge : `ink-500 #6a7689` → **3,86 à 4,33**.
  ⚠️ **Et le repli d'identification ne sauve rien** : un champ `bg-dark` posé sur une carte
  `bg-surface` fait **1,05** de contraste — le fond ne distingue pas le contrôle non plus, donc
  l'exemption « identifiable autrement » de 1.4.11 ne s'applique pas.
  🧭 **Pourquoi c'est ta décision** : passer 31 bordures de 10 % à 34 % (ou à un gris plein) change
  visiblement le caractère de l'app, et la frontière entre « contrôle » et « décor » demande un
  arbitrage (les 224 décoratives peuvent rester à 10 %, mais un séparateur de tableau très visible
  n'est pas le même choix esthétique qu'un champ de saisie).
  Trois options : (a) `ink-500` sur les 31 contrôles seulement ; (b) `white/34` sur les 31 ;
  (c) statu quo assumé et documenté comme écart WCAG connu.
- [ ] **`[UI-RETIREMENT-DEAD-FRAGMENT]`** (XS, cosmétique — retour revue #604) — fragment JSX `<>…</>`
  inutile dans `components/Retirement.tsx` (lignes ~322-434) après le retrait d'un ternaire mort ;
  suppression imposte re-indenter ~110 lignes. Aucun impact fonctionnel ; `eslint` le rate
  (règle `react/jsx-no-useless-fragment` non activée). Reporté en attente d'une PR plus large
  de refactoring `Retirement.tsx` (où il se perdrait dans le bruit).
- [ ] **`[FUTUR-PAST-EXACT]`** (M, 🧭 retour Marc 2026-08-12 17:20) — « le passé doit représenter
  EXACTEMENT le passé et je veux pouvoir voir les transactions aussi » : la partie passée de la
  courbe doit coller aux données réelles sans approximation, et l'infobulle/le détail d'un jour
  PASSÉ doit montrer les TRANSACTIONS de ce jour (elles existent dans le store — les brancher au
  point réel). Cadrer : quelles approximations restantes le gênent (ancre, flux non datés — cf.
  FUTUR-DAILY-ANCHOR-CAVEAT) ?
- [ ] **`[DEBT-FROM-CONTRACT]`** (M, 🧭 retour Marc 2026-08-12) — « ma dette doit être exactement
  ce que j'ai — là ça me dit que j'ai la dette depuis des années mais c'est faux, je t'ai donné
  le PDF du contrat, ça devrait être automatique » : extraire du contrat la date de début, le
  principal, le taux, l'échéancier → la dette du store reflète le contrat RÉEL.
  ✅ **DIAGNOSTIQUÉ le 2026-08-13** : les trois maillons cassés sont identifiés — voir
  `[PASSE-REEL-DETTE-1/2/3]`. Ce ticket-ci reste le point d'entrée « demande de Marc » ; les
  sous-tickets sont le PLAN.
  ✅ **CADRAGE TRANCHÉ le 2026-08-21** : Marc a confirmé vouloir la courbe qui S'AMORTIT (pas le
  niveau figé) — voir `[DEBT-AMORTIZATION]` ci-dessus, qui reprend `originalBalance` et le reste
  du périmètre.
- [ ] **`[MCP-V2-OVERHAUL]`** (L, 🧭 retour Marc 2026-08-12) — « grosse MAJ du MCP : je veux que
  tout fonctionne bien et plus de fonctionnalités » : passe complète sur les tools MCP (fiabilité,
  erreurs honnêtes, couverture) + nouvelles capacités à cadrer avec Marc (écritures étendues,
  transactions, dettes-contrats, simulations). Plan-first.
- [ ] **`[AUTH-REMEMBER-DEVICE]`** (M, retour Marc 2026-08-12) — « je veux pas qu'à chaque fois
  ✅ **DÉCISION Marc 2026-09-05 (en session)** : **retirer la déconnexion auto 8 h** quand « se souvenir de cet appareil » est actif ; ré-auth exigée seulement pour les Réglages. Lire le journal `[AUTH-DRIVE-STILL-RECONNECT]` d'abord (D4 en attente : Marc n'a que son téléphone).
  je doive me reconnecter, ça me le demande trop souvent pour rien : me connecter UNE fois avec
  option de se souvenir de l'appareil… à part pour changer des paramètres » : session Drive
  persistante par appareil (option « se souvenir de cet appareil »), ré-auth exigée SEULEMENT
  pour les zones sensibles (Réglages/paramètres). ⚠️ Inverse en partie la décision
  `[AUTH-DRIVE-INACTIVITY]` (déco auto 8 h, demande Marc 2026-07-22) — nouvelle préférence
  prévaut (à confirmer : garder ou retirer la déco 8 h en plus du « se souvenir »). Cadrer
  d'abord le POURQUOI des reconnexions actuelles (instrumentation `[AUTH-DRIVE-STILL-RECONNECT]`
  déjà en place — lire le journal Diagnostics avant de coder).
- [ ] **`[TOUR-STEP-GROUPE-REPLIE]`** (S, 🧭 si Marc le veut — reste de `[TOUR-ANCHOR-INVISIBLE]`) —
  depuis que `findVisibleAnchorRect` refuse une ancre `visibility:hidden`, le tour ne pointe plus un
  bouton invisible : il retombe sur sa carte centrée. C'est HONNÊTE, mais l'étape décrit encore un
  contrôle que l'utilisateur doit ouvrir lui-même. L'option (a) du ticket d'origine — le tour force
  l'ouverture du groupe de l'étape active — la rendrait ATTEIGNABLE, au prix d'un tour qui défait un
  repli VOLONTAIRE et d'un couplage entre les étapes et l'état de la nav. Décision d'UX : à trancher.
- [ ] **`[REFONTE-NAV]`** (L, ⏳, GO Marc 2026-08-12) — chantier « tout tourne autour de la courbe
  Future », plan détaillé + décisions dans `docs/REFONTE_NAV_PLAN.md`. ⚠️ L1-L4 ARCHIVÉS
  (2026-08-12, PR #600-#604). Lots restants :
  - [x] `[REFONTE-NAV-L5]` Lot 5 — Transactions fusionnées (tx, budget, abonnements, imports).
    **FAIT 2026-08-12 (PR à venir)** : `BudgetWorkspace` porte le h1 de page (`TAB_LABELS`,
    stable sur les 4 sous-onglets + deep-links `objectifs`/`abonnements`/`sante`), `Budget`
    rétrogradé en barre de pilotage (fin du 2e h1), cross-links poste ⇄ transactions
    (`poste:<nom>` / `category:<nom>` via `navigateWithFocus`), empty state UNIQUE desktop+mobile
    (le desktop rendait un `<table>` d'en-têtes vide), les 2 exports CSV consolidés sur
    `utils/csvExport`, et le compte « groupe(s) à classer » n'est plus gaté sur l'ouverture de
    l'assistant (il était figé à 0 = faux chiffre). → à ARCHIVER avec L1-L4 au merge.
  - [ ] `[REFONTE-NAV-L6]` Lot 6 — Assistant pleine page + outils (sous-lots par outil, voir plan).
    ⚠️ Le plan étiquetait « 6a » comme « écritures NL » ; le sous-lot réellement livré est
    « Assistant ancré sur la courbe » → sous-lots restants RENUMÉROTÉS dans
    `docs/REFONTE_NAV_PLAN.md` (écritures NL = 6b). Le parent `[REFONTE-NAV-L6]` reste OUVERT
    tant que 6b..6f ne sont pas faits.
    - [x] `[REFONTE-NAV-L6a]` 6a — Assistant ancré sur la courbe. **FAIT 2026-08-12 (PR à venir)** :
      `FutureProjection` publie son contexte d'écran (`useViewContextPublisher('future', …)`,
      patron `CHAT-PAGE-CONTEXT`) bâti par le builder pur `services/aiChat/futureViewContext.ts`
      sur la courbe AFFICHÉE (source unique `lastProjection.chartData` / gel `PROJECTION-PERSIST`,
      zéro recalcul UI) : patrimoine départ + horizon, retraite, FIRE, plus gros creux, point
      sélectionné (modal détail ou infobulle figée). `ViewContextDetail` devient une union
      discriminée par `kind` (`budget` | `future`), `SCOPE_TO_TAB.future = Tab.FUTURE`, badge du
      chat décliné par `kind`. **No-fake-data** : tout champ gardé par `Number.isFinite`, un montant
      manquant est OMIS **et NOMMÉ** dans le prompt ; aucune projection → aveu honnête sans AUCUN
      chiffre. + rangée de **chips** de questions suggérées qui PRÉ-REMPLISSENT la saisie (jamais
      d'envoi automatique), présentes seulement si une projection existe, et
      « Pourquoi ça baisse en [année] ? » seulement sur un vrai creux détecté (≥ 5 % pic→creux).
      20 tests neufs (14 builder + 6 chips). → à ARCHIVER au merge.
      **Revue 2026-08-12** (3 correctifs, même branche) : jalon FIRE du prompt rendu STRUCTUREL
      (`services/projection/fireMilestone.ts` — `FireTarget`/`NetWorth`, plus de regex sur des
      libellés qui portent du texte utilisateur) ; chips de la page Assistant gatées sur
      `revealedProjectionSig` (même geste explicite que le Futur) ; énumération vide du prompt
      remplacée par « aucun chiffre disponible ». +10 tests (5 prouvés discriminants).
    - [ ] `[FUTUR-FIRE-REGEX-SHARED]` (S) — **duplication restante du jalon FIRE**. Le prompt IA
      lit désormais le jalon STRUCTUREL (`isFireReached`, `services/projection/fireMilestone.ts`),
      mais la **pastille de la courbe** (`components/FutureProjection.tsx` ~l.440) et l'infobulle
      (`components/projection/ProjectionTooltip.tsx` l.11) choisissent encore l'icône 🔥 par
      `/\bfire\b/i` sur le libellé. Toléré (l'utilisateur VOIT la pastille et son libellé, il peut
      la démentir) mais faux positif possible sur un nom d'immeuble/d'enfant contenant « fire ».
      → faire consommer `FIRE_LIFE_EVENT` (comparaison EXACTE) ou le prédicat structurel, avec un
      test « immeuble nommé Fire pit reno → aucune pastille FIRE ». ⚠️ Vérifier l'impact bundle :
      `FutureProjection` importerait un module de `services/projection/` (leaf, types only).
    - [ ] `[REFONTE-NAV-L6b]` 6b — écritures en langage naturel (ex-« 6a » du plan initial).
    - [ ] `[REFONTE-NAV-L6c]` 6c — what-if comparés.
    - [ ] `[REFONTE-NAV-L6d]` 6d — explication du moteur.
    - [ ] `[REFONTE-NAV-L6e]` 6e — analyse de documents.
    - [ ] `[REFONTE-NAV-L6f]` 6f — assistant proactif.
  - [x] `[REFONTE-NAV-L7]` Lot 7 — **CADUQUE 2026-08-17 (décision Marc, `docs/adr/`)**.
    « Réglages retravaillés en sections » était **DÉJÀ LIVRÉ** : `components/Settings.tsx` est un
    orchestrateur léger de SIX sous-onglets (Profil · Comptes & soldes · Patrimoine · Clés API ·
    Sauvegarde · Système & diagnostics), délégués à `components/settings/sections/` — livré le
    2026-07-31 par la PR #549, donc AVANT la rédaction du plan, qui ne consacrait au Lot 7 qu'une
    ligne sans contenu. Classe `BACKLOG-STALE-TICKET`.
    → remplacé par le découpage de **Profil** (seul volet vivant, cf. `[UI-TABS-RICH]`).
- [ ] **`[A11Y-SUBTABS-FUTUR]`** (M — **RE-CHIFFRÉ 2026-08-17, plus gros qu'annoncé**) —
  `FutureProjection` est le 5e écran à sous-onglets et le seul non converti à `<SubTabs>`.
  **Deux obstacles, mesurés** :
  1. **Habillage différent** (emojis au lieu d'icônes, autre fond, autres espacements) → le convertir
     tel quel changerait l'apparence de l'écran principal de Marc. Solution : une VARIANTE
     d'habillage dans `<SubTabs>`, pas un alignement forcé.
  2. ⚠️ **Obstacle STRUCTUREL, découvert en tentant la conversion** : ses 4 onglets ne sont pas
     rendus par 4 blocs mais par **SEPT blocs conditionnels dispersés** — `graph` en 3 morceaux
     (`curveRestoring`, `!curveVisible`, `curveVisible`), `plan` en 2, plus `params` et
     `historique`. Un `role="tabpanel"` par bloc produirait **plusieurs panneaux avec le même `id`
     pour un seul onglet** — un balisage ARIA invalide, donc pire que l'actuel.
     La conversion exige donc de REGROUPER 7 blocs en 4 panneaux dans un fichier de ~2 000 lignes.
  **C'est un refactor à part entière de l'écran principal**, pas un habillage : à faire dans une PR
  DÉDIÉE, avec les tests de l'écran en filet. Chiffré M, pas S.
  ⚠️ En attendant, il reste épinglé dans le CLIQUET de `tests/components/subTabsAria.test.tsx` —
  exception listée et justifiée, jamais silencieuse.
- [x] 🔴 **`[FINTABLE-INVESTMENTS-MUET]` — LIVRÉ le 2026-09-03** (PR #830), voir
  `docs/BACKLOG_ARCHIVE.md`. `services/fintable/comptesSansPositions.ts` traduit `holdingsSkipped`
  en `FintableSyncReport.comptesSansPositions` (identité + LIBELLÉ humain + raison) ; les DEUX
  chemins de sync le remplissent depuis cette source unique, et `FintableSyncCard` ÉNUMÈRE la cause
  au lieu de la compter. Aucun montant, aucune promesse de guérison automatique.

- [ ] **`[PERF-BOOT]`** (M-L, différé SCIEMMENT — provider-aware) — paralléliser
  `hydrateAssets`/priceRefresh SANS dépasser CoinGecko free ~30/min (le sleep 2500 protège le
  provider le PLUS strict). Fix provider-aware planifié, pas un Promise.all aveugle. (≡ D7.)

## 🧱 Dette technique

- [ ] 🔧 **`[MCP-HTTP-ERR-MESSAGE]`** (S) — les **QUATRE** routes de
  `mcp/http/routesPlanifiees.ts` renvoient `err.message` BRUT à l'appelant authentifié
  (`handleRefresh`, `handleFintableSync`, `handleVehiculeBail` — **la même ligne au caractère
  près dans les trois**, `sendJson(res, 503, { ok: false, error: reason }, HUB_NO_STORE)` — plus
  l'équivalent tronqué de `handleHubSummary` via `errorHubSummary`). **Découverte par la revue sécurité du lot
  `[VEHICULE-BAIL]` (15/09), PR #967 — préexistant, PAS causé par ce lot.** Tracé : les erreurs nommées de la chaîne d'état
  sont des phrases françaises fixes, sans secret ; le seul détail opérationnel est une panne
  OAuth `invalid_grant` (`mcp/drive/tokenProvider.ts`) qui interpole `backend.description` — un
  chemin local en dev, ou le **NOM** d'un secret Google Secret Manager en prod, jamais sa valeur,
  et seulement APRÈS la garde d'auth. ⚠️ **Se fait sur les QUATRE handlers ENSEMBLE** (message
  générique en réponse, détail complet dans `console.error`) : durcir `/vehicule/bail` seule
  créerait l'incohérence inverse de celle qu'on corrige.

- [ ] **`[FUTUR-STACK-ZOOM-AWARE]`** (M, cosmétique — reliquat RE-CADRÉ de `[FUTUR-DAILY-STACK-X]`,
  livré #724) — séparer horizontalement deux pastilles du même mois posées à des jours différents
  n'est LÉGITIME qu'en vue zoomée, et cette information n'existe pas là où le rang est calculé.
  **MESURÉ** : la pastille fait 24 px de diamètre (rayon 12 dans `ClickableEventIcon`), 44 px de
  cible de clic ; à l'horizon PAR DÉFAUT (40 ans = 480 mois, `constants.ts`) sur un écran de
  téléphone (390 px), **un mois vaut ≈ 0,7 px** — deux événements à 15 jours d'écart sont donc à
  ≈ 0,35 px l'un de l'autre. Les séparer verticalement n'est pas un défaut à cet horizon : c'est la
  seule chose qui les rende lisibles. Le critère juste est en PIXELS (`Δx × px/mois ≥ 24`), donc il
  dépend de la fenêtre de zoom et de la largeur du conteneur — deux grandeurs absentes du calcul
  actuel, qui ne dépend que de `chartData`. Faire ce lot = déplacer la décision au rendu (fenêtre
  visible + largeur mesurée), pas changer la clé de groupement. ⚠️ Ne PAS livrer « grouper par
  abscisse arrondie » : à la vue par défaut, ça superpose les pastilles au lieu de les empiler.
- [x] **Godfiles (V11)** — ✅ **FAMILLE COMPLÈTE le 2026-09-04** :
  ✅ `[GODFILE-STORE]` fait le 2026-09-04 (lot 158, PR #889) — `useFinanceStore.ts` re-mesuré
  **783 l.** → façade de **207** : `etatParDefaut.ts` (défauts + migration legacy `app_*` +
  `initialState` calculé LÀ, une seule exécution), `migrationsPersistees.ts` (v1→v7),
  `actionsModeTest.ts` (créateur, mêmes fermetures set/get), `optionsPersistance.ts`
  (merge/filet/partialize + statut d'hydratation). **Zéro migration** : nom, version (7) et forme
  persistée inchangés — prouvé par EMPREINTE (sha256 de la sortie de `partialize` triée, clés,
  version, nom : identiques avant/après). Le risque du ticket était la persistance : la CONFIG
  persist reste dans la façade, à côté du create().
  ✅ `[GODFILE-FUTUREDETAILMODAL]` fait le 2026-09-04 (lot 154, PR #885) — re-mesuré **1 142 l.**
  (le « 606 » du ticket décrivait un état d'avant) → **445** : `futureDetail/comptes.ts` (ACCOUNTS,
  espace par année, explainMovement — pur), `detailsTransaction.ts`, `DrillDownCompte.tsx` (la vue
  compte entière avec ses dérivations, tooltip DÉCLARÉ dedans — exigence de `chartPrivacyScan`),
  et les trois sections (catégories du mois, variation du jour avec son pli persisté, transactions
  du jour). Conditions d'affichage et leurs justifications restées chez le parent.
  ✅ `[GODFILE-REALESTATE-CMP]` fait le 2026-09-04 (lot 153, PR #884) — le ticket disait
  « RealEstate.tsx 624 » mais ce fichier était déjà une façade de 29 l. ; le vrai godfile était
  `components/realestate/RealEstateWorkspace.tsx` (912 l.), redescendu à 661 en extrayant
  `calculsImmoLocaux.ts` (amortissement local + comparaison Acheter-vs-Louer, fonctions pures),
  `ScenariosComparatifsCard.tsx` et `AmortissementCards.tsx` (extraction verbatim ; l'état des
  curseurs reste chez le parent — la carte-conseil IA lit les mêmes valeurs).

- [x] **`[DETTE-UI-PRIMITIVES]`** (unifie `[UI-NO-INPUT-PRIMITIVE]`) ✅ fait le 2026-09-04 (lot 156,
  PR #887) — `ui/Input` (variants compact/large + accents, classes ÉCRITES EN ENTIER), `ui/Select`,
  `ui/Field` (paire label↔id écrite une fois, id toujours EXPLICITE). Périmètre RE-CENSÉ (les
  comptes du ticket étaient périmés) : APP 26 réels migrés (le « 27e » était un commentaire —
  prose), Onboarding 8 (dont 6 en Field), ProjectionControls 1 select (les 13 sliders = autre
  famille). EXCLUSIONS déclarées : PatrimoineExtended reste tel quel (grille dense hétérogène —
  col-span/px-0.5/text-tiny par cellule, une primitive y dégraderait) ; la prop « erreur » du
  ticket N'EST PAS livrée (aucun site migré n'affiche d'erreur aujourd'hui — un prop sans
  producteur est une intention jamais livrée) ; unification VISUELLE des trois densités non faite
  (changement visible = décision produit, pas un refactor). (≡ CA-08.)
- [x] **`[ENG-RAMQ-FIELDS]`** ✅ fait le 2026-09-04 (lot 155, PR #886) — `User.hasPrivateDrugInsurance`
  + case par personne (Profil → Options fiscales) + `ramqExemptAdultsCount` PAR ADULTE dans
  taxDecember (Annexe K : chaque conjoint calcule SA prime ; le drapeau de ménage `ramqExempt`
  reste accepté, le compte fin prime). Recensé : la bascule de MÉNAGE existait déjà — le manque
  était la granularité par adulte ET le producteur du champ. Reste routé (préexistant, hors
  périmètre) : `childrenCount` approximé via `childGoals.length` (TODO `User.dependentChildrenCount`
  dans projection.ts, inchangé).
- [ ] **`[T4]`** (M, par lots) — automatiser les tests manuels critiques en Playwright : 15 specs e2e
  aujourd'hui (re-compté 2026-09-04), cible 20-30. ⚠️ **PRÉMISSE MORTE (recensé 2026-09-04)** : la
  source annoncée, `docs/MANUAL_TEST_CHECKLIST.md`, a été SUPPRIMÉE par la PR #244 (réduction
  47→9 docs) et son contenu décrit une app d'avant la refonte nav (onglet « Accueil », fixtures
  Alex+Sam aux valeurs d'époque). Faire ce lot = RE-DÉRIVER la liste des parcours critiques depuis
  l'app ACTUELLE (onglets, flux réels), jamais depuis le récit mort — sinon on automatise des
  attendus périmés.

## 🚀 Gros chantiers (⏳ — plan-first + OK Marc par chantier)

- [ ] **`[ITEM-2A]`** (L, money-critical, approche VALIDÉE Marc 2026-06-16) — impôt NOMINAL.
  Phase 0 ✓ (golden). Restent : Phase 1 (threader `rate` dans getIndexedBracketsForYear — taux 1,02
  FIGÉ `utils/tax.ts:694` — + calculateFiscalReport/BPA/crédits/FSS/RAMQ, défaut 0,02 additif) ;
  Phase 2 (bascule ~10 sites sur revenu nominal, retirer les déflations, re-baser les golden
  SCIEMMENT, panel fiscal + validator).
- [ ] **`[CIX-B]`** (S, reste) — `owner` sur `Debt` (Asset ✓, netWorthByOwner ✓, carte ✓) + comptes.
- [ ] **`[CIX-A1B]`** (L, reste) — attribution SRG/DB/rentes per-conjoint end-to-end (soldes REER/FERR
  per-conjoint ✓).
- [ ] **`[CIX-A3]`** (M) — REER de conjoint : `useSpousalRrsp` déclaré (types.ts:650) mais JAMAIS lu
  (fonctionnalité fantôme, classe TX-DUPLICATES) → câbler le moteur ou retirer le champ.
- [ ] **`[CIX-A45]`** (M) — déductions au plus haut taux marginal + crédits transférables (frais
  médicaux, âge, conjoint) — seul le fractionnement pension existe.
- [ ] **`[CIX-C]`** (M, reste) — patrimoine familial QC (séparation) + comparateur ensemble vs séparé
  (décès/divorce stochastique ✓).
- [ ] **`[CIX-DE]`** (L) — optimiseur de couple + décaissement coordonné à 2 têtes (drawdownOptimizer
  sans perUser aujourd'hui).
- [ ] **`[CIX-F]`** (M) — bascule couple↔individuel sans perte (mémoriser le conjoint) + avatars.
- [ ] **`[ICONS-FUT]`** (S, requalifier — quasi couvert) — restent : icônes typées
  transferts/hypothèque/RAP/REEE + clustering LOD complet (le gros est livré par FUTUR-ICONS-RICH).
- [ ] **`[PH4-BUD]`** (🧭 cadrage Marc requis) — refonte Budget design (Budget techniquement sain ;
  a gagné les vues MONTH/QUARTER/YEAR/CUSTOM depuis).

---

## Audit de santé 2026-08-19 (panel de 9 agents, demandé par Marc)

> « Gros checkup de santé : finance, code, sécu, interface. » 9 agents lancés en parallèle sur
> l'état de `main` @ 1381ef7 (pas un diff). Chaque item est **[MESURÉ]** ou **[HYPOTHÈSE]**, et a
> été **reconfronté au vrai code par Claude** avant d'atterrir ici (règle : un finding
> money-critical est une hypothèse, ≈3/8 des HIGH sont faux).
> Les findings RÉFUTÉS sont en fin de section — ne pas les re-lever.

### ✅ Fiscal — impôt jamais facturé — **SECTION VIDE, tout est livré** *(en-tête conservé pour l'historique des liens ; il annonçait « les 2 plus gros de tout l'audit » et faisait croire à deux défauts d'argent OUVERTS)*

> ⚠️ Les deux CRITIQUES ci-dessous sont **invisibles pour la garde de conservation monétaire**
> (`projection.moneyConservation.test.ts` : 20/20 VERT avec les bugs en place). Un impôt jamais
> facturé ne crée ni ne détruit d'argent côté utilisateur — il faut une assertion sur **l'ASSIETTE**,
> pas sur les soldes. Mécanismes reconfirmés ligne par ligne par Claude ; montants mesurés par
> l'agent en exécutant le moteur.


### 🔴 Moteur — invariants et registres (agent `projection-validator`, tout MESURÉ)

> ✅ **Point chaud RÉSORBÉ — les QUATRE défauts sont livrés** (vérifié le 2026-09-02 : chacun est
> `[x]` dans `docs/BACKLOG_ARCHIVE.md`). `services/projection/realEstateMonth.ts` cumulait, trouvés
> par deux agents qui ne se parlaient pas, une assiette fiscale absente (`[REER-IMMO-HORS-ASSIETTE]`),
> un registre d'affichage absent (`retraitReerMois`), le plafond RAP d'un COUPLE accordé à une
> personne seule (`[RAP-DIVORCE-DEUX-TETES]`) et un taux marginal PLAT sur un retrait à six chiffres
> (`[EMPILEMENT-REER-ACHAT-IMMO]`).
> **Ce qui reste vrai, et c'est la seule raison de garder cette note** : le module d'achat immobilier
> a été écrit sans passer la checklist « quels registres ce producteur doit-il alimenter ? ». Tout
> nouveau producteur d'argent s'y confronte AVANT d'être livré. ⚠️ Cet en-tête annonçait encore
> quatre défauts OUVERTS le 2026-09-02 — il envoyait chercher un point chaud déjà nettoyé.


- [x] **`[CONSTANTES-MOTEUR-NON-SOURCEES]`** ✅ 2026-08-22 — les quatre nombres sont nommés et
  documentés dans `services/projection/modelAssumptions.ts` (un 4e site s'est ajouté au tri : le
  multiple 25× existait en DEUX copies anonymes, `projection.ts` et `monthlyOutput.ts`). ⚠️ Ils
  n'ont PAS été rangés dans `FISCAL_REFERENCE.md` : ce sont des hypothèses de MODÈLE, qu'aucune
  autorité ne publie — les y mettre leur prêterait l'autorité d'un texte de loi. ⚠️ Le tri a montré
  que le ticket groupait des enjeux **incomparables** : les deux tickets ci-dessous en sortent.

- [x] **`[SMITH-HELOC-TAUX-FIGE]`** ✅ 2026-08-24 — **décision Marc : « la marge suit l'hypothèque ».**
  Le taux de la marge du levier Smith n'est plus un littéral figé à 5 % : `smithHelocAnnualRate(goal.mortgageRate)`
  rend `hypothèque + 2 points`, avec un plancher à 3 %.
  ⚠️ **Ce n'est pas un chiffre d'affichage** : `useSmithManoeuvre` est dans l'espace de recherche de
  stratégies, donc ce taux décide de ce que l'app RECOMMANDE. Le 5 % figé pouvait passer SOUS le taux
  du prêt — une marge révolvante moins chère que le prêt de premier rang qu'elle accompagne, ce qui
  est impossible en pratique et flatteur dans le modèle, **précisément quand les taux montent et que
  le levier devient dangereux**.
  **Effet MESURÉ** (30 ans, célibataire 8 000 $/mois, maison 500 k$, rendement 6 %), gain du levier :
  hypothèque 3 % → **+639 889 $ inchangé** (la marge y vaut 5 %, comme avant : non-régression) ;
  hypothèque 5 % → **+489 760 $ → +413 769 $** ; hypothèque 8 % → **+275 001 $ → +32 263 $**, soit
  **242 738 $ d'avantage fantôme retirés** au taux le plus élevé.
  ⚠️ **La DIRECTION est structurelle, la MAGNITUDE est une hypothèse** : les 2 points ne sont pas un
  écart de marché relevé quelque part, et le module le dit — le documenter comme un « prime + 0,5 »
  fabriquerait la source qu'on prétend citer.
  7 tests neufs, **3 perturbations prouvées rouges**. **Deux gardes existantes ont rougi, comme elles
  devaient** : ma garde de LIMITE de `[CONSTANTES-MOTEUR-NON-SOURCEES]` (« l'intérêt ne suit PAS le
  taux ») — **INVERSÉE plutôt que supprimée**, un test de limite qui disparaît laisse croire que la
  limite n'a jamais existé — et le test voisin de `realEstateMonth`, dont la fixture à
  `mortgageRate: 5` coïncidait exactement avec l'ancien taux figé et ne pouvait donc RIEN discriminer.
  Elle discrimine maintenant. ⚠️ Aucun golden n'a bougé, et c'est EXPLIQUÉ : `useSmithManoeuvre` est
  faux par défaut et seuls 2 fichiers de test l'activent — aucun golden ne l'exerce.
- [ ] **`[COASTFIRE-CROISSANCE-FIGEE]`** (XS, FAIBLE — **portée mesurée NULLE**) — la croissance qui
  actualise la cible CoastFIRE est figée à 5 %/an, indépendante de `projection.returnRate` : deux
  utilisateurs qui projettent 4 % et 9 % obtiennent le même CoastFIRE, alors que la question n'a pas
  de sens sans le rendement. Même famille pour le revenu « barista » de 1 500 $/mois, qui ne s'indexe
  pas alors que les dépenses dont il se soustrait le sont. ⚠️ **Trancher d'ABORD si ces champs ont un
  consommateur** : `CoastFIRE` et `BaristaFIRE` sont publiés au contrat et lus par **personne**
  (mesuré, gardé). Corriger un champ que rien ne lit ne se distingue pas d'une régression — et la
  seule garde existante n'exerce que la branche post-retraite, où cette croissance n'intervient pas.


### 🔴 Valeurs fiscales sans source (viole le non-négociable `FISCAL_REFERENCE.md`)

> ⚠️ **Périmètre RÉVÉLÉ par `[FISC-GUARD-SCOPE]` (livré 2026-08-20, PR #666)** — l'élargissement du
> ratchet à 12 modules a sorti **76 littéraux / 63 clés** de l'ombre. Les quatre tickets ci-dessous
> sont désormais tous inventoriés et tracés dans `utils/fiscalConstGuardV2.ts` : aucun ne peut plus
> disparaître en silence. Trois DÉCOUVERTES s'y sont ajoutées (juste après).

- [x] **`[FLAKE-DIVORCE-INCOME-PHANTOM]`** ✅ 2026-08-22 — **NON reproduit** (8 exécutions vertes sur
  le même commit : 5 en isolation, 3 suites complètes). Le ticket supposait « ORDRE ou PARALLÉLISME » ;
  les mesures réfutent les deux, et toutes les autres explications faciles :
  · le RNG du Monte-Carlo est **entièrement graine** (`buildSeededRng(scenarioType, strategy, iterIndex)`,
    aucun `Math.random`) et **aucun `new Date()`/`Date.now()` n'existe dans la chaîne** → immunisé aux
    faux timers comme à l'ordre des fichiers ;
  · `vitest.config.ts` pose `fileParallelism: false` → il n'y a **pas** de parallélisme de fichiers, et
    **mesuré**, la durée des 3 tests dans la SUITE COMPLÈTE (2 289 / 1 888 / 1 343 ms) est la même
    qu'en isolation (2 400 / 1 838 / 1 417 ms) : **aucun effet de charge**, donc pas un dépassement de
    délai ;
  · la marge de l'assertion est **énorme** — mesuré `perte = 1,132` contre un seuil de 0,5, le scénario
    divorcé finissant à **−644 980 $** contre 4 885 681 $ sans divorce : aucun tremblement numérique ne
    peut la franchir.
  **Reste UN mécanisme possible, et il était réel** : une grandeur ABSENTE. `P50` est annulable côté
  moteur (`d.P50 = mcResult.p50Data[i] ?? null`) et le helper la convertissait en `NaN` en silence —
  `expect(NaN).toBeGreaterThan(0.5)` échoue alors avec un message qui **accuse le moteur d'un défaut
  d'argent inexistant**. Violation de `GARDE-AU-PRODUCTEUR-NE-PROUVE-PAS-LA-CHAINE`, leçon pourtant
  déjà indexée. **Livré** : le helper EXIGE la mesure avant de comparer. Perturbation (P50 forcé à
  `null`) : l'ancien helper rendait « expected NaN to be greater than 0.5 », le nouveau rend « P50
  ABSENT du dernier point ». La tolérance n'a PAS été élargie.

- [ ] **`[ESTATE-NPV-BASE-REELLE]`** (M, **ÉLEVÉ** — découvert en revue de `[ESTATE-NPV-07]`, PR #671) —
  la VAN des rentes publiques (`services/projection/estateCalculation.ts`, bloc `rrqExpected`/`psvExpected`)
  est bâtie sur l'estimé de SAISIE (`rrqEstimateMonthly` ou le split 65/35 de `governmentPension`)
  indexé à l'inflation, **pas** sur la rente que le moteur verse réellement. Elle ignore donc
  `rrqProrata` (gains/MGA × années de résidence). **MESURÉ** sur la fixture divorce : VAN RRQ
  599 584 $ contre 470 081 $ à partir de la rente réellement versée → **+129 503 $ de VAN
  surévaluée**. Le lot `[ESTATE-NPV-07]` a plombé la vraie rente (`pensionRrqMonthlyFinal`…) mais
  **uniquement pour le facteur d'impôt**, pas pour la VAN elle-même — les deux grandeurs divergent
  donc encore. C'est aussi la cause de la discontinuité résiduelle à la frontière de retraite
  (facteur 0,9068 juste avant, 1,0000 juste après, mesuré sur un horizon qui bouge d'UN an).
  ⚠️ Toucher à la VAN re-base des goldens ET peut déplacer le classement de `compareLifeScenarios` —
  vérifier le classement à 25/28/30/33/35 ans avant/après, comme #671 l'a fait.

  ⚠️⚠️ **INSTRUIT ET CHIFFRÉ le 2026-08-29, correctif TENTÉ puis REMIS — lire avant de recommencer.**
  · **Le finding est CONFIRMÉ**, par interception des entrées réelles de `computeEstateNetWorth`
    (fixture couple 45 ans, horizon 25 ans, inflation 2 %) :

    | rente | estimé indexé (base actuelle) | réellement versée | ratio |
    |---|---|---|---|
    | RRQ | 3 609 $/mois | 2 310 $/mois | **0,640** |
    | PSV | 2 297 $/mois | 2 297 $/mois | 1,000 |
    | **total** | **5 906 $/mois** | **4 607 $/mois** | **0,780** |

    Soit **22 % de VAN surévaluée**, et c'est le **RRQ SEUL** qui diverge — le PSV colle au centime.
    C'est la signature exacte du prorata de gains/résidence, comme le ticket l'annonçait.
  · **Piège d'unité à ne pas rater** : la rente réelle est DÉJÀ en dollars nominaux de l'année
    finale ; seule la branche ESTIMÉ doit s'indexer. La ré-indexer la gonflerait de ×1,64.
  · ⚠️ **MAIS le correctif ne se limite PAS à changer la base de la VAN**, et c'est pour ça qu'il a
    été remis plutôt que livré à moitié. Changer `rrqExpected`/`psvExpected` seuls fait tomber
    **5 tests d'`[ESTATE-NPV-07]`** qui ne sont PAS des goldens : ce sont des invariants de
    CONCEPTION. `rentesValorisees` (ce que la VAN valorise) et `rentesReellesAnnuelles` (l'assiette
    imposable) sont couplées par un « complément » ajouté au contexte fiscal, dont l'unique raison
    d'être est d'assurer la CONTINUITÉ du facteur d'impôt au démarrage d'une rente. Baser la VAN sur
    le réel rend ce complément ~nul en phase de rente — ce qui est probablement plus juste — mais
    **change la sémantique du facteur**, donc les preuves du lot #671. Le vrai périmètre est le
    COUPLE (VAN, assiette), pas une base. Classe `UN-FLUX-ALIMENTE-PLUSIEURS-REGISTRES`.
  · **Ce qu'il reste à trancher** : (i) en phase de rente, le contexte fiscal devient le revenu réel
    seul — est-ce voulu ? (ii) la branche PRÉ-retraite garde forcément l'estimé indexé (aucune rente
    versée) : les deux régimes cohabitent, il faut que la frontière reste continue ; (iii) le SRG est
    inclus dans `.psv` et réellement versé — le garder dans la VAN (flux reçu) tout en le retranchant
    de l'assiette (non imposable) est défendable, mais suppose qu'il reste versé sur tout l'horizon.

- [ ] **`[ESTATE-NPV-CONTEXTE-PLURIANNUEL]`** (M, MOYEN — découvert en revue de `[ESTATE-NPV-07]`, PR #671) —
  le facteur net d'impôt de la VAN se calcule sur le revenu de retraite d'UN SEUL point (l'année
  finale) alors qu'il valorise 25 ans de rentes. #671 a retenu un contexte **structurel**
  (`incomeRetirement × 12 + accRentesYear`, hors retrait REER ponctuel) parce que c'est la seule
  variante qui ne fait pas basculer la recommandation de décaissement au gré du curseur d'horizon —
  mais l'hypothèse a un sens d'erreur ASSUMÉ : pour un retraité qui décaisse son REER/FERR chaque
  année, elle sous-estime le revenu récurrent, donc **surestime** le facteur (0,9335 au lieu de
  0,8987 mesuré sur la fixture divorce). Le correctif propre est un revenu de retraite MOYEN sur les
  années restantes. ⚠️ `estateNetWorth` est l'objectif de tri de `drawdownOptimizer.ts` et le score
  `wealth` de `strategyRanking.ts` : toute variante doit être mesurée sur le CLASSEMENT, pas seulement
  sur la valeur.
  ⚠️ **Ce ticket a gagné un COMPAGNON obligatoire le 2026-09-02** (lot 85) : la bande des rentes doit
  aussi recevoir les crédits d'âge (`[FISC-BANDES-FRERES-SANS-AGEOPTS]`), et les deux ne peuvent PAS
  se livrer séparément — câbler les crédits seuls inverse l'invariant « une pension DB pleinement
  indexée ne peut pas appauvrir » pour tout horizon ≤ ~9 ans (mesures dans l'autre ticket). Le
  contexte pluriannuel est le prérequis : c'est lui qui rend la sensibilité au revenu légitime.

- [ ] **`[ESTATE-COUPLE-DECLARANT-UNIQUE]`** (M, MOYEN — découvert en revue de `[ESTATE-NPV-07]`, PR #671) —
  `estateCalculation.ts` empile la liquidation successorale sur UNE déclaration (hypothèse du double
  décès, correcte pour la liquidation). `[ESTATE-NPV-07]` réutilise ce même revenu mono-déclarant
  pour taxer la VAN — or cette VAN représente des rentes encaissées **par deux personnes, sur deux
  déclarations, pendant 25 ans**. Le barème étant progressif, l'abattement est structurellement trop
  élevé pour un couple. Hypothèse de modèle NOUVELLE, à > 100 k$ d'impact, écrite nulle part hors du
  commentaire de code. **Correctif** : soit ventiler la VAN par conjoint avant d'appliquer le barème,
  soit documenter l'hypothèse dans `docs/PROJECTION.md` et la nommer dans l'UI.

- [x] **`[ASSETLOC-INCLUSION-RECOPIEE]`** ✅ LIVRÉ 2026-08-21 (voir docs/BACKLOG_ARCHIVE.md). Contexte d’origine : (XS, MOYEN — découvert en revue de `[FISC-GUARD-SCOPE]`) —
  `services/projection/assetLocation.ts:117` écrit `return marginalRate * 0.5` : le taux d'inclusion
  des gains en capital **recopié en dur**. C'est le SEUL site du dépôt à le faire — `latentTax`,
  `estateCalculation`, `retirementIncome`, `taxDecember`, `taxEstimate` et `projection.ts` importent
  tous `CAPITAL_GAINS_INCLUSION_STANDARD` (vérifié par grep). Il était invisible parce que `0.5`
  figurait dans le `BENIGN` du garde. **Correctif** : importer la source unique. Rétrocompat
  bit-identique tant que le taux vaut 50 %, et c'est justement l'intérêt : le jour où il change,
  ce site suivra.

- [ ] **`[FISC-REEE-AGE-FERMETURE]`** (XS, FAIBLE — découvert en revue de `[FISC-GUARD-SCOPE]`) —
  ✅ **DÉCISION Marc 2026-09-05 (en session)** : « 35 ans » CONFIRMÉ par recherche relayée — mais c'est **35 ans après l'OUVERTURE** (cotisations 31 ans), pas un âge de l'enfant. Reste UNE question à Marc : garder 25 ans comme hypothèse de simulation documentée (reco) ou aligner sur ouverture + 35.
  `services/projection/childrenReee.ts:401` ferme le REEE à **25 ans** alors que le régime réel
  autorise 35 ans. L'écart est un choix de simulation défendable, mais il n'est **documenté nulle
  part** : `FISCAL_REFERENCE.md` ne mentionne ni « 35 ans » ni l'âge de fermeture (vérifié — le §9
  ne couvre que le PRA, le clawback de subventions et les PAE). **Correctif** : une ligne en §9,
  ou aligner sur 35.
  ⚠️ **BLOQUÉ sur une source (2026-08-25)** → routé en `docs/A_FAIRE_MOI.md` **B8**. Le ticket
  AFFIRME « 35 ans » — mais un ticket n'est pas une source, et le proxy bloque `canada.ca`.

- [x] **`[ASSETLOC-YEAR-2026]`** ✅ LIVRÉ 2026-08-21 (voir docs/BACKLOG_ARCHIVE.md). Contexte d’origine : (XS, FAIBLE — découvert par `[FISC-GUARD-SCOPE]`) —
  `services/projection/assetLocation.ts:135` lit le taux marginal avec une année fiscale de repli
  **écrite en dur à 2026**. En 2027 le module consultatif lira un barème périmé sans rien dire.
  **Correctif** : reprendre l'année courante du moteur plutôt qu'un littéral.

- [x] **`[FISC-GUARD-ARGUMENT]`** + **`[FISC-GUARD-BENIGN-60]`** ✅ 2026-08-22 (livrés ENSEMBLE, le
  ticket l'exigeait : le `60` de la RRQ était caché DEUX fois, par l'exemption ET par la position).
  ⚠️ **L'arbitrage du ticket était FAUX, et son inverse aussi.** Le ticket annonçait « ~1 clé fiscale
  pour ~15 de bruit ». RE-MESURÉ : le motif large `/[(,]$/` sort **26 clés neuves dont 16 fiscales**
  — ce qui semble renverser l'arbitrage. Mais 14 de ces 16 sont les **âges** de la table FERR, dont
  le fait est DÉJÀ porté par les 24 entrées de **taux** (`RRIF_RATES[73]` etc.) : des clés fiscales
  qui n'ajoutent **aucune protection**. Le motif retenu, `/\w\($/` (1er argument d'un APPEL), sort
  **11 clés + 3 comptes** et attrape **les DEUX barèmes réellement neufs** — l'âge 18 de début de la
  période cotisable RRQ et la borne 60 d'anticipation — soit **100 % de la protection pour 42 % des
  entrées**. Il évite en prime un faux positif que le motif large importait : « (18 ans) » dans un
  MESSAGE utilisateur de `childrenReee.ts` (`SCAN-QUI-MATCHE-LA-PROSE`, cette fois dans un littéral
  de chaîne — hors de portée de `stripComments`). 3 tests neufs, **3 perturbations prouvées rouges**.

- [x] **`[TAXBRACKETVIZ-ANNEE]`** ✅ 2026-08-22 — paire recâblée : `TaxBracketViz` reçoit désormais
  une année **REQUISE** (aucun défaut : un `= 2026` se périme en silence, et lire l'horloge dans le
  composant en ferait une bombe au 1er janvier), et l'utilise pour les **barres ET le total**.
  Nouvel export `bracketsForYear` dans `utils/tax.ts`, qui lit `getIndexedBracketsForYear` — la
  source dont `calculateFiscalReport` tire son impôt, jamais une ré-indexation recopiée.
  Côté `Retirement`, une SEULE lecture d'horloge alimente maintenant le brut déduit et les paliers.
  ⚠️ **Le chiffre du ticket était faux, et sa nature aussi.** Il annonçait « 333 $ sur 86 968 (0,4 %)
  dès 2027 — visuellement invisible, d'où FAIBLE ». RE-MESURÉ sur l'impôt total : **+212 $ (1,0 %)
  en 2027, +874 $ (4,4 %) en 2030, +2 069 $ (11,1 %) en 2035** à 86 968 $ de brut ; **+5 095 $ à
  200 000 $ en 2035**. Ce n'est pas un biais FIXE : il COMPOSE à ~2 %/an, comme l'indexation qu'il
  ignore. À dix ans l'impôt affiché est surévalué de plus de 11 %.
  6 tests neufs, **3 perturbations prouvées rouges** — dont les DEUX demi-correctifs que le ticket
  interdisait à juste titre (barres figées + total indexé, et l'inverse), chacun produisant une
  incohérence visible entre des barres et la somme affichée juste en dessous.
- [x] **`[GROSSFROMNET-CREDITS-65]`** ✅ 2026-08-24 — **décision Marc : tout câbler, moteur inclus.**
  `calculateGrossFromNet` accepte désormais `ageOpts` (optionnel, défaut NEUTRE), et les **quatre**
  appelants de production le passent PAR UTILISATEUR via la source unique
  `ageOptsForSalaryInversion` — `Retirement`, `TaxCenter` (aux **DEUX bouts** de son aller-retour),
  `buildSimulationParams`, et le socle `computeIncomeBaseline`, dont le type `users` a dû être élargi
  pour recevoir `age`/`birthYear`.
  ✅ **Les chiffres du ticket étaient EXACTS** au dollar près (+1 904 $ à 36 k$ de net, +1 018 $ à
  48 k$, +391 $ à 60 k$) — j'ai failli le déclarer faux en mesurant côté BRUT alors qu'il annonçait,
  et NOMMAIT, un écart en NET. Leçon écrite.
  Mesures ajoutées : côté brut l'écart atteint **+3 041 $ à 30 k$ de net (6,7 % du net)** et
  **disparaît au-dessus de ~80 k$** — le défaut mordait surtout EN BAS de l'échelle. Le cas COUPLE
  diffère du SOLO (+2 527 $ contre +3 004 $ à 36 k$) : `hasSpouse` est dérivé du nombre d'ACTIFS, pas
  de `users.length`, sinon un ménage dont le second membre n'a aucun revenu serait sur-crédité.
  Contre-épreuve à 64 ans : écart exactement 0.
  ⚠️ **AUCUN golden n'a bougé — et c'est EXPLIQUÉ, pas constaté** : l'effet exige les DEUX conditions
  à la fois (65 ans et plus **ET** aucun brut saisi), or les fixtures de goldens ont toutes un brut.
  Un test dédié construit ce profil pour prouver que le câblage moteur n'est pas inerte, et un autre
  vérifie qu'un 66 ans AVEC brut saisi n'est pas touché.
  10 tests neufs, **3 perturbations prouvées rouges** (paramètre non transmis · socle moteur muet ·
  `hasSpouse` figé). Un 11e test existant a rougi : ma propre garde de `[TAXBRACKETVIZ-ANNEE]`,
  ancrée sur l'ARITÉ de l'appel — resserrée sur le FAIT qu'elle défend.
- [ ] **`[RQAP-PHASES-70-55]`** (M, MOYEN — sorti de `[RQAP-CAP-98K]`, décision PRODUIT) — le moteur
  applique **55 % plat** sur les 12 mois de congé parental. Le régime de BASE du RQAP verse en
  réalité **70 %** pendant la maternité/paternité et le début du parental, puis 55 % — donc le début
  du congé est SOUS-ESTIMÉ. Le corriger fidèlement demande de modéliser le nombre de semaines par
  prestation **et** le choix entre régime de base et régime particulier, que l'app ne saisit nulle
  part. ⚠️ **Ce n'est pas un correctif, c'est une feature** : il faut d'abord décider si on demande
  le régime à l'utilisateur ou si on assume le régime de base. La constante est déjà NOMMÉE
  (`RQAP_REPLACEMENT_RATE_BASE`) et la divergence documentée sur place + FISCAL_REFERENCE §2.

- [x] **`[JOBLOSS-DUREE-N-PLUS-1]`** ✅ LIVRÉ 2026-08-21 (voir docs/BACKLOG_ARCHIVE.md). Contexte d’origine : (XS, FAIBLE — revue #675) — `jobLossDurationMonths: 6` produit
  **7 mois** de prestation (le mois de déclenchement est déjà réduit, puis le compteur en décompte
  6 de plus) ; le log dit « durée prévue 6 mois ». ~347 $/mois d'écart sur un épisode. Pré-existant.

- [ ] **`[FISC-BANDES-FRERES-SANS-AGEOPTS]`** (S, MOYEN — revue #676 · **deux tiers livrés** :
  `latentTax` au lot 84, bande SUCCESSORALE de `estateCalculation` au lot 85, 2026-09-02) —
  ⬜ **RESTE le SEUL site `facteurNetRentes`**, et il est **BLOQUÉ, pas oublié** : à livrer dans le
  MÊME lot que `[ESTATE-NPV-CONTEXTE-PLURIANNUEL]` ci-dessus, jamais seul.
  **MESURÉ au lot 85** (fixture `buildAtRetirement`, couple 64 ans, DB 2 000 $/mois) : câbler les
  crédits d'âge sur cette bande INVERSE l'invariant vrai « une pension DB pleinement indexée ne peut
  pas appauvrir ». Écart `indexée − non indexée` du patrimoine successoral, par horizon :
  5 ans **+4 836 → −4 845 $** · 6 ans +9 324 → −2 594 · 8 ans +15 999 → −175 · 10 ans +26 284 →
  +6 398 · 25 ans +327 886 → +315 912. Le point de bascule passe de « sous 5 ans » à « ~9 ans ».
  ⚠️ **La cause n'est PAS le crédit d'âge** : décomposition par site à 5 ans, bande successorale
  seule = +4 764 $ (invariant intact), bande des rentes seule = **−4 773 $**. C'est l'artefact
  `[ESTATE-NPV-CONTEXTE-PLURIANNUEL]` (facteur d'UNE année appliqué à une VAN pluriannuelle) que
  rendre le facteur plus sensible au revenu AMPLIFIE. Livrer la moitié isolément déplacerait un
  chiffre faux au lieu de le corriger (`DES-TESTS-ROUGES-QUI-ENCODENT-UNE-CONCEPTION-NE-SE-RE-BASENT-PAS`).
  L'état actuel est BORNÉ par un test qui doit MOURIR au moment du correctif couplé
  (`tests/services/estateAgeCredits.test.ts`, cas « INVENTAIRE DE DETTE »).


- [ ] **`[ENG-RENTES-ACTIF-APRES-AGE-MAX-REPORT]`** (M, MOYEN — découvert au lot 195 en mesurant le persona « Gilles, 71 ans », MESURÉ) — **un ménage ACTIF ne touche AUCUNE rente RRQ/PSV tant que `isRetired` est faux**, quel que soit son âge : `computeRetirementIncome` n'est appelé que sous `if (isRetired)` (`services/projection.ts`, phase retraite), et `rrqStartAge`/`psvStartAge` ne sont lus que là. Or la PSV ne se reporte pas au-delà de **70 ans** ni la RRQ au-delà de **72** (`PSV_DEFERRED_START_AGE`, `RRQ_DEFERRED_START_AGE`) : un travailleur de 71-75 ans les REÇOIT obligatoirement. Mesuré sur Gilles (71 ans, `targetAge` 76, `governmentPension` 2 100 $/mois) : `IncomeRetirement` vaut **0 sur les 60 premiers mois**, premier versement au mois 60 (76 ans) — ≈ **126 k$ bruts** de rentes jamais versées ni imposées (avant impôt et récupération PSV, `[À vérifier]` en net). Population : quiconque saisit un `targetAge` > 70. ⚠️ Correctif non trivial : les rentes de la branche active doivent aussi entrer dans l'assiette de décembre (§1 actif) et dans la récupération PSV — grep les DEUX registres avant de câbler, comme pour les retraits REER actifs (`[REER-ACTIF-NON-RECONCILIE]`). Le `governmentPension` saisi est un AGRÉGAT RRQ+PSV : le découpage par âge de début est à décider (Marc). Non corrigé au lot 195 (hors périmètre, bug préexistant signalé).

- [x] **`[TAXDEC-BANDE-ACTIVE-BASE-BRUTE]`** ✅ CONSIGNÉ 2026-08-22 (FISCAL_REFERENCE §4 + garde ; voir docs/BACKLOG_ARCHIVE.md). Contexte d’origine : (XS, FAIBLE — revue #676, financial-integrity F6) —
  branche ACTIVE : `incomeForGains` est le salaire BRUT alors que le §4 accorde le crédit d'âge sur
  le taxable NET des déductions (REER/FHSA). Un travailleur 65+ qui cotise voit l'érosion de sa
  bande calculée depuis une base plus haute que celle du crédit → sous-facturation bornée
  (~1 153 $/adulte/an max). Population marginale ; incohérence née de #676 (avant, la bande active
  ne portait aucun crédit). Documenter en limite assumée OU aligner la base. [MESURÉ borné]

- [x] **`[TAXDEC-SPLIT-EGAL-VS-PERUSER]`** ✅ CONSIGNÉ 2026-08-22 (FISCAL_REFERENCE §4 + garde ; voir docs/BACKLOG_ARCHIVE.md). Contexte d’origine : (XS, FAIBLE — revue #676, financial-integrity F5) — le
  crédit d'âge FÉDÉRAL s'érode sur le revenu individuel : le bloc §6 le calcule sur
  `taxableRealByUser[i]` (asymétrique si `usePerUser`), la bande sur `incomeForGains / N` (moyen).
  Pour un couple 90/10, crédit accordé et crédit érodé ne se chaînent pas. Approximation
  PRÉ-EXISTANTE des paliers étendue aux crédits — signe dépendant du profil : consigner comme
  limite assumée (FISCAL_REFERENCE §4), ne PAS « corriger » à l'aveugle. [À consigner]

- [x] **`[KEYSTORE-DECRYPT-FAILED-SILENCIEUX]`** ✅ LIVRÉ 2026-08-21 (voir docs/BACKLOG_ARCHIVE.md). Contexte d’origine : (XS, MOYEN — revue #676, silent-failure-hunter,
  HORS diff : préexistant) — `services/secureKeyStore.ts:252-253` : à la sauvegarde de clés,
  `existing?.status === 'ok'` traite `decrypt_failed` (coffre corrompu → champs device-local
  `fintable` NON préservés) exactement comme `empty` (rien à préserver), sans trace. Classe
  `REPLI-SILENCIEUX-LEGITIME-VS-CORRUPTION` : `empty` est légitime, `decrypt_failed` mérite un
  `logError`. Le `.catch(() => null)` externe est mort (la fonction encode l'erreur dans son
  retour — `PATRON-COPIE-AVEC-SON-CONTRAT-D-ERREUR`). [VÉRIFIÉ dans le code par la revue]

- [ ] **`[PROJ-TAXPAID-SOLDE-AVRIL]`** (S, MOYEN — revue du correctif 12×, 2026-08-20) —
  `totalTaxesPaid` (`services/projection.ts`, `+= fluxImpots`) ne somme QUE les règlements d'avril,
  et l'avril actif vaut `totalAnnualTax − estimatedWithholding` — donc **négatif structurel** dès
  qu'il y a des déductions REER/CELIAPP (mesuré −126 094 $ sur un témoin sans W5) : la retenue
  salariale, incorporée au `netSalary` saisi, ne transite jamais par `fluxImpots`. Nom trompeur
  (`UN-NOM-TROMPEUR-FABRIQUE-DES-FAUX-FINDINGS`). Pas affiché à l'écran, MAIS pilote
  `strategyRanking.ts` (`lifetimeTax`), `drawdownOptimizer` et `strategySearch` — un objectif
  « impôt minimum » assis sur un solde d'avril. ⚠️ Se coordonne avec `[ENG-RANKTAX-ESTATE]`
  (LIVRÉ 2026-08-21 : l'objectif score désormais lifetimeTaxTotal — le biais des retenues reste).
  ⚠️ Relecture #681 : le biais n'est PAS constant entre stratégies sous T1213
  (optimizeSourceDeductions) — la retenue absorbe les déductions REER strategy-dépendantes,
  écart mesuré 107 530 $ entre PRIO_REER et PRIO_CELI sur le même profil. [MESURÉ]

- [ ] ⏸️ **`[W5-RENTAL-DPA-ELECTION]`** (relevé de **S à L** — la décision choisie l'exige, voir plus bas ;
  découvert en livrant `[W5-RENTAL-INTERET-DPA]`, lot 188 ; **✅ DÉCISION MARC répondue le 2026-09-14
  (en clic) : option 3, élire AVEC vente et recapture — plan-first posé dans `docs/A_FAIRE_MOI.md`,
  GO en attente**) — la DPA (déduction pour amortissement, catégorie 1,
  4 %/an dégressif, règle de demi-année) n'est PAS modélisée : `RentalProperty.ccaTaken` est une DPA
  **CUMULÉE** saisie pour la recapture à la vente — or la vente n'est pas modélisée non plus, donc le
  champ n'a aucun lecteur (`UN-CHAMP-SANS-LECTEUR-NE-SE-CORRIGE-PAS-EN-LUI-DONNANT-UNE-SAISIE`). Élire la
  DPA chaque année est un CHOIX de l'utilisateur (elle ne peut pas créer une perte de location, et elle
  est reprise à la vente) : la modéliser sans la vente surévaluerait le patrimoine, ne pas la modéliser
  le sous-évalue pour un bailleur qui l'élit. Trois issues posées à Marc : ne pas modéliser et le DIRE à
  l'écran ; élection par immeuble (case + taux) sans recapture ; élection AVEC vente/recapture.
  [MESURÉ : 0 lecteur de `ccaTaken` ; ampleur DPA ≈ 4 % × (valeur − terrain) × proxy/an, non mesurée]

- [ ] 🔴 **`[IMMO-BUT-LOCATIF-LOYER-NON-IMPOSE-ACTIF]`** (S, **ÉLEVÉ money-critical** — découvert au lot 189
  en MESURANT le jumeau ci-dessous, 2026-09-05 ; **plan P5 à valider dans `docs/A_FAIRE_MOI.md`**) — le
  loyer d'un BUT immobilier locatif (`realEstateMonth.ts` → `accRentesYear`) n'entre dans l'assiette
  du barème de décembre QUE dans la branche RETRAITÉE (`taxDecember.ts` §1, `basePensionAnnual`) ; la
  branche ACTIVE taxe `salaire + retraits REER` seulement — le loyer d'un ménage qui travaille n'est
  imposé par AUCUN barème (il n'entre que dans les bases RAMQ/FSS et la récupération PSV). Miroir
  exact de `[REER-ACTIF-NON-RECONCILIE]` (2026-08-19 : la branche retraitée avait le terme, l'active
  pas). **MESURÉ** (couple 260 k$ actif 30 ans, condo loué 350 k$ / 1 500 $ de loyer, prêt 280 k$ à
  4,5 %) en ajoutant le loyer à l'assiette active (part égale par adulte, comme la branche
  retraitée) : impôt cumulé **+63 242 $ à 10 ans, +156 559 $ à 20, +264 356 $ à 30** ; patrimoine
  final **−76 038 $ / −224 099 $ / −436 909 $** (−4,1 % à 30 ans) ; sans hypothèque
  −79 189 $ / −228 719 $ / −443 392 $. Le persona et les fixtures à `rentalIncomeMonthly` (7 fichiers
  de tests) re-baseraient. ⚠️ DOIT se livrer AVEC le jumeau ci-dessous (la déduction des intérêts) :
  l'un sans l'autre est faux dans un sens ou dans l'autre. ⚠️ L'assiette d'EMPLOI (RRQ/RQAP/AE)
  reste le salaire seul, comme pour les retraits REER. [MESURÉ]

- [ ] **`[IMMO-BUT-LOCATIF-INTERET-BRUT]`** (S, MOYEN — JUMEAU trouvé en livrant `[W5-RENTAL-INTERET-DPA]`,
  lot 188 ; ⚠️ **NE PAS livrer seul — apparié à `[IMMO-BUT-LOCATIF-LOYER-NON-IMPOSE-ACTIF]`, plan P5**.
  MESURÉ au lot 189, 2026-09-05 : la déduction SEULE (`accRentesYear += loyer − intérêt`, revenu
  gagné net) sur le couple actif ci-dessus donne impôt **inchangé** au dollar près quand le revenu
  gagné reste brut, et patrimoine **−2 820 $ / −6 836 $ / −10 076 $** à 10/20/30 ans quand il
  passe net — parce que le loyer n'est pas imposé en phase active, la déduction ne réduit AUCUN
  impôt et ne fait que retirer des droits REER : une perte sèche, le cas d'école
  `CABLER-UNE-ANNEE-C-EST-CABLER-UNE-PAIRE`. Le code a été écrit, mesuré, puis RETIRÉ) — le loyer d'un BUT immobilier locatif (`realEstateMonth.ts`, `goal.rentalIncomeMonthly` →
  `accRentesYear`, imposé au barème en décembre) est imposé BRUT des intérêts hypothécaires, alors que
  `state.immoInterest` les calcule au même endroit et que le lot 188 vient de les déduire pour le chemin
  W5 — deux chemins, deux règles pour le même fait fiscal (T4036 ligne 8710). ⚠️ Pas au proxy ici : la
  déduction doit RÉDUIRE l'assiette `accRentesYear` (barème complet), pas un `divers` forfaitaire — et
  `accRentesYear` a d'AUTRES lecteurs (crédit de pension ? fractionnement ?) à recenser AVANT (leçon
  « un flux moteur alimente plusieurs registres »). [Dérivé, à mesurer : ≈ 12,5 k$ d'intérêts la
  1re année sur le condo 350 k$ à 4,5 % de la fixture `rrspRentalEarnedWiring`, imposés en trop au
  taux marginal du ménage]

- [x] **`[W5-DOUBLE-SAISIE-LOCATIF]`** ✅ LIVRÉ 2026-08-22 (note UX aux DEUX écrans ; voir docs/BACKLOG_ARCHIVE.md). Contexte d’origine : (XS, FAIBLE — revue 2026-08-20) — rien n'empêche de saisir
  le MÊME immeuble comme `realEstateGoal` avec `rentalIncomeMonthly` (imposé via `accRentesYear` en
  décembre) ET comme `rentalProperty` W5 (imposé par le forfait) → double comptage du revenu et
  double imposition par deux mécanismes distincts. Garde de saisie ou note UX. [À vérifier]

- [ ] **`[W5-DIVIDENDE-PROXY-VS-MOTEUR]`** (S, MOYEN — découvert en livrant `[W5-PROXY-NON-SOURCE]`,
  PR #673) — `services/projection/w5Effects.ts` impose le dividende CCPC à un forfait de 36 %, alors
  que **le dépôt sait déjà le calculer exactement** : `utils/tax.ts` `calculateDividendTax` applique
  la majoration (38 % déterminé / 15 % ordinaire) et les deux crédits d'impôt pour dividende, dans
  le bon ordre vis-à-vis de l'abattement québécois. C'est le cas d'école « grep le moteur : s'il
  l'émet déjà, le CONSOMMER ». **MESURÉ** sur 30 k$ de dividende, barème 2026 : le forfait ne vaut
  que pour un dividende **ORDINAIRE à ~100 k$** de revenu (36,04 %) ; il sur-impose un dividende
  **DÉTERMINÉ** de **+7 606 $/an** à 40 k$ de revenu et **+2 969 $** à 100 k$, et sous-impose un
  actionnaire à 250 k$ de **−3 526 $/an**. ⚠️ Bloquant produit : `PrivateBusiness` ne porte pas le
  TYPE de dividende — il faut d'abord ajouter le champ (déterminé / ordinaire), donc c'est un lot
  avec une décision Marc, pas un remplacement mécanique. ⚠️ Re-baserait des goldens. [MESURÉ]

- [x] **`[ENV-NODE-NON-DECLARE]`** ✅ LIVRÉ 2026-08-21 (voir docs/BACKLOG_ARCHIVE.md). Contexte d’origine : (XS, MOYEN) — aucun `engines` dans `package.json`, aucun `.nvmrc` :
  la seule déclaration de la version visée est `node-version: '20'`, répété dans **4 workflows**
  (`ci.yml` ×2, `lighthouse.yml`, `refresh-screenshots.yml`). Le conteneur de dev tourne sur Node
  **22**. **Conséquence MESURÉE le 2026-08-19** : `globSync` (`node:fs`, Node 22+) a donné un gate
  local VERT et une CI ROUGE sur le même commit (`TypeError: globSync is not a function`, PR #665).
  Rien n'avertit à l'écriture. **Correctif** : `engines: { node: '20.x' }` + `.nvmrc`, et faire
  pointer les workflows dessus plutôt que de répéter le littéral (`DOC-METRIQUE-RECOPIEE` appliqué à
  une version). ⚠️ Modification de chaîne d'outils → **valider avec Marc avant** : un `engines`
  strict peut casser un `npm install` local sur une autre machine. [MESURÉ]

### 🔴 No-fake-data — la garde de `formatCAD` annulée sur place

### 🔴 Argent — valeurs fausses ou silencieuses

- [ ] **`[BACKUP-TEXTE-INCONNU-REFUSE]`** (S, FAIBLE) — limite ASSUMÉE de la garde de type livrée au
  lot 41 : elle refuse une chaîne sous une clé que l'app ne connaît pas encore, donc un backup
  produit par une version **plus récente** et portant un nouveau champ textuel ne se restaurerait
  pas. Accepté parce que (1) le cas suppose de restaurer un fichier plus récent que l'app qui le
  lit, (2) tout champ texte ajouté au produit entre dans `types.ts` et fait rougir le canari en CI,
  (3) l'alternative — lister les champs numériques — échoue en SILENCE sur le money-critical. À
  revoir si le cas se présente vraiment. Le raisonnement complet est dans
  `tests/components/backupSchemaTypes.test.ts`.


### 🔴 Interface — atteignabilité et clavier

- [x] **`[A11Y-CONTRAST-TOOL-GAP-CTA]`** ✅ LIVRÉ 2026-08-21 (voir docs/BACKLOG_ARCHIVE.md). Contexte d’origine : (XS, FAIBLE) — `scripts/check-contrast.ts` ne teste que
  `text-{couleur}` sur les 3 fonds de page ; il ne teste **pas** les CTA pleins
  (`bg-{danger,info,warning,success}-600` + `text-white`, ex. `DebtManager.tsx:128`,
  `TaxCenter.tsx:342`). C'est un **trou de couverture de l'outil-arbitre**, pas un échec constaté
  (non mesuré, et on ne juge pas un contraste à l'œil). Correctif : étendre le script, puis rejouer.
- [x] **`[A11Y-PCT-NOT-MASKED]`** ✅ LIVRÉ 2026-08-21 (voir docs/BACKLOG_ARCHIVE.md). Contexte d’origine : (XS, FAIBLE) — `components/investments/NetWorthByOwnerCard.tsx:66` :
  le montant par personne passe par `PrivateAmount` mais le **pourcentage** juste à côté non, alors
  que `FutureKpiStrip` traite explicitement un `%` comme une donnée financière à masquer. Un % de
  répartition entre conjoints reste une info relationnelle. [MESURÉ]

- [ ] **`[A11Y-CTA-HORS-SCAN]`** (S, FAIBLE, 🧭 **décision d'APPARENCE — Marc tranche**) — angle
  mort RESTANT de `check-contrast` une fois `[A11Y-CTA-CONTRASTE-OFFENDERS]` livré. Le scan lit les
  fonds `bg-{famille}-{shade}` et `hover:bg-…` **littéraux** ; trois familles lui échappent encore,
  et deux sont MESURÉES non conformes :
  - `bg-secondary` + `text-white` → **3,67** (`components/ui/Button.tsx:18`, variante `secondary`) :
    token PLAT, hors du motif `-\d{3}` du scan. `text-dark` sur ce même fond vaudrait **5,43**.
  - `bg-amber-700` + `hover:brightness-110` → **4,28** (`components/StatementReminder.tsx:87`) : un
    FILTRE CSS échappe par construction à un scan de classes. Le repos (5,02) est conforme, le
    survol non — c'est exactement le motif corrigé dans `CeliAssetNudge` par le ticket parent.
  - fonds TRANSLUCIDES (`bg-amber-700/60` + `text-white`, `components/BackupReminder.tsx:126`) :
    exigent une composition sur le fond sous-jacent, hors périmètre déclaré de l'outil.
  Correctif proposé : passer les deux premiers à une teinte conforme PAR MESURE (jamais à l'œil),
  puis étendre le scan aux tokens plats en fond. Le troisième reste un angle mort assumé et écrit.

### 🔴 IA / Anthropic

- [x] **`[AI-UNBOUNDED-CONFIDENCE]`** ✅ LIVRÉ 2026-08-21 (voir docs/BACKLOG_ARCHIVE.md). Contexte d’origine : (XS, ÉLEVÉ) — `CategorizeItemSchema` / `SubscriptionItemSchema`
  / `CoupleOptimizationStrategySchema` valident `confidence`, `averageAmount`, `dayOfMonth`,
  `yearlyCost` avec `z.number()` **nu** (`services/claude.ts:60-76`), alors que `PayslipSchema` a été
  durci (`.positive().finite()`) pour exactement ce risque. Une confiance hallucinée traverse
  `safeJsonValidate` et s'affiche verbatim (`components/Transactions.tsx:893-894`, 985-986) :
  « Confiance: 9999 % ». Correctif : `.min(0).max(100)` sur `confidence`, `.nonnegative().finite()`
  sur les montants, + clamp défensif à l'affichage. [MESURÉ, reconfirmé par Claude]
- [x] **`[BUDGET-AI-WRONG-MODEL]`** ✅ LIVRÉ 2026-08-21 (voir docs/BACKLOG_ARCHIVE.md). Contexte d’origine : (XS, MOYEN — coût ; unifie `[AI-BUDGETMODAL-MODEL-COST]`) — `components/budget/BudgetAiModal.tsx:68-72`
  appelle `chatStream` **sans `model`** → retombe sur `MODEL_SONNET` (`services/claude.ts:261`). Or
  les 4 surfaces de même nature (rééquilibrage, abonnements, conseil immo, optimisation couple)
  passent toutes Haiku explicitement. Seule surface Haiku-éligible qui paie le tarif Sonnet, sur la
  clé BYOK de Marc. Correctif : passer `model: MODEL_HAIKU`. [MESURÉ, reconfirmé par Claude]
- [x] **`[TX-STALE-MODEL-LABEL]`** ✅ LIVRÉ 2026-08-21 (voir docs/BACKLOG_ARCHIVE.md). Contexte d’origine : (XS, FAIBLE) — `components/Transactions.tsx:376` affiche
  « Modele: Claude Sonnet 4.6 » pendant la catégorisation, alors que `categorizeBatch` utilise
  `MODEL_HAIKU` (`services/claude.ts:481`). Étiquette jamais mise à jour lors de la bascule.
  Correctif : dériver le libellé de la table `services/aiChat/models.ts`. [MESURÉ, reconfirmé]
- [x] **`[REBALANCE-SILENT-FAIL]`** ✅ LIVRÉ 2026-08-21 (voir docs/BACKLOG_ARCHIVE.md). Contexte d’origine : (XS, MOYEN) — `components/Investments.tsx:1024-1039` :
  `getRebalanceJustifications` rend `[]` sur erreur, et le composant ne pose **aucun** état d'erreur
  — contrairement à `CoupleOptimizationCard` / `RealEstateAdviceCard` qui font
  `if (result.length === 0) setHasError(true)`. Un 429 se lit « l'IA n'avait rien à dire ».
  Correctif : répliquer le pattern `hasError`. [MESURÉ]
- [x] **`[BUDGET-AI-DUP-PARSING]`** ✅ LIVRÉ 2026-08-21 (voir docs/BACKLOG_ARCHIVE.md). Contexte d’origine : (XS, FAIBLE) — `components/budget/BudgetAiModal.tsx:78-86`
  réimplémente son parsing JSON (`match(/\[[\s\S]*\]/)` + `JSON.parse` + `.parse`) au lieu de
  `safeJsonValidate` (déjà testé pour les fences ```json et la prose autour). Un JSON malformé jette
  tout le texte streamé. [MESURÉ]
- [ ] **`[AI-CATEGORIZE-DOUBLE-RETRY]`** (XS, FAIBLE — ⚠️ HYPOTHÈSE, découverte au lot 209, NON corrigée) — `categorizeBatch` empile SON réessai applicatif (`CATEGORIZE_MAX_ATTEMPTS = 4`, backoff 1 s → 60 s) sur celui du SDK (`maxRetries = 2`, 0,5 s → 8 s) : un chunk en 429 persistant coûte jusqu'à **4 × 3 = 12 requêtes réseau**, et le message de progression « essai 2/4 » compte les tentatives applicatives, pas les requêtes. Rien de faux à l'écran, mais deux politiques de réessai pour un même appel sont deux endroits qui divergent. À trancher : soit `maxRetries: 0` sur le client de `categorizeBatch` (sa politique est plus riche : `auth`/`fatal`/progression), soit supprimer la couche applicative au profit du SDK (`Retry-After` honoré des deux côtés). Mesure à faire AVANT : compter les requêtes réelles sur un 429 persistant (garde du lot 209 comme modèle, `fetch` simulé).

### 🔴 Sécurité / vie privée

### ✅ Échecs silencieux — **SECTION VIDE, tout est livré** *(en-tête conservé pour l'historique)*

### 🚀 Performance — mesurée par harnais, pas déduite

> Baselines mesurées le 2026-08-19 (Node 22, 2 adultes, horizon 40 ans) — à réutiliser comme point
> de comparaison : run déterministe **~133 ms** · Monte Carlo 100 itérations **~3 764 ms**
> (~27 ms/itération) · `buildMonthlyDataPoint` **126,6 µs/appel** · `structuredClone` d'un
> `ProjectionResult` complet (481 points × ~90 champs, ~2,05 Mo) **8,4 ms** · bundle de boot
> **~540,9 ko brut / ~177,3 ko gzip**. Croissance quasi-linéaire (~3,3 ms/année) — pas de blowup.

- [x] **`[PERF-ENGINE-DATELABEL-INTL]`** ✅ LIVRÉ 2026-08-21 (voir docs/BACKLOG_ARCHIVE.md). Contexte d’origine : (XS, CRITIQUE) — `currentLoopDate.toLocaleString('fr-CA',
  { month: 'short' })` appelé **sans formatter mis en cache**, à chaque mois de chaque run
  (`services/projection/monthlyOutput.ts:209`). **Mesuré : 79,4 µs/appel** contre **0,82 µs** avec une
  instance `Intl.DateTimeFormat` réutilisée (~97×) et 0,023 µs avec une table précalculée → **~45 ms
  par run déterministe** pour ce seul point, sur un chemin qui tourne à chaque debounce de saisie
  (300 ms) dans l'onglet Futur.
  ⚠️ **Le correctif existe déjà 200 lignes plus loin dans le même moteur** : `dailyLedger.ts:396-401`
  construit `WEEKDAY_SHORT_FR` « UNE fois » avec le commentaire « mesuré ~800 ms pour 11 000 jours ».
  Le jour de la semaine a été traité, **le mois a été oublié**. Correctif : table de 12 libellés
  construite par `toLocaleString` (même source, pas de liste re-codée qui dériverait du locale).
  Sortie strictement identique → zéro risque money/fiscal. [MESURÉ, précédent vérifié par Claude]
- [x] **`[PERF-ENGINE-ISOSTRING-HOTLOOP]`** ✅ LIVRÉ 2026-08-21 (voir docs/BACKLOG_ARCHIVE.md). Contexte d’origine : (XS, MOYEN) — `computeIncomeLossFactor` fait
  `toISOString().substring(0,7).split('-')` **inconditionnellement** à chaque mois, même sans aucun
  événement `PERTE_EMPLOI`/`SABBATIQUE`/`ACCIDENT` (`services/projection/monthlyEvents.ts:78-79`).
  **Mesuré : 1,096 µs/appel** contre **0,046 µs** avec
  `getUTCFullYear()*12 + getUTCMonth()` (~24×, valeur numérique identique). Gain ≈ **500 ms sur une
  recherche de stratégie à 1 000 itérations**, ≈ 50 ms sur un run MC à 100. [MESURÉ]
- [ ] **`[PERF-ENGINE-MC-WASTED-LOGSTRINGS]`** (M, FAIBLE) — sous Monte Carlo, `buildMonthlyDataPoint`
  retourne bien un point allégé (déjà optimisé), mais tout le travail amont qui construit
  `flowEventsLog`/`lifeEventsLog` (~40 sites) s'exécute quand même — messages **entièrement jetés** en
  MC. Mesure de contrôle importante : `Number.toLocaleString('fr-CA')` **sans options** est déjà rapide
  (0,49 µs, quasi identique à un formatter caché) → ce n'est **pas** un problème d'`Intl` non caché,
  seulement des template strings jamais lues. Gater les logs ne suffirait pas (les arguments sont
  évalués AVANT l'appel en JS) : il faudrait remonter la garde aux ~40 sites d'appel — coût
  disproportionné. [HYPOTHÈSE — gain non confirmé comme significatif ; noté pour ne pas être re-cherché]

### 🧱 Dette technique et architecture

- [ ] **`[FISC-DEC-PSV-CLAWBACK-ASSIETTE-TIMING]`** (S, ⚠️ bug préexistant potentiel, signalé sans correctif —
  découverte du lot 179, 2026-09-05) — le bloc de récupération PSV de décembre (`computeOasClawback`, « Cycle 10 »
  de `projection.ts`) lit `accRetraitsReerYear`, `accRetraitsReerYearByUser`, `capitalGainsRealizedThisYear` et
  les dividendes de l'année AVANT la cascade d'allocation, le meltdown, l'immobilier et les objectifs du même
  décembre — exactement le trou que le lot 179 vient de fermer pour le DÉPÔT fiscal, un lecteur plus haut dans
  la boucle. Un retrait REER de décembre échappe donc au revenu de récupération PSV (ligne 23400) de l'année.
  **MESURÉ, et le banc est AVEUGLE** : `scripts/inverserOrdreBoucle.py dec_psv_fin_de_mois` (déplace les DEUX
  blocs) rend **0,00 $ d'écart sur les 5 fixtures** de `scripts/mesureOrdreBoucle.ts` — parce qu'aucune n'atteint
  le seuil de récupération PSV (`OAS_CLAWBACK_THRESHOLD_2026`), pas parce que le lecteur est inerte
  (`UNE-GARDE-NE-COUVRE-QUE-CE-QUE-SA-FIXTURE-REND-NON-NUL`).
  ✅ **MESURÉ au lot 181 (2026-09-05)** sur quatre retraités à HAUT revenu (REER 2 à 2,5 M$, 25 ans, bloc PSV
  déplacé après le meltdown, moteur de `main` post-#910) : **0,00 $ sous AUTO_MARGINAL** sur les deux fixtures
  (récupération déjà saturée au plafond — un dollar de plus n'y change rien) ; sous MELTDOWN_REER : couple
  66/66 patrimoine **+180,41 $**, impôt à vie −415,58 $ ; solo 70 patrimoine **−2 919,53 $**, impôt à vie
  −918,30 $, retraits REER +836 $. Effet PETIT et de signe non évident (le retrait de décembre déplace le
  calendrier du meltdown de l'année suivante) — reclassé **XS, FAIBLE**. Correctif si GO (Q11 de
  `docs/A_FAIRE_MOI.md`) : déplacer le bloc APRÈS le meltdown avec sa garde d'ordre (`oasClawbackNextPeriod`
  n'est lu qu'en janvier : rien ne l'oblige à précéder le dépôt). Non corrigé : hors du périmètre nommé par
  la décision 15 (le dépôt fiscal). Reproduction : `scratchpad/mesurePsv181.ts` (non committé — fixtures
  décrites ci-dessus, banc `mesureOrdreBoucle.ts` aveugle par construction sur ce lecteur).
- [ ] **`[DETTE-COULEURS-ADHOC]`** (S, MOYEN) — **26 couleurs hex en dur** (`bg-[#1a1a1a]`,
  `text-[#2dd4bf]`, `bg-[#0d1118]`…) dans ~15 fichiers dont `Layout.tsx` (×3), `Investments.tsx` (×2),
  `aiChat/AiChatView.tsx` (×2), `Retirement.tsx` (×2). Ces teintes échappent à `check-contrast` ET
  aux tokens. Correctif : mapper vers `tailwind.config.js`, ou y ajouter la teinte si elle est
  volontaire. [MESURÉ]
- [x] **`[DETTE-KNIP-API-ENTRY]`** ✅ LIVRÉ 2026-08-21 (voir docs/BACKLOG_ARCHIVE.md). Contexte d’origine : (XS, FAIBLE — unifie `[KNIP-EDGE-FALSE-POSITIVE]`) — `knip.json` ne déclare pas `api/**/*.ts` en entry
  point → `api/claude/[...path].ts` (fonction Vercel Edge, routée par la plateforme) ressort en
  « fichier inutilisé » alors qu'il est en PROD. Le faux positif aveugle aussi le scan sur du vrai
  code mort futur dans `api/`. Correctif : ajouter `"api/**/*.ts"` à `entry`. [MESURÉ]
- [x] **`[DETTE-KNIP-ADMZIP]`** ✅ 2026-08-24 — **knip avait raison**, et la cause est instruite.
  Le paquet `adm-zip` LUI-MÊME est bien vivant : `mcp/pack.mjs` l'importe, et le script `mcp:pack`
  l'exécute. Mais ce consommateur est un fichier **`.mjs`**, et `tsconfig.json` pose `allowJs: true`
  **sans `checkJs`** — le fichier est donc inclus mais **jamais typé**. `@types/adm-zip` fournissait
  ses déclarations à personne. Vérifié par l'expérience plutôt que par lecture : retrait du paquet →
  **`npm run typecheck` reste VERT**, et knip ne signale plus **aucune** dépendance inutilisée.
  Le runtime est intact (`import('adm-zip')` résout, `node --check mcp/pack.mjs` passe).
  ⚠️ **Aucune garde ajoutée, et c'est délibéré** : si quelqu'un importe un jour `adm-zip` depuis un
  fichier **TypeScript**, `tsc` échouera de lui-même sur la déclaration manquante. La garde existe
  déjà, c'est le typecheck (`AVANT-D-AJOUTER-LA-GARDE-VERIFIER-QU-ELLE-N-EXISTE-PAS-DEJA`).

### ✅ Documentation — **SECTION VIDE, tout est livré** *(en-tête conservé pour l'historique des liens ; son titre affirmait au PRÉSENT que « la doc a décroché du code », sans un seul item dessous — vérifié vide depuis au moins #674)*


### ✅ Vérifié SAIN par le panel (ne pas re-lever sans nouvelle preuve)

- **Sécurité** : aucun secret en dur (code, CI, `.env.example`) ; coffre AES-256-GCM à clé de device
  non-extractible en IDB, `apiKeys` exclu du `partialize` ; backup PBKDF2-SHA256 600k ; jeton Fintable
  device-local ; CSP sans `unsafe-eval`/`unsafe-inline`, `frame-ancestors 'none'` ; zéro `innerHTML`
  hors tests ; MCP HTTP en `timingSafeEqual` + OAuth 2.1/PKCE + anti-DNS-rebinding ; `errorLogger`
  scrube montants ET secrets avant persistance ET avant `console.*`.
- **Mode discret** : 94 tests de garde verts. PDF **et** CSV refusent de générer ; le contexte écran
  envoyé au LLM est coupé à la source ; les `tickFormatter`/`formatter` Recharts sont couverts.
- **a11y mesuré** : `check-contrast` = 60 combinaisons de TOKENS, **0 non conforme**, 9 en AA-large
  seulement (⚠️ périmètre limité — cf. `[A11Y-CONTRAST-ANGLE-MORT-541]`) —
  toutes vérifiées comme décoratives ou disabled (`ink-500`), `danger-600`/`info-600` n'existent en
  `text-*` nulle part. **Aucun shade hors palette.** 17/17 tests axe-core verts, zéro violation
  serious/critical. Modale : piège de focus, restauration, `Escape`, bouton 44×44. Sidebar hover-only
  déjà corrigée (`[D6-KBD]`). Un seul `<h1>` par écran rendu. `prefers-reduced-motion` global.
- **IA** : `promptCad`/`roundToHundred` empêchent structurellement le faux `0 $` ; anti-injection
  systématique (`wrapUserData`, `sanitizePromptText`) ; `agentLoop` à cap de tours, snapshot figé,
  distinction annulation/troncature/refus ; `apiKeys` exclu du snapshot d'état ; consentement explicite
  avant tout envoi Vision ; cache de prompt Anthropic correctement posé.
- **Fiscalité, mesurée par script** : **0 écart sur 66 constantes** entre `utils/tax.ts` et
  `docs/FISCAL_REFERENCE.md` (paliers féd/QC, BPA, RRQ/RQAP/AE, RAMQ 12 valeurs, FSS 8 valeurs, SRG,
  PSV/clawback, crédits 65+/ligne 361, retenues REER, CELI/REER, abattement 16,5 %). Mécanique
  d'impôt **recalculée à la main, exacte au cent** à 100 k$ (fédéral 11 880,55 $ / QC 13 629,47 $ /
  RRQ 4 895,30 $ / RQAP 430,00 $ / AE 895,70 $). Table FERR : 24 facteurs conformes, plateau 20 % à
  95+. Immobilier : taxe de bienvenue 500 k$ = 5 885 $ Montréal / 5 610,50 $ reste du QC, SCHL,
  OSFI, TPS/TVQ tous conformes. REEE : SCEE et IQEE conformes. Gardes de constantes 43/43 vertes.
- **Unités salaires** : les **40** consommateurs de `grossSalary`/`netSalary` relus un par un — le
  `×12` est correct partout où c'est annuel, le mensuel conservé là où c'est mensuel. Seule anomalie :
  la prop morte `[RETIREMENT-GROSSINCOME-DEAD]` ci-dessus.
- **Devises** : `assetFxGuard` vert, `assetValueCad`/`toCurrencyFactor` systématiques sur les 20 sites
  UI qui somment des actifs. Aucune somme `quantity × currentPrice` sans FX hors allowlist.
- **Divisions et arrondis** : `activeUsersCount` forcé ≥ 1, gardes `!(total > 0)` sur chaque quotient,
  `Number.isFinite` en entrée de toutes les fonctions fiscales. Les `toFixed(2)` ne touchent que les
  séries de SORTIE, jamais les soldes internes — pas d'accumulation d'erreur.
- **Conservation, mesurée en DOLLARS sur 12 scénarios** (socle, dettes, enfants+REEE, achat de
  résidence, locatif+vente, voyages, héritage, rénovation, véhicule cyclique, krach, retraité,
  divorce MC), 30 à 60 ans : forme-BILAN `NetWorth == Σactifs − DettesNonImmo` **max 0,02 $** ;
  forme-FLUX **max 0,02 $/mois, Σ 0,41 $ sur 481 mois**. Hypothèque jamais double-comptée
  (`min(DetteTotale − DettesNonImmo) = 0,00 $`). Per-conjoint REER : **0,00 $**.
  `totalTaxesPaid == Σ FluxImpots` : **0,00–0,01 $**. `Savings` au jour `== Income − Expenses` sur
  1 795 jours : **0,00 $**.
- **Divorce sous Monte Carlo** (split 50 %, 25 ans) : bilan max 0,02 $, et les espaces
  CELI/REER/CELIAPP suivent bien `taxFilers` (CELIAPPMax 32 000 → 16 000).
- **Source unique du patrimoine net** : grep exhaustif → 5 appelants de `computeRawNetWorth`,
  **0 copie locale de la formule**, `realEstateEquity` jamais re-soustrait.
- **Grand livre quotidien** : mesuré SANS consulter `FIELD_KIND` (donc non circulaire) sur 60 mois ×
  tous champs → **0 champ ne raccordant ni en stock ni en flux**, 0 champ moteur absent de la table.
  (La COUVERTURE de la garde reste étroite, cf. `[GARDE-JOUR-ANTICIRCULAIRE-ETROITE]`.)
- **Robustesse NaN/Infinity** : INV-8 vert, aucun NaN propagé sur les 12 scénarios.
- **Retenue REER** : créditée exactement UNE fois (décembre soustrait, avril débite) — pas de double
  comptage. C'est l'absence de la contrepartie (l'assiette) qui pose problème, pas la retenue.
- **Moteur** : `services/projection*` n'importe **jamais** le store ni `components/` — le cœur
  money-critical est structurellement propre. Migrations v1→v7 chaînées, échec de réhydratation
  TRACÉ et visible plutôt qu'avalé.
- **Bundle de boot** : rien à corriger. Build PROPRE + `grep modulepreload dist/index.html` confirme
  que recharts (404,61 ko), jspdf (399,38 ko) et le SDK Anthropic (125,28 ko) sont **hors boot** —
  seules des chaînes de caractères les référencent dans le chunk d'entrée, pas leur code. Aucun
  `manualChunk` piégé en EAGER. Boot réel : ~540,9 ko brut / ~177,3 ko gzip.
- **Recherche de stratégie** : architecture déjà mature — pool de workers dimensionné sur
  `hardwareConcurrency`, budget adaptatif borné [60,400] itérations, estimation calibrée à 8 ms/sim
  (pas le défaut optimiste de 2 ms). Le `structuredClone` de 8,4 ms à la frontière worker est mitigé
  par le debounce de 300 ms déjà en place.
- **Structure plate** : tient à cette taille (sous-dossiers par domaine déjà en place) — aucune
  restructuration à chiffrer. Le problème n'est pas la topologie.

### ❌ RÉFUTÉS par Claude (ne pas re-créer de ticket)

- **`calculateDetailedTax` « code mort »** : FAUX — la fonction **est appelée** (`utils/tax.ts:803` et
  `814`). `knip` signalait l'`export` superflu, pas la fonction. L'agent a confondu les deux.
- **`calculateNetFromGross` mort** : vrai. Traité au lot 73 (`[DEAD-CALCNETFROMGROSS]`, PR #803) —
  fonction retirée, et la citation de `docs/FISCAL_REFERENCE.md` qui la présentait comme « la source
  unique de conversion brut→net du dépôt » corrigée : elle n'avait aucun appelant.
- **`expect(x).toBeDefined()` « tests vacueux »** (56 occurrences / 30 fichiers) : inspection par
  échantillon → presque tous suivent le patron légitime « garde d'existence avant assertion réelle »
  (`find(...)` puis `expect(x!.valeur).toBe(...)`). Pas un item.
- **`components/Settings.tsx` god-file** : périmé — refactoré à 208 lignes (orchestrateur de 6
  sous-onglets), documenté dans `docs/adr/`.
- **`as any` / `@ts-ignore` en prod** : quasi absents (0 `as any` hors tests, 2 `@ts-expect-error`
  tous deux dans des tests).
- Faux positifs `knip` vérifiés : `encryptBackupPayload`/`decryptBackupPayload` (usage interne),
  `investmentTargetPcts` (round-trip réel), `propertyGrowthRate` (correctement câblé),
  `fiscalConstGuardV2.ts`, `transactionsSearch.ts` (testés indirectement).
- **Sidebar hover-only** : déjà corrigée, ne pas re-signaler.

---

## Audit complet 2026-08-12 (panel de 9 agents)

> Consolidation de 8 rapports spécialisés : dette technique, fiscal, sécurité, silence, a11y,
> perf, IA, moteur. 🔴 = fuite de données / argent / problème utilisateur réel mesurable.
> Tous les findings ont une MESURE exécutée. Chaque ticket porte un lien vers le rapport audit.
> Les 5 derniers captions du moteur détaillent CHAQUE hypothèse testée et RÉFUTÉE (ne pas
> re-lever). Aucune baseline testée n'est cassée (3833/3833 verts post-audit).

### 🔴 Moteur & fiscal — altère les calculs d'argent

> Périmètre : projection.ts + projection/* + utils/tax.ts + services/realEstate.ts
> + services/claude.ts (Vision payslip). Tous les findings sont MESURÉS sur le vrai moteur
> (tvite run, sondes adverses). Tests discriminants posés à chaque correction.

#### HIGH — Bloque la fiabilité des chiffres


#### MOYEN

- [ ] **`[FISC-RAMQ-COUPLE-CAP]`** (S) — couple ne peut jamais atteindre prime RAMQ max 766 $ (tranche
  2 bornée 9 600 $ → 744 $ max possible). **Mesuré : célibataire 766 $, couple 744 $ constant.**
  Impact −22 $/adulte/an = ~1 300 $ / 30 ans retraite. Incohérence interne doc (prime max vs tranche
  2 qui s'excluent). **Correctif** : re-sourcer Annexe K 2026 réelle (Revenu Québec / RAMQ / CFFP) et
  corriger la valeur fautive EN CODE ET EN DOC. Ne rien ajuster sans source.

#### LOW / FAIBLE



#### Divorce — reliquat MESURÉ par le panel de re-revue (PR #616)

> Les deux blocages ÉLEVÉ (SRG et cible du meltdown) sont CORRIGÉS dans #616. Ce qui suit a été
> mesuré par le même panel et laissé DÉLIBÉRÉMENT hors du lot : ce sont des surfaces voisines, pas
> le mécanisme du divorce lui-même. ⚠️ Leur point commun est le motif d'échec de #613 — « le même
> défaut, laissé dans la fonction sœur ».
>
> ⚠️ **Les 8 items LIVRÉS de cette sous-section sont partis dans `docs/BACKLOG_ARCHIVE.md`**
> (2026-08-14, PR #626) — `ROOM-COUPLE`, `ESTATE-PENSION`, `LATENTTAX`, `TAXDEBT-UNSPLIT`,
> `SPLITPCT-UNBOUNDED`, `MC-OBSERVABILITY`, `NO-CONSERVATION-GUARD`, `DISPLAY-RATES`.
> Ne reste ici que ce qui est encore à faire.


### ✅ Échecs silencieux — **SECTION VIDE, tout est livré** *(le HIGH `[SILENT-ACTIONPLAN-NAN]` par #608, les MED/LOW ensuite ; le titre annonçait autrefois un reliquat — voir `docs/BACKLOG_ARCHIVE.md`)*

> Pattern : traiter un champ présent-mais-non-fini comme absent, SANS log ni signal à l'utilisateur.
> Référence : `services/finance.ts` (parseRate, patron parfait), `services/marketData/*` (appliqué),
> `services/claude.ts` (safeJsonValidate loggue sys, rejets massifs tracés).


### 🔴 A11y

> Les 4 fuites de Mode Discret de l'audit sont CORRIGÉES (#608), ainsi qu'une 5e trouvée à la revue
> (axes et infobulles de graphiques, `[A11Y-PRIVACY-CHART-FORMATTER]`). Garde de non-régression :
> `tests/components/chartPrivacyScan.test.ts`.

### 🔴 `[PASSE-REEL-DETTE]` — le passé montre la dette actuelle depuis TOUJOURS (Marc, signalé 2×)

> ⚠️ **Ces trois sous-tickets SONT le plan de `[DEBT-FROM-CONTRACT]`** (retour Marc 2026-08-12,
> plus haut dans ce fichier) — pas un doublon. Je les avais d'abord écrits sans voir que le ticket
> d'origine existait : classe `PM-DUPLICATE-TICKET`, corrigée en les RELIANT plutôt qu'en supprimant
> l'un des deux (le ticket d'origine porte la DEMANDE et sa date, ceux-ci portent le PLAN).
>
> Marc : « je veux que ma dette soit exactement ce que j'ai — là ça me dit que j'ai la dette depuis
> des années mais c'est faux ; je t'ai donné le pdf du contrat, ça devrait être automatique ».
> **Constat VÉRIFIÉ dans le code le 2026-08-13** — le symptôme est réel, et il a DEUX causes
> indépendantes. Même famille que `[PASSE-REEL-1]` : le passé affiche quelque chose de faux.

> ✅ **CONFIRMÉ VIVANT le 2026-08-19** (Marc : « oui on veut extraire »). Le PM de la passe de
> ménage proposait de fermer ces trois tickets + `[DEBT-FROM-CONTRACT]` comme caducs, en citant la
> Décision 2 de `docs/adr/`. **Refusé après vérification** : cette décision interdit
> l'amortissement RÉTROACTIF et toute SAISIE demandée à Marc — lire le PDF du contrat qu'il a déjà
> fourni n'est ni l'un ni l'autre. La décision a été précisée en conséquence
> (`docs/adr/`, « PRÉCISION Marc du 2026-08-19 »). Ne pas re-fermer ces items.

✅ **`[PASSE-REEL-DETTE-1]` livré 2026-08-21, PR #687 — voir `docs/BACKLOG_ARCHIVE.md`.**

- [x] ~~🔴 `[PASSE-REEL-DETTE-2]`~~ — **CADUC le 2026-09-03** (lot 96) : c'était un POINTEUR vers
  `[DEBT-AMORTIZATION]`, dont il ne restait que `originalBalance?: number`. Vérifié sur `types.ts` :
  le champ existe depuis le lot 91.
- [x] ~~🔴 `[PASSE-REEL-DETTE-3]`~~ — **CADUC le 2026-09-03** (lot 96) : « l'import PDF ne capte ni
  les dates ni `originalBalance` ». Vérifié sur `mcp/ingest/applyDocument.ts` : `DebtPayload` porte
  `startDate`, `termEndDate` (`[DEBT-MCP-PARITE]`, 2026-08-21) et `originalBalance` (lot 93).

### 🔴 `[DEBT-AMORTIZATION]` — courbe d'amortissement du passé + refonte onglet Dette (Marc, 2026-08-21)

> Marc a demandé le fix `[PASSE-REEL-DETTE-1]` (dette absente avant sa date de début), puis en
> creusant a demandé PLUS : une vraie courbe décroissante dans le passé (« chaque semaine je dois
> un peu moins »), pas juste un niveau figé. **Ceci INVERSE explicitement la Décision 2 de
> `docs/adr/0012-quatre-decisions-de-marc-2026-08-17.md`** (« aucun amortissement rétroactif,
> aucune saisie demandée ») — confirmé par Marc en connaissance de cause après rappel du contexte
> (« Je confirme, je veux la courbe malgré le coût supplémentaire »). ⚠️ À documenter dans l'ADR
> comme une inversion CONSCIENTE, pas un oubli, dès que ce chantier avance.

- [x] 🔴 **`[DEBT-MCP-PARITE]`** — ✅ **LIVRÉ 2026-08-21** (PR #? — à compléter au merge), voir
  `docs/BACKLOG_ARCHIVE.md`. `debtKind`/`startDate`/`termEndDate` câblés dans l'import PDF et le
  tool MCP direct ; description du tool corrigée.
- [x] 🔴 **`[DEBT-AMORTIZATION]` — LOT 1/2 LIVRÉ le 2026-09-02** (PR #821), découpage demandé par
  Marc (« je te montre le résultat du lot 1 avant d'engager le lot 2 »). Livré : `Debt.originalBalance?`
  (additif, aucune migration) + le service PUR `services/projection/debtAmortization.ts` + 13 gardes.
  **Rien n'est branché : la courbe du passé ne bouge pas encore.**
- [x] 🔴 **`[DEBT-AMORTIZATION-CABLAGE]` — LOT 2/2 LIVRÉ le 2026-09-02** (PR #822), voir
  `docs/BACKLOG_ARCHIVE.md`. Delta additif câblé dans `buildPastPrefix`/`dailyPastLedger`, bandeau
  du graphe corrigé, ADR 0012 annoté, mesure reproductible committée
  (`npx tsx scripts/mesureAmortissementPasse.ts`).
- [x] 🔴 **`[DEBT-MCP-ORIGINALBALANCE]` — LIVRÉ le 2026-09-02** (PR #823), voir
  `docs/BACKLOG_ARCHIVE.md`. `originalBalance` câblé dans le schéma Zod du tool `apply_debt` ET dans
  `applyDocument` (import PDF compris, qui ne passe pas par Zod) : bornes métier, refus
  `originalBalance < balance` jugé sur les valeurs EFFECTIVES après fusion, et une garde
  d'ATTEIGNABILITÉ bout-en-bout (payload MCP → dette écrite → courbe du passé non plate).
  La courbe du lot 92 est désormais atteignable par extraction de contrat.
- [x] ~~🟠 `[DEBT-KIND-MORTGAGE-DANS-DETTES-NON-IMMO]`~~ — **CADUQUE, RÉFUTÉ le 2026-09-02** au
  re-recensement (lot 93). Je l'avais écrit la veille, en regardant la couche que je venais de
  changer — le neuvième périmètre de ticket faux d'affilée, et cette fois de ma main.
  **Ce que dit le code** : `DettesNonImmo = activeDebtsTotal + liquidDebt + smithManoeuvreDebt`, et
  ce qu'il EXCLUT est `mortgageBalance`, l'hypothèque des BIENS (`realEstateGoals`), déjà nettée dans
  `Immobilier`. « Hors hypothèque » ne veut donc pas dire « aucune dette de `kind: 'mortgage'` » :
  `Debt` n'a AUCUN champ de liaison à un bien (vérifié — `propertyId` appartient à `LifeEvent`, pas à
  `Debt`), donc une dette hypothécaire saisie dans la liste n'est nettée par RIEN d'autre. La compter
  est correct, et l'amortir dans le passé l'est aussi — une hypothèque s'amortit.
  ⚠️ **Les deux correctifs que le ticket proposait étaient des régressions money-critical** :
  exclure ce `kind` de `sumActiveDebts` ferait DISPARAÎTRE une vraie dette du bilan (classe
  `EFFACER-SUR-UNE-DATE-FABRIQUE-DU-PATRIMOINE`), et le refuser à l'ingestion retirerait une
  classification légitime que `Debt.amortizationYears` documente explicitement (« pour auto,
  hypothécaire »). Le double comptage réel — saisir la MÊME hypothèque dans la liste de dettes ET
  dans un bien — est un problème de SAISIE, antérieur à tout ce chantier et inchangé par lui.
- [x] 🟡 **`[DEBT-UI-PAR-TYPE]` — LIVRÉ le 2026-09-02** (PR #824), voir `docs/BACKLOG_ARCHIVE.md`.
  Sélecteur `kind` (11 valeurs, libellés en `Record<DebtKind, string>` exhaustif) + `originalBalance`
  affiché SEULEMENT pour les types que `KIND_AMORTISSANT` déclare amortissants, dans les DEUX
  formulaires jumeaux. L'UI refuse désormais exactement ce que l'assistant refuse.
  ⚠️ **Périmètre RÉDUIT par rapport au ticket, avec sa raison** : le ticket prescrivait un découpage
  en `LoanForm.tsx`/`LeaseForm.tsx`. Recensé, `DebtManager.tsx` fait **279 lignes** et ses deux
  formulaires partagent nom/solde/taux/paiement/dates — deux composants auraient DUPLIQUÉ ces champs
  au lieu d'un seul, soit le défaut à éviter en plus gros. Extrait la PAIRE qui manquait
  (`components/debt/DebtKindFields.tsx`), pas le formulaire.
- [x] ~~🟡 `[DEBT-UI-CHAMPS-RESTANTS]`~~ — **REMÈDE RÉFUTÉ le 2026-09-03** (lot 95, PR #825).
  Le ticket demandait d'ajouter `limit`, `amortizationYears` et `isInterestDeductible` au formulaire.
  **Mesuré, aucun des trois n'est LU par quoi que ce soit** : zéro accès à `<dette>.limit`, zéro à
  `<dette>.isInterestDeductible` (le champ n'existe QUE dans `types.ts`), et les trois accès à
  `.amortizationYears` en production portent sur d'AUTRES objets — `rp.` (`RentalProperty`, un
  immeuble locatif), `ctx.` (l'hypothèque du ménage dans un prompt IA) et `doc.` (le payload MCP, qui
  ÉCRIT). Leur donner une saisie aurait fabriqué trois champs dont le remplissage ne change rien :
  une interface qui promet un effet qu'elle n'a pas. Image MIROIR de
  `UN-CHAMP-TYPE-SANS-PRODUCTEUR` — ici il y a des producteurs et zéro consommateur.
  ⚠️ Livré à la place : `tests/services/debtChampsSansLecteur.test.ts`, un inventaire qui **sait
  mourir** (il rougit dès qu'un vrai lecteur apparaît et exige alors qu'on retire son entrée).
- [ ] 🟠 **`[DEBT-AMORTIZATIONYEARS-QUATRE-PRODUCTEURS-ZERO-LECTEUR]`** (QUESTION POUR MARC, sortie
  du lot 95) — `Debt.amortizationYears` est ÉCRIT par quatre producteurs (`jeuneCoupleDink`,
  `coupleDettes`, `mcp/whatIf.ts` ×2, `applyDocument`), **validé** à l'ingestion (« Amortissement
  invalide (N ans) »), exposé dans le schéma Zod du tool MCP… et **lu par personne**. `mcp/whatIf.ts`
  calcule un `termYears` et le range en croyant qu'il compte. Trois issues, et le choix n'est pas
  technique : (a) le BRANCHER — un prêt à terme fini devrait cesser d'être payé à son échéance, ce
  que `termEndDate` fait déjà autrement ; (b) le SUPPRIMER du type avec ses quatre écritures ;
  (c) le laisser et l'assumer par écrit. ⚠️ Ne rien trancher seul : (a) déplace de l'argent,
  (b) touche un type persisté. Même famille que `rsuYearsRemaining` (+23 % de patrimoine final), sauf
  qu'ici le champ n'est lu par personne — donc aucun chiffre n'est faux AUJOURD'HUI.

**Ordre imposé** : `[DEBT-MCP-PARITE]` → `[DEBT-AMORTIZATION]` → `[DEBT-MCP-ORIGINALBALANCE]`.
Les trois sont LIVRÉS (lots 91→94). Reste UNE question pour Marc :
`[DEBT-AMORTIZATIONYEARS-QUATRE-PRODUCTEURS-ZERO-LECTEUR]`.

⚠️ **`[DEBT-LEASE-VS-LOAN-COMPARATOR]` (comparateur prêt vs bail, demandé par Marc dans le même
message) N'EST PAS scopé ici** — cadrage insuffisant pour un MVP fiable : « rentable » n'a pas de
sens univoque sans trancher hypothétique-avant-signature vs rétrospectif-sur-dette-existante, ni
sans décision sur la valeur résiduelle nette de l'actif (ignorer la valeur résiduelle rendrait
« le prêt coûte plus cher » trompeur — un prêt payé laisse un bien au bilan, un bail non). Router
vers une session de cadrage dédiée (batch de questions habituel) avant d'écrire un seul test.

### ✅ `[PASSE-REEL]` — le passé affichait la PROJECTION (signalé par Marc 2026-08-13) — **SECTION VIDE, tout est livré**

> Marc : « mon passé ne semble pas correspondre à mon passé réel mais au futur qui était estimé.
> Je n'ai pas de compte CELI et pourtant mon passé me dit que j'ai de l'argent dedans. »
> Cause : `services/projection/dailyCurve.ts` — `if (!real) return { ...d }` où `d` est le point
> PROJETÉ. ⚠️ L'en-tête du MÊME fichier énonçait pourtant la règle inverse.

### 🔴 `[PASSE-REEL-JOUR]` — la courbe passée au jour (bug + demande de Marc, 2026-08-14)

- [x] 🔴 **`[PASSE-REEL-RACCORD-CHUTE]` — LIVRÉ le 2026-09-03** (PR #826), voir
  `docs/BACKLOG_ARCHIVE.md`. La marche au raccord est désormais DITE sous le graphe, jamais lissée.
  `reconstructCashHistoryDaily` publie `fluxPeriodeAnnulee` (le flux du jour qu'elle vient de
  défaire), le registre au jour le remonte, et `services/history/raccordNotice.ts` en fait une
  phrase — sans montant, pour qu'elle survive au mode discret.
- [x] 🟠 **`[PASSE-REEL-RACCORD-CHUTE-MENSUEL]` — LIVRÉ le 2026-09-03** (PR #827), voir
  `docs/BACKLOG_ARCHIVE.md`. `reconstructCashHistory` publie `fluxPeriodeAnnulee` (tout le mois
  courant), `buildPastPrefix` le remonte — son retour passe d'un tableau nu à
  `{ points, fluxPeriodeAnnulee }`, seize sites énumérés par le compilateur —, et la mention est
  GATÉE sur la vue au jour : quand la reconstruction quotidienne est en place, c'est la marche du
  JOUR que Marc voit, et la phrase mensuelle décrirait un raccord absent de l'écran.
### 🔴 `[A11Y-PRIVACY-LOT2]` — le mode discret ne couvre PAS encore les formulaires (balayage exhaustif 2026-08-13)

> Balayage complet des 133 composants après la PR #608 (3 tours de revue). Les écrans de LECTURE
> visés par #608 sont couverts et gardés par test. Le trou restant est d'une autre nature : **#608 a
> traité l'affichage, jamais la SAISIE**. Les formulaires natifs de Réglages/Profil affichent les
> données les plus sensibles de l'app — salaire des deux conjoints, soldes réels par compte,
> assurances, immeubles locatifs, société — en `<input type="number" value={…}>` non masqué, quel que
> soit le mode. La primitive existe déjà (`PrivateNumberInput`, utilisée par `AssetLocationCard`).
> ⚠️ Rappel de méthode (leçon #608) : un test de fuite doit être prouvé DISCRIMINANT, et un canal de
> fuite peut être un ATTRIBUT (`title`, `aria-label`) ou la STRUCTURE (nombre de lignes rendues).
>
> ⚠️ **Prérequis LEVÉ par `[A11Y-PRIVACY-SALAIRE]`** (2026-08-14) : la primitive volait le NOM
> ACCESSIBLE du champ qu'elle masquait (`aria-label` en dur, prioritaire sur `<label htmlFor>` ET
> sur l'`aria-label` du champ). Tous les champs masqués d'un formulaire annonçaient donc le même
> nom. Corrigé DANS la primitive : les tickets suivants de ce lot en héritent, il n'y a rien à
> refaire par écran. Voir `A11Y-MASK-STEALS-NAME` dans `docs/CONVENTIONS.md`.

- [x] 🔴 **`[HYDRATATION-REFUS-TOUT-OU-RIEN]`** ✅ **RÉPONDU par Marc le 2026-09-14 (en clic) :
  statu quo (option a)** — le tout-ou-rien est conservé, aucun code à changer ; le correctif déjà
  livré (liste dérivée du contrat + CI qui rougit sur un oubli) rend le refus beaucoup plus rare, et
  c'était jugé suffisant sans introduire de demi-état → à déménager vers `BACKLOG_ARCHIVE.md` à la
  prochaine PR. Contexte d'origine (né de l'incident du
  2026-09-01) — aujourd'hui, un SEUL champ inattendu dans l'état persisté fait échouer **toute** la
  réhydratation : `merge` lève, l'app s'ouvre vide, et l'utilisateur croit avoir tout perdu. Le blob
  reste intact et la bannière le dit, mais l'écran vide parle plus fort que la bannière.
  L'arbitrage du 2026-08-29 (« refuser et nommer, jamais coercer ») reste bon pour un **montant** :
  hydrater à moitié un état money-critical produirait des chiffres que personne n'a saisis. Il l'est
  beaucoup moins pour un **identifiant** — refuser tout le patrimoine parce qu'un `accountId` est
  une chaîne est disproportionné.
  ⚠️ Trois options, aucune évidente, et c'est pourquoi c'est une QUESTION et pas une tâche :
  · **(a) statu quo** — le correctif du jour rend le refus beaucoup plus rare (liste dérivée du
    contrat, CI qui rougit) ; on garde le tout-ou-rien, simple et sans demi-état.
  · **(b) refus PAR CHAMP** — n'écarter que le champ fautif et hydrater le reste. Simple à dire,
    mais il faut décider ce que devient l'objet amputé : une transaction sans `amount` n'est pas
    « presque bonne ».
  · **(c) refus SÉLECTIF par nature du champ** — bloquer sur un champ monétaire, tolérer et
    journaliser sur un identifiant. Le plus proche de l'intention, mais il faut la liste des champs
    monétaires, qui n'existe pas encore (celle des champs TEXTE a été choisie exprès à sa place).
  Ne rien coder avant la réponse de Marc.

### 🔴 Performance

> Mesures réelles (Node profiling CPU V8 + micro-bench isolés). NO O(n²) trouvé.
> Le coût dominant = volume itérations (mois × MC × configs), pas un algorithme mal choisi.

- [ ] **`[PERF-BOOT-HYDRATE-CHAIN]`** (M/L) — hydratation historique/prix/profil chaînées en SÉRIE :
  chaque passe a sa PROPRE boucle pacée 2500 ms → 3 passes totales = 3×N×2500 ms pour N titres.
  Pour 20 titres : **jusqu'à ~150 s** avant dernier titre complet vs ~50 s si entrelaçé. **⚠️ NE PAS
  paralléliser naïvement** (rate-limit provider écrasé) — piste sûre = entrelacer par titre (historique
  +prix+profil consécutifs). **Correctif** : valider budget provider RÉEL avant de coder (cf. leçon
  `docs/CONVENTIONS.md` « vraie contrainte »).


### 🔴 IA / Anthropic

> Périmètre : services/claude.ts, Vision payslip, chat in-app, budget recommandations.


- [ ] **`[AI-MODELID-EPINGLER-SNAPSHOTS]`** (XS, **HUMAIN**) — ⚠️ **Moitié restante de
  `[AI-MODELID-PINNING-DRIFT]` (lot 70), non faisable par Claude.** `claude-sonnet-4-6` et
  `claude-opus-4-8` sont des ALIAS que le fournisseur peut repointer ; les remplacer par leurs
  instantanés datés supprimerait la dérive de tarif à la source. **Claude ne peut pas inventer ces
  identifiants** — un mauvais id casserait tous les appels du chat, ce qui est bien pire que la
  dérive. **Action** : relever les ids datés sur docs.claude.com, puis les substituer dans
  `services/aiChat/models.ts` et `pricing.ts` (un suffixe de date, rien d'autre) et retirer les
  entrées correspondantes de `ALIAS_A_EPINGLER` — le test refuse un inventaire périmé, il guidera.

### 🔴 Dette technique

> Périmètre : bundling, UI, sync, linting, code mort, god files.

- [ ] **`[CHART-COLOR-DUP]`** (S — unifie `[CA-07]`, dont la **règle ESLint anti-régression** est
  ⚠️ RE-MESURÉ le 2026-09-06 (lot 211) : **257 occurrences de hex dans 27 fichiers, 60 valeurs distinctes** (le ticket disait 212 dans 6+) ; 13 valeurs / 54 occurrences sont DÉJÀ des tokens de `tailwind.config.js`, 47 valeurs / 203 occurrences n'en sont pas (`#4f9d86` ×23, `#5b82bf` ×22, `#c2974f` ×19…). Aucun `constants/chartColors.ts` n'existe malgré l'archive de `[CA-07]`. Un module central qui garde les MÊMES hex est un pur réorganisation sans décision ; les MAPPER aux tokens change des couleurs (décision d'apparence, comme `[A11Y-CTA-HORS-SCAN]`) et la règle ESLint est une politique — ces deux volets se routent, le premier se livre. Taille réelle : M, pas S. Recensement : `grep -rhoE '#[0-9a-fA-F]{6}\b' components utils --include=*.tsx --include=*.ts | sort | uniq -c | sort -rn`.
  à reprendre : sans elle les hex reviennent) — Aucun module central de tokens couleurs graphiques. **212 hex
  littéraux** dans 6+ fichiers (FutureProjection, Retirement, Investments…), mêmes valeurs répétées
  (ex. `#ef4444` rouge alerte dans 6 fichiers). Un changement de teinte design system = grep-replace
  manuel 6 fichiers sans garantie exhaustivité. **Correctif** : `utils/chartColors.ts` exportant
  teintes de séries (mappées aux tokens Tailwind existants), importé par les 6 fichiers.


- [ ] **`[GODFILE-FUTUREPROJECTION]`** (L — unifie `[DETTE-GODFILE-FUTUREPROJECTION]` et la part
  `FutureProjection` de l'ex-`[DETTE-GODFILES]`) — ⚠️ **taille re-mesurée le 2026-09-07 : 2 207 lignes** (2 026 le
  2026-08-19, pas 1 820 : le fichier a GROSSI de 12 % entre deux tickets qui le décrivaient. C'est la
  démonstration que l'agrégat périmé ne servait à rien.
  ⚠️ **À faire AVANT `[A11Y-SUBTABS-FUTUR]`**, qui est un second refactor du MÊME fichier : les
  mener en parallèle garantit un conflit sur le plus gros fichier du dépôt.
  Détail historique (mesure 1 820 l.) : `FutureProjection.tsx` **1 820 lignes**, 91 fonctions
  locales, 15 `useMemo`, 6 `useEffect`. Combine : config séries + zoom/tooltip + marqueurs événements
  + persistance localStorage. **Correctif (découpe sans changement comportement)** : (1) extraire config
  statique vers `components/future/seriesConfig.ts` ; (2) logique marqueurs vers
  `hooks/useFutureEventMarkers.ts` ; (3) persistance vers `hooks/useHiddenSeries.ts` (pattern dupliqué
  ailleurs).

- [ ] **`[GODFILE-INVESTMENTS]`** (L) — `Investments.tsx` **1 533 lignes** (mesuré 2026-09-07 ; 1 440 au ticket), 9 `useState`, 20 définitions
  locales. Combine probablement liste positions + comparaison + formulaires. Certains partiellement
  extraits (AddStockForm 475 l.). **Correctif** : identifier sous-sections quasi-autonomes (return
  imbriqués / commentaires section), extraire vers `components/investments/` style AddStockForm. Nécessite
  lecture préalable COMPLÈTE avant découpe.

- [ ] **`[GODFILE-BUDGET]`** (L) — `Budget.tsx` **1 569 lignes** (mesuré 2026-09-07 ; 1 413 au ticket), 12 `useMemo`, 46 const/fonctions locales.
  Contient sélection dates inline (violant `[UI-NO-INPUT-PRIMITIVE]`). **Correctif** : même méthode que
  FutureProjection — extraire blocs purement calculatoires (agrégats budget, vérifier non-re-dérivés
  localement vs moteur), puis sous-vues JSX. Mesurer handlers (0 `useCallback` → risque re-création).


---

## 🧊 Différés SCIEMMENT (ne pas prendre sans le déclencheur noté)

- [ ] **`[NONREG-LOSS]`** (M, REQUALIFIÉ FAIBLE par l'analyse fiscale 2026-07-31) — branche perte
  NonReg inatteignable (`portfolioOps.ts:70-75`) MAIS l'ACB excédentaire est CONSERVÉ → la perte est
  DIFFÉRÉE, pas détruite (effet de timing seulement, ~0 $ permanent). Déjà limite assumée
  FISCAL_REFERENCE §3. Prendre seulement avec un scénario où le timing compte (décaissement baissier).
- [ ] **`[FISC-RRSP-PRE2010-FALLBACK]`** (S, RÉFUTÉ pour le profil actuel) — plafond fallback ne mord
  que si salaire passé > 180 500 $ avant 2010 (mesuré). Latent — reprendre si un tel profil apparaît.
- [ ] **`[FISC-REEE-AIP-MODEL]`** (M, FAIBLE — conditionnel enfants + solde survivant aux études) —
  impôt PRA 20 % sur le solde total au lieu de la portion gains + surtaxe. Le défaut PLUS GROS
  (subventions non remboursées) est ticketé séparément : `[FISC-REEE-GRANT-CLAWBACK]` (V6).

- [ ] **`[NAN-MUTATOR-CENTRAL]`** (S) — garde centrale des 4 mutateurs nus — SEULEMENT si un vecteur
  d'entrée non-UI apparaît (numericInput couvre le boundary ; plan prêt en réserve).
- [ ] **`[FISC-RAP-REPAY]`** (M, fixIsSafe:false) — inclusion ligne 12900 + passif successoral RAP —
  risque double-comptage estate ; limite consignée FISCAL_REFERENCE §9.
- [ ] **`[FISC-CHILDCARE]`** (M) — T778/crédit QC exacts au lieu de l'heuristique 30 % — travail dédié.
- [ ] **`[FISC-SURVIVOR-CAP]`** (S) — cap RRQ combiné per-bénéficiaire via perUserRrqWeight (un cap
  naïf serait FAUX) — peu d'impact.
- [ ] **`[FISC-ASSETLOC-INTL]`** (M) — withholdingDrag international en CELI/REER — rouvrir si la
  classe international entre au portefeuille (CELI-ASSET-NUDGE).
- [ ] **`[PROJ-REVEAL-RACE]`** (S, LOW) — course Rechoisir vs miroir IDB — récupérable en re-révélant.
- [ ] **`[MCP-WHATIF-DATED-DEBT]`** (M, ✅ tranché Marc 2026-07-31 : MOTEUR) — `Debt.startDate`
  optionnel honoré par le moteur (dette servie à partir de sa date, pas du mois 0). Plan-first
  (touche le moteur, money-critical) ; débloque le volet immobilier de MCP-DIRECT-EDIT.
- [ ] **`[FISC-CONST-LINT-LIMITS]`** (note de vigilance) — étendre le scan aux taux 2-3 décimales et
  RRIF_RATES = arbitrage faux-positifs à faire — seulement si une fuite réelle apparaît.
- [ ] **`[HARDEN-DECIMAL-STUDY]`** (S, étude) — PoC centimes entiers/decimal.js sur un sous-module —
  dérive flottante déjà bornée ≤ 0,02 $ ; mesurer le coût MC avant d'adopter.

## 🧭 Décisions Marc requises (posées en UN lot le 2026-07-31)

- [ ] **`[Q-HOOKS-DEPS-ERROR]`** — moitié (b) de `[HOOKS-EXHAUSTIVE-DEPS-WARN]`, livré au lot 76.
  Passe-t-on `react-hooks/exhaustive-deps` de `warn` à **`error`** ? **Mesuré après le lot 76 :
  0 violation dans tout le dépôt**, donc le basculement ne coûte RIEN aujourd'hui et rendrait la
  classe impossible à réintroduire (c'est la leçon de `[ENV-NODE-NON-DECLARE]` : seul l'artefact
  EXÉCUTOIRE protège, le déclaratif n'avertit que). **Ce qu'il coûte à l'avenir** : la règle a des
  faux positifs connus, et sous `error` la sortie de secours est un commentaire de désactivation
  ligne par ligne — certains la gardent en `warn` pour ça. C'est un arbitrage de politique, donc
  ta décision, pas la mienne.

## 👤 Actions humaines Marc (jamais auto-cochées)

- [ ] Vérif prod AUTH-DRIVE : si une reconnexion est redemandée → Réglages → Diagnostics → raison GIS
  exacte (login_required = session Google ; popup/cookies = ITP).
- [ ] P0-PROXY restes : env Vercel + smoke + spike Vision (relire sous ADR-002 app solo).
- [ ] RECH-ACTION-UX : confirmation visuelle des fixes #355.
- [ ] Tests manuels (checklist historique — beaucoup sont de facto couverts par l'usage réel
  quotidien ; les cocher si tu les as vécus) : install 1 clic connecteur · auto-sync paie/relevé via
  Claude · fenêtre privée → données reviennent · reste connecté au refresh · clés chiffrées autre
  appareil · rentes RRQ/PSV aux âges choisis · switch persona zéro fuite · refonte Futur 4
  sous-onglets OK ? · zoom molette 60 fps · écran « Calcul en cours » · salaire mensuel cohérent
  partout · chômage → moins d'espace REER.

## 🛡️ Dépendances

- [ ] **`[DEP-ESLINT10]`** (M, dev-only) — ⚠️ **SA RAISON A DISPARU (mesuré 2026-09-02, lot 79).** Il
  existait pour « 5 vulnérabilités high `brace-expansion`/`minimatch` dans la chaîne eslint, fix =
  eslint@10 (breaking) ». Mesuré : `npm audit` rend **0 vulnérabilité** après un `npm audit fix`
  **simple, sans `--force`** — `brace-expansion` est passé 5.0.7 → 5.0.9 dans la chaîne eslint
  existante, sans toucher à eslint. L'écosystème a bougé sous le ticket : le remède « breaking »
  qu'il prescrivait n'était plus nécessaire.
  **Ce qui RESTE** : migrer vers `eslint@10` peut valoir la peine pour d'autres raisons (règles,
  performances, support), mais ce n'est plus un lot de SÉCURITÉ et rien ne le rend urgent. À
  requalifier ou à fermer par Marc — il n'a plus de justification mesurable aujourd'hui.

