# Agents FinanceAI

> Flotte d'agents de revue spécialisés FinanceAI. Définitions : `.claude/agents/*.md`.
> Usage (commandes, panel) : `docs/workflow.md`. Décision de design : `docs/adr/` (ADR-001).

## Deux niveaux
- **Globaux** (`~/.claude/agents/`, ~184 via claude-config / ECC / toolkit) : génériques, dispo dans tous les projets.
- **Projet** (`.claude/agents/`, **14**) : spécialisés FinanceAI, **surchargent les globaux par nom**. Le 14ᵉ est l'`orchestrator` (routage, cf ci-dessous).
  Overrides sains (collision volontaire d'un global générique) : `code-reviewer`, `security-privacy`
  (le global s'appelle `security-reviewer`), `performance-optimizer`, `silent-failure-hunter`.

## Orchestrateur (routage à chaque message)
`orchestrator` (sonnet, lecture seule, ne code jamais) détermine quels agents lancer selon le TYPE de demande. Le hook
`UserPromptSubmit` (`scripts/hooks/orchestrate.mjs`) injecte sa directive à CHAQUE message → la boucle principale annonce
les agents retenus/ignorés (+ pourquoi) avant d'agir. Message trivial → aucun agent. Routage complet dans
`.claude/agents/orchestrator.md`. ⚠️ Claude Code ne peut pas auto-spawner un sous-agent par message : le routage est
appliqué par la boucle principale, pas par un sous-agent.

## Principe : une décision unique par agent
Chaque agent existe pour **la décision qu'aucun autre ne prend**. Les exclusions évitent le chevauchement
et le bruit. Tous les agents de revue sont **lecture seule** (sauf `documentation-manager` et `test-writer`).

## Panel cœur (revue)
| Agent | Décision unique | Exclut | Modèle |
|---|---|---|---|
| `architect` | structure cible + plan d'implémentation | revue ligne-à-ligne (→ code-reviewer) | sonnet |
| `product-manager` | valeur utilisateur / MVP / critères d'acceptation | toute considération technique | sonnet |
| `financial-integrity` | justesse calcul $ + intégrité donnée (vs `FISCAL_REFERENCE.md`) | invariants moteur (→ projection-validator), IA (→ ai-reviewer), sécu (→ security-privacy) | **opus** |
| `security-privacy` | failles d'accès / fuites / vie privée (Loi 25, RGPD) | justesse des calculs (→ financial-integrity) | sonnet |
| `code-reviewer` | correction / clarté / maintenabilité / perf générale / tests | archi cible (→ architect), profilage moteur (→ performance-optimizer) | sonnet |
| `ai-reviewer` | robustesse prompts / coût / fallback du SDK Anthropic | exactitude $ des sorties (→ financial-integrity), injection (→ security-privacy) | sonnet |
| `documentation-manager` | cohérence des fichiers de doc (`.md`) ↔ code (Edit `docs/`+`.md`) | valeur fiscale (→ financial-integrity) ; JSDoc/commentaires inline (→ code-reviewer) | haiku |

## Spécialistes money-critical (distincts du panel cœur)
| Agent | Décision unique | Modèle |
|---|---|---|
| `projection-validator` | la SIMULATION conserve-t-elle l'argent / respecte ses 12 invariants ? (systémique, dynamique) | **opus** |
| `silent-failure-hunter` | une erreur est-elle avalée / un fallback masque-t-il un bug ? (transversal) | sonnet |

## Utilitaires (hors panel par-commit, à la demande)
| Agent | Rôle | Modèle |
|---|---|---|
| `test-writer` | **génère** des tests Vitest (Edit/Write) | sonnet |
| `performance-optimizer` | profilage moteur profond (Monte Carlo / worker / boucles chaudes) | sonnet |
| `a11y-auditor` | accessibilité WCAG AA sur UI notable | sonnet |
| `code-analyzer` | dette technique large → entrées BACKLOG | sonnet |

## Format de sortie commun
Chaque agent de revue classe ses findings **CRITIQUE / ÉLEVÉ / MOYEN / FAIBLE**, chacun avec :
`fichier:ligne` · vecteur/cause · impact utilisateur · correctif recommandé. Aucun agent ne modifie le
code applicatif. **CRITIQUE = bloquant (NO-GO).**

## Ce qui n'est PAS un agent
- **release-manager** → synthèse GO/NO-GO de `/release-review` (`docs/release-process.md`).
- **conformité réglementaire** → checklist aux jalons (`docs/compliance.md`), pas par commit.
- **« comment utiliser les agents »** → `docs/workflow.md`.
- **UX** → revue interactive en chat (captures d'écran), pas un agent code-only.

## Entretien
Les agents **s'améliorent à chaque push** (règle Marc 2026-06-17) : bruit, angle mort, ou convention changée
→ mettre à jour `.claude/agents/<nom>.md` (+ ce fichier si le rôle bouge) dans la MÊME PR. Le hook
`learn-on-push` le rappelle au moment du push.
