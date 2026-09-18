# MediSync

MediSync est l'outil interne d'un **service de réadaptation** qui anime un programme d'**éducation thérapeutique
du patient (ETP)**. Il sert à construire les parcours du programme (séances collectives et rendez-vous individuels),
à les planifier sur l'année, à suivre la participation des patients inclus et à tenir leur dossier éducatif.

L'application est en français, à usage interne du service : elle manipule des **données de santé réelles**.

## Le domaine en bref

| Terme | Ce que c'est |
| --- | --- |
| **Modèle de parcours** (`PathwayTemplate`) | La trame d'un programme : un nom, une couleur, des tags et la liste des séances qui le composent. |
| **Modèle de créneau** (`SlotTemplate`) | Une séance de la trame, positionnée en jour/heure relatifs au début du parcours (`offsetDays`), collective (avec une capacité) ou individuelle, rattachée à une thématique, un lieu et un ou plusieurs soignants. |
| **Parcours** (`Pathway`) | Une instance datée d'un modèle : le modèle « déroulé » à partir d'une date de début. |
| **Créneau** (`Slot`) | Une séance réelle dans l'agenda, issue d'un modèle de créneau. Peut être verrouillée. |
| **Rendez-vous** (`Appointment`) | Ce qui est posé dans un créneau, avec ses patients (`AppointmentPatient` : présence, motif de refus, accompagnant, transmissions). |
| **Patient** | Identité, contact, contexte social, données d'inclusion ETP (décision ETP, type de programme, orientation, objectif) et de sortie (date, motif d'arrêt, point final du parcours). |
| **Diagnostic éducatif** | Le bilan éducatif partagé, structuré par un modèle qui décide des champs actifs. |
| **Thématique / Soignant / Lieu** | Référentiels utilisés par les créneaux (un soignant est relié aux thématiques qu'il anime). |
| **Semaine interdite** (`ForbiddenWeek`) | Une semaine neutralisée dans la planification (congés, fermeture…). |
| **Cycle de planning** (`PlanningCycle`) | La semaine de départ et le nombre de semaines du cycle de répétition des parcours. |

## Fonctionnalités

- **Dashboard** — calendrier des créneaux, filtrable par soignants et par modèles de parcours, avec prise de
  rendez-vous et ajout de patients directement depuis le calendrier.
- **Agenda** — la journée sous forme de tableau : rendez-vous, patients attendus, présence/absence, accompagnant et
  notes de transmission.
- **Patients** — liste des patients et dossier complet (identité, social, inclusion, sortie), planning individuel,
  diagnostics éducatifs et **export PDF du programme** remis au patient (couverture, calendrier des séances à
  venir, page de conseils, plus des pages optionnelles activables à l'export).
- **Diagnostic éducatif** — formulaire structuré (qualité de vie, connaissances de la maladie, identification des
  facteurs de risque, savoir-faire par facteur — tension artérielle, HbA1c, LDL, adhésion au traitement, alimentation,
  stress, tabac, tour de taille, activité physique — puis objectifs patient/soignants et suivi négocié). Les modèles de
  diagnostic permettent de n'activer que les champs pertinents.
- **Suivi** — vue mensuelle croisant parcours, patients et jours du mois pour lire la participation d'un coup d'œil.
- **Administration** (réservée aux comptes `ADMIN`) — construction du planning des modèles de parcours (calendrier
  annuel, duplication et déplacement en masse de créneaux, régénération des parcours déjà instanciés, export PDF du
  planning), semaines interdites, cycle de semaines, thématiques, soignants, lieux, utilisateurs et rôles, modèles de
  diagnostic, et **journal d'activité** (qui a créé/modifié/supprimé quoi).
- **Tâches** — pense-bête par soignant, accessible depuis la barre de navigation.
- **Comptes** — authentification par JWT dans un cookie `httpOnly`. Un compte fraîchement créé a le rôle `NONE` et
  reste en attente d'approbation par un administrateur (`USER` puis `ADMIN`).

## Architecture

| Dossier | Contenu |
| --- | --- |
| `back/` | API Node/Fastify (TypeScript, architecture en couches avec IoC Awilix, validation Zod, Prisma/PostgreSQL). Voir `back/CLAUDE.md` pour le détail des couches et des scripts. |
| `front/` | SPA React 19 + Vite (TanStack Router/Query/Table/Form, Radix Themes + Tailwind, FullCalendar, `@react-pdf/renderer`). |
| `deploy/` | Stack Docker Compose (PostgreSQL, back, front, sauvegardes) et scripts d'exploitation. |
| `docs/` | Specs et plans d'implémentation des fonctionnalités, par date. |

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

### Démarrer le frontend

```shell
cd front
npm install
npm run dev     # http://localhost:4270
```

Le port 4270 est **strict** (`strictPort` dans `vite.config.ts`) : Vite refuse de démarrer plutôt que de glisser
silencieusement sur le port suivant, ce qui casserait le CORS du back (`CORS_ORIGIN` / `FRONT_URL` dans `back/.env`).
Un seul serveur de dev à la fois, donc : si le port est occupé, arrêtez l'instance précédente.

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
