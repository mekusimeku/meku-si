/** Stage 18: published-package inspection ONLY. Not a signing library or release approval. */
import { createHash, timingSafeEqual } from 'node:crypto';

export const targets = Object.freeze([
  { name: '@scure/bip39', version: '2.4.0', deps: { '@noble/hashes': '2.4.0' } },
  { name: '@noble/curves', version: '2.4.0', deps: { '@noble/hashes': '2.4.0' } },
  { name: '@noble/hashes', version: '2.4.0', deps: {} },
]);
const forbiddenScripts = ['preinstall', 'install', 'postinstall', 'prepare', 'prepack', 'postpack'];
function fail(message) { throw new Error(`FAIL_CLOSED: ${message}`); }
function record(v) { return v && typeof v === 'object' && !Array.isArray(v); }
function exactMap(actual, expected) {
  if (!record(actual) || Object.keys(actual).length !== Object.keys(expected).length) return false;
  return Object.entries(expected).every(([key, value]) => actual[key] === value);
}
export function checkManifest(manifest, target) {
  if (!record(manifest) || manifest.name !== target.name || manifest.version !== target.version) fail('wrong published package identity');
  if (!exactMap(manifest.dependencies ?? {}, target.deps)) fail(`${target.name} unexpected runtime dependency`);
  if (forbiddenScripts.some(script => Object.hasOwn(manifest.scripts ?? {}, script))) fail(`${target.name} lifecycle script present`);
  if (!record(manifest.exports)) fail(`${target.name} exports missing`);
  return true;
}
export function checkIntegrity(buffer, integrity) {
  if (!Buffer.isBuffer(buffer) || typeof integrity !== 'string' || !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(integrity)) fail('invalid integrity data');
  const expected = Buffer.from(integrity.slice(7), 'base64');
  const calculated = createHash('sha512').update(buffer).digest();
  if (expected.length !== 64 || !timingSafeEqual(calculated, expected)) fail('published tarball did not match registry SHA512');
  return calculated.toString('hex');
}
export function checkLockfile(lock, metadata) {
  if (!record(lock) || lock.lockfileVersion !== 3 || !record(lock.packages)) fail('invalid npm v3 lockfile');
  const paths = Object.keys(lock.packages).sort();
  const accepted = ['', ...targets.map(t => `node_modules/${t.name}`)].sort();
  if (JSON.stringify(paths) !== JSON.stringify(accepted)) fail('unexpected transitive package in lockfile');
  const root = lock.packages[''];
  if (!record(root) || !exactMap(root.dependencies, Object.fromEntries(targets.map(t => [t.name, t.version])))) fail('wrong lockfile root dependencies');
  for (const t of targets) {
    const item = lock.packages[`node_modules/${t.name}`];
    if (!record(item) || item.version !== t.version || item.integrity !== metadata[t.name]) fail(`wrong locked artifact for ${t.name}`);
    if (!exactMap(item.dependencies ?? {}, t.deps)) fail(`wrong locked dependency for ${t.name}`);
    if (typeof item.resolved !== 'string' || !item.resolved.startsWith('https://registry.npmjs.org/')) fail('untrusted lockfile registry URL');
  }
  return true;
}
