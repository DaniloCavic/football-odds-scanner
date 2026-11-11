FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci
COPY . .
RUN npm run build && chown -R node:node /app
ENV NODE_ENV=production
# Server ne radi kao root
USER node
EXPOSE 3000
# Pri svakom pokretanju: migracije baze, admin nalog (ako ne postoji), pa server.
CMD ["npm", "run", "start:prod"]
