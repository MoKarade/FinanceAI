<!-- Extrait de CLAUDE.md, déplacé le 2026-09-26 (texte copié à l'identique, rien supprimé). Index : CLAUDE.md -->

# CLAUDE.md — FinanceAI

App perso de planif financière (fiscalité ARC + Revenu Québec, Monte Carlo retraite,
assistant Claude). 100 % navigateur, pas de backend. TS strict, **6 319 tests** Vitest
(638 fichiers de test — **MESURÉ en local**, suite complète verte, le 2026-09-18 sur `cc0aa63c`
(`npm run test`, 979 s). ⚠️ Une suite lancée pendant qu'on modifie `BACKLOG.md` ne mesure rien :
deux gardes lisent ce fichier à l'EXÉCUTION — une première mesure a été jetée pour ça.
⚠️ Et le log du job CI n'est pas téléchargeable depuis ce conteneur (403 au CONNECT sur le blob
Azure ; `get_job_logs` ne rend que ~3,5 Ko de queue, donc jamais le résumé Vitest) : le compteur se
mesure EN LOCAL, une fois l'arbre figé. Mesure qui CONFIRME, publiée comme telle : le total DÉRIVÉ
que portait cet en-tête pour `069effd3` — 6 315 / 637 — était exact au test près (6 319 − 4 gardes
neuves, 638 − 1 fichier neuf). Tout en français.

> **Ce fichier se charge à CHAQUE session — il reste COURT, pour de vrai.**
> Le détail (leçons, incidents, pièges, rationnels) vit dans **`docs/CONVENTIONS.md`**,
> qui est l'ancien CLAUDE.md intégral. Ici : ce qu'il faut savoir AVANT de savoir quoi
> chercher. Une leçon nouvelle va dans `docs/CONVENTIONS.md` ; on n'ajoute ici qu'une
> LIGNE d'index quand une classe de piège n'y figure pas encore.
>
> Structure imposée par la convention commune aux huit dépôts
> ([`claude-config/conventions/STRUCTURE-DEPOT.md`](https://github.com/MoKarade/claude-config/blob/main/conventions/STRUCTURE-DEPOT.md)) :
> mêmes titres, même ordre, dans les huit. Les principes en §1, le gate en §5, les leçons en §9.
> **Trois documents ont déménagé le 2026-08-20** pour s'y conformer : `docs/BACKLOG.md` →
> `BACKLOG.md`, `docs/SESSION_HANDOVER.md` → `HANDOVER.md`, et `docs/decisions.md` (785 lignes,
> treize décisions empilées dans le désordre) → `docs/adr/NNNN-slug.md`, une par fichier.

