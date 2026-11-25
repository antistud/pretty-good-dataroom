# syntax=docker/dockerfile:1

# ---- build ----
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# The build must not touch real data; point it at a throwaway directory.
RUN DATA_DIR=/tmp/build-data npm run build

# ---- runtime ----
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/data

RUN groupadd --system --gid 1001 dataroom \
    && useradd --system --uid 1001 --gid dataroom --home /app dataroom \
    && mkdir -p /data && chown dataroom:dataroom /data

COPY --from=build --chown=dataroom:dataroom /app/.next/standalone ./
COPY --from=build --chown=dataroom:dataroom /app/.next/static ./.next/static
# better-sqlite3 is a native module kept out of the bundle. It ships prebuilt
# binaries in its own prebuilds/ folder; copy the whole package so the right
# .node file is present even if build-time file tracing misses it.
COPY --from=build --chown=dataroom:dataroom /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3

USER dataroom
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
