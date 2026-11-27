#!/usr/bin/env python3
"""Independent reference for the MEKU proof-of-work ledger digest (meku.pow/1).

A second implementation, in another language and with only the Python standard library,
of the two things an outside verifier most needs to trust: which comments count as
records, and the rolling SHA-256 digest over them. It deliberately shares no code with
tools/pow/verify.mjs. If both print the same digest for a bundle, the hashing rules are
implemented consistently. It does not perform verify.mjs's other checks.

Usage: python3 tools/pow/digest_reference.py <bundle.json>
"""
import hashlib
import json
import re
import sys

PROTOCOL = "meku.pow/1"
BLOCK = re.compile(r"```json[^\n]*\n(.*?)```", re.S)


def jcs(value):
    """RFC 8785 for null, booleans, integers, strings, arrays and objects (no floats)."""
    if isinstance(value, float):
        raise ValueError("floats are not allowed in records")
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def sha256_hex(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def is_record(value):
    return isinstance(value, dict) and value.get("pow") == PROTOCOL


def records_in(body):
    """Fenced json blocks; with no fences at all, one bare JSON object from the first { to the last }."""
    text = body.replace("\r\n", "\n")
    found = []
    for block in BLOCK.findall(text):
        try:
            parsed = json.loads(block)
        except ValueError:
            continue
        if is_record(parsed):
            found.append(parsed)
    if found or "```" in text or PROTOCOL not in text:
        return found
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end > start:
        try:
            parsed = json.loads(text[start : end + 1])
        except ValueError:
            return found
        if is_record(parsed):
            found.append(parsed)
    return found


def main(path):
    with open(path, encoding="utf-8") as handle:
        bundle = json.load(handle)
    comments = sorted(bundle["comments"], key=lambda c: (c["created_at"], str(c["id"])))
    pairs = [(c["author"].lower(), r) for c in comments for r in records_in(c["body"])]
    opening = next(r for _, r in pairs if r.get("type") == "pilot_opened" and r.get("seq") == 0)
    roster = {opening["roster"]["operator"].lower(), opening["roster"]["developer"].lower()}
    offered = next((r for a, r in pairs if r.get("type") == "task_offered" and a == opening["roster"]["operator"].lower()), None)
    if offered:
        roster.add(offered["human"].lower())
    chain = [r for a, r in pairs if a in roster and r.get("type") != "independent_verification"]
    for index, record in enumerate(chain):
        if record.get("seq") != index:
            raise SystemExit(f"seq {record.get('seq')} found where {index} was expected; run verify.mjs for details")
    digest = sha256_hex(f"{PROTOCOL}|{opening['pilot_id']}")
    for record in chain:
        digest = sha256_hex(f"{digest}|{sha256_hex(jcs(record))}")
    print(f"{digest} (through seq {len(chain) - 1}; {len(chain)} records)")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    main(sys.argv[1])
