# Architecture Decision Records

Décisions structurantes documentées au format ADR léger (1-2 pages chacune).

| # | Titre | Date | Statut |
|---|---|---|---|
| [001](001-migration-gemini-claude.md) | Migration Gemini → Claude (Anthropic SDK) | 2026-05 | Acceptée |
| [002](002-era-context-moteur-qualite.md) | Era Context comme moteur de qualité IA | 2026-05 | Acceptée |
| [003](003-split-projection-modulaire.md) | Split `services/projection.ts` en 31 sous-modules | 2026-05 | Acceptée |
| [004](004-design-system-custom-vs-shadcn.md) | Design system primitives custom (vs shadcn/Radix) | 2026-05 | Acceptée |
| [005](005-future-source-unique-calculs.md) | Future = source unique pour les calculs projetés | 2026-05-21 | Acceptée |
| [006](006-no-fake-data-convention.md) | Convention "valeurs réelles ou rien" | 2026-05-21 | Acceptée |
| [007](007-auth-cloudflare-access.md) | Authentification via Cloudflare Access + Google OAuth | 2026-05-22 | Acceptée (implémentée) |
| [008](008-strategy-config-decoupling.md) | Optimiseur : leviers découplés + adaptateur moteur fin | 2026-05-26 | Acceptée (implémentée) |

## Format

Chaque ADR suit ce gabarit court :

```markdown
# ADR-NNN : Titre

**Date** : YYYY-MM
**Statut** : Proposée / Acceptée / Remplacée par ADR-XXX

## Contexte
Problème ou opportunité. Quelles forces sont en jeu ?

## Décision
Ce qui est tranché.

## Conséquences
Bonnes, mauvaises, ouvertes. Ce qui en découle.
```

## Quand créer un ADR

- Choix d'une dépendance majeure (SDK, framework, lib > 50KB)
- Refactoring structurel qui touche >5 fichiers
- Changement de pattern transverse (state, IA, routing, design system)
- Décision qui aurait été utile à connaître **6 mois plus tard**

## Quand ne PAS créer d'ADR

- Bug fix
- Refactoring local (1 fichier)
- Tweak visuel
- Renommage
