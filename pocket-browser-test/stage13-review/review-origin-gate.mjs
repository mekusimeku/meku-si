/**
 * MEKU Pocket Stage 13: ORIGIN-BOUND, VIEW-ONLY transfer request gate.
 *
 * No wallet keys, signature APIs, signing permissions, approved-transaction
 * tokens, RPC or payment code. This is not production authentication.
 * Only an independently trusted signer screen could show this public preview.
 * The signer must use an independently decoded transaction and require a NEW
 * direct user approval; receiving a preview is NEVER authorization to sign.
 */
import { createTransferIntent, PocketTransferError } from './transfer-preflight.mjs';

const SOL_KEYS = Object.freeze(['network', 'asset', 'requestId', 'owner', 'recipient', 'amount']);
const MEKU_KEYS = Object.freeze([...SOL_KEYS, 'mint', 'programId', 'decimals']);
const ENVELOPE_KEYS = Object.freeze(['type', 'version', 'issuedAt', 'intent']);
const TYPE = 'MEKU_POCKET_PREVIEW_REQUEST_V1';
const BASE_URL = /^https:\/\/[a-z0-9][a-z0-9.-]*?(?::443)?$/;
const MAX_AGE_MS = 60_000;
const MAX_SEEN_REQUESTS = 128; // Fail closed before a hostile sender consumes unbounded memory.
const FUTURE_TOLERANCE_MS = 5_000;

export class ReviewBoundaryError extends Error {
  constructor(code) { super(code); this.name = 'ReviewBoundaryError'; this.code = code; }
}
const deny = code => { throw new ReviewBoundaryError(code); };

function plainRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  if (Object.getOwnPropertySymbols(value).length !== 0) return false;
  return Reflect.ownKeys(value).every(k => {
    const d = Object.getOwnPropertyDescriptor(value, k);
    return typeof k === 'string' && d && Object.hasOwn(d, 'value');
  });
}
function exactKeys(value, allow) {
  if (!plainRecord(value)) return false;
  const keys = Object.keys(value);
  return keys.length === allow.length && keys.every(k => allow.includes(k)) && allow.every(k => Object.hasOwn(value, k));
}
function trimApprovedOrigin(origin) {
  if (typeof origin !== 'string' || !BASE_URL.test(origin) || /\.{2}|\.\-|\-\./.test(origin))
    deny('INVALID_TRUSTED_ORIGIN');
  return origin;
}
function nonce16() {
  if (!globalThis.crypto?.getRandomValues) deny('SECURE_RANDOM_UNAVAILABLE');
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Caller must pass the actual `MessageEvent`, NOT a serialized imitation.
 * trustedRequestOrigin is a build-time verified origin, NEVER from a message.
 * expectedSource is the exact WindowProxy of a known opener / parent.
 * No fallback origin or source allowed. `clock` injection ONLY for tests.
 */
export function createPreviewOnlyGate({trustedRequestOrigin, expectedSource, clock = Date.now} = {}) {
  const trusted = trimApprovedOrigin(trustedRequestOrigin);
  if (!expectedSource || !['object', 'function'].includes(typeof expectedSource) || typeof clock !== 'function')
    deny('INVALID_BOUNDARY_CONFIG');
  const seen = new Set();
  let stopped = false;
  let current = null; // { preview, issuedAt }; never a signing or approval credential.

  // The caller must refresh the displayed review from getPreview() before any user action.
  // This cannot by itself dismiss a static UI that never calls us again.
  function clearStalePreview() {
    if (!current) return;
    const now = clock();
    if (!Number.isSafeInteger(now) || now - current.issuedAt > MAX_AGE_MS) current = null;
  }

  function accept(event) {
    if (stopped) deny('STOP_ACTIVE');
    clearStalePreview();
    if (current) deny('REVIEW_IN_PROGRESS');
    if (!event || event.origin !== trusted || event.source !== expectedSource)
      deny('UNTRUSTED_MESSAGE_SOURCE');
    const data = event.data;
    if (!exactKeys(data, ENVELOPE_KEYS)) deny('UNEXPECTED_MESSAGE_FIELDS');
    if (data.type !== TYPE || data.version !== 1) deny('UNSUPPORTED_MESSAGE_PROTOCOL');
    const now = clock();
    if (!Number.isSafeInteger(now) || !Number.isSafeInteger(data.issuedAt) ||
        data.issuedAt < 0 || data.issuedAt > now + FUTURE_TOLERANCE_MS || now - data.issuedAt > MAX_AGE_MS)
      deny('EXPIRED_OR_INVALID_REQUEST_TIME');
    const draft = data.intent;
    // Reject accessors before reading asset; a fake direct-call event may contain getters.
    if (!plainRecord(draft)) deny('UNEXPECTED_INTENT_FIELDS');
    const expected = draft.asset === 'MEKU SI' ? MEKU_KEYS : SOL_KEYS;
    if (!exactKeys(draft, expected)) deny('UNEXPECTED_INTENT_FIELDS');
    let intent;
    try { intent = createTransferIntent(draft); }
    catch (error) { deny(error instanceof PocketTransferError ? error.code : 'INVALID_INTENT'); }
    if (seen.has(intent.requestId)) deny('DUPLICATE_REQUEST');
    if (seen.size >= MAX_SEEN_REQUESTS) deny('SESSION_REQUEST_LIMIT');
    const nonce = nonce16();
    const preview = Object.freeze({
      status: 'REVIEW_ONLY_NO_AUTHORITY',
      requestId: intent.requestId,
      owner: intent.owner, recipient: intent.recipient, asset: intent.asset,
      amount: intent.amount, baseUnits: intent.baseUnits,
      decimals: intent.decimals, network: intent.network,
      mint: intent.mint, programId: intent.programId,
      nonce, // UI session marker, NOT a signing challenge or authorization token.
    });
    seen.add(intent.requestId);
    current = { preview, issuedAt: data.issuedAt };
    return structuredClone(preview);
  }
  function dismiss() { current = null; return 'DISMISSED_NO_APPROVAL'; }
  function stop() { current = null; stopped = true; return 'STOPPED_NO_SIGNING'; }
  function getPreview() { clearStalePreview(); return current ? structuredClone(current.preview) : null; }
  return Object.freeze({ accept, dismiss, stop, getPreview });
}
