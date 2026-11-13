/** MEKU Pocket Stage 17 — TEST ONLY authenticated owner boundary.
 * HMAC JWTs in these fixtures are NOT Pocket's real identity provider.
 * This never signs, approves, creates or broadcasts any transaction.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export class AuthFailure extends Error {
  constructor(code) { super(code); this.name = 'AuthFailure'; this.code = code; }
}
function reject(code) { throw new AuthFailure(code); }
const b64url = /^[A-Za-z0-9_-]+$/;
function decode(segment) {
  if (!b64url.test(segment) || segment.length > 4096) reject('BAD_TOKEN');
  const buf = Buffer.from(segment, 'base64url');
  if (!buf.length || buf.toString('base64url') !== segment) reject('BAD_TOKEN');
  try {
    const value = JSON.parse(buf.toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) reject('BAD_TOKEN');
    return value;
  } catch { reject('BAD_TOKEN'); }
}
function exactKeys(obj, names) {
  const keys = Object.keys(obj).sort();
  return keys.length === names.length && keys.every((s, i) => s === [...names].sort()[i]);
}
export function verifyFixtureJwt(token, { secret, issuer, audience, nowSec }) {
  if (!Buffer.isBuffer(secret) || secret.length < 32) reject('INVALID_SERVER_SETUP');
  if (typeof issuer !== 'string' || !issuer || typeof audience !== 'string' || !audience || !Number.isSafeInteger(nowSec)) reject('INVALID_SERVER_SETUP');
  if (typeof token !== 'string' || token.length > 4096) reject('BAD_TOKEN');
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some(x => !b64url.test(x))) reject('BAD_TOKEN');
  const header = decode(parts[0]);
  if (!exactKeys(header, ['alg','typ']) || header.alg !== 'HS256' || header.typ !== 'JWT') reject('BAD_HEADER');
  const payload = decode(parts[1]);
  if (!exactKeys(payload, ['iss','aud','sub','iat','nbf','exp','jti'])) reject('BAD_CLAIMS');
  const expected = createHmac('sha256',secret).update(parts[0]+'.'+parts[1]).digest();
  const provided = Buffer.from(parts[2], 'base64url');
  if (provided.length !== expected.length || provided.toString('base64url') !== parts[2] || !timingSafeEqual(expected,provided)) reject('BAD_SIGNATURE');
  if (payload.iss !== issuer || payload.aud !== audience) reject('WRONG_ISSUER_OR_AUDIENCE');
  if (typeof payload.sub !== 'string' || !/^[A-Za-z0-9:_-]{3,128}$/.test(payload.sub)) reject('BAD_SUBJECT');
  if (typeof payload.jti !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(payload.jti)) reject('BAD_JTI');
  if (![payload.iat,payload.nbf,payload.exp].every(Number.isSafeInteger)) reject('BAD_TIME');
  if (payload.iat > nowSec || payload.nbf > nowSec || payload.exp <= nowSec) reject('EXPIRED_OR_NOT_YET_VALID');
  if (payload.exp <= payload.iat || payload.exp - payload.iat > 60 || payload.nbf < payload.iat) reject('BAD_TOKEN_LIFETIME');
  return { subject: payload.sub, tokenId: payload.jti };
}
export function createFixtureGateway({ secret, issuer, audience, nowSec, ownerForSubject, db }) {
  if (typeof ownerForSubject !== 'function' || !db || !['claim','stop','status'].every(k => typeof db[k] === 'function')) reject('INVALID_SERVER_SETUP');
  function identity(request) {
    if (!request || typeof request !== 'object' || Array.isArray(request)) reject('BAD_REQUEST');
    // Never accept an owner key in user-supplied request data.
    if (Object.keys(request).some(k => !['authorization','requestKey','action'].includes(k))) reject('UNSUPPORTED_FIELD');
    if (typeof request.authorization !== 'string' || !request.authorization.startsWith('Bearer ')) reject('MISSING_AUTH');
    const token = request.authorization.slice(7);
    const verified = verifyFixtureJwt(token, { secret, issuer, audience, nowSec: nowSec() });
    const owner = ownerForSubject(verified.subject);
    if (typeof owner !== 'string' || !/^[A-Za-z0-9_-]{4,80}$/.test(owner)) reject('UNBOUND_SUBJECT');
    return owner;
  }
  async function handle(request) {
    const owner = identity(request);
    if (!['claim','stop','status'].includes(request.action)) reject('UNSUPPORTED_ACTION');
    if (request.action === 'stop') {
      if ('requestKey' in request) reject('UNSUPPORTED_FIELD');
      return db.stop(owner);
    }
    if (typeof request.requestKey !== 'string' || !/^[A-Za-z0-9_-]{12,100}$/.test(request.requestKey)) reject('BAD_REQUEST_KEY');
    if (request.action === 'claim') return db.claim(owner, request.requestKey);
    return db.status(owner, request.requestKey);
  }
  return Object.freeze({ handle });
}
