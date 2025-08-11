# Dockerfile pour Coolify - Version corrigée
FROM node:18-alpine

# Installation des dépendances système pour Sharp
RUN apk add --no-cache \
    vips-dev \
    build-base \
    python3 \
    make \
    g++ \
    libc6-compat \
    curl

# Répertoire de travail
WORKDIR /app

# Copie des fichiers de dépendances
COPY package*.json ./

# Installation des dépendances Node.js avec rebuild de Sharp
RUN npm ci --only=production --no-audit && \
    npm rebuild sharp

# Copie du code source
COPY . .

# Création d'un utilisateur non-root pour la sécurité
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Attribution des permissions
RUN chown -R nodejs:nodejs /app
USER nodejs

# Exposition du port
EXPOSE 3000

# Health check avec curl
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Commande de démarrage
CMD ["npm", "start"]
