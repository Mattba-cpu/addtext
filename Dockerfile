# Dockerfile simplifié pour debug
FROM node:18-alpine

# Ajout de curl pour health check seulement
RUN apk add --no-cache curl

# Répertoire de travail
WORKDIR /app

# Copie des fichiers de dépendances
COPY package*.json ./

# Installation SANS Sharp pour le moment
RUN npm ci --only=production --no-audit --ignore-scripts

# Copie du code source
COPY . .

# Création utilisateur non-root
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Attribution des permissions
RUN chown -R nodejs:nodejs /app
USER nodejs

# Exposition du port
EXPOSE 3000

# Health check simple
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Commande de démarrage
CMD ["npm", "start"]
