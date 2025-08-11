# Dockerfile Ubuntu - Plus compatible avec Sharp
FROM node:18-slim

# Installation des dépendances système
RUN apt-get update && apt-get install -y \
    curl \
    libvips-dev \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Répertoire de travail
WORKDIR /app

# Copie des fichiers de dépendances
COPY package*.json ./

# Installation avec npm install (pas ci)
RUN npm install --only=production --no-audit && \
    npm rebuild sharp --verbose

# Copie du code source
COPY . .

# Création utilisateur non-root
RUN groupadd -g 1001 nodejs && \
    useradd -r -u 1001 -g nodejs nodejs

# Attribution des permissions
RUN chown -R nodejs:nodejs /app
USER nodejs

# Exposition du port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Commande de démarrage
CMD ["npm", "start"]
