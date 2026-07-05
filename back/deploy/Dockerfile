ARG NODE_VERSION
ARG MIRROR_URL

# Base system image with specific version of node and npm
FROM ${MIRROR_URL}node:${NODE_VERSION} AS node-npm
ARG NPM_VERSION
RUN npm config set audit=false fund=false loglevel=error omit=dev update-notifier=false
RUN npm i -g npm@${NPM_VERSION}

# Built application image
FROM node-npm AS app-build
# `prisma generate` ne se connecte pas à la base : une URL factice suffit au build
# et évite de graver le vrai mot de passe DB dans les layers de l'image.
# La vraie DATABASE_URL est fournie au runtime (voir `environment` dans compose.yaml).
ENV DATABASE_URL="postgresql://user:password@localhost:5432/db?schema=public"

WORKDIR /usr/src/app

COPY ../package.json package-lock.json .npmrc ./
RUN npm ci --prefer-offline --include=dev --ignore-scripts --loglevel verbose

COPY ../.swcrc tsconfig.json prisma.config.ts ./
COPY ../src ./src
COPY ../prisma ./prisma

RUN npx prisma generate
RUN cp prisma/seed.ts src/seed.ts && cp -r prisma/seed src/seed
RUN npm run build
RUN npm prune --omit=dev --ignore-scripts

# Application image with dist
FROM ${MIRROR_URL}node:${NODE_VERSION}-slim AS app
RUN apt-get update -qq && apt-get install -y --no-install-recommends libssl-dev dumb-init

WORKDIR /usr/src/app

COPY --chown=node:node ../package.json package-lock.json ./
COPY --chown=node:node --from=app-build /usr/src/app/node_modules/ ./node_modules
COPY --chown=node:node --from=app-build /usr/src/app/lib ./lib
COPY --chown=node:node --from=app-build /usr/src/app/prisma ./prisma
COPY --chown=node:node ../prisma.config.ts ./

ENV NODE_ENV production
EXPOSE 3000

# Ne pas tourner en root : les fichiers de l'app sont déjà en node:node (--chown).
USER node

CMD ["dumb-init", "npm", "run", "start:migrate:production"]
