// components/tour/tourSteps.ts
// G22-F4 — Définition des étapes du tutoriel guidé (visite de tous les onglets).
//
// Chaque étape cible un onglet (le tour le sélectionne automatiquement) et
// s'ancre sur l'item de navigation correspondant (`data-tour-id="nav-<TAB>"`,
// posé dans Layout) pour la surbrillance. Les étapes `tab: null` sont des
// cartes centrées (intro / conclusion).

import { Tab } from '../../types';

export interface TourStep {
  /** Onglet à ouvrir pour cette étape (null = carte centrée sans navigation). */
  tab: Tab | null;
  title: string;
  body: string;
}

// [REFONTE-NAV Lot 1] Visite dans l'ordre des 6 destinations : Futur d'abord (le cœur),
// puis Configurations (ce que j'ai), Vie (ce que je prévois), Transactions, Assistant,
// Réglages. L'étape Accueil est retirée (l'onglet n'existe plus).
export const TOUR_STEPS: ReadonlyArray<TourStep> = [
  {
    tab: null,
    title: '👋 Bienvenue dans la visite guidée',
    body: "En 1 minute, je te montre les 6 sections de l'app. Tout tourne autour de la courbe Future. Tu peux passer à tout moment et relancer la visite depuis Réglages.",
  },
  {
    tab: Tab.FUTURE,
    title: '🔮 Futur — le cœur de l\'app',
    body: "C'est ta page d'accueil : la courbe projette ton patrimoine sur des décennies, avec tes chiffres du jour juste au-dessus. L'optimiseur teste des stratégies et te recommande la meilleure. Zoome, clique, explore chaque jour.",
  },
  {
    tab: Tab.PROFILE,
    title: '👤 Profil',
    body: "Dans Configurations : ton identité, tes salaires et ta situation (seul ou en couple). Tout le reste de l'app lit ces données.",
  },
  {
    tab: Tab.INVESTMENTS,
    title: '📈 Investissements',
    body: "Tes comptes CELI, REER, non-enregistré et crypto au même endroit, avec l'évolution de ton portefeuille.",
  },
  {
    tab: Tab.REAL_ESTATE,
    title: '🏡 Immobilier',
    body: "Ta propriété et tes achats : mise de fonds, hypothèque, RAP/CELIAPP. Le futur en tient compte automatiquement.",
  },
  {
    tab: Tab.DEBT,
    title: '💳 Dettes',
    body: "Liste tes dettes (carte, prêt auto, marge) et vois en combien de temps tu les rembourses selon ta stratégie.",
  },
  {
    tab: Tab.TAX,
    title: '🧮 Impôts & Docs',
    body: "Estimation de tes impôts (fédéral + Québec) à partir de ton profil.",
  },
  {
    tab: Tab.RETIREMENT,
    title: '🏖️ Retraite',
    body: "Dans Vie : capital nécessaire, indépendance financière (FIRE), RRQ/PSV — vérifie si tu es sur la bonne voie.",
  },
  {
    tab: Tab.CHILD,
    title: '👶 Enfant',
    body: "Coûts d'un enfant, REEE et études : la projection ajoute ces dépenses et subventions au bon moment.",
  },
  {
    tab: Tab.LIFE_PROJECTS,
    title: '🛤️ Projets de vie',
    body: "Voyages, mariage, gros achats… ajoute tes projets ponctuels pour les voir dans ta trajectoire financière.",
  },
  {
    tab: Tab.TRANSACTIONS,
    title: '🧾 Transactions',
    body: "Importe tes relevés (ou connecte ta banque) et catégorise tes dépenses. L'IA peut le faire pour toi si tu actives Claude.",
  },
  {
    tab: Tab.BUDGET,
    title: '📊 Budget',
    body: "Fixe tes enveloppes de dépenses, suis tes charges fixes et abonnements, et garde le cap sur tes objectifs d'épargne.",
  },
  {
    tab: Tab.ASSISTANT,
    title: '🤖 Assistant IA',
    body: "Pose tes questions financières en langage naturel. Il connaît ton contexte (si tu as activé Claude).",
  },
  {
    tab: Tab.SETTINGS,
    title: '⚙️ Réglages',
    body: "Tes clés API, ta sauvegarde, la sync et les diagnostics — tout est ici, en sous-onglets. C'est aussi d'ici que tu relances cette visite.",
  },
  {
    tab: null,
    title: '🎉 C\'est tout !',
    body: "Tu connais maintenant les grandes lignes. Commence par Transactions ou reste sur la courbe Future. Bonne route !",
  },
];
