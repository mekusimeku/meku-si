// Stage 12: tests the existing Stage 11 disposable browser page.
// Basic static review only. NOT a wallet audit or independent-device acceptance.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const file = process.env.STAGE11_TEST_HTML || resolve(import.meta.dirname, 'iphone-disposable-seed-recovery-stage11.html');
const html = readFileSync(file, 'utf8');
const inlineScripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/ig)].map(x => x[1]);
const executable = inlineScripts.join('\n').replace(/const WORDLIST_STRING="(?:[^"\\]|\\.)*";/s, 'const WORDLIST_STRING="REDACTED";');
test('self-contained single inline test script, no external scripts or forms', () => {
  assert.equal(inlineScripts.length, 1);
  assert.doesNotMatch(html, /<script\b[^>]*\bsrc\s*=/i);
  assert.doesNotMatch(html, /<iframe\b|<form\b/i);
});
test('test CSP blocks network connections', () => {
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /default-src 'none'/);
  assert.match(html, /form-action 'none'/);
});
test('no deliberate network APIs in executable script', () => {
  assert.doesNotMatch(executable, /\b(fetch\s*\(|XMLHttpRequest\b|WebSocket\b|EventSource\b|sendBeacon\s*\(|importScripts\s*\(|serviceWorker\b|navigator\.share\b)/);
  assert.doesNotMatch(executable, /\bimport\s*\(/);
});
test('no deliberate persistent browser storage APIs', () => {
  assert.doesNotMatch(executable, /\b(localStorage|sessionStorage|indexedDB|caches\s*\.|cookie\s*=)/);
});
test('real-wallet warning and test-only fixed signature message', () => {
  assert.match(html, /NEVER enter words from an actual wallet/);
  assert.match(executable, /TEST_ONLY_MESSAGE\s*=\s*'MEKU POCKET STAGE 10 PUBLIC DIAGNOSTIC - NO FUNDS'/);
  assert.match(html, /No funds\. No real phrases\./);
});
test('result output uses textContent, not innerHTML', () => {
  assert.match(executable, /\$\('restore-status'\)\.textContent=/);
  assert.match(executable, /\$\('restore-address'\)\.textContent=/);
  assert.doesNotMatch(executable, /\.innerHTML\s*=/);
});
