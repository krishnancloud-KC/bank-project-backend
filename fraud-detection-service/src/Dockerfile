FROM node:20-slim

WORKDIR /app

# Package files copy చేయి
COPY package*.json ./

# Dependencies install చేయి
RUN npm ci --only=production

# Source code copy చేయి
COPY src/ ./src/
COPY .env ./

# Non-root user కోసం
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nodeuser && \
    chown -R nodeuser:nodejs /app

USER nodeuser

EXPOSE 8083

CMD ["node", "src/index.js"]
