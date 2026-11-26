#!/usr/bin/env bash
set -euo pipefail
: "${POCKET_CI_PG_CONTAINER:?Missing disposable GitHub Postgres container id}"
files='pocket-browser-test/stage16-auth'
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

as_admin() { docker exec -i "$POCKET_CI_PG_CONTAINER" psql -X -U pocket_ci -d pocket_ci -v ON_ERROR_STOP=1 -Atq; }
login_as() {
  local who="$1" sql="$2" password
  case "$who" in
    alice) password='stage16_alice_TEST_ONLY_do_not_reuse';;
    bob) password='stage16_bob_TEST_ONLY_do_not_reuse';;
    outsider) password='stage16_outsider_TEST_ONLY_do_not_reuse';;
    *) echo 'Unknown test role' >&2; return 2;;
  esac
  docker exec -e "PGPASSWORD=$password" "$POCKET_CI_PG_CONTAINER" \
    psql -X -h 127.0.0.1 -U "pocket_stage16_$who" -d pocket_ci \
      -v ON_ERROR_STOP=1 -Atqc "$sql"
}
assert_pass() {
  local result="$1" expected="$2" label="$3"
  if [[ "$result" != "$expected" ]]; then
    printf 'FAIL %s expected=<%s> actual=<%s>\n' "$label" "$expected" "$result" >&2
    exit 1
  fi
  echo "PASS: $label"
}
assert_denied() {
  local who="$1" sql="$2" why="$3" pattern="$4"
  if login_as "$who" "$sql" >"$tmp/deny.out" 2>"$tmp/deny.err"; then
    echo "FAIL: denied operation succeeded: $why" >&2; exit 1
  fi
  if ! grep -Eiq "$pattern" "$tmp/deny.err"; then
    echo "FAIL: wrong denial for $why" >&2
    cat "$tmp/deny.err" >&2
    exit 1
  fi
  echo "PASS: denied $why"
}

as_admin < "$files/schema.sql"

assert_pass "$(login_as alice 'SELECT pocket_stage16_test_only.status_mine('\''same-request-001'\'');')" 'SIGNED_RECORDED' 'Alice starts with owned signed fixture'
assert_pass "$(login_as bob 'SELECT pocket_stage16_test_only.status_mine('\''same-request-001'\'');')" 'SIGNED_RECORDED' 'Bob starts with same request key in own namespace'
assert_pass "$(login_as alice 'SELECT pocket_stage16_test_only.status_mine('\''bob-private-001'\'');')" 'NOT_FOUND' 'Alice cannot read Bob-only request'
assert_pass "$(login_as bob 'SELECT pocket_stage16_test_only.status_mine('\''alice-private-001'\'');')" 'NOT_FOUND' 'Bob cannot read Alice-only request'
assert_denied outsider "SELECT pocket_stage16_test_only.claim_once('same-request-001');" 'unbound outsider function execute' 'permission denied'
assert_denied alice "UPDATE pocket_stage16_test_only.intents SET state='CLAIMED_UNKNOWN' WHERE request_key='same-request-001';" 'Alice direct table update' 'permission denied'
assert_denied bob "SELECT * FROM pocket_stage16_test_only.owner_bindings;" 'Bob direct identity mapping read' 'permission denied'
assert_denied bob 'SET ROLE pocket_stage16_alice;' 'Bob role escalation' 'permission denied'
assert_denied bob 'SET SESSION AUTHORIZATION pocket_stage16_alice;' 'Bob session escalation' 'permission denied'
assert_denied alice "SELECT pocket_stage16_test_only.claim_once('owner-bob','same-request-001');" 'caller-supplied owner argument' 'does not exist'
assert_denied alice "SELECT pocket_stage16_test_only.claim_once('bad request with spaces');" 'malformed request' 'INVALID_REQUEST'

# Deliberate attempt to spoof a client-side session variable cannot affect SESSION_USER mapping.
assert_pass "$(login_as alice "SELECT set_config('pocket.claimed_owner','owner-bob',false); SELECT pocket_stage16_test_only.status_mine('bob-private-001');" | tail -1)" 'NOT_FOUND' 'Client-set owner variable has no effect'

# Separate authenticated database logins, shared row within Alice. Exactly ONE DB claim.
pids=()
for i in $(seq 1 12); do
  (login_as alice "SELECT pocket_stage16_test_only.claim_once('same-request-001');" >"$tmp/$i.out" 2>"$tmp/$i.err") &
  pids+=("$!")
done
for pid in "${pids[@]}"; do wait "$pid" || true; done
wins=0;denied=0
for i in $(seq 1 12); do
  if grep -qx 'CLAIMED_UNKNOWN' "$tmp/$i.out"; then wins=$((wins+1));
  elif grep -q 'DO_NOT_RETRY' "$tmp/$i.err"; then denied=$((denied+1));
  else echo "FAIL: unexpected concurrent result $i" >&2; cat "$tmp/$i.out" "$tmp/$i.err" >&2; exit 1; fi
done
[[ "$wins" -eq 1 && "$denied" -eq 11 ]] || { echo "FAIL: winners=$wins denied=$denied" >&2; exit 1; }
echo 'PASS: 12 separate Alice PostgreSQL login sessions, 1 claim + 11 refused'
assert_denied alice "SELECT pocket_stage16_test_only.claim_once('same-request-001');" 'new session after claim refuses resend' 'DO_NOT_RETRY'
assert_pass "$(login_as alice "SELECT pocket_stage16_test_only.status_mine('same-request-001');")" 'CLAIMED_UNKNOWN' 'Alice evidence persists after reconnect'

assert_pass "$(login_as bob "SELECT pocket_stage16_test_only.claim_once('same-request-001');")" 'CLAIMED_UNKNOWN' 'Bob claim independent for same request key'
assert_pass "$(login_as bob 'SELECT pocket_stage16_test_only.stop_mine();')" 'STOPPED' 'Bob STOP succeeds'
assert_denied bob "SELECT pocket_stage16_test_only.claim_once('stop-request-001');" 'Bob STOP blocks new claims' 'STOP_ACTIVE'
assert_pass "$(login_as bob "SELECT pocket_stage16_test_only.status_mine('same-request-001');")" 'CLAIMED_UNKNOWN' 'Bob STOP preserves already-claimed evidence'
assert_pass "$(login_as bob "SELECT pocket_stage16_test_only.status_mine('stop-request-001');")" 'CANCELLED' 'Bob STOP cancels unclaimed test intent'
assert_pass "$(login_as alice "SELECT pocket_stage16_test_only.claim_once('stop-request-001');")" 'CLAIMED_UNKNOWN' 'Bob STOP cannot stop Alice'
assert_pass "$(login_as alice "SELECT pocket_stage16_test_only.status_mine('alice-private-001');")" 'SIGNED_RECORDED' 'Alice has independent other intent'

final_state="$(as_admin <<'SQL'
SELECT COUNT(*)::text || ':' || SUM(claims)::text FROM pocket_stage16_test_only.intents;
SQL
)"
assert_pass "$final_state" '6:3' 'DB evidence has six synthetic intents and three unique claims'
echo 'Stage 16 PostgreSQL role-bound, race, STOP and privilege tests PASS'
