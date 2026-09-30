# syntax=docker/dockerfile:1

# ---------- Stage 1: build ----------
# Node is needed only to build: type-check and bundle the app into static files in dist/.
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts vitest.config.ts ./
COPY public ./public
COPY src ./src
COPY tests ./tests
RUN npm run build

# ---------- Stage 2: runtime ----------
# The result is plain HTML, CSS and JS: nginx serves it, no Node at runtime at all.
FROM nginx:1.27-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

# nginx:alpine includes BusyBox wget, enough to check that the page is served.
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
    CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1/"]
