# syntax=docker/dockerfile:1

# ---------- Stage 1: build ----------
# Alpine Linux is a minimal distribution (~5 MB base vs ~75 MB for Debian slim), so the final image is small.
# Full toolchain here: TypeScript and the C++ build tools better-sqlite3 needs if no prebuilt binary matches.
FROM node:22-alpine AS build
WORKDIR /app

RUN apk add --no-cache python3 make g++

# Dependencies first: this layer is reused from the cache until package*.json changes.
COPY package.json package-lock.json ./
RUN npm ci

# Then the source, which changes often.
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build \
    # Keep only production dependencies for the runtime stage (TypeScript, Vitest etc. are dropped).
    && npm prune --omit=dev \
    # better-sqlite3 ships the SQLite C sources and leaves compiler output behind; only the .node binary is needed.
    && cd node_modules/better-sqlite3 \
    && rm -rf deps src build/Release/obj build/Release/obj.target build/Release/.deps build/deps

# ---------- Stage 2: runtime ----------
# Same Alpine base as the build stage, so the compiled better-sqlite3 binary (built against musl libc) matches.
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/app/data/tickets.db

# The server starts with plain `node`; npm and its bundled packages are not needed at runtime,
# and every tool left in a production image is something an attacker could use.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack

# Only what the server needs at runtime: compiled JS, production node_modules, SQL migrations.
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY drizzle ./drizzle

# The database lives in /app/data, which docker-compose mounts as a volume so it survives new containers.
# The folder belongs to the unprivileged "node" user that ships with the image; the server does not run as root.
RUN mkdir -p /app/data && chown node:node /app/data
USER node
VOLUME /app/data

EXPOSE 3000

# Docker marks the container unhealthy if /health stops answering. Node itself does the check, so no curl is needed.
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:' + process.env.PORT + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]

# Exec form (a JSON array): node runs as PID 1 and receives SIGTERM from `docker stop` directly,
# so the graceful shutdown in src/index.ts finishes requests and closes the database.
CMD ["node", "dist/index.js"]
