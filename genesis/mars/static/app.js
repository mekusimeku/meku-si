const $ = id => document.getElementById(id);
const esc = value => String(value ?? 'missing').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let current = null;
let selected = 'ARES';
let busy = false;

async function request(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

function notice(message, ok = false) {
  $('notice').textContent = message;
  $('notice').className = ok ? 'notice ok' : 'notice';
}

async function action(command, extra = {}) {
  if (busy) return;
  if (command === 'reset' && !confirm('Reset the local simulation and delete its three local settlement databases?')) return;
  busy = true;
  try {
    current = await request('/api/action', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({command,...extra})});
    notice(`${command.replace('_', ' ')} recorded in the local simulation.`, true);
    render();
  } catch (error) { notice(error.message); }
  finally { busy = false; }
}

function resource(name, s) {
  const map = {water:'Water',oxygen:'Oxygen',food:'Food',energy:'Power'};
  return `<div><div class="res-label">${map[name]}</div><div class="res-value">${esc(s.resources[name])}<small>${esc(s.units[name])}</small></div></div>`;
}

function renderCards() {
  $('settlements').innerHTML = Object.values(current.settlements).map(s => `<button class="settlement-card ${s.name === selected ? 'active' : ''}" data-select="${s.name}" aria-pressed="${s.name === selected}">
    <div class="card-top"><span class="card-name">${s.name}</span><span class="tag ${s.online ? '' : 'red'}">${s.online ? 'LINK ONLINE' : 'BLACKOUT'}</span></div>
    <div class="card-focus">${esc(s.focus)}</div><div class="resource-grid">${['water','oxygen','food','energy'].map(k => resource(k,s)).join('')}</div>
    <div class="card-foot"><span>${s.alerts.length} alert${s.alerts.length === 1 ? '' : 's'}</span><span>${s.tasks.filter(t => t.status === 'pending').length} pending tasks</span></div></button>`).join('');
}

function evidence(e) {
  if (!e.body) return `<div class="entry"><strong>Evidence missing</strong><p>ID ${esc(e.id)}</p></div>`;
  const b = e.body;
  return `<div class="entry"><div class="card-top"><strong>${esc(e.topic)}</strong><span class="tag ${e.status === 'disputed' ? 'red' : ''}">${esc(e.status)}</span></div>
    <p><b>${esc(b.value)} ${esc(b.unit)}</b> · ${esc(b.source)} · ${esc(b.location)} · step ${esc(b.timestamp_step)}</p>
    <div class="meta">ID ${esc(e.id)} · ${b.simulated ? 'SIMULATED' : 'SOURCE UNKNOWN'}</div>
    <div class="meta">Uncertainty: ${esc(b.uncertainty)} · Verification method: ${esc(b.verification_method)}</div>
    <div class="meta">Supporting: ${esc((b.supports || []).join(', ') || 'none')} · Conflicting: ${esc((b.conflicts || []).join(', ') || 'none')}</div></div>`;
}

function task(t, name) {
  const decided = new Set(t.approvals.map(a => a.role));
  const nextRole = !decided.has(t.role) ? t.role : t.high_risk && !decided.has('safety-officer') ? 'safety-officer' : null;
  const decisionButtons = t.status === 'pending' && nextRole ? `<div class="entry-actions"><button data-command="decision" data-settlement="${name}" data-task="${esc(t.id)}" data-role="${esc(nextRole)}" data-decision="approve">Approve as ${esc(nextRole)}</button><button class="danger" data-command="decision" data-settlement="${name}" data-task="${esc(t.id)}" data-role="${esc(nextRole)}" data-decision="refuse">Refuse as ${esc(nextRole)}</button></div>` : t.status === 'approved' ? `<div class="entry-actions"><button class="primary" data-command="execute" data-settlement="${name}" data-task="${esc(t.id)}">Run simulated action</button></div>` : '';
  return `<article class="entry"><div class="card-top"><strong>${esc(t.action)}</strong><span class="tag ${t.status === 'refused' ? 'red' : 'orange'}">${esc(t.status)}</span></div>
    <p>${esc(t.reason)}</p><div class="meta">Required role: ${esc(t.role)}${t.high_risk ? ' + safety officer' : ''} · Task ${esc(t.id)}</div>
    <div class="meta">Human decisions: ${esc(t.approvals.map(a => `${a.role}: ${a.decision} (${a.actor})`).join('; ') || 'none yet')}</div>
    <details><summary>Supporting evidence (${t.evidence.length})</summary>${t.evidence.map(evidence).join('')}</details>${decisionButtons}</article>`;
}

function message(m, direction, pending = false) {
  const kind = m.payload?.type || 'unknown';
  return `<div class="entry"><div class="card-top"><strong>${esc(m.from)} → ${esc(m.to)}</strong><span class="tag">${esc(kind)}</span></div>
    <p>${direction === 'incoming' ? 'Verified signed envelope, recorded in inbox' : pending ? `Signed envelope, queued for step ${esc(m.due)}` : 'Signed envelope, delivered'}</p>
    <div class="meta">Message ${esc(m.id)} · sequence ${esc(m.seq)}</div><div class="signature">Signature ${esc((m.signature || '').slice(0,32))}…</div></div>`;
}

function pack(p, name) {
  const b = p.body;
  return `<div class="entry"><div class="card-top"><strong>${esc(b.content.topic)}</strong><span class="tag ${p.status === 'rejected' ? 'red' : 'orange'}">${esc(p.status)}</span></div>
    <p>${esc(b.content.method)}</p><div class="meta">From ${esc(b.origin)} · version ${esc(b.version)} · ${esc(b.content.verification)}</div>
    <div class="signature">Package ${esc(p.id)} · signature ${esc((b.signature || '').slice(0,32))}…</div>
    ${p.status === 'quarantined' ? `<div class="entry-actions"><button data-command="package_review" data-settlement="${name}" data-package="${esc(p.id)}" data-decision="accept">Accept as verifier</button><button class="danger" data-command="package_review" data-settlement="${name}" data-package="${esc(p.id)}" data-decision="reject">Reject</button></div>` : ''}</div>`;
}

function event(row) {
  let body;
  try { body = JSON.parse(row.body); } catch { body = row.body; }
  return `<details class="entry"><summary><strong>${esc(row.kind.replaceAll('-', ' '))}</strong> <span class="muted">#${esc(row.seq)}</span></summary>
    <p class="meta">${esc(JSON.stringify(body))}</p><div class="signature">Record hash ${esc(row.hash)}</div></details>`;
}

function renderDetail() {
  const s = current.settlements[selected];
  $('detail').innerHTML = `<div class="section-heading"><div><p class="eyebrow">SETTLEMENT RECORD</p><h2>${esc(selected)} control</h2></div><span class="tag">EVENT LOG ${s.log_valid ? 'VALID' : 'FAILED'}</span></div>
    <div class="tabs">${Object.keys(current.settlements).map(n => `<button class="${n === selected ? 'active' : ''}" data-select="${n}">${n}</button>`).join('')}</div>
    <div class="subpanel"><h3>Inject a simulated incident</h3><div class="inject-controls"><button data-command="sensor_failure" data-settlement="${selected}">Sensor failure</button><button data-command="blackout" data-settlement="${selected}">${s.online ? 'Start blackout' : 'End blackout'}</button><select id="resource-choice" aria-label="Resource for shortage">${Object.keys(s.resources).map(k => `<option value="${k}">${k.replace('_',' ')} (${s.units[k]})</option>`).join('')}</select><button data-command="shortage" data-settlement="${selected}">Resource shortage</button></div><p class="hint">These controls change only local simulated records. A shortage records an external loss; it is never an approved allocation.</p></div>
    <div class="detail-grid section"><div class="stack"><div class="subpanel"><h3>Alerts & tasks</h3>${s.alerts.map(a => `<div class="alert">${esc(a)}</div>`).join('') || '<p class="muted">No active alerts.</p>'}<div class="stack">${s.tasks.map(t => task(t,selected)).join('') || '<p class="muted">No tasks recorded.</p>'}</div></div>
    <div class="subpanel"><h3>Evidence history</h3><div class="stack">${s.evidence.map(evidence).join('') || '<p class="muted">No evidence recorded.</p>'}</div></div></div>
    <div class="stack"><div class="subpanel"><h3>Messages</h3><p class="muted">${s.online ? 'Link online' : 'Link offline'} · ${s.outgoing.filter(m => !m.delivered).length} pending outgoing</p><div class="stack">${s.outgoing.map(m => message(m,'outgoing',!m.delivered)).join('')}${s.incoming.map(m => message(m,'incoming')).join('') || (s.outgoing.length ? '' : '<p class="muted">No messages recorded.</p>')}</div></div>
    <div class="subpanel"><h3>Shared knowledge</h3><div class="stack">${s.packages.map(p => pack(p,selected)).join('') || '<p class="muted">No packages received.</p>'}</div></div>
    <div class="subpanel"><h3>Resource stock</h3><div class="scroll"><table><thead><tr><th>Resource</th><th>Available</th><th>Unit</th></tr></thead><tbody>${Object.entries(s.resources).map(([k,v]) => `<tr><td>${esc(k.replace('_',' '))}</td><td>${esc(v)}</td><td>${esc(s.units[k])}</td></tr>`).join('')}</tbody></table></div></div>
    <div class="subpanel"><h3>Event trail</h3><div class="stack">${s.events.map(event).join('') || '<p class="muted">No events.</p>'}</div></div></div></div>`;
}

function render() {
  if (!current) return;
  $('clock').textContent = current.clock;
  $('clock-state').textContent = current.running ? 'Running · 1 step / second' : 'Paused';
  $('top-status').textContent = current.running ? '● SIMULATION RUNNING' : '○ SIMULATION PAUSED';
  $('pending-count').textContent = `${current.pending_messages} MESSAGES QUEUED`;
  renderCards();
  if (document.activeElement?.tagName !== 'SELECT') renderDetail();
}

async function loadState() {
  if (busy) return;
  try { current = await request('/api/state'); render(); }
  catch (error) { $('top-status').textContent = 'SERVER UNAVAILABLE'; notice(error.message); }
}

document.addEventListener('click', async e => {
  const select = e.target.closest('[data-select]');
  if (select) { selected = select.dataset.select; render(); return; }
  const button = e.target.closest('[data-command]');
  if (!button) return;
  const {command, settlement, task, role, decision, package:pkg} = button.dataset;
  await action(command, {settlement,task,role,decision,package:pkg,resource:$('resource-choice')?.value});
});

$('run-benchmark').addEventListener('click', async () => {
  $('benchmark-results').textContent = 'Running paired simulations…';
  try {
    const data = await request('/api/benchmark');
    const scenarios = ['transferable','unrelated','poisoned'];
    $('benchmark-results').innerHTML = `<div class="scroll"><table><thead><tr><th>Scenario</th><th>Isolated fault step</th><th>Cooperative fault step</th><th>Change</th><th>Messages</th></tr></thead><tbody>${scenarios.map(s => {
      const rows = data.pairs.filter(x => x.scenario === s);
      const avg = fn => (rows.reduce((n,r) => n + fn(r),0)/rows.length).toFixed(1);
      const delta = avg(r => r.fault_step_delta);
      return `<tr><td>${s}</td><td>${avg(r => r.isolated.fault_step)}</td><td>${avg(r => r.cooperative.fault_step)}</td><td class="${Number(delta)<0?'good':Number(delta)>0?'bad':''}">${Number(delta)>0?'+':''}${delta} steps</td><td>${avg(r => r.cooperative.messages_sent)}</td></tr>`;
    }).join('')}</tbody></table></div><p class="hint">${data.pairs.length} paired runs, seeds ${[...new Set(data.pairs.map(p => p.seed))].join(', ')}. Negative change is faster. A valid signature does not make a bad note true.</p>`;
  } catch (error) { $('benchmark-results').textContent = error.message; }
});

loadState();
setInterval(loadState, 2000);
