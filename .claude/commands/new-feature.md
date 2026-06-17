---
description: Cadre une nouvelle feature FinanceAI — product-manager (valeur/MVP) puis architect (structure/plan). Lecture seule, planification AVANT tout code.
allowed-tools: Bash, Read, Grep, Glob, Agent
---

Objectif : transformer une idée de feature en plan actionnable, AVANT d'écrire du code (plan-first OBLIGATOIRE). Pipeline **séquentiel** — chaque sous-agent démarre dans un contexte vierge, tu lui passes EXPLICITEMENT la sortie du précédent.

1. **product-manager** : lance l'agent sur la demande ($ARGUMENTS). Récupère sa fiche : problème utilisateur, valeur vs effort, **MVP**, hors-périmètre, critères d'acceptation (Given/When/Then), risques produit.

2. **architect** : lance l'agent en lui PASSANT la fiche du product-manager (MVP + critères d'acceptation). Récupère : structure cible (modules / frontières / flux), réutilisation des patrons existants, dette & risques, **plan d'implémentation ordonné** (chemin critique d'abord, points de vigilance money-critical, tests discriminants requis), trade-offs (ADR court).

3. **Synthèse** : présente à Marc le plan consolidé (MVP + plan d'archi + risques + étapes ordonnées) et **attends son OK explicite avant de coder**. Cette commande ne modifie AUCUN fichier applicatif.

Argument : $ARGUMENTS = description de la feature à cadrer.
