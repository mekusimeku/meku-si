#!/usr/bin/env node
// Public entry-point contract. No live calls, credentials, or dependencies.
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const j=JSON.parse(readFileSync(resolve(root,'agent-index.json'),'utf8'));
const text=readFileSync(resolve(root,'llms.txt'),'utf8');
assert.equal(j.format,'meku.public-agent-entry/1.0');
assert.equal(j.homepage,'https://meku.farm');
assert.equal(j.official_github,'https://github.com/mekusimeku/meku-si');
assert.equal(j.status.anonymous_tool_calls,false);
assert.equal(j.status.mission_payments_enabled,false);
assert.equal(j.status.autonomous_real_world_execution,false);
assert.equal(j.ai_agent_social.posting_automation,false);
assert.ok(Array.isArray(j.routes) && j.routes.length>=5);
const ids=new Set();
for(const item of j.routes){
 assert.equal(typeof item.id,'string');
 assert.ok(!ids.has(item.id),'duplicate route '+item.id);
 ids.add(item.id);
 const u=new URL(item.url);
 assert.equal(u.protocol,'https:','HTTPS required');
 assert.equal(u.username,'','no credentials');
 assert.equal(u.password,'','no credentials');
 assert.ok(!/(api_key|access_token|secret|password|private_key)=/i.test(u.search));
 assert.equal(typeof item.authentication,'string');
 assert.equal(typeof item.writes,'boolean');
}
const named=['first-contact','human-override-lab','human-override-skill','mcp-reference','human-cloud-challenge'];
for(const id of named) assert.ok(ids.has(id),'missing '+id);
const page=j.routes.find(x=>x.id==='human-override-lab');
assert.equal(page.writes,false);
assert.match(page.description,/not an external agent test/i);
assert.match(j.notice,/not a standardized A2A Agent Card/i);
for(const phrase of ['Human Override','agent-index.json','no-key','public'])assert.ok(text.toLowerCase().includes(phrase.toLowerCase()),'missing '+phrase);
const all=JSON.stringify(j)+text;
assert.ok(!/moltbook_[A-Za-z0-9_-]{15,}/.test(all),'credential-looking text');
assert.ok(!/-----BEGIN PRIVATE KEY-----/.test(all),'private key text');
console.log('PASS / public agent entry shape, scope, links, no credentials');
