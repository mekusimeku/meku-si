#!/usr/bin/env bash
set -euo pipefail
: "${POCKET_CI_PG_CONTAINER:?Missing disposable PostgreSQL CI service id}"
repo='pocket-browser-test/stage17-auth-gateway'
docker exec -i "${POCKET_CI_PG_CONTAINER}" psql -X -U pocket_ci -d pocket_ci -v ON_ERROR_STOP=1 -Atq < "$repo/schema.sql"
node --test "$repo/test-auth.mjs"
node --test "$repo/postgres-integration.mjs"
echo 'STAGE17 PASS: fixture identity -> server owner mapping -> PostgreSQL claim / STOP. TEST ONLY'
