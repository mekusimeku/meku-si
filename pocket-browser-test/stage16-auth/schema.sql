-- MEKU Pocket Stage 16 — TEST ONLY ROLE-BOUND JOURNAL, not a production migration.
-- No wallet keys, SOL, token transfers, external services, real authentication or signing.
-- Tested in fresh throwaway PostgreSQL CI database; roles/passwords below are disposable fixtures.
BEGIN;
CREATE SCHEMA pocket_stage16_test_only;
REVOKE ALL ON SCHEMA pocket_stage16_test_only FROM PUBLIC;
CREATE ROLE pocket_stage16_executor NOLOGIN;
CREATE ROLE pocket_stage16_alice LOGIN PASSWORD 'stage16_alice_TEST_ONLY_do_not_reuse';
CREATE ROLE pocket_stage16_bob LOGIN PASSWORD 'stage16_bob_TEST_ONLY_do_not_reuse';
CREATE ROLE pocket_stage16_outsider LOGIN PASSWORD 'stage16_outsider_TEST_ONLY_do_not_reuse';

CREATE TABLE pocket_stage16_test_only.owner_bindings (
  login_name name PRIMARY KEY,
  owner_key text NOT NULL UNIQUE CHECK (owner_key ~ '^[a-z0-9_-]{4,80}$')
);
CREATE TABLE pocket_stage16_test_only.owner_controls (
  owner_key text PRIMARY KEY REFERENCES pocket_stage16_test_only.owner_bindings(owner_key),
  stopped boolean NOT NULL DEFAULT false
);
CREATE TABLE pocket_stage16_test_only.intents (
  owner_key text NOT NULL REFERENCES pocket_stage16_test_only.owner_controls(owner_key),
  request_key text NOT NULL CHECK (request_key ~ '^[A-Za-z0-9_-]{12,100}$'),
  intent_sha256 text NOT NULL CHECK (intent_sha256 ~ '^[0-9a-f]{64}$'),
  tx_sha256 text NOT NULL CHECK (tx_sha256 ~ '^[0-9a-f]{64}$'),
  state text NOT NULL CHECK (state IN ('SIGNED_RECORDED','CLAIMED_UNKNOWN','REVIEW_REQUIRED','CANCELLED')),
  claims smallint NOT NULL DEFAULT 0 CHECK (claims IN (0,1)),
  PRIMARY KEY (owner_key, request_key),
  CHECK ((claims = 0 AND state IN ('SIGNED_RECORDED','CANCELLED')) OR (claims = 1 AND state IN ('CLAIMED_UNKNOWN','REVIEW_REQUIRED')))
);

-- Deliberately do not accept an owner_key argument. SESSION_USER refers to the
-- original authenticated *database* login, even in SECURITY DEFINER context.
-- Application-level authentication is NOT demonstrated by this arrangement.
CREATE FUNCTION pocket_stage16_test_only.claim_once(p_request text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  bound_owner text;
  is_stopped boolean;
  changed text;
BEGIN
  IF p_request IS NULL OR p_request !~ '^[A-Za-z0-9_-]{12,100}$' THEN
    RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE = 'P0001';
  END IF;
  SELECT owner_key INTO bound_owner
    FROM pocket_stage16_test_only.owner_bindings
    WHERE login_name = SESSION_USER;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_BOUND' USING ERRCODE = 'P0001'; END IF;
  SELECT stopped INTO is_stopped
    FROM pocket_stage16_test_only.owner_controls
    WHERE owner_key = bound_owner FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CONTROL_MISSING' USING ERRCODE = 'P0001'; END IF;
  IF is_stopped THEN RAISE EXCEPTION 'STOP_ACTIVE' USING ERRCODE = 'P0001'; END IF;
  UPDATE pocket_stage16_test_only.intents SET claims = 1, state = 'CLAIMED_UNKNOWN'
    WHERE owner_key = bound_owner AND request_key = p_request
      AND claims = 0 AND state = 'SIGNED_RECORDED'
    RETURNING request_key INTO changed;
  IF NOT FOUND THEN RAISE EXCEPTION 'DO_NOT_RETRY' USING ERRCODE = 'P0001'; END IF;
  RETURN 'CLAIMED_UNKNOWN';
END;
$$;

CREATE FUNCTION pocket_stage16_test_only.stop_mine()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE bound_owner text;
BEGIN
  SELECT owner_key INTO bound_owner
    FROM pocket_stage16_test_only.owner_bindings
    WHERE login_name = SESSION_USER;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_BOUND' USING ERRCODE = 'P0001'; END IF;
  UPDATE pocket_stage16_test_only.owner_controls SET stopped = true WHERE owner_key = bound_owner;
  IF NOT FOUND THEN RAISE EXCEPTION 'CONTROL_MISSING' USING ERRCODE = 'P0001'; END IF;
  UPDATE pocket_stage16_test_only.intents SET state = 'CANCELLED'
    WHERE owner_key = bound_owner AND claims = 0 AND state = 'SIGNED_RECORDED';
  RETURN 'STOPPED';
END;
$$;

CREATE FUNCTION pocket_stage16_test_only.status_mine(p_request text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE bound_owner text; status text;
BEGIN
  SELECT owner_key INTO bound_owner FROM pocket_stage16_test_only.owner_bindings WHERE login_name = SESSION_USER;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_BOUND' USING ERRCODE = 'P0001'; END IF;
  SELECT state INTO status FROM pocket_stage16_test_only.intents
    WHERE owner_key = bound_owner AND request_key = p_request;
  RETURN COALESCE(status, 'NOT_FOUND');
END;
$$;

INSERT INTO pocket_stage16_test_only.owner_bindings(login_name, owner_key) VALUES
  ('pocket_stage16_alice', 'owner-alice'),
  ('pocket_stage16_bob', 'owner-bob');
INSERT INTO pocket_stage16_test_only.owner_controls(owner_key) VALUES ('owner-alice'),('owner-bob');
INSERT INTO pocket_stage16_test_only.intents(owner_key,request_key,intent_sha256,tx_sha256,state) VALUES
  ('owner-alice','same-request-001',repeat('a',64),repeat('b',64),'SIGNED_RECORDED'),
  ('owner-bob','same-request-001',repeat('a',64),repeat('c',64),'SIGNED_RECORDED'),
  ('owner-alice','stop-request-001',repeat('d',64),repeat('e',64),'SIGNED_RECORDED'),
  ('owner-bob','stop-request-001',repeat('d',64),repeat('f',64),'SIGNED_RECORDED'),
  ('owner-alice','alice-private-001',repeat('1',64),repeat('2',64),'SIGNED_RECORDED'),
  ('owner-bob','bob-private-001',repeat('3',64),repeat('4',64),'SIGNED_RECORDED');

-- Dedicated NOLOGIN definer, NOT superuser. Application roles receive NO table grants.
GRANT USAGE, CREATE ON SCHEMA pocket_stage16_test_only TO pocket_stage16_executor;
GRANT SELECT ON pocket_stage16_test_only.owner_bindings TO pocket_stage16_executor;
GRANT SELECT, UPDATE ON pocket_stage16_test_only.owner_controls TO pocket_stage16_executor;
GRANT SELECT, UPDATE ON pocket_stage16_test_only.intents TO pocket_stage16_executor;
ALTER FUNCTION pocket_stage16_test_only.claim_once(text) OWNER TO pocket_stage16_executor;
ALTER FUNCTION pocket_stage16_test_only.stop_mine() OWNER TO pocket_stage16_executor;
ALTER FUNCTION pocket_stage16_test_only.status_mine(text) OWNER TO pocket_stage16_executor;
REVOKE ALL ON ALL TABLES IN SCHEMA pocket_stage16_test_only FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA pocket_stage16_test_only FROM PUBLIC;
GRANT USAGE ON SCHEMA pocket_stage16_test_only TO pocket_stage16_alice, pocket_stage16_bob;
GRANT EXECUTE ON FUNCTION pocket_stage16_test_only.claim_once(text) TO pocket_stage16_alice, pocket_stage16_bob;
GRANT EXECUTE ON FUNCTION pocket_stage16_test_only.stop_mine() TO pocket_stage16_alice, pocket_stage16_bob;
GRANT EXECUTE ON FUNCTION pocket_stage16_test_only.status_mine(text) TO pocket_stage16_alice, pocket_stage16_bob;
COMMIT;
