#!/usr/bin/env python3
"""Independent reference for the MEKU proof-of-work ledger digest (meku.pow/1).

A second implementation, in another language and with only the Python standard library,
of the two things an outside verifier most needs to trust: which comments count as
records, and the rolling SHA-256 digest over them. It deliberately shares no code with
tools/pow/verify.mjs and follows the written rules in docs/proof-of-work/records.md.
If both print the same digest for a bundle, the rules are implemented consistently.
It does not perform verify.mjs's other checks.

Usage: python3 -I tools/pow/digest_reference.py <bundle.json> [--expect-operator mekusimeku]
"""
import hashlib
import json
import re
import sys
from datetime import datetime

PROTOCOL = "meku.pow/1"
FENCE = re.compile(r"```json[^\n]*\n(.*?)```", re.S)
HTML_COMMENT = re.compile(r"<!--.*?(?:-->|\Z)", re.S)
MAX_SAFE = 2**53 - 1


def reject_float(text):
    raise ValueError("records may not contain fractional or exponent numbers")


def bounded_int(text):
    value = int(text)
    if abs(value) > MAX_SAFE:
        raise ValueError("integer outside the safe range")
    return value


def parse(text):
    return json.loads(text, parse_float=reject_float, parse_int=bounded_int, parse_constant=reject_float)


def jcs(value):
    """RFC 8785 for null, booleans, integers, strings, arrays and objects (no floats)."""
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)


def sha256_hex(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def visible(body):
    """What a reader sees as the poster's own words: no HTML comments, no quoted lines."""
    text = HTML_COMMENT.sub("", body.replace("\r\n", "\n").replace("\r", "\n"))
    return "\n".join(line for line in text.split("\n") if not re.match(r"^[ \t]*>", line))


def is_record(value):
    return isinstance(value, dict) and value.get("pow") == PROTOCOL


def records_in(body):
    """(records, malformed): fenced json blocks; with no fence at all, one bare record
    that starts the comment ("{" first) and ends at its last "}"."""
    text = visible(body)
    found, malformed = [], False
    for block in FENCE.findall(text):
        try:
            parsed = parse(block)
        except ValueError:
            malformed = malformed or PROTOCOL in block
            continue
        if is_record(parsed):
            found.append(parsed)
    trimmed = text.strip()
    if found or "```" in text or not trimmed.startswith("{") or PROTOCOL not in trimmed:
        return found, malformed
    try:
        parsed = parse(trimmed[: trimmed.rfind("}") + 1])
    except ValueError:
        return found, True
    if is_record(parsed):
        found.append(parsed)
    return found, malformed


def when(comment):
    return datetime.fromisoformat(comment["created_at"].replace("Z", "+00:00"))


def same(a, b):
    return isinstance(a, str) and isinstance(b, str) and a.lower() == b.lower()


def main(path, expect_operator):
    with open(path, encoding="utf-8") as handle:
        bundle = json.load(handle)
    comments = sorted(bundle["comments"], key=lambda c: (when(c), str(c["id"])))
    entries = []
    for c in comments:
        found, malformed = records_in(c["body"])
        entries.append((c, found, malformed))
    openings = [(c, r) for c, found, _ in entries for r in found if r.get("type") == "pilot_opened" and r.get("seq") == 0]
    preferred = [e for e in openings if same(e[0]["author"], expect_operator) and same((e[1].get("roster") or {}).get("operator"), expect_operator)]
    synthetic = [e for e in openings if str(e[1].get("pilot_id", "")).startswith("POW-SYNTHETIC-")]
    opening_comment, opening = (preferred or synthetic or openings)[0]
    roster = opening.get("roster") or {}
    operator, developer = roster.get("operator"), roster.get("developer")
    human = next((r.get("human") for c, found, _ in entries for r in found if r.get("type") == "task_offered" and same(c["author"], operator)), None)
    members = [m for m in (operator, developer, human) if isinstance(m, str)]
    chain = []
    for c, found, malformed in entries:
        if not any(same(c["author"], m) for m in members) or malformed or len(found) != 1:
            continue
        record = found[0]
        if record.get("type") == "independent_verification":
            continue
        if record.get("type") == "pilot_opened" and c is not opening_comment:
            continue
        if chain and same(chain[-1][0]["author"], c["author"]) and jcs(chain[-1][1]) == jcs(record):
            continue  # an exact double post adds nothing
        chain.append((c, record))
    for index, (_, record) in enumerate(chain):
        if record.get("seq") != index:
            raise SystemExit(f"seq {record.get('seq')} found where {index} was expected; run verify.mjs for details")
    digest = sha256_hex(f"{PROTOCOL}|{opening['pilot_id']}")
    for _, record in chain:
        digest = sha256_hex(f"{digest}|{sha256_hex(jcs(record))}")
    print(f"{digest} (through seq {len(chain) - 1}; {len(chain)} records)")


if __name__ == "__main__":
    args = sys.argv[1:]
    operator = "mekusimeku"
    if "--expect-operator" in args:
        i = args.index("--expect-operator")
        operator = args[i + 1]
        del args[i : i + 2]
    if len(args) != 1:
        raise SystemExit(__doc__)
    main(args[0], operator)
