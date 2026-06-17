#!/usr/bin/env node
// UserPromptSubmit : à CHAQUE message de Marc, injecte la directive d'ORCHESTRATION
// (applique `.claude/agents/orchestrator.md`). NON-BLOQUANT (exit 0 toujours).
// N'invoque PAS un sous-agent (coûteux + ce n'est pas ainsi que marchent les sous-agents) :
// c'est une DIRECTIVE de routage que la boucle principale applique (annonce des agents
// retenus/ignorés + pourquoi, puis exécution). C'est ça qui « fonctionne à chaque message ».
const directive =
  'ORCHESTRATION (orchestrator.md, règle Marc 2026-06-17) : AVANT de répondre à ce message, déduis le ' +
  'TYPE de la demande et annonce en 1-2 lignes les agents PERTINENTS à lancer (+ les ignorés et pourquoi), ' +
  'puis exécute. Routage FinanceAI : nouvelle feature → product-manager + architect (/new-feature) ; ' +
  'calcul $ / impôt / solde / dette / devise → financial-integrity (+ projection-validator si services/projection/) ' +
  '+ silent-failure-hunter ; sécurité / secrets / persistance / vie privée → security-privacy ; SDK Anthropic → ' +
  'ai-reviewer ; UI / a11y → a11y-auditor ; structure / dette → architect / code-analyzer (+ documentation-manager ' +
  'si la doc bouge) ; perf moteur → performance-optimizer ; logique métier ajoutée → test-writer ; avant commit/merge → ' +
  'code-reviewer + silent-failure-hunter (/review-all) ; avant release → /release-review. ' +
  'Message TRIVIAL / conversationnel (ok, go, merci, accusé de réception, question simple) → AUCUN agent, réponds ' +
  'direct. Ne lance JAMAIS un agent hors sujet ; optimise coût et temps.';

process.stdout.write(JSON.stringify({
  hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: directive },
}));
process.exit(0);
