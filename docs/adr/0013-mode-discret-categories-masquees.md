# ADR — Mode discret : les CATÉGORIES sont masquées aussi (2026-08-18)
**Statut** : accepté (Marc, 2026-08-18, réponse « masquer »).

**Contexte** : l'audit vie privée de la PR #645 a soulevé que l'argument justifiant de masquer le
MARCHAND (`[PRIV-PAYEE-MODE-DISCRET]`, décision de la veille) vaut presque autant pour la catégorie :
« Santé » ou « Dons », datée, ré-identifie à peu près aussi bien qu'un nom de commerçant. Trois
options ont été présentées : (A) statu quo documenté, (B) masquer toutes les catégories, (C) masquer
une liste de catégories sensibles.

**Décision** : **B — masquer TOUTES les catégories** en mode discret.

⚠️ **Cette décision RENVERSE ma recommandation**, qui était (A). Mon argument — « la catégorie est
une classe générique, pas un identifiant ; sans elle une ligne masquée ne dit plus rien » — reste
vrai pour l'écrasante majorité des catégories, et faux pour la poignée qui compte. Marc a choisi la
protection plutôt que l'utilité résiduelle. C'est sa donnée ; consigné ici pour que la prochaine
session ne « corrige » pas la politique en croyant retrouver une cohérence perdue.

**Pourquoi PAS (C), l'option qui paraît la plus fine** : une liste de catégories « sensibles » est
une HEURISTIQUE DE TEXTE sur des libellés que Marc écrit lui-même — classe
`TEXT-HEURISTIC-OVER-USER-TEXT`, déjà au dossier. Une catégorie personnalisée « Psy » y échapperait
EN SILENCE, et un masquage qui rate discrètement est pire qu'un masquage absent : il donne une
confiance injustifiée. (C) ne redeviendrait défendable qu'avec un marqueur STRUCTUREL — un drapeau
« sensible » posé par Marc sur la catégorie — jamais avec une regex sur le libellé.

**Trade-offs** :
- ✅ Cohérent : le mode discret masque désormais valeurs, marchands ET catégories.
- ⚠️ Une ligne masquée n'apprend plus rien de son contenu. Restent la DATE et la structure — assumé.
- ⚠️ Le `<select>` de catégorie s'ÉDITE : masquer son texte aurait masqué la FONCTION. D'où
  `PrivateSelect`, qui reprend l'idiome déjà décidé pour les montants (`D6-PRIV-MONTANTS`) —
  masqué au repos, révélé au clic/focus, re-masqué dès que le mode est réactivé.

**Alternative rejetée** : envelopper le select dans `PrivateText` (masquage total) — retirer une
fonction pour protéger une valeur, alors que le dépôt avait déjà résolu ce cas exact.

---

> Journal court des décisions structurantes. Format : Contexte / Décision / Pourquoi / Trade-offs / Alternatives
> rejetées. Les ADR livrés plus anciens sont consolidés dans `docs/HISTORIQUE.md`.
