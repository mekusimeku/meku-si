#!/usr/bin/env bash
set -euo pipefail
: "${POCKET_CI_PG_CONTAINER:?GitHub Actions PostgreSQL service ID required}"
path='pocket-browser-test/stage15-postgres'
psql_in() { docker exec -i "$POCKET_CI_PG_CONTAINER" psql -X -U pocket_ci -d pocket_ci -v ON_ERROR_STOP=1 -q; }
psql_in < "$path/schema.sql"
psql_in < "$path/smoke-and-setup.sql"
temp_dir="$(mktemp -d)"
trap 'rm -rf "$temp_dir"' EXIT
pids=()
# Each Docker exec starts a distinct PostgreSQL client connection.
for i in $(seq 1 12); do
 (docker exec "$POCKET_CI_PG_CONTAINER" psql -X -U pocket_ci -d pocket_ci -v ON_ERROR_STOP=1 -Atqc \
  "SELECT pocket_stage15_test_only.claim_once('race-owner-01','race-request-01');" \
   > "$temp_dir/$i.out" 2> "$temp_dir/$i.err") &
 pids+=("$!")
done
for pid in "${pids[@]}"; do wait "$pid" || true; done
wins=0; denied=0
for i in $(seq 1 12); do
 if grep -qx 'CLAIMED_UNKNOWN' "$temp_dir/$i.out"; then
  wins=$((wins+1))
 elif grep -q 'DO_NOT_RETRY' "$temp_dir/$i.err"; then
  denied=$((denied+1))
 else
  echo "Unexpected result from process $i" >&2
  cat "$temp_dir/$i.out" "$temp_dir/$i.err" >&2
  exit 1
 fi
done
[[ "$wins" -eq 1 && "$denied" -eq 11 ]] || { echo "Race failure: $wins wins, $denied denied"; exit 1; }
echo "PASS: 12 PostgreSQL clients, 1 claim, 11 refused"
# Simulate worker restart and retry through an entirely new DB connection.
if docker exec "$POCKET_CI_PG_CONTAINER" psql -X -U pocket_ci -d pocket_ci -v ON_ERROR_STOP=1 -Atqc \
 "SELECT pocket_stage15_test_only.claim_once('race-owner-01','race-request-01');" \
 > "$temp_dir/retry.out" 2> "$temp_dir/retry.err"; then
 echo 'FAIL: retry unexpectedly succeeded' >&2; exit 1
fi
grep -q DO_NOT_RETRY "$temp_dir/retry.err"
# Race STOP against a separate claim process: STOP may run before or after the
# one claim; after STOP commits, every new claim must be denied.
(docker exec "$POCKET_CI_PG_CONTAINER" psql -X -U pocket_ci -d pocket_ci -v ON_ERROR_STOP=1 -Atqc \
  "SELECT pocket_stage15_test_only.stop_owner('stop-race-owner');" \
  > "$temp_dir/stop.out" 2> "$temp_dir/stop.err") &
stop_pid=$!
(docker exec "$POCKET_CI_PG_CONTAINER" psql -X -U pocket_ci -d pocket_ci -v ON_ERROR_STOP=1 -Atqc \
  "SELECT pocket_stage15_test_only.claim_once('stop-race-owner','stop-race-request');" \
  > "$temp_dir/stop-claim.out" 2> "$temp_dir/stop-claim.err") &
claim_pid=$!
wait "$stop_pid"
wait "$claim_pid" || true
grep -qx STOPPED "$temp_dir/stop.out"
if docker exec "$POCKET_CI_PG_CONTAINER" psql -X -U pocket_ci -d pocket_ci -v ON_ERROR_STOP=1 -Atqc \
 "SELECT pocket_stage15_test_only.claim_once('stop-race-owner','stop-race-request');" \
 > "$temp_dir/after-stop.out" 2> "$temp_dir/after-stop.err"; then
 echo 'FAIL: claim succeeded after STOP' >&2; exit 1
fi
grep -q STOP_ACTIVE "$temp_dir/after-stop.err"
docker exec "$POCKET_CI_PG_CONTAINER" psql -X -U pocket_ci -d pocket_ci -Atqc \
 "SELECT state || ':' || claims FROM pocket_stage15_test_only.intents WHERE owner_key='race-owner-01' AND request_key='race-request-01';" | grep -qx 'CLAIMED_UNKNOWN:1'
echo 'PASS: restart refusal, owner STOP, evidence preserved'
