# ── Stage 1: install production dependencies ──────────────────────
FROM node:20-alpine AS deps

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ── Stage 2: runtime ──────────────────────────────────────────────
FROM node:20-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src

# Folder upload runtime (foto meeting + file laporan sementara).
# Untuk data persisten, mount volume ke /app/uploads.
RUN mkdir -p uploads/cg-meeting-photos uploads/reports \
  && chown -R node:node /app

USER node

EXPOSE 3000

CMD ["node", "src/server.js"]
