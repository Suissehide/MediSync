# MediSync

MediSync est une application moderne de gestion des rendez-vous et du suivi des patients, spécialement conçue pour les 
infirmières libérales. Elle permet une organisation fluide, une gestion optimisée des consultations et un suivi
efficace des patients.

## Fonctionnalités

- Agenda intelligent : Planification et gestion des rendez-vous avec rappels automatiques.
- Dossier patient : Stockage sécurisé des informations médicales essentielles.
- Notifications : Alertes pour les consultations à venir.
- Gestion administrative : Notes, facturation et suivi.

## Prérequis

Avoir installé au préalable :

- [Volta](https://docs.volta.sh/guide/getting-started) : pour installer et utiliser de manière transparente les bonnes versions de
  NodeJS et NPM.
- [Docker](https://docs.volta.sh/guide/getting-started) : pour avoir accès aux bases de données Postgres, ainsi que l'application containerisé
    - Sur Windows : Passer par la [WSL 2](https://learn.microsoft.com/fr-fr/windows/wsl/install#install-wsl-command) pour installer Docker comme si vous étiez sur Linux
    - Sur Linux (Ex: Ubuntu) : Installez en passant par le [repository APT](https://docs.docker.com/engine/install/ubuntu/#installation-methods).
    - Sur MacOS : Installez en utilisant Brew puis installez aussi "colima" de la même manière `brew install docker colima`
        - Pour que les tests fonctionnent en local, il faudra aussi exporter ces deux variables d'environnement à votre fichier de config ".zshrc" :
            - export DOCKER_HOST="unix://${HOME}/.colima/default/docker.sock"
            - export TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE="/var/run/docker.sock"

## Usage

La majorité des interactions avec le backend passent par les scripts NPM.

Pour découvrir la liste des scripts NPM, exécuter `npm run`.

### Démarrage rapide

- Les fichiers `.env` ne sont pas versionnés : créez les vôtres à partir des exemples, puis ajustez-les à votre
  machine (le port Postgres publié, par exemple, s'il est déjà pris) :
  ```shell
  cp back/.env.example back/.env
  cp front/.env.example front/.env
  cp deploy/.env.example deploy/.env
  ```
- Avant le premier lancement, créez le réseau Docker externe requis : `docker network create proxy`
- Pour démarrer les bases de données nécessaires au projet, allez dans le dossier deploy `cd deploy` et exécuter `docker compose --profile db up -d`
- Pour démarrer le backend, exécuter `npm start`.
- Pour démarrer le backend en mode développement avec watch, exécuter `npm run dev` :
  ```shell
  ✅ Ran 4 scripts and skipped 0 in 18s.
  INFO (50907): IoC container initialized.
  INFO (50907): Registering plugins
  INFO (50907): All plugins registered
  INFO (50907): Starting a postgresql pool with 21 connections.
  INFO (50907): Server is listening
  INFO (50907): Server is ready: visit http://127.0.0.1:3000/
  ```
- Pour démarrer le backend en mode développement, exécuter `npm run start:development`.
- Pour démarrer le backend en mode production, exécuter `npm run start:production` (prérequis : avoir construit le
  projet).

### Récupérer la base d'un environnement déployé

Le service `postgres-backup` de la stack produit un `pg_dump` quotidien, téléchargeable depuis l'interface Dokploy.
Pour rejouer une de ces sauvegardes en local :

```shell
deploy/scripts/restore-db-dump.sh ~/Downloads/2026-09-09T22:00:00.057Z.sql.gz
```

Le script recrée la base du conteneur `medisync-postgres` et y restaure le dump. **L'opération est destructive** : la
base de développement locale est supprimée, d'où la confirmation demandée (contournable avec `--yes`).

Quelques points à connaître :

- Malgré leur extension `.sql.gz`, ces sauvegardes sont au **format custom** (`pg_dump -Fc`), pas du SQL brut : `psql`
  ne sait pas les lire, il faut `pg_restore`. Le script détecte le format et la compression tout seul.
- Aucun client Postgres n'est requis sur votre machine : `pg_restore` est exécuté depuis un conteneur jetable attaché
  au réseau du conteneur cible, ce qui évite au passage qu'un client plus ancien que le serveur d'origine refuse
  l'archive.
- Le dump embarque un `CREATE DATABASE … LOCALE 'en_US.utf8'` inapplicable sur les images Alpine ; le script crée donc
  la base lui-même et restaure sans `-C`.
- Pensez à vérifier ensuite que le schéma correspond à votre branche : `cd back && npx prisma migrate status`.
- Ces sauvegardes contiennent des données patients réelles. Elles n'ont rien à faire dans le dépôt ni sur un service
  tiers.

Variables d'environnement disponibles pour cibler une autre base : `CONTAINER`, `DB_NAME`, `DB_USER`,
`PG_CLIENT_IMAGE`.
