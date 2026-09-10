#!/usr/bin/env bash
#
# Restaure un dump Postgres (ex. une sauvegarde recuperee depuis Dokploy) dans le
# conteneur Postgres local du projet.
#
# Usage :
#   deploy/scripts/restore-db-dump.sh <fichier-dump> [--yes]
#
# Le fichier peut etre gzippe ou non, au format custom (pg_dump -Fc) ou en SQL
# brut : le script detecte les deux. Attention, les sauvegardes produites par
# postgres-backup-local portent l'extension `.sql.gz` alors qu'elles sont en
# realite au format custom.
#
# Variables d'environnement :
#   CONTAINER        conteneur Postgres cible          (defaut: medisync-postgres)
#   DB_NAME          base a recreer                    (defaut: medisync)
#   DB_USER          role Postgres                     (defaut: postgres)
#   PG_CLIENT_IMAGE  image fournissant pg_restore/psql (defaut: postgres:16-alpine)
#
set -euo pipefail

CONTAINER="${CONTAINER:-medisync-postgres}"
DB_NAME="${DB_NAME:-medisync}"
DB_USER="${DB_USER:-postgres}"
PG_CLIENT_IMAGE="${PG_CLIENT_IMAGE:-postgres:16-alpine}"

die() { printf '\033[31merreur :\033[0m %s\n' "$*" >&2; exit 1; }
info() { printf '\033[36m==>\033[0m %s\n' "$*"; }

# --- Arguments ---------------------------------------------------------------

DUMP_FILE=""
ASSUME_YES=0
for arg in "$@"; do
  case "$arg" in
    --yes|-y) ASSUME_YES=1 ;;
    -h|--help) sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*) die "option inconnue : $arg" ;;
    *) [ -n "$DUMP_FILE" ] && die "un seul fichier attendu"; DUMP_FILE="$arg" ;;
  esac
done

[ -n "$DUMP_FILE" ] || die "usage : $0 <fichier-dump> [--yes]"
[ -f "$DUMP_FILE" ] || die "fichier introuvable : $DUMP_FILE"

# --- Garde-fou : cible locale uniquement -------------------------------------
#
# Ce script DETRUIT la base cible. On refuse de parler a un daemon Docker distant
# pour qu'une variable d'environnement mal placee ne puisse pas rediriger le drop
# vers un serveur.
if [ -n "${DOCKER_HOST:-}" ] && [[ "$DOCKER_HOST" != unix://* ]]; then
  die "DOCKER_HOST pointe vers un daemon distant ($DOCKER_HOST) ; ce script est reserve au local."
fi
if [ -n "${DOCKER_CONTEXT:-}" ] && [ "$DOCKER_CONTEXT" != "default" ] && [ "$DOCKER_CONTEXT" != "colima" ]; then
  die "contexte Docker « $DOCKER_CONTEXT » non local ; annulation."
fi

docker inspect "$CONTAINER" >/dev/null 2>&1 \
  || die "conteneur « $CONTAINER » introuvable. Demarre-le : (cd deploy && docker compose --profile db up -d)"
[ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER")" = "true" ] \
  || die "le conteneur « $CONTAINER » est arrete."

# --- Preparation du dump -----------------------------------------------------

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

if [ "$(head -c 2 "$DUMP_FILE" | od -An -tx1 | tr -d ' \n')" = "1f8b" ]; then
  info "Decompression de $(basename "$DUMP_FILE")"
  gzip -dc "$DUMP_FILE" > "$WORK_DIR/dump"
else
  cp "$DUMP_FILE" "$WORK_DIR/dump"
fi

# `pg_dump -Fc` prefixe son archive par la signature « PGDMP ».
if [ "$(head -c 5 "$WORK_DIR/dump")" = "PGDMP" ]; then
  DUMP_FORMAT="custom"
else
  DUMP_FORMAT="plain"
fi
info "Format detecte : $DUMP_FORMAT ($(du -h "$WORK_DIR/dump" | cut -f1) decompresse)"

# --- Confirmation ------------------------------------------------------------

if [ "$ASSUME_YES" -ne 1 ]; then
  printf '\033[33mLa base « %s » du conteneur « %s » va etre SUPPRIMEE et remplacee.\033[0m\n' "$DB_NAME" "$CONTAINER"
  read -r -p 'Continuer ? [y/N] ' reply
  [[ "$reply" =~ ^[yY]$ ]] || die "annule."
fi

# --- Recreation de la base ---------------------------------------------------

PGPASSWORD_VALUE="$(docker exec "$CONTAINER" printenv POSTGRES_PASSWORD 2>/dev/null || true)"

psql_admin() {
  docker exec -i -e PGPASSWORD="$PGPASSWORD_VALUE" "$CONTAINER" \
    psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d postgres "$@"
}

info "Fermeture des connexions a « $DB_NAME »"
psql_admin -q -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid();" >/dev/null

info "Recreation de la base « $DB_NAME »"
# On recree la base nous-memes plutot que d'utiliser `pg_restore -C` : l'archive
# porte un `CREATE DATABASE ... LOCALE 'en_US.utf8'` que les images Alpine (musl)
# ne savent pas honorer. Sans -C, pg_restore ignore cette entree.
psql_admin -q -c "DROP DATABASE IF EXISTS \"$DB_NAME\";"
psql_admin -q -c "CREATE DATABASE \"$DB_NAME\" OWNER \"$DB_USER\";"

# --- Restauration ------------------------------------------------------------
#
# pg_restore/psql tournent depuis une image client dediee, attachee au namespace
# reseau du conteneur cible : le client est alors au moins aussi recent que le
# serveur qui a produit l'archive, meme si le Postgres local est en retard d'un
# patch. Aucun client Postgres n'est requis sur la machine hote.
#
# Le dump est pousse sur stdin plutot que monte en volume : les repertoires
# temporaires de macOS ne sont pas toujours partages avec la VM Docker.
run_client() {
  docker run --rm -i \
    --network "container:$CONTAINER" \
    -e PGPASSWORD="$PGPASSWORD_VALUE" \
    "$PG_CLIENT_IMAGE" "$@"
}

info "Restauration en cours"
if [ "$DUMP_FORMAT" = "custom" ]; then
  run_client pg_restore -h 127.0.0.1 -p 5432 -U "$DB_USER" -d "$DB_NAME" \
    --no-owner --no-privileges --exit-on-error < "$WORK_DIR/dump"
else
  run_client psql -h 127.0.0.1 -p 5432 -U "$DB_USER" -d "$DB_NAME" \
    -v ON_ERROR_STOP=1 -q -f - < "$WORK_DIR/dump"
fi

# --- Recapitulatif -----------------------------------------------------------

info "Contenu restaure :"
docker exec -e PGPASSWORD="$PGPASSWORD_VALUE" "$CONTAINER" \
  psql -U "$DB_USER" -d "$DB_NAME" -P pager=off -c "
    SELECT relname AS \"table\",
           (xpath('/row/c/text()',
                  query_to_xml(format('SELECT count(*) AS c FROM public.%I', relname),
                               false, true, '')))[1]::text::bigint AS lignes
      FROM pg_stat_user_tables
     ORDER BY 2 DESC, 1;"

printf '\033[32mTermine.\033[0m La base « %s » contient desormais les donnees de %s\n' \
  "$DB_NAME" "$(basename "$DUMP_FILE")"
