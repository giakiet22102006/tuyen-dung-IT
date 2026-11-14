# syntax=docker/dockerfile:1

# ==============================================================================
# Stage 1: Production dependencies only (cached separately from source changes)
# ==============================================================================
FROM node:22-bookworm-slim AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ==============================================================================
# Stage 2: Build Tailwind CSS assets (needs devDependencies like @tailwindcss/cli)
# ==============================================================================
FROM node:22-bookworm-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY src/styles ./src/styles
COPY views ./views
COPY public ./public

RUN npm run build:css

# ==============================================================================
# Stage 3: Minimal production runtime (non-root user, exec-form PID 1)
# ==============================================================================
FROM node:22-bookworm-slim AS runner

ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app

# Copy production dependencies & application source owned by non-root 'node' user
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node views ./views
COPY --chown=node:node public ./public
COPY --from=builder --chown=node:node /app/public/assets/css/tailwind.css ./public/assets/css/tailwind.css

# Ensure runtime writable directories exist with non-root permissions
RUN mkdir -p /app/public/uploads /app/storage/private/cv \
  && chown -R node:node /app/public/uploads /app/storage

USER node

EXPOSE 3000

# Use Node's built-in fetch for liveness check (no curl/wget needed in image)
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/healthz').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]

# Exec form ensures node receives SIGTERM directly as PID 1 (no shell wrapper)
CMD ["node", "src/server.js"]
