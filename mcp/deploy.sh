#!/usr/bin/env bash
# mcp/deploy.sh — [MCP-CLOUDRUN-DEPLOY]
# Déploie le serveur MCP FinanceAI sur Google Cloud Run (déploiement manuel ;
# le déploiement CONTINU passe par .github/workflows/deploy-mcp.yml sur push main).
#
# Prérequis (À FAIRE UNE FOIS par Marc — cf mcp/README.md § « Déployer sur Cloud Run ») :
#   - projet GCP + `gcloud` authentifié (`gcloud auth login`, `gcloud config set project <PROJET>`) ;
#   - API activées : run, secretmanager, cloudbuild, artifactregistry ;
#   - 3 secrets créés dans Secret Manager :
#       financeai-oauth-signing-key   (≥32 octets aléatoires)
#       financeai-access-key          (≥16 octets aléatoires — TA clé d'accès)
#       financeai-google-refresh      (JSON des identifiants Drive : cf `npm run mcp:auth` puis copier ~/.financeai-mcp/credentials.json)
#   - le compte de service Cloud Run a `roles/secretmanager.secretAccessor` sur LES 3 secrets
#     (les 2 clés OAuth sont montées en variables d'env ; le refresh Google est lu à l'exécution).
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

echo "▶ Déploiement de $SERVICE sur $REGION (projet $PROJECT_ID, min-instances $MIN_INSTANCES)…"

# L'issuer OAuth (FINANCEAI_PUBLIC_URL) doit être connu AU DÉMARRAGE (le serveur refuse
# de démarrer exposé sans lui). Au 1ᵉʳ déploiement l'URL n'existe pas encore → on démarre
# avec un placeholder valide (le serveur boote, /health répond, la révision devient
# « ready »), on récupère la vraie URL, puis on la corrige. Aux déploiements SUIVANTS
# l'URL est déjà connue → une seule passe, AUCUNE fenêtre où l'issuer est faux.
EXISTING_URL="$(gcloud run services describe "$SERVICE" --project "$PROJECT_ID" --region "$REGION" --format 'value(status.url)' 2>/dev/null || true)"
PUBLIC_URL="${EXISTING_URL:-https://pending.invalid}"

gcloud run deploy "$SERVICE" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --source . \
  --allow-unauthenticated \
  --min-instances "$MIN_INSTANCES" \
  --max-instances 2 \
  --port 8080 \
  --set-secrets "FINANCEAI_OAUTH_SIGNING_KEY=financeai-oauth-signing-key:latest,FINANCEAI_ACCESS_KEY=financeai-access-key:latest" \
  --set-env-vars "FINANCEAI_GOOGLE_SECRET=projects/${PROJECT_ID}/secrets/financeai-google-refresh,FINANCEAI_PUBLIC_URL=${PUBLIC_URL}"

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
