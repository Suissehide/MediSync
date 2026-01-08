ARG NODE_VERSION
ARG MIRROR_URL

# Base system image with specific version of node and npm
FROM ${MIRROR_URL}node:${NODE_VERSION} AS node-npm
ARG NPM_VERSION
RUN npm config set audit=false fund=false loglevel=error omit=dev update-notifier=false
RUN npm i -g npm@${NPM_VERSION}

# Built application image
FROM node-npm AS app-build
WORKDIR /usr/src/app
COPY ../package.json package-lock.json ./
COPY ../deploy/conf/nginx.conf ./
RUN npm ci --prefer-offline --include=dev --ignore-scripts --loglevel verbose
COPY ../tsconfig.json ./
COPY ../src ./src
RUN npm run build
RUN npm prune --omit=dev --ignore-scripts

# Application image with dist
FROM nginx:alpine AS app

WORKDIR /usr/share/nginx/html
COPY --chown=node:node ../package.json package-lock.json ./
COPY --chown=node:node --from=app-build /usr/src/app/node_modules/ ./node_modules

RUN rm /etc/nginx/conf.d/default.conf
COPY --from=app-build /usr/src/app/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=app-build /usr/src/app/dist ./dist

ENV NODE_ENV production
EXPOSE 80