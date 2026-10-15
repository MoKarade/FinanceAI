#!/usr/bin/env bash
# mcp/deploy.sh — [MCP-CLOUDRUN-DEPLOY]
# Déploie le serveur MCP FinanceAI sur Google Cloud Run (déploiement manuel ;
# le déploiement CONTINU passe par .github/workflows/deploy-mcp.yml sur push main).
#
# Prérequis (À FAIRE UNE FOIS par Marc — cf mcp/README.md § « Déployer sur Cloud Run ») :
#   - projet GCP + `gcloud` authentifié (`gcloud auth login`, `gcloud config set project <PROJET>`) ;
#   - API activées : run, secretmanager, cloudbuild, artifactregistry ;
#   - 3 secrets OBLIGATOIRES créés dans Secret Manager :
#       financeai-oauth-signing-key   (≥32 octets aléatoires)
#       financeai-access-key          (≥32 caractères aléatoires, ex. 32 octets en hex = 64 car. — TA clé d'accès ; plus court : alerte au journal et dans ping, STRICT=1 ferme /oauth/authorize)
#       financeai-google-refresh      (JSON des identifiants Drive : cf `npm run mcp:auth` puis copier ~/.financeai-mcp/credentials.json)
#   - le compte de service Cloud Run a `roles/secretmanager.secretAccessor` sur CES 3 secrets
#     (les 2 clés OAuth sont montées en variables d'env ; le refresh Google est lu à l'exécution).
#
# Secrets OPTIONNELS — chacun ACTIVE une route, et son absence la laisse désactivée (le script
# le dit à chaque déploiement) : financeai-hub-token, financeai-refresh-secret,
# financeai-finnhub-key, financeai-fintable-{sync-secret,token,roles-json},
# financeai-vehicule-{token,dette}.
#
# ⚠️ CE SCRIPT EST LE SEUL ENDROIT OÙ LE CÂBLAGE SURVIT. `--set-secrets` et `--set-env-vars`
# REMPLACENT l'existant : une variable posée à la main dans la console est effacée au
# déploiement suivant, sans bruit. Et une variable que `mcp/http.ts` lit sans qu'elle soit
# montée ici donne une route ABSENTE du service alors que le code, les tests et la doc
# existent — vécu sur /vehicule/bail, 404 en production pendant que tout avait l'air vert.
# `tests/mcp/deploySecretsCables.test.ts` interdit désormais cet écart.
#
# Usage : PROJECT_ID=mon-projet ./mcp/deploy.sh
set -euo pipefail

PROJECT_ID="${PROJECT_ID:?Définis PROJECT_ID=<ton-projet-gcp>}"
REGION="${REGION:-northamerica-northeast1}"   # Montréal
SERVICE="${SERVICE:-financeai-mcp}"
# Coût : 0 par défaut (scale-to-zero = gratuit à l'usage solo ; cold start ~2 s au réveil,
# qui vide le cache anti-rejeu OAuth en mémoire). Passe MIN_INSTANCES=1 pour éliminer le
# cold start + garder le cache chaud (facture le temps idle → non gratuit).
MIN_INSTANCES="${MIN_INSTANCES:-0}"

# ─────────────────────────────────────────────────────────────────────────────
# [DEPLOY-CLONE-EN-RETARD] REFUS de déployer un clone en retard sur origin/main.
#
# ⚠️ CE SCRIPT ENVOIE `--source .` : il construit LE DOSSIER D'OÙ ON LE LANCE, pas GitHub.
# Un clone qui n'a pas été `git pull` déploie donc l'ANCIEN code — et `gcloud` affiche quand
# même « ✅ Déployé », « Routing traffic... Done », « serving 100 percent of traffic ». Rien,
# nulle part, ne dit que le code embarqué est périmé.
#
# Vécu le 2026-09-21 : plusieurs allers-retours à chercher pourquoi la carte du hub n'affichait
# pas des métriques pourtant mergées, alors que le déploiement était « réussi ». C'est
# exactement la classe §6 du CLAUDE.md (« CI verte ne veut pas dire en ligne ») appliquée au
# déploiement manuel : le succès de l'OUTIL est pris pour le succès de l'INTENTION.
#
# ⚠️ On refuse UNIQUEMENT le retard strict (`HEAD..origin/main` non vide). Déployer une branche
# de travail, un correctif local non poussé ou un `HEAD` détaché reste permis : ce sont des
# gestes délibérés, et un garde-fou qui interdit les cas légitimes finit contourné.
# ⚠️ `ALLOW_BEHIND=1` existe pour le cas rare (retour arrière volontaire) — il doit se TAPER,
# donc il ne peut pas arriver par distraction.
if git rev-parse --git-dir >/dev/null 2>&1; then
  if git fetch --quiet origin main 2>/dev/null; then
    retard="$(git rev-list --count HEAD..origin/main 2>/dev/null || echo 0)"
    if [ "${retard:-0}" -gt 0 ]; then
      if [ "${ALLOW_BEHIND:-0}" = "1" ]; then
        echo "  ⚠️ Clone en retard de ${retard} commit(s) sur origin/main — forcé par ALLOW_BEHIND=1."
      else
        echo "✋ REFUS : ce clone est en retard de ${retard} commit(s) sur origin/main." >&2
        echo "   Le déploiement embarque le dossier LOCAL : il enverrait du code PÉRIMÉ en affichant « ✅ Déployé »." >&2
        echo "   Corrige :  git pull origin main   puis relance ce script." >&2
        echo "   (Retour arrière volontaire : ALLOW_BEHIND=1 $0)" >&2
        exit 1
      fi
    fi
  else
    # Une mesure impossible se DIT, elle ne se remplace pas par un silence rassurant.
    echo "  ⚠️ Impossible de joindre origin : le retard du clone n'a PAS pu être vérifié."
  fi
else
  echo "  ⚠️ Hors dépôt git : le retard du clone n'a PAS pu être vérifié."
fi

# [MCP-VERSION-FIGEE] Le commit embarqué, publié par GET /health (cf `buildSha` dans
# mcp/bootstrap.ts). Vide hors dépôt git : `/health` rendra alors `sha: null`, ce qui est la
# réponse honnête — jamais un repli qui ferait croire qu'on sait.
BUILD_SHA="$(git rev-parse HEAD 2>/dev/null || true)"
# ─────────────────────────────────────────────────────────────────────────────

echo "▶ Déploiement de $SERVICE sur $REGION (projet $PROJECT_ID, min-instances $MIN_INSTANCES)…"

# L'issuer OAuth (FINANCEAI_PUBLIC_URL) doit être connu AU DÉMARRAGE (le serveur refuse
# de démarrer exposé sans lui). Au 1ᵉʳ déploiement l'URL n'existe pas encore → on démarre
# avec un placeholder valide (le serveur boote, /health répond, la révision devient
# « ready »), on récupère la vraie URL, puis on la corrige. Aux déploiements SUIVANTS
# l'URL est déjà connue → une seule passe, AUCUNE fenêtre où l'issuer est faux.
EXISTING_URL="$(gcloud run services describe "$SERVICE" --project "$PROJECT_ID" --region "$REGION" --format 'value(status.url)' 2>/dev/null || true)"
PUBLIC_URL="${EXISTING_URL:-https://pending.invalid}"

# Secrets montés en variables d'env. Les 2 clés OAuth sont obligatoires ; le jeton du
# hub perso est OPTIONNEL — monté seulement si le secret `financeai-hub-token` existe
# (sinon GET /hub/summary reste désactivé, pas d'échec). Le monter ici plutôt qu'en
# variable posée à la main garantit qu'il SURVIT à chaque redéploiement (--set-secrets
# et --set-env-vars remplacent l'existant : une var posée hors script serait effacée).
SECRETS="FINANCEAI_OAUTH_SIGNING_KEY=financeai-oauth-signing-key:latest,FINANCEAI_ACCESS_KEY=financeai-access-key:latest"
if gcloud secrets describe financeai-hub-token --project "$PROJECT_ID" >/dev/null 2>&1; then
  SECRETS="${SECRETS},FINANCEAI_HUB_TOKEN=financeai-hub-token:latest"
  echo "  Hub : secret financeai-hub-token trouvé → GET /hub/summary ACTIF."
else
  echo "  Hub : secret financeai-hub-token absent → GET /hub/summary désactivé."
  echo "        Pour l'activer : crée le secret puis redéploie (cf mcp/README.md § Hub perso)."
fi

# Refresh planifié des prix (HUB-REFRESH-CRON) — OPTIONNEL, même logique que le hub :
# monté seulement si le secret `financeai-refresh-secret` existe (sinon POST /refresh reste
# désactivé, 404). La clé Finnhub est optionnelle (repli CoinGecko pour la crypto sans clé).
if gcloud secrets describe financeai-refresh-secret --project "$PROJECT_ID" >/dev/null 2>&1; then
  SECRETS="${SECRETS},FINANCEAI_REFRESH_SECRET=financeai-refresh-secret:latest"
  echo "  Refresh : secret financeai-refresh-secret trouvé → POST /refresh ACTIF."
else
  echo "  Refresh : secret financeai-refresh-secret absent → POST /refresh désactivé."
  echo "            Pour l'activer : crée le secret puis redéploie (cf mcp/README.md § Refresh planifié)."
fi
if gcloud secrets describe financeai-finnhub-key --project "$PROJECT_ID" >/dev/null 2>&1; then
  SECRETS="${SECRETS},FINANCEAI_FINNHUB_KEY=financeai-finnhub-key:latest"
  echo "  Refresh : secret financeai-finnhub-key trouvé → cours actions via Finnhub."
fi

# [FINTABLE-3] Sync planifiée (cron quotidien) — OPTIONNELLE, même logique. Le jeton Fintable
# (`financeai-fintable-token`, LECTURE SEULE — cf FINTABLE-0/decisions.md) suffit : cette route
# ne fait que des GET vers Fintable, elle n'écrit QUE dans l'état FinanceAI (Drive), jamais
# chez Fintable. `financeai-fintable-roles-json` associe chaque compte Fintable à son rôle
# FinanceAI ({"<id-compte>":{"kind":"cash"|"debt"|"investment"|"ignore",...}}) — sans lui, la
# route tourne mais ne reconnaît aucun compte (mapper à vide, rapport avec accountsWithoutRole).
if gcloud secrets describe financeai-fintable-sync-secret --project "$PROJECT_ID" >/dev/null 2>&1; then
  SECRETS="${SECRETS},FINANCEAI_FINTABLE_SYNC_SECRET=financeai-fintable-sync-secret:latest"
  echo "  Fintable : secret financeai-fintable-sync-secret trouvé → POST /fintable-sync ACTIF."
  if gcloud secrets describe financeai-fintable-token --project "$PROJECT_ID" >/dev/null 2>&1; then
    SECRETS="${SECRETS},FINTABLE_TOKEN=financeai-fintable-token:latest"
  else
    echo "            ⚠️ MAIS financeai-fintable-token absent → chaque appel échouera (503)."
  fi
  if gcloud secrets describe financeai-fintable-roles-json --project "$PROJECT_ID" >/dev/null 2>&1; then
    SECRETS="${SECRETS},FINTABLE_ROLES_JSON=financeai-fintable-roles-json:latest"
  else
    echo "            ⚠️ MAIS financeai-fintable-roles-json absent → aucun compte ne sera reconnu."
  fi
else
  echo "  Fintable : secret financeai-fintable-sync-secret absent → POST /fintable-sync désactivé."
  echo "             Pour l'activer : crée les 3 secrets (sync-secret + token + roles-json) puis redéploie."
fi

# [VEHICULE-BAIL] GET /vehicule/bail — ce que FinanceAI sait du bail du véhicule, lu par CarAI
# (ADR 0017). OPTIONNEL, même logique que les précédents.
#
# ⚠️ CETTE ROUTE A ÉTÉ ÉCRITE, TESTÉE, DOCUMENTÉE — ET INJOIGNABLE EN PRODUCTION. Le code
# ne câble la route que si `FINANCEAI_VEHICULE_TOKEN` existe (cf `mcp/http.ts`), et ce script
# ne le montait pas : le service déployé répondait donc 404 sur une URL que CarAI interrogeait
# déjà. Rien n'était rouge — un 404 est exactement ce que la route est CENSÉE rendre quand elle
# est volontairement désactivée, donc son absence ressemblait à un choix.
#
# ⚠️ Et poser la variable à la main dans la console NE MARCHE PAS DURABLEMENT : `--set-secrets`
# et `--set-env-vars` REMPLACENT l'existant à chaque déploiement (cf le commentaire du bloc
# `SECRETS` plus haut). Le seul endroit où ce câblage survit est ici.
if gcloud secrets describe financeai-vehicule-token --project "$PROJECT_ID" >/dev/null 2>&1; then
  SECRETS="${SECRETS},FINANCEAI_VEHICULE_TOKEN=financeai-vehicule-token:latest"
  echo "  Véhicule : secret financeai-vehicule-token trouvé → GET /vehicule/bail ACTIF."
  # Nomme la dette qui compte quand plusieurs véhicules coexistent. Sans lui la route choisit
  # par `kind`/catégorie, et REFUSE (409) s'il y a plusieurs candidates — elle ne devine pas.
  if gcloud secrets describe financeai-vehicule-dette --project "$PROJECT_ID" >/dev/null 2>&1; then
    SECRETS="${SECRETS},FINANCEAI_VEHICULE_DETTE=financeai-vehicule-dette:latest"
    echo "             Dette nommée par financeai-vehicule-dette."
  fi
else
  echo "  Véhicule : secret financeai-vehicule-token absent → GET /vehicule/bail désactivé (404)."
  echo "             Pour l'activer : crée le secret puis redéploie (cf mcp/README.md § Bail du véhicule)."
fi

# [MCP-ACCESS-KEY-MIN] ACCESS_KEY_STRICT=1 (ou la variable GitHub MCP_ACCESS_KEY_STRICT) → FINANCEAI_ACCESS_KEY_STRICT=1 :
# une clé d'accès de moins de 32 caractères ferme alors /oauth/authorize (le reste du serveur continue). Posée ICI parce que
# --set-env-vars REMPLACE l'existant : une variable ajoutée à la main dans la console serait effacée au déploiement suivant.
ENV_VARS="FINANCEAI_GOOGLE_SECRET=projects/${PROJECT_ID}/secrets/financeai-google-refresh,FINANCEAI_PUBLIC_URL=${PUBLIC_URL},FINANCEAI_BUILD_SHA=${BUILD_SHA}"
if [ "${ACCESS_KEY_STRICT:-}" = "1" ]; then
  ENV_VARS="${ENV_VARS},FINANCEAI_ACCESS_KEY_STRICT=1"
fi

gcloud run deploy "$SERVICE" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --source . \
  --allow-unauthenticated \
  --min-instances "$MIN_INSTANCES" \
  --max-instances 2 \
  --port 8080 \
  --set-secrets "$SECRETS" \
  --set-env-vars "$ENV_VARS"

if [ -z "$EXISTING_URL" ]; then
  URL="$(gcloud run services describe "$SERVICE" --project "$PROJECT_ID" --region "$REGION" --format 'value(status.url)')"
  echo "▶ 1ᵉʳ déploiement : correction de l'issuer OAuth → $URL"
  gcloud run services update "$SERVICE" \
    --project "$PROJECT_ID" --region "$REGION" \
    --update-env-vars "FINANCEAI_PUBLIC_URL=$URL"
else
  URL="$EXISTING_URL"
fi

echo "✅ Déployé. Branche claude.ai → Settings → Connectors → Add custom connector :"
echo "     URL du serveur MCP : ${URL}/mcp"
echo "   claude.ai découvrira l'OAuth via ${URL}/.well-known/oauth-protected-resource."
echo "   Sonde santé : ${URL}/health"
