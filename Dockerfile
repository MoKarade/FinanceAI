# Dockerfile — [MCP-CLOUDRUN-DEPLOY]
# Conteneur du serveur MCP FinanceAI (transport HTTP) pour Google Cloud Run.
# À la RACINE car `gcloud run deploy --source .` détecte un Dockerfile racine (il
# n'existe pas de flag --dockerfile). Vercel (front) ignore ce fichier — il détecte
# Vite via package.json. Le .dockerignore n'embarque que le serveur, pas le front.
#
# Le serveur est du TypeScript exécuté par `tsx` (pas de build séparé : le moteur de
# projection est importé tel quel). Build/run local :
#   docker build -t financeai-mcp .
#   docker run -e PORT=8080 -e FINANCEAI_OAUTH_SIGNING_KEY=… -e FINANCEAI_ACCESS_KEY=… \
#              -e FINANCEAI_PUBLIC_URL=https://… -p 8080:8080 financeai-mcp

FROM node:22-slim

WORKDIR /app

# Install déterministe via le lockfile (npm ci). On installe AUSSI les devDeps :
# `tsx` (le runtime TS du serveur) y vit → `--include=dev` obligatoire, et l'install
# doit rester HORS NODE_ENV=production (sinon npm saute les devDeps → `tsx` absent →
# le CMD échoue / retélécharge à chaud à chaque cold start — findings panel 2026-07-13).
# Manifeste + lockfile copiés d'abord = cache de couche quand seul le code change.
COPY package.json package-lock.json ./
RUN npm ci --include=dev --no-audit --no-fund

# Le serveur tourne en production (Cloud Run injecte $PORT ; écoute 0.0.0.0:$PORT).
ENV NODE_ENV=production

# Code nécessaire au serveur MCP (fermeture d'import PROUVÉE minimale : moteur +
# adaptateurs + tools + types racine). On évite le front (components/, e2e/, tests/…).
COPY tsconfig.json ./
COPY types.ts constants.ts ./
COPY mcp ./mcp
COPY services ./services
COPY utils ./utils

# Utilisateur non-root (image node fournit `node`).
USER node

EXPOSE 8080
CMD ["npx", "tsx", "mcp/http.ts"]
