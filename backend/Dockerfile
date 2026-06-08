# Walt backend image.
#
# Node 20 (matches README "Node.js 20"; the repo's >=18 engines floor is also satisfied).
# better-sqlite3 is a NATIVE module: it is compiled from source against this image's
# Node ABI in the build stage, then the prebuilt node_modules is copied into a slim
# runtime stage. This is why the build stage installs python3/make/g++.
#
# This image builds ONLY the backend package. The backend depends solely on published
# npm packages (no workspace-internal deps), so it is built standalone with npm against
# backend/package.json — it does not need the repo root or the pnpm workspace lockfile.
#
# Build context MUST be the backend directory (see docker-compose.yml: build.context).

# ---- build stage: compile native deps ----
FROM node:20-bookworm-slim AS build

# Toolchain required to compile better-sqlite3 from source.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps first for layer caching. No lockfile is committed for the backend
# package, so use `npm install` (not `npm ci`). --omit=dev: runtime needs prod deps only.
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

# ---- runtime stage: slim image, no compilers ----
FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production

WORKDIR /app

# Prebuilt node_modules (incl. compiled better-sqlite3) from the build stage.
COPY --from=build /app/node_modules ./node_modules

# Application source. .dockerignore keeps node_modules/.env/data out of the context.
COPY . .

# Default app port (overridable via PORT env). Documentation only; compose maps it.
EXPOSE 3001

# server.js calls dotenv.config({ path: <backend>/.env }); compose also injects env_file,
# so the app runs whether env arrives via the mounted .env or via the environment.
CMD ["node", "server.js"]
