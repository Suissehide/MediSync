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

COPY package.json package-lock.json ./
RUN npm ci --prefer-offline --ignore-scripts

COPY . .
RUN npm run build

# Runtime image
FROM nginx:alpine

# Supprime la config par défaut
RUN rm /etc/nginx/conf.d/default.conf

# Ajoute la config SPA
COPY build/conf/nginx.conf /etc/nginx/conf.d/default.conf

# Copie le build React
COPY --from=app-build /usr/src/app/dist /usr/share/nginx/html

EXPOSE 80