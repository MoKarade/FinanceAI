# Dockerfile — [MCP-CLOUDRUN-DEPLOY]
# Conteneur du serveur MCP FinanceAI (transport HTTP) pour Google Cloud Run.
# À la RACINE car `gcloud run deploy --source .` détecte un Dockerfile racine (il
# n'existe pas de flag --dockerfile). Vercel (front) ignore ce fichier — il détecte
# Vite via package.json. Le .dockerignore n'embarque que le serveur, pas le front.
#
# Le serveur est BUNDLÉ au build par esbuild (dist-mcp/http.js, un fichier autonome).
# Pourquoi PAS `tsx` au runtime : selon la version de Node, tsx échoue à résoudre les
# imports sans extension à nom pointé (`./tools/ping.tool` → ERR_MODULE_NOT_FOUND, vu
# sur Cloud Run). Le bundle fige la résolution au build ET démarre instantanément.
#
# Build/run local : docker build -t financeai-mcp . && docker run -e PORT=8080 … financeai-mcp

FROM node:22-slim

WORKDIR /app

# Install déterministe via le lockfile. `--include=dev` : esbuild (bundler du serveur)
# vit dans les devDeps → requis au BUILD ; l'install doit rester HORS NODE_ENV=production
# (sinon npm saute les devDeps). Manifeste + lockfile d'abord = cache de couche.
COPY package.json package-lock.json ./
RUN npm ci --include=dev --no-audit --no-fund

# Code du serveur (fermeture d'import : moteur + adaptateurs + tools + types racine).
COPY tsconfig.json ./
COPY types.ts constants.ts ./
COPY mcp ./mcp
COPY services ./services
COPY utils ./utils

# Bundle esbuild → dist-mcp/http.js (autonome : toutes les deps inline).
RUN node mcp/build-server.mjs

ENV NODE_ENV=production
USER node

EXPOSE 8080
# Node pur sur le bundle (pas de tsx) : démarrage rapide, résolution figée.
CMD ["node", "dist-mcp/http.js"]
