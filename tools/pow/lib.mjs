// MEKU proof-of-work pilot (meku.pow/1): shared, dependency-free helpers.
// Used by request.mjs (developer client), record.mjs, export.mjs and verify.mjs.
// Nothing here performs network calls, reads credentials or moves money.

import { createHash, randomBytes } from "node:crypto";
import { inflateSync } from "node:zlib";

export const PROTOCOL = "meku.pow/1";
export const BUNDLE_FORMAT = "meku.pow-bundle/1";
export const MCP_ENDPOINT = "https://meku.farm/api/public/mcp";
export const VARIANT = "operator-relayed";
export const TASK_KIND = "fresh-code-photo";
// Crockford base32: no I, L, O or U, so a handwritten code is hard to misread.
export const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const CODE_LENGTH = 8;
// Everyday objects found in most homes. None reveals identity or location.
export const OBJECTS = Object.freeze(["SPOON", "CUP", "PLATE", "BOWL", "SOCK", "TOWEL", "PEN", "SHOE"]);
export const EVIDENCE_HOURS_AFTER_REVEAL = 48;
export const CYCLE_HOURS = 168;
export const BUDGET_TEXT = "None - unpaid pilot, no payment of any kind";
export const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;
export const MIN_EVIDENCE_SHORT_SIDE = 240;

// MEKU's shared request validator trims and then silently CUTS text at these caps
// (private source src/lib/execution-request.ts, live docs meku.farm/docs). The pilot
// refuses anything that would be cut, so the code can never be truncated away.
export const REQUEST_LIMITS = Object.freeze({
  title: [4, 120],
  action: [4, 200],
  description: [20, 2000],
  deliverable: [1, 300],
  timeframe: [1, 120],
  budget_text: [1, 80],
});

export const RECORD_ORDER = Object.freeze([
  "pilot_opened",
  "developer_ready",
  "request_submitted",
  "request_reviewed",
  "request_status_observed",
  "task_offered",
  "human_consent",
  "object_revealed",
  "evidence_submitted",
  "result_returned",
  "requester_decision",
  "pilot_closed",
]);

const SHA256 = /^[0-9a-f]{64}$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const PILOT_ID = /^POW-(?:\d{3}|SYNTHETIC-[A-Z0-9-]{1,30})$/;
// GitHub logins: letters, digits and single inner hyphens, at most 39 characters.
const GITHUB_LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;
// Synthetic fixtures use underscores, which GitHub forbids, so no real account is named.
const SYNTHETIC_LOGIN = /^synthetic_[a-z]{1,30}$/;
const LEDGER_URL = /^https:\/\/github\.com\/[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}\/issues\/[1-9]\d{0,8}$/;
const ATTACHMENT_URL =
  /https:\/\/(?:github\.com\/user-attachments\/assets\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|user-images\.githubusercontent\.com\/\d{1,12}\/[A-Za-z0-9._-]{1,200})/g;

export const isSyntheticPilot = (pilotId) => typeof pilotId === "string" && pilotId.startsWith("POW-SYNTHETIC-");
export const isSha256 = (value) => typeof value === "string" && SHA256.test(value);
export const isLedgerUrl = (value) => typeof value === "string" && LEDGER_URL.test(value);
export function isGithubLogin(value, { synthetic = false } = {}) {
  if (typeof value !== "string") return false;
  return GITHUB_LOGIN.test(value) || (synthetic && SYNTHETIC_LOGIN.test(value));
}
export const sameLogin = (a, b) => typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase();

/** RFC 8785 (JCS) for the subset the protocol allows: null, booleans, safe integers,
 *  strings, arrays and objects. Floats are refused so no number formatting can differ. */
export function canonicalize(value) {
  if (value === null || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new Error("Only safe integers are allowed in records.");
    return String(value);
  }
  if (typeof value === "string") {
    if (!value.isWellFormed()) throw new Error("Strings must be well-formed Unicode.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (typeof value === "object") {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) throw new Error("Only plain objects are allowed.");
    // Default sort compares UTF-16 code units, exactly as RFC 8785 requires.
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
  }
  throw new Error(`Unsupported value type: ${typeof value}`);
}

export function sha256Hex(data) {
  return createHash("sha256").update(typeof data === "string" ? Buffer.from(data, "utf8") : data).digest("hex");
}

export const recordHash = (record) => sha256Hex(canonicalize(record));

/** canonicalize() that answers null instead of throwing, for comparing untrusted input. */
export function canon(value) {
  try {
    return canonicalize(value);
  } catch {
    return null;
  }
}

/** Public commitment to a MEKU request id: links records without publishing the id. */
export function requestIdCommitment(requestId) {
  if (typeof requestId !== "string" || !/^[0-9a-f-]{36}$/i.test(requestId)) throw new Error("Invalid request id.");
  return sha256Hex(`${PROTOCOL}|request-id|${requestId.toLowerCase()}`);
}

/** Rolling digest over records 0..n in seq order. Anyone can recompute it in any language:
 *  d = sha256("meku.pow/1|" + pilot_id); for each record: d = sha256(d + "|" + sha256(JCS(record))). */
export function ledgerDigest(pilotId, records) {
  let digest = sha256Hex(`${PROTOCOL}|${pilotId}`);
  for (const record of records) digest = sha256Hex(`${digest}|${recordHash(record)}`);
  return digest;
}

export function generateCode(randomSource = randomBytes) {
  const bytes = randomSource(5); // 40 random bits = exactly 8 base32 characters.
  if (!bytes || bytes.length !== 5) throw new Error("Random source must return 5 bytes.");
  let bits = 0n;
  for (const byte of bytes) bits = (bits << 8n) | BigInt(byte);
  let code = "";
  for (let i = CODE_LENGTH - 1; i >= 0; i -= 1) code += CODE_ALPHABET[Number((bits >> BigInt(i * 5)) & 31n)];
  return code;
}

export const isValidCode = (code) =>
  typeof code === "string" && code.length === CODE_LENGTH && [...code].every((c) => CODE_ALPHABET.includes(c));

export function buildRequestArguments({ pilotId, code, ledgerUrl }) {
  if (!PILOT_ID.test(pilotId ?? "")) throw new Error("Invalid pilot id.");
  if (!isValidCode(code)) throw new Error("Invalid code.");
  if (!isLedgerUrl(ledgerUrl)) throw new Error("The ledger must be a GitHub issue URL.");
  return {
    title: `${pilotId}: handwritten code photo (unpaid pilot)`,
    action: "Handwrite a code on paper, place one named everyday object beside it, take one photo",
    description:
      `MEKU ${pilotId} independent proof-of-work pilot. Unpaid: no payment, token or wallet of any kind. ` +
      `Code: ${code}. If you freely agree: (1) handwrite the code ${code} on paper; ` +
      `(2) after you post your consent in the public record, the developer will post 2 more characters to ` +
      `write after the code and name one everyday object; place that object next to the paper; (3) take one ` +
      `photo showing only the paper and the object on a ` +
      `plain surface - no people, faces, screens, documents, addresses or windows; (4) post a screenshot of ` +
      `that photo in the public record (screenshots normally carry no location data). Under 5 minutes, at a place ` +
      `you already are. No travel, purchase or special equipment. You may refuse or stop at any time without ` +
      `penalty. Public record: ${ledgerUrl}`,
    skills: [],
    deliverable: "One metadata-free photo of the handwritten code and the named object",
    timeframe: "Within 7 days; photo within 48 hours after the object is named",
    budget_text: BUDGET_TEXT,
    travel_required: false,
    equipment_required: false,
    idempotencyKey: `${pilotId}.${code}`,
  };
}

/** Problems that would make MEKU store something other than what was sent. */
export function requestArgumentProblems(args) {
  const problems = [];
  for (const [field, [min, max]] of Object.entries(REQUEST_LIMITS)) {
    const value = args?.[field];
    if (typeof value !== "string") {
      problems.push(`${field} must be a string`);
      continue;
    }
    if (value !== value.trim()) problems.push(`${field} has leading or trailing whitespace`);
    if (value.length < min || value.length > max) problems.push(`${field} must be ${min}-${max} characters`);
  }
  if (!Array.isArray(args?.skills) || args.skills.length !== 0) problems.push("skills must be an empty array");
  if (args?.travel_required !== false) problems.push("travel_required must be false");
  if (args?.equipment_required !== false) problems.push("equipment_required must be false");
  if (args?.budget_text !== BUDGET_TEXT) problems.push(`budget_text must be exactly "${BUDGET_TEXT}"`);
  if (typeof args?.idempotencyKey !== "string" || !/^[A-Za-z0-9._:-]{1,80}$/.test(args.idempotencyKey))
    problems.push("idempotencyKey must be 1-80 letters, digits, dots, underscores, colons or dashes");
  return problems;
}

// ---------------------------------------------------------------------------
// Record schema. One table drives validation here and the published JSON Schema.

const str = (min, max, extra = {}) => ({ kind: "string", min, max, ...extra });
const constant = (value) => ({ kind: "const", value });
const oneOf = (...values) => ({ kind: "enum", values });
const bool = () => ({ kind: "boolean" });
const sha = () => str(64, 64, { pattern: SHA256, patternSource: "^[0-9a-f]{64}$" });
const iso = () => str(20, 35, { pattern: ISO_UTC, patternSource: ISO_UTC.source });
const login = () => ({ kind: "login" });
const obj = (fields) => ({ kind: "object", fields });
const nullableStr = (max) => ({ kind: "nullable-string", max });
const optional = (spec) => ({ ...spec, optional: true });
const trueFlags = (...names) => obj(Object.fromEntries(names.map((n) => [n, constant(true)])));

// Operator records name the request by its fresh code, so they need no hashing and can be
// written on a phone; the developer's records carry the hash commitments.
const CODE_FIELD = str(CODE_LENGTH, CODE_LENGTH, { pattern: /^[0-9A-HJKMNP-TV-Z]{8}$/, patternSource: "^[0-9A-HJKMNP-TV-Z]{8}$" });

const REQUEST_ARGUMENTS = obj({
  title: str(4, 120),
  action: str(4, 200),
  description: str(20, 2000),
  skills: { kind: "array", item: str(1, 40), max: 10 },
  deliverable: str(1, 300),
  timeframe: str(1, 120),
  budget_text: str(1, 80),
  travel_required: bool(),
  equipment_required: bool(),
  idempotencyKey: str(1, 80, { pattern: /^[A-Za-z0-9._:-]+$/, patternSource: "^[A-Za-z0-9._:-]+$" }),
});

const STORED_REQUEST = obj({
  title: str(0, 120),
  action: str(0, 200),
  description: str(0, 2000),
  country: nullableStr(80),
  region: nullableStr(80),
  skills: { kind: "array", item: str(0, 40), max: 10 },
  deliverable: nullableStr(300),
  timeframe: nullableStr(120),
  budget_text: nullableStr(80),
  travel_required: bool(),
  equipment_required: bool(),
  requester_kind: str(1, 20),
  status: str(1, 20),
  created_at: iso(),
});

export const RECORD_TYPES = Object.freeze({
  pilot_opened: {
    roles: ["operator"],
    fields: {
      protocol: str(20, 300, { pattern: /^https:\/\//, patternSource: "^https://" }),
      mcp_endpoint: constant(MCP_ENDPOINT),
      variant: constant(VARIANT),
      roster: obj({ operator: login(), developer: login() }),
      task: obj({
        kind: constant(TASK_KIND),
        code_alphabet: constant(CODE_ALPHABET),
        code_length: constant(CODE_LENGTH),
        objects: constant([...OBJECTS]),
        evidence_hours_after_reveal: constant(EVIDENCE_HOURS_AFTER_REVEAL),
        cycle_hours: constant(CYCLE_HOURS),
      }),
      payment: constant("none"),
    },
  },
  developer_ready: {
    roles: ["developer"],
    fields: {
      client: obj({ name: str(1, 80), version: str(1, 40) }),
      agent: str(1, 160),
      server: obj({ name: constant("meku-human-cloud"), version: str(1, 20), protocol_version: str(1, 20) }),
      tools_listed: { kind: "array", item: str(1, 80), max: 20 },
      independence: trueFlags(
        "not_meku_staff_or_contractor",
        "not_paid_by_meku",
        "no_meku_financial_interest",
        "controls_own_agent",
      ),
      payment: constant("none"),
    },
  },
  request_submitted: {
    roles: ["developer"],
    fields: {
      code: CODE_FIELD,
      object_commitment: sha(),
      arguments: REQUEST_ARGUMENTS,
      arguments_sha256: sha(),
      request_id_sha256: sha(),
      response: obj({ status: str(1, 20), created_at: iso(), deduplicated: bool() }),
      response_text_sha256: sha(),
      observed_at: iso(),
      payment: constant("none"),
    },
  },
  request_reviewed: {
    roles: ["operator"],
    fields: {
      code: CODE_FIELD,
      decision: oneOf("approved", "rejected"),
      reviewer_role: oneOf("seek_reviewer", "admin"),
      reviewer_is_key_issuer: constant(false),
      reviewer_same_person_as_key_issuer: bool(),
      note: optional(str(0, 300)),
    },
  },
  request_status_observed: {
    roles: ["developer"],
    fields: {
      request_id_sha256: sha(),
      stored_request: STORED_REQUEST,
      stored_request_sha256: sha(),
      response_text_sha256: sha(),
      observed_at: iso(),
    },
  },
  task_offered: {
    roles: ["operator"],
    fields: {
      code: CODE_FIELD,
      human: login(),
      human_is_registered_meku_human: bool(),
      task_shown: constant("ledger-seq-4"),
      channel: oneOf("github", "email", "in_person", "phone", "message", "other"),
      payment: constant("none"),
    },
  },
  human_consent: {
    roles: ["human"],
    fields: {
      consents: trueFlags("voluntary_participation", "may_reject_or_stop", "responsible_for_safety", "safety_checklist"),
      adult_18_plus: constant(true),
      unpaid_understood: constant(true),
      publication: trueFlags("photo_public", "github_login_public"),
      independence: trueFlags("not_meku_staff_or_contractor", "not_the_developer"),
    },
  },
  object_revealed: {
    roles: ["developer"],
    fields: {
      object: oneOf(...OBJECTS),
      suffix: str(2, 2, { pattern: /^[0-9A-HJKMNP-TV-Z]{2}$/, patternSource: "^[0-9A-HJKMNP-TV-Z]{2}$" }),
      salt: str(32, 32, { pattern: /^[0-9a-f]{32}$/, patternSource: "^[0-9a-f]{32}$" }),
      consent_comment_id: { kind: "integer", min: 1, max: Number.MAX_SAFE_INTEGER },
    },
  },
  evidence_submitted: {
    roles: ["human"],
    fields: {
      statements: trueFlags(
        "code_physically_written",
        "object_placed_after_reveal",
        "no_people_or_personal_data",
        "metadata_removed",
      ),
      evidence: constant("attached-in-this-comment"),
    },
  },
  result_returned: {
    roles: ["operator"],
    fields: {
      code: CODE_FIELD,
      evidence: constant("ledger-seq-8"),
      meku_check: obj({
        code_visible: bool(),
        object_visible: bool(),
        no_personal_data_visible: bool(),
      }),
      note: optional(str(0, 300)),
    },
  },
  requester_decision: {
    roles: ["developer"],
    fields: {
      decision: oneOf("ACCEPTED", "REJECTED"),
      checks: obj({
        code_visible: bool(),
        code_matches: bool(),
        object_visible: bool(),
        object_matches: bool(),
        no_personal_data_visible: bool(),
      }),
      evidence_sha256: sha(),
      ledger_digest: sha(),
      reason: str(1, 300),
    },
  },
  pilot_closed: {
    roles: ["operator"],
    fields: {
      key_revoked: constant(true),
      outcome: oneOf("completed", "stopped", "rejected_by_review"),
      note: optional(str(0, 300)),
    },
  },
  stop: {
    roles: ["developer", "operator", "human"],
    fields: { reason: str(1, 300) },
  },
  independent_verification: {
    roles: ["verifier"],
    unsequenced: true,
    fields: {
      verdict: oneOf("PASS", "FAIL", "INCOMPLETE", "STOPPED", "REJECTED_BY_REVIEW", "COMPLETED_REJECTED"),
      ledger_digest: sha(),
      tool: str(1, 200),
      manual_checks: obj({
        code_legible_and_matching: bool(),
        object_matching: bool(),
        no_personal_data_visible: bool(),
        physical_arrangement: bool(),
        human_did_not_withdraw: bool(),
        other_comments_consistent: bool(),
      }),
      notes: optional(str(0, 500)),
    },
  },
});

const ENVELOPE = ["pow", "pilot_id", "seq", "type", "role"];

// Control and bidirectional-override characters could make a printed report lie about itself.
const UNSAFE_TEXT = /[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/;
const SAFE_TEXT_PATTERN =
  "^(?!.*(?:<!--|-->|```|~~~))[^\\u0000-\\u001f\\u007f-\\u009f\\u200e\\u200f\\u202a-\\u202e\\u2066-\\u2069]*$";

// Comment markers and code fences inside a record would make GitHub show something other
// than what is parsed, so no record string may contain them.
const MARKUP_TEXT = /<!--|-->|```|~~~/;

function checkValue(spec, value, path, problems, ctx) {
  if (typeof value === "string" && UNSAFE_TEXT.test(value)) {
    problems.push(`${path} contains control or text-direction characters`);
    return;
  }
  if (typeof value === "string" && MARKUP_TEXT.test(value)) {
    problems.push(`${path} contains a comment marker or code fence`);
    return;
  }
  switch (spec.kind) {
    case "const":
      if (canonicalize(value ?? null) !== canonicalize(spec.value)) problems.push(`${path} must be ${JSON.stringify(spec.value)}`);
      return;
    case "enum":
      if (!spec.values.includes(value)) problems.push(`${path} must be one of ${spec.values.join(", ")}`);
      return;
    case "boolean":
      if (typeof value !== "boolean") problems.push(`${path} must be true or false`);
      return;
    case "integer":
      if (!Number.isSafeInteger(value) || value < spec.min || value > spec.max) problems.push(`${path} must be an integer ${spec.min}-${spec.max}`);
      return;
    case "login":
      if (!isGithubLogin(value, ctx)) problems.push(`${path} must be a GitHub login`);
      return;
    case "nullable-string":
      if (value === null) return;
      if (typeof value !== "string" || value.length > spec.max) problems.push(`${path} must be null or a string of at most ${spec.max} characters`);
      return;
    case "string":
      if (typeof value !== "string") {
        problems.push(`${path} must be a string`);
        return;
      }
      if (value.length < spec.min || value.length > spec.max) problems.push(`${path} must be ${spec.min}-${spec.max} characters`);
      if (spec.pattern && !spec.pattern.test(value)) problems.push(`${path} has an invalid format`);
      return;
    case "array":
      if (!Array.isArray(value)) {
        problems.push(`${path} must be an array`);
        return;
      }
      if (value.length > spec.max) problems.push(`${path} has more than ${spec.max} items`);
      value.forEach((item, i) => checkValue(spec.item, item, `${path}[${i}]`, problems, ctx));
      return;
    case "object":
      checkObject(spec.fields, value, path, problems, ctx);
      return;
    default:
      problems.push(`${path}: unknown schema kind`);
  }
}

function checkObject(fields, value, path, problems, ctx) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    problems.push(`${path} must be an object`);
    return;
  }
  for (const key of Object.keys(value)) if (!Object.hasOwn(fields, key)) problems.push(`${path}.${key} is not allowed`);
  for (const [key, spec] of Object.entries(fields)) {
    if (!Object.hasOwn(value, key)) {
      if (!spec.optional) problems.push(`${path}.${key} is missing`);
      continue;
    }
    checkValue(spec, value[key], `${path}.${key}`, problems, ctx);
  }
}

/** Schema problems for one record; an empty list means the shape is valid. */
export function recordProblems(record) {
  const problems = [];
  if (typeof record !== "object" || record === null || Array.isArray(record)) return ["record must be a JSON object"];
  try {
    canonicalize(record);
  } catch (error) {
    return [`record cannot be canonicalized: ${error.message}`];
  }
  if (record.pow !== PROTOCOL) problems.push(`pow must be "${PROTOCOL}"`);
  if (typeof record.pilot_id !== "string" || !PILOT_ID.test(record.pilot_id)) problems.push("pilot_id must look like POW-001");
  const spec = typeof record.type === "string" && Object.hasOwn(RECORD_TYPES, record.type) ? RECORD_TYPES[record.type] : null;
  if (!spec) return [...problems, `type must be one of ${Object.keys(RECORD_TYPES).join(", ")}`];
  if (typeof record.role !== "string" || !spec.roles.includes(record.role)) problems.push(`role for ${record.type} must be ${spec.roles.join(" or ")}`);
  if (spec.unsequenced) {
    if (Object.hasOwn(record, "seq")) problems.push("independent_verification records have no seq");
  } else if (!Number.isSafeInteger(record.seq) || record.seq < 0 || record.seq > 99) problems.push("seq must be an integer 0-99");
  const ctx = { synthetic: isSyntheticPilot(record.pilot_id) };
  const body = Object.fromEntries(Object.entries(record).filter(([key]) => !ENVELOPE.includes(key)));
  checkObject(spec.fields, body, "record", problems, ctx);
  return problems;
}

/** JSON Schema (draft 2020-12) generated from RECORD_TYPES, published for other implementations. */
export function recordJsonSchema() {
  const toSchema = (spec) => {
    switch (spec.kind) {
      case "const":
        return { const: spec.value };
      case "enum":
        return { enum: spec.values };
      case "boolean":
        return { type: "boolean" };
      case "integer":
        return { type: "integer", minimum: spec.min, maximum: spec.max };
      case "login":
        // Real GitHub logins, plus the underscore form used only by synthetic test ledgers
        // (verify.mjs additionally refuses that form outside POW-SYNTHETIC-* pilots).
        return { type: "string", pattern: `^(?:${GITHUB_LOGIN.source.slice(1, -1)}|${SYNTHETIC_LOGIN.source.slice(1, -1)})$` };
      case "nullable-string":
        return { type: ["string", "null"], maxLength: spec.max, pattern: SAFE_TEXT_PATTERN };
      case "string":
        // A field with its own pattern must still be safe text, as the verifier requires.
        return {
          type: "string",
          minLength: spec.min,
          maxLength: spec.max,
          ...(spec.patternSource ? { allOf: [{ pattern: SAFE_TEXT_PATTERN }, { pattern: spec.patternSource }] } : { pattern: SAFE_TEXT_PATTERN }),
        };
      case "array":
        return { type: "array", maxItems: spec.max, items: toSchema(spec.item) };
      case "object":
        return objectSchema(spec.fields);
      default:
        throw new Error("unknown kind");
    }
  };
  const objectSchema = (fields, extra = {}) => ({
    type: "object",
    additionalProperties: false,
    required: Object.entries(fields)
      .filter(([, s]) => !s.optional)
      .map(([k]) => k),
    properties: { ...extra, ...Object.fromEntries(Object.entries(fields).map(([k, s]) => [k, toSchema(s)])) },
  });
  const variants = Object.entries(RECORD_TYPES).map(([type, spec]) => {
    const envelope = {
      pow: { const: PROTOCOL },
      pilot_id: { type: "string", pattern: PILOT_ID.source },
      type: { const: type },
      role: { enum: spec.roles },
      ...(spec.unsequenced ? {} : { seq: { type: "integer", minimum: 0, maximum: 99 } }),
    };
    const schema = objectSchema(spec.fields, envelope);
    schema.required = [...Object.keys(envelope), ...schema.required];
    return schema;
  });
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://github.com/mekusimeku/meku-si/blob/main/tools/pow/pow-record-v1.schema.json",
    title: "MEKU proof-of-work pilot record (meku.pow/1)",
    description:
      "Generated by tools/pow/record.mjs schema from tools/pow/lib.mjs. Cross-record rules (order, authorship, hashes, timing) are enforced by tools/pow/verify.mjs and described in docs/proof-of-work/records.md.",
    oneOf: variants,
  };
}

// ---------------------------------------------------------------------------
// Reading comments. A record counts only when its comment is exactly one record and
// nothing else, in a form the tools print or a person pastes:
//   an optional tool header line, then one ```json block, or one bare JSON record,
// plus, in the evidence comment only, one GitHub image attachment before or after it.
// Anything else in a comment could look different on GitHub from how it is read, so such a
// comment is not counted; the verifier lists it for a person to read instead.

/** Trims only JSON whitespace (space, tab, newline, carriage return), identically in every
 *  implementation; String.prototype.trim and Python's strip disagree on other characters. */
export const jsonTrim = (text) => String(text).replace(/^[ \t\n\r]+|[ \t\n\r]+$/g, "");

// The only label a header may carry is the reveal's instruction to the human, so a header
// line can never hold words that nobody reads.
const HEADER_LINE =
  /^MEKU proof-of-work record: (?:seq [0-9]{1,4} )?[a-z_]{1,40} \(POW-[A-Z0-9-]{1,40}\)(?: - write ([0-9A-HJKMNP-TV-Z]{10}) and put an? ([A-Z]{2,5}) next to it)?$/;
const IMAGE_AT_START = /^(?:!\[[^\]\n]{0,200}\]\([^)\s]{1,300}\)|<img\b[^<>\n]{0,1000}>)/i;
const IMAGE_AT_END = /(?:!\[[^\]\n]{0,200}\]\([^)\s]{1,300}\)|<img\b[^<>\n]{0,1000}>)$/i;

/** The attachment URL of one image in GitHub's own upload markup, or null. */
function attachmentImage(markup) {
  let url = null;
  const md = markup.match(/^!\[([^\]\n<>`]{0,200})\]\(([^)\s]{1,300})\)$/);
  if (md) url = md[2];
  else {
    const tag = markup.match(/^<img((?:[ ]+[a-z]{1,10}="[^"<>`\n]{0,300}")+)[ ]*\/?>$/i);
    if (!tag) return null;
    const attrs = new Map();
    for (const [, name, value] of tag[1].matchAll(/[ ]+([a-z]{1,10})="([^"]*)"/gi)) {
      const key = name.toLowerCase();
      if (attrs.has(key) || !["width", "height", "alt", "src"].includes(key)) return null;
      if ((key === "width" || key === "height") && !/^[0-9]{1,5}$/.test(value)) return null;
      attrs.set(key, value);
    }
    url = attrs.get("src") ?? null;
  }
  return url && ATTACHMENT_ONLY.test(url) ? normalizeAttachmentUrl(url) : null;
}

/** Reads one comment by the strict grammar above. Returns null when the comment makes no
 *  attempt at a record, { problem } when it does but is not in an accepted form, and
 *  { record, image } when it is exactly one record (image: the attachment URL, or null). */
export function readRecordComment(body) {
  const raw = String(body ?? "");
  if (!raw.includes(PROTOCOL) && !/```json/i.test(raw)) return null;
  let text = jsonTrim(raw.replace(/\r\n?/g, "\n"));
  let image = null;
  // GitHub puts an uploaded image where the cursor was, so it may share a line with the record.
  for (const [pattern, cut] of [
    [IMAGE_AT_START, (m) => text.slice(m[0].length)],
    [IMAGE_AT_END, (m) => text.slice(0, text.length - m[0].length)],
  ]) {
    const m = image === null ? text.match(pattern) : null;
    if (!m) continue;
    image = attachmentImage(m[0]);
    if (!image) return { problem: "an image that is not a single GitHub attachment in GitHub's own markup" };
    text = jsonTrim(cut(m));
  }
  const lines = text.split("\n");
  const header = lines[0].match(HEADER_LINE);
  if (header) text = jsonTrim(lines.slice(1).join("\n"));
  let json;
  if (text.startsWith("```")) {
    const block = text.split("\n");
    if (block.length < 3 || !/^```json[ \t]*$/.test(block[0]) || !/^```[ \t]*$/.test(block.at(-1)))
      return { problem: "not exactly one ```json block and nothing else" };
    json = block.slice(1, -1).join("\n");
  } else if (text.startsWith("{") && text.endsWith("}")) {
    // A bare record is shown as Markdown, where HTML could hide text; inside a block it could not.
    if (text.includes("<")) return { problem: 'a bare record containing "<"; put it inside ```json lines' };
    json = text;
  } else return { problem: "text besides the record; post the record alone, as printed" };
  let record;
  try {
    record = parseRecordJson(json);
  } catch (error) {
    return { problem: `the record is not valid JSON: ${error.message}` };
  }
  if (!isRecordObject(record)) return { problem: 'JSON without "pow": "meku.pow/1"' };
  if (image && record.type !== "evidence_submitted") return { problem: "an image beside a record other than the evidence" };
  if (!image && record.type === "evidence_submitted") return { problem: "the evidence record without its screenshot; post both in one comment" };
  let label = null;
  if (header?.[1]) {
    if (record.type !== "object_revealed" || header[1].slice(8) !== record.suffix || header[2] !== record.object)
      return { problem: "a header line whose instruction does not match the record" };
    label = { code: header[1].slice(0, 8), suffix: header[1].slice(8), object: header[2] };
  }
  return { record, image, label };
}

/** JSON for records: refuses fractional and exponent numbers, which JavaScript and Python
 *  would hash differently ("1.0" is 1 in one and 1.0 in the other). */
export function parseRecordJson(text) {
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "-" || (c >= "0" && c <= "9")) {
      let j = i;
      while (j < text.length && /[-+0-9.eE]/.test(text[j])) j += 1;
      if (/[.eE]/.test(text.slice(i, j))) throw new Error("records may not contain fractional or exponent numbers");
      i = j - 1;
    }
  }
  return JSON.parse(text);
}

const isRecordObject = (v) => v && typeof v === "object" && !Array.isArray(v) && v.pow === PROTOCOL;

/** The words in a comment besides anything record-shaped: fenced JSON blocks, a bare JSON
 *  object that mentions the protocol, images and tool header lines. Used to find a STOP that
 *  the human wrote next to a record. */
export function wordsBesideRecord(body) {
  let text = String(body ?? "").replace(/\r\n?/g, "\n");
  text = text.replace(/```json[^\n]*\n[\s\S]*?(?:```|$)/g, "\n");
  text = text.replace(/<img\b[^>]*>|!\[[^\]]*\]\([^)]*\)/gi, "\n");
  text = text.replace(/^MEKU proof-of-work record:[^\n]*$/gm, "\n");
  const open = text.indexOf("{");
  const close = text.lastIndexOf("}");
  if (open !== -1 && close > open && text.slice(open, close + 1).includes(PROTOCOL)) text = text.slice(0, open) + "\n" + text.slice(close + 1);
  return jsonTrim(text);
}

/** Records in a comment, for callers that want a list: [], [{ error }] or [{ record, image }]. */
export function extractRecords(body) {
  const read = readRecordComment(body);
  if (!read) return [];
  return read.problem ? [{ error: read.problem }] : [{ record: read.record, image: read.image, label: read.label }];
}

// The documented STOP: a comment that says only one of these words (any case or width, with
// or without accents on Latin letters, spaces or punctuation, quoted or in a code block), or
// only a stop sign. The list holds only words that mean stop when they stand alone, because a
// match can only be cleared by a stop record. Anything else the human writes goes to a person
// (manual check M05), so a withdrawal in any other words still prevents a verified cycle.
export const STOP_WORDS = [
  "stop", "halt", "stopp", "stoppen", "aufhören", "arrête", "arrêtez", "arrêter", "arrêt", "fermati", "fermatevi",
  "parar", "detener", "basta", "berhenti", "batal", "dur", "durdur", "tigil", "dừng", "стоп", "хватит",
  "停止", "停", "やめて", "止めて", "やめる", "ストップ", "중지", "멈춰", "그만", "توقف", "रुको", "หยุด",
];
const normalizeWord = (text) =>
  String(text)
    .normalize("NFKD")
    .replace(/(\p{Script=Latin})\p{M}+/gu, "$1")
    .normalize("NFKC")
    .toLowerCase();
// Letters, numbers and the marks that belong to them (Thai and Hindi vowel signs, for example).
const NOT_WORD = /[^\p{L}\p{M}\p{N}]+/gu;
const STOP_SET = new Set(STOP_WORDS.map((w) => normalizeWord(w).replace(NOT_WORD, "")));
const STOP_SIGNS = /^[\s!.]*(?:\u{1F6D1}|\u26D4)[\s!.\uFE0F\u{1F6D1}\u26D4]*$/u;

export function isStopWord(text) {
  // Quote markers and code-block lines do not change what the words say.
  const t = String(text)
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/^(?:[ \t]*>)+/, ""))
    .filter((line) => !/^[ \t]*(?:```|~~~)/.test(line))
    .join("\n")
    .replace(/:(?:stop_sign|octagonal_sign):/g, "\u{1F6D1}")
    .replace(/:no_entry:/g, "\u26D4");
  if (STOP_SIGNS.test(t)) return true;
  const plain = normalizeWord(t);
  // "STOP", "s t o p" and "Stop, stop!" all count; "please stop" goes to a person instead.
  if (STOP_SET.has(plain.replace(NOT_WORD, ""))) return true;
  const words = plain.split(NOT_WORD).filter(Boolean);
  return words.length > 0 && words.every((w) => STOP_SET.has(w));
}

/** Display-safe text: control and text-direction characters become visible \u escapes. */
export function displaySafe(value) {
  return String(value).replace(new RegExp(UNSAFE_TEXT.source, "g"), (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

/** The roster as the verifier sees it: seq 0 posted by the expected operator account (or, for
 *  synthetic test ledgers, the first synthetic seq 0), and the human named in that operator's
 *  task_offered. Roster values that are not strings are treated as absent. */
export function rosterFromComments(comments, { expectOperator = "mekusimeku" } = {}) {
  // Only records the verifier could count name roles, so an invalid draft never names anyone.
  const records = [];
  for (const comment of comments)
    for (const f of extractRecords(comment.body)) if (f.record && recordProblems(f.record).length === 0) records.push({ comment, record: f.record });
  const openings = records.filter((e) => e.record.type === "pilot_opened" && e.record.seq === 0);
  const opening =
    openings.find((e) => sameLogin(e.comment.author, expectOperator) && sameLogin(e.record.roster?.operator, expectOperator)) ??
    openings.find((e) => isSyntheticPilot(e.record.pilot_id)) ??
    openings[0] ??
    null;
  const text = (v) => (typeof v === "string" ? v : null);
  if (!opening) return { opening: null, operator: null, developer: null, human: null };
  const operator = text(opening.record.roster?.operator);
  const offers = records.filter(
    (e) => e.record.type === "task_offered" && e.record.pilot_id === opening.record.pilot_id && sameLogin(e.comment.author, operator),
  );
  // A pilot has one human. Every valid offer must name the same one, even an offer posted
  // before its turn; the verifier fails a ledger whose offers name more than one.
  const humansNamed = [...new Set(offers.map((e) => text(e.record.human)).filter(Boolean).map((l) => l.toLowerCase()))];
  return { opening, operator, developer: text(opening.record.roster?.developer), human: text(offers[0]?.record.human), humansNamed };
}

const ATTACHMENT_ONLY = new RegExp(`^${ATTACHMENT_URL.source}$`, "i");
const ATTACHMENT_URL_ANY = new RegExp(ATTACHMENT_URL.source, "i");

/** Every GitHub attachment URL anywhere in the raw comment, shown or hidden (host matched
 *  case-insensitively). */
export function extractAttachmentUrls(body) {
  const urls = (String(body ?? "").match(new RegExp(ATTACHMENT_URL.source, "gi")) ?? []).map(normalizeAttachmentUrl);
  return [...new Set(urls)];
}

/** Every distinct http(s) URL anywhere in the raw comment. */
export function extractAllUrls(body) {
  const urls = String(body ?? "").match(/https?:\/\/[^\s<>"'()[\]]+/gi) ?? [];
  return [...new Set(urls.map((u) => (ATTACHMENT_ONLY.test(u) ? normalizeAttachmentUrl(u) : u)))];
}

/** Images in the raw comment that are not GitHub attachments (they cannot be checked). */
export function externalImages(body) {
  const refs = String(body ?? "").match(/<img\b[^>]*>|!\[[^\]]*\]\([^)]*\)|<source\b[^>]*>/gi) ?? [];
  return refs.filter((ref) => !ATTACHMENT_URL_ANY.test(ref));
}

function normalizeAttachmentUrl(url) {
  const u = new URL(url);
  return `https://${u.hostname.toLowerCase()}${u.pathname}`;
}

// ---------------------------------------------------------------------------
// Object commit-reveal: neither the developer nor the human can choose the object.
// The developer commits to a secret salt in seq 2 and reveals it in seq 7; the object then
// follows from the salt and GitHub's id for the human's consent comment, which nobody knows
// before that comment exists.

export const isObjectSalt = (value) => typeof value === "string" && /^[0-9a-f]{32}$/.test(value);
export const generateObjectSalt = (randomSource = randomBytes) => Buffer.from(randomSource(16)).toString("hex");
export const objectCommitment = (salt) => sha256Hex(`${PROTOCOL}|object-salt|${salt}`);
export function objectFor(salt, consentCommentId) {
  if (!isObjectSalt(salt) || !Number.isSafeInteger(consentCommentId) || consentCommentId < 1) throw new Error("Invalid salt or comment id.");
  return OBJECTS[Number.parseInt(sha256Hex(`${PROTOCOL}|object|${salt}|${consentCommentId}`).slice(0, 8), 16) % OBJECTS.length];
}

/** Two more characters the human writes after the code, revealed with the object, so a photo
 *  cannot be prepared from the public code alone (8 objects x 1024 suffixes). */
export function suffixFor(salt, consentCommentId) {
  if (!isObjectSalt(salt) || !Number.isSafeInteger(consentCommentId) || consentCommentId < 1) throw new Error("Invalid salt or comment id.");
  const h = sha256Hex(`${PROTOCOL}|suffix|${salt}|${consentCommentId}`);
  return CODE_ALPHABET[Number.parseInt(h.slice(0, 2), 16) % 32] + CODE_ALPHABET[Number.parseInt(h.slice(2, 4), 16) % 32];
}

// ---------------------------------------------------------------------------
// Evidence image checks (PNG and JPEG only). This is an ALLOW-LIST: only structures known to
// carry pixels or colour information pass. Anything else, including data after the end of
// the image, fails, because metadata can reveal where and with which device a photo was taken.

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
// Pixel, palette, transparency and colour chunks only.
const PNG_ALLOWED = new Set(["IHDR", "PLTE", "IDAT", "IEND", "tRNS", "cHRM", "gAMA", "sBIT", "sRGB", "cICP", "mDCv", "cLLi", "pHYs", "bKGD", "iDOT"]);
const LOCATION_TEXT =
  /GPS|exif:GPS|photoshop:(?:City|State|Country)|Iptc4xmpCore:(?:Location|City|CountryCode)|Iptc4xmpExt:Location|LocationShown|LocationCreated|latitude|longitude/i;

const fail = (code, detail) => ({ level: "FAIL", code, detail });
const warnF = (code, detail) => ({ level: "WARN", code, detail });

function tiffHasGps(tiff) {
  if (tiff.length < 8) return false;
  const little = tiff[0] === 0x49 && tiff[1] === 0x49;
  if (!little && !(tiff[0] === 0x4d && tiff[1] === 0x4d)) return false;
  const u16 = (o) => (little ? tiff.readUInt16LE(o) : tiff.readUInt16BE(o));
  const u32 = (o) => (little ? tiff.readUInt32LE(o) : tiff.readUInt32BE(o));
  const ifd0 = u32(4);
  if (ifd0 + 2 > tiff.length) return false;
  for (let i = 0; i < u16(ifd0); i += 1) {
    const entry = ifd0 + 2 + i * 12;
    if (entry + 12 > tiff.length) break;
    if (u16(entry) === 0x8825) return true;
  }
  return false;
}

function exifFindings(tiff) {
  return [
    fail("EXIF_PRESENT", "EXIF metadata is present"),
    ...(tiffHasGps(tiff) ? [fail("GPS_PRESENT", "EXIF GPS location data is present: treat the image as public and request removal now")] : []),
  ];
}

// The only XMP a phone screenshot needs: its pixel size, orientation, resolution and the
// comment "Screenshot". Every element, attribute and text value in the packet is checked, so a
// name, device, place or any other text anywhere in it fails.
const XMP_ELEMENTS = new Set([
  "x:xmpmeta", "rdf:RDF", "rdf:Description", "rdf:Alt", "rdf:Seq", "rdf:Bag", "rdf:li", "exif:PixelXDimension",
  "exif:PixelYDimension", "exif:UserComment", "tiff:Orientation", "tiff:XResolution", "tiff:YResolution", "tiff:ResolutionUnit",
]);
const XMP_VALUE_NAMES = new Set([...XMP_ELEMENTS].filter((n) => n.startsWith("exif:") || n.startsWith("tiff:")));
const XMP_VALUE = /^(?:[0-9]{1,6}(?:[./][0-9]{1,6})?|screenshot)$/i;

function xmpFindings(text) {
  if (LOCATION_TEXT.test(text)) return [fail("XMP_LOCATION", "XMP metadata contains location fields")];
  const bad = (what) => [fail("XMP_FIELD", `XMP that a screenshot does not need: ${what}`)];
  const packet = String(text).replace(/^\uFEFF/, "").replace(/<\?xpacket\b[^?<>]*\?>/g, "");
  for (const token of packet.split(/(<[^>]*>)/)) {
    if (!token) continue;
    if (!token.startsWith("<")) {
      const value = token.trim();
      if (value && !XMP_VALUE.test(value)) return bad(`the text ${JSON.stringify(value.slice(0, 40))}`);
      continue;
    }
    if (/^<[!?]/.test(token)) return bad("a comment, declaration or processing instruction");
    const tag = token.match(/^<\/?([A-Za-z_][\w.-]*(?::[A-Za-z_][\w.-]*)?)((?:\s+[^\s=<>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*\/?>$/);
    if (!tag) return bad("a malformed tag");
    if (!XMP_ELEMENTS.has(tag[1])) return bad(`the element ${tag[1]}`);
    for (const attr of tag[2].matchAll(/([^\s=<>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
      const [name, value] = [attr[1], attr[2] ?? attr[3]];
      const ok =
        name === "xmlns" || name.startsWith("xmlns:")
          ? /^[\x21-\x7e]{1,200}$/.test(value)
          : name === "x:xmptk"
            ? /^[A-Za-z0-9 ._-]{0,60}$/.test(value)
            : name === "rdf:about"
              ? value === ""
              : name === "rdf:parseType"
                ? value === "Resource"
                : name === "xml:lang"
                  ? /^[A-Za-z-]{1,20}$/.test(value)
                  : XMP_VALUE_NAMES.has(name) && XMP_VALUE.test(value.trim());
      if (!ok) return bad(`the attribute ${name}`);
    }
  }
  return [warnF("XMP_PRESENT", "screenshot XMP with only its pixel size, orientation, resolution and the word Screenshot")];
}

// A colour profile may carry only colour tags, each inside the profile, and short texts (its
// name and copyright). Anything else, or another file hidden inside, fails.
const ICC_TAGS = new Set([
  "desc", "cprt", "wtpt", "bkpt", "rXYZ", "gXYZ", "bXYZ", "rTRC", "gTRC", "bTRC", "kTRC", "chad", "chrm", "lumi", "meas",
  "tech", "view", "vued", "dmnd", "dmdd", "A2B0", "A2B1", "A2B2", "B2A0", "B2A1", "B2A2", "gamt", "pre0", "pre1", "pre2", "cicp",
]);
const ICC_TEXT_TAGS = new Set(["desc", "cprt", "dmnd", "dmdd", "vued"]);
const MAX_ICC_BYTES = 128 * 1024;

function iccFindings(profile) {
  const bad = (what) => [fail("ICC_PROFILE", `colour profile ${what}`)];
  if (profile.length < 132 || profile.length > MAX_ICC_BYTES) return bad(`of ${profile.length} bytes is outside the expected size`);
  if (profile.readUInt32BE(0) !== profile.length || profile.toString("latin1", 36, 40) !== "acsp") return bad("has a malformed header");
  const count = profile.readUInt32BE(128);
  if (count > 64 || 132 + count * 12 > profile.length) return bad("has a malformed tag table");
  for (let i = 0; i < count; i += 1) {
    const entry = 132 + i * 12;
    const sig = profile.toString("latin1", entry, entry + 4);
    const offset = profile.readUInt32BE(entry + 4);
    const size = profile.readUInt32BE(entry + 8);
    if (!ICC_TAGS.has(sig)) return bad(`holds the tag ${JSON.stringify(sig)}, which is not colour data`);
    if (offset + size > profile.length || offset < 132) return bad(`tag ${sig} lies outside the profile`);
    if (ICC_TEXT_TAGS.has(sig) && size > 8192) return bad(`text tag ${sig} is ${size} bytes long`);
  }
  if (profile.includes(Buffer.from("Exif\0\0", "latin1"))) return bad("holds EXIF data");
  return [];
}

function pngIccFindings(data) {
  // iCCP: profile name (1-79 bytes)\0 method compressed-profile
  const zero = data.indexOf(0);
  if (zero < 1 || zero > 79 || data[zero + 1] !== 0) return [fail("ICC_PROFILE", "malformed colour profile chunk")];
  try {
    return iccFindings(inflateSync(data.subarray(zero + 2), { maxOutputLength: MAX_ICC_BYTES + 1 }));
  } catch {
    return [fail("ICC_PROFILE", "unreadable colour profile chunk")];
  }
}

function scanPng(bytes) {
  const out = { mediaType: "image/png", width: null, height: null, findings: [] };
  let offset = 8;
  let sawEnd = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("latin1", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) {
      out.findings.push(fail("PNG_TRUNCATED", `chunk ${JSON.stringify(type)} runs past the end of the file`));
      return out;
    }
    const data = bytes.subarray(dataStart, dataEnd);
    if (type === "IHDR" && length >= 8) {
      out.width = data.readUInt32BE(0);
      out.height = data.readUInt32BE(4);
    } else if (type === "eXIf" || type === "zxIf") {
      out.findings.push(...exifFindings(data));
    } else if (type === "iCCP") {
      out.findings.push(...pngIccFindings(data));
    } else if (type === "iTXt" && data.toString("latin1", 0, 18) === "XML:com.adobe.xmp\0") {
      out.findings.push(...pngXmpFindings(data));
    } else if (type === "tIME") {
      out.findings.push(warnF("PNG_TIME", "a last-modified time chunk is present"));
    } else if (!PNG_ALLOWED.has(type)) {
      out.findings.push(fail("PNG_METADATA_CHUNK", `chunk ${JSON.stringify(type)} is not allowed in evidence (only pixel and colour chunks are)`));
    }
    offset = dataEnd + 4;
    if (type === "IEND") {
      sawEnd = true;
      break;
    }
  }
  if (!sawEnd) out.findings.push(fail("PNG_TRUNCATED", "no IEND chunk"));
  else if (offset < bytes.length) out.findings.push(fail("DATA_AFTER_END", `${bytes.length - offset} bytes follow the end of the image`));
  return out;
}

function pngXmpFindings(data) {
  // iTXt: keyword\0 flag method language\0 translated\0 text
  try {
    const zero = 17;
    const flag = data[zero + 1];
    const langEnd = data.indexOf(0, zero + 3);
    const transEnd = data.indexOf(0, langEnd + 1);
    if (langEnd === -1 || transEnd === -1) return [fail("PNG_METADATA_CHUNK", "malformed XMP chunk")];
    const raw = data.subarray(transEnd + 1);
    // Capped: a small compressed chunk must not expand into gigabytes.
    return xmpFindings((flag === 1 ? inflateSync(raw, { maxOutputLength: 1 << 20 }) : raw).toString("utf8"));
  } catch {
    return [fail("PNG_METADATA_CHUNK", "unreadable XMP chunk")];
  }
}

const JPEG_SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
// Tables and frame/scan headers carry pixels and coding data, not metadata.
const JPEG_TABLES = new Set([0xc4, 0xcc, 0xdb, 0xdd]);

function scanJpeg(bytes) {
  const out = { mediaType: "image/jpeg", width: null, height: null, findings: [] };
  const iccChunks = [];
  let offset = 2;
  let sawEnd = false;
  while (offset + 2 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      out.findings.push(fail("JPEG_MALFORMED", `expected a marker at byte ${offset}`));
      return out;
    }
    const marker = bytes[offset + 1];
    if (marker === 0xff) {
      offset += 1; // fill byte
      continue;
    }
    if (marker === 0xd9) {
      offset += 2;
      sawEnd = true;
      break;
    }
    if (marker >= 0xd0 && marker <= 0xd7) {
      offset += 2;
      continue;
    }
    if (offset + 4 > bytes.length) break;
    const length = bytes.readUInt16BE(offset + 2);
    const segEnd = offset + 2 + length;
    if (length < 2 || segEnd > bytes.length) {
      out.findings.push(fail("JPEG_TRUNCATED", `segment 0x${marker.toString(16)} runs past the end`));
      return out;
    }
    const seg = bytes.subarray(offset + 4, segEnd);
    if (marker === 0xe0 && seg.toString("latin1", 0, 5) === "JFIF\0") {
      // JFIF header: resolution and at most a raw RGB thumbnail. (JFXX thumbnails, which can
      // hold a whole JPEG with EXIF, are refused below.)
    } else if (marker === 0xe2 && seg.toString("latin1", 0, 12) === "ICC_PROFILE\0" && seg.length > 14) {
      // A colour profile, possibly split over several segments: checked once reassembled.
      iccChunks.push({ seq: seg[12], data: seg.subarray(14) });
    } else if (marker === 0xee && seg.toString("latin1", 0, 5) === "Adobe") {
      // Adobe colour transform flag: always exactly 12 bytes.
      if (seg.length !== 12) out.findings.push(fail("JPEG_METADATA_SEGMENT", `an Adobe segment of ${seg.length} bytes instead of 12`));
    } else if (marker === 0xe1 && seg.subarray(0, 6).equals(Buffer.from("Exif\0\0", "latin1"))) {
      out.findings.push(...exifFindings(seg.subarray(6)));
    } else if (marker === 0xe1 && seg.toString("latin1", 0, 29) === "http://ns.adobe.com/xap/1.0/\0") {
      out.findings.push(...xmpFindings(seg.toString("utf8", 29)).map((f) => ({ ...f, level: "FAIL" })));
    } else if (JPEG_SOF.has(marker)) {
      if (seg.length >= 5) {
        out.height = seg.readUInt16BE(1);
        out.width = seg.readUInt16BE(3);
      }
    } else if (JPEG_TABLES.has(marker)) {
      // Huffman, arithmetic, quantisation and restart tables.
    } else if (marker === 0xda) {
      // Start of scan: skip the entropy-coded data up to the next real marker.
      let i = segEnd;
      while (i + 1 < bytes.length && !(bytes[i] === 0xff && bytes[i + 1] !== 0x00 && !(bytes[i + 1] >= 0xd0 && bytes[i + 1] <= 0xd7))) i += 1;
      offset = i;
      continue;
    } else {
      out.findings.push(fail("JPEG_METADATA_SEGMENT", `segment 0x${marker.toString(16)} is not allowed in evidence (only pixel and colour segments are)`));
    }
    offset = segEnd;
  }
  if (!sawEnd) out.findings.push(fail("JPEG_TRUNCATED", "no end-of-image marker"));
  else if (offset < bytes.length) out.findings.push(fail("DATA_AFTER_END", `${bytes.length - offset} bytes follow the end of the image`));
  if (iccChunks.length) out.findings.push(...iccFindings(Buffer.concat(iccChunks.sort((a, b) => a.seq - b.seq).map((c) => c.data))));
  return out;
}

/** Media type, dimensions and findings for an evidence file. A FAIL finding blocks PASS. */
export function scanImage(bytes) {
  if (!Buffer.isBuffer(bytes)) bytes = Buffer.from(bytes);
  let result;
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(PNG_SIGNATURE)) result = scanPng(bytes);
  else if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) result = scanJpeg(bytes);
  else return { mediaType: null, width: null, height: null, findings: [fail("UNSUPPORTED_TYPE", "evidence must be a PNG or JPEG file")] };
  if (bytes.length > MAX_EVIDENCE_BYTES) result.findings.push(fail("TOO_LARGE", `file is larger than ${MAX_EVIDENCE_BYTES} bytes`));
  if (!result.width || !result.height) result.findings.push(fail("NO_DIMENSIONS", "image dimensions could not be read"));
  else if (Math.min(result.width, result.height) < MIN_EVIDENCE_SHORT_SIDE)
    result.findings.push(fail("TOO_SMALL", `shorter side is below ${MIN_EVIDENCE_SHORT_SIDE} pixels`));
  return result;
}

/** Findings that concern the file's shape rather than its metadata. */
export const SHAPE_FINDINGS = new Set(["UNSUPPORTED_TYPE", "TOO_LARGE", "NO_DIMENSIONS", "TOO_SMALL", "PNG_TRUNCATED", "JPEG_MALFORMED", "JPEG_TRUNCATED"]);
