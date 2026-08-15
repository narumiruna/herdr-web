# syntax=docker/dockerfile:1

FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY . .
RUN npm run build

FROM node:22-alpine AS runtime

WORKDIR /app

ENV BRIDGE_HOST=0.0.0.0 \
    HERDR_SOCKET_PATH=/run/herdr/herdr.sock \
    HERDR_WEB_STATIC_ROOT=/app/dist \
    PORT=8080

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:8080/healthz || exit 1

CMD ["node", "dist-server/index.js"]
