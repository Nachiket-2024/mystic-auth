#!/bin/bash
# Runs on the postgres service's first initialization only (the official image
# executes every script in /docker-entrypoint-initdb.d/ once, against an empty
# data directory, never again).
#
# Creates a second database on the same Postgres server, owned by
# $POSTGRES_USER, for the optional self-hosted Bugsink error-monitoring service
# (see docs/mystic_auth/error-monitoring/overview.md).
#
# If you're enabling Bugsink against an ALREADY-INITIALIZED postgres_data
# volume (this script won't retroactively run), create the database
# manually instead:
#   docker compose exec postgres psql -U $POSTGRES_USER -d $POSTGRES_DB \
#     -c "CREATE DATABASE bugsink;"
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE DATABASE bugsink OWNER "$POSTGRES_USER";
EOSQL
