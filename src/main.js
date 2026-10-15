import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { createVerse } from './verse.js';

const statusEl = document.getElementById('status');
const pathEl = document.getElementById('path');
const sideEl = document.getElementById('side');
const logEl = document.getElementById('log');
const canvas = document.getElementById('g');
const flightBtn = document.getElementById('flight');

let folder = null;
let graph = { nodes: [], edges: [] };
let focus = null;
let highlight = new Set();
let hits = [];
let lastStatus = null;

const verse = createVerse(canvas, {
  onSelect(id) {
    focus = id;
    highlight = new Set([id]);
    verse.setFocus(id);
    verse.setHighlight(highlight);
    document.getElementById('hop').disabled = !folder;
    document.getElementById('blast').disabled = !folder;
    log(`focus ${id}`);
    showDetail(id);
  },
});
verse.attachHud(document.getElementById('mpcHud'));

function log(msg) {
  logEl.textContent = msg;
}

let waiting = false;
let waitLabelText = '';
let waitT0 = 0;
let waitTimer = null;

function setWaitLabel(label) {
  waitLabelText = label;
}

function beginWait(label) {
  waiting = true;
  waitLabelText = label;
  if (!waitT0) waitT0 = Date.now();
  const tick = () => {
    const s = Math.floor((Date.now() - waitT0) / 1000);
    statusEl.className = 'wait';
    statusEl.innerHTML = `<span class="spin"></span>${escapeHtml(waitLabelText)} ${s}s`;
  };
  tick();
  clearInterval(waitTimer);
  waitTimer = setInterval(tick, 250);
}

function endWait() {
  waiting = false;
  waitT0 = 0;
  clearInterval(waitTimer);
  waitTimer = null;
  if (lastStatus) paintStatus(lastStatus);
}

function paintStatus(h) {
  lastStatus = h;
  const ep = h.endpoint ? ' · endpoint ●' : ' · endpoint ○';
  const line = `qdrant ${h.qdrant ? '●' : '○'}:${h.qdrant_port}  embed ${h.embed ? '●' : '○'}:${h.embed_port}  ${h.embed_model} ${h.embed_dims || '?'}d  ${h.collection} ${h.crystal_points}${ep}`;
  if (waiting) return;
  statusEl.textContent = h.error ? `${line}  · ${h.error}` : line;
  const starting = h.error === 'starting local engines…';
  statusEl.className = h.qdrant && h.embed ? 'ok' : starting ? 'wait' : 'bad';
  document.getElementById('nowQ').textContent = String(h.qdrant_port);
  document.getElementById('nowE').textContent = String(h.embed_port);
  const canChat = !!(h.endpoint && folder);
  document.getElementById('chatq').disabled = !canChat;
  document.getElementById('ask').disabled = !canChat;
}

function setReady(on) {
  document.getElementById('ingest').disabled = !on;
  document.getElementById('q').disabled = !on;
  document.getElementById('go').disabled = !on;
  const canChat = !!(on && lastStatus?.endpoint);
  document.getElementById('chatq').disabled = !canChat;
  document.getElementById('ask').disabled = !canChat;
}

const session = [];

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderMd(src) {
  let s = escapeHtml(src);
  s = s.replace(/^### (.+)$/gm, '<h4>$1</h4>');
  s = s.replace(/^## (.+)$/gm, '<h3>$1</h3>');
  s = s.replace(/^# (.+)$/gm, '<h3>$1</h3>');
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/^\* (.+)$/gm, '<li>$1</li>');
  s = s.replace(/((?:<li>[\s\S]*?<\/li>\s*)+)/g, '<ul>$1</ul>');
  s = s.replace(/\n{2,}/g, '<br><br>');
  s = s.replace(/\n/g, '<br>');
  return `<div class="md">${s}</div>`;
}

function chips(ids) {
  return (ids || [])
    .map((id) => `<button class="chip" type="button" data-node="${escapeHtml(id)}">${escapeHtml(id)}</button>`)
    .join('');
}

function pushCard(title, plain, extraHtml) {
  session.push({ title, plain, extraHtml: extraHtml || '' });
  renderSession();
  const last = sideEl.lastElementChild;
  if (last) last.scrollIntoView({ block: 'end' });
}

function renderSession() {
  if (!session.length) {
    sideEl.textContent = 'Pick a folder of notes or code.';
    return;
  }
  sideEl.innerHTML = session
    .map(
      (card, i) => `<div class="hit"><div class="top"><b>${escapeHtml(card.title)}</b><button class="iconmini" type="button" data-copy="${i}" title="Copy">⧉</button></div>${card.extraHtml || renderMd(card.plain)}</div>`,
    )
    .join('');
}

function censusText(census) {
  return [
    `markdown ${census.markdown}`,
    `code ${census.code}`,
    `pdf ${census.pdf}`,
    `html ${census.html}`,
    `text ${census.text}`,
    `image ${census.image} (graph only, no OCR)`,
    `office ${census.office} (not ingested)`,
    `skipped ${census.skipped}`,
    census.truncated ? 'truncated' : '',
    ...(census.samples || []),
  ]
    .filter((x) => x !== '')
    .join('\n');
}

function selectNode(id) {
  focus = id;
  highlight = new Set([id]);
  verse.setFocus(id);
  verse.setHighlight(highlight);
  document.getElementById('hop').disabled = !folder;
  document.getElementById('blast').disabled = !folder;
  showDetail(id);
}

sideEl.addEventListener('click', (e) => {
  const node = e.target.closest('[data-node]');
  if (node) {
    selectNode(node.dataset.node);
    return;
  }
  const copy = e.target.closest('[data-copy]');
  if (!copy) return;
  const text = session[Number(copy.dataset.copy)]?.plain || '';
  navigator.clipboard.writeText(text).then(() => log('copied'));
});

function sessionMarkdown() {
  return session.map((c) => `## ${c.title}\n\n${c.plain}\n`).join('\n');
}

document.getElementById('saveMd').addEventListener('click', () => {
  const blob = new Blob([sessionMarkdown()], { type: 'text/markdown' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'crystal-rag-session.md';
  a.click();
  URL.revokeObjectURL(a.href);
});

function weightLabel(rel, weight) {
  if (rel === 'conflicts_with') return `similarity ${(weight / 100).toFixed(2)}`;
  return `w ${weight}`;
}

function showDetail(id) {
  const card = document.getElementById('detail');
  card.classList.remove('hidden');
  card.innerHTML = `<p class="meta">loading ${escapeHtml(id)}</p>`;
  invoke('node_detail', { id })
    .then((d) => {
      const neighbors = (d.neighbors || [])
        .slice()
        .sort((a, b) => (b.weight || 0) - (a.weight || 0))
        .slice(0, 16)
        .map(
          (n) =>
            `<li><span class="kicker">${escapeHtml(n.rel)}</span> ${weightLabel(n.rel, n.weight)} · ${escapeHtml(n.label)}</li>`,
        )
        .join('');
      const passages = (d.passages || [])
        .slice(0, 8)
        .map((p) => {
          const hit = hits.find((h) => h.path === p.path && h.chunk_index === p.chunk_index);
          const scores = hit
            ? `<p class="meta">raw ${Number(hit.score).toFixed(3)}${hit.rrf_score != null ? ` · fused ${Number(hit.rrf_score).toFixed(4)}` : ''}${(hit.lists || []).length ? ` · ${hit.lists.join('+')}` : ''}</p>`
            : '';
          const surface = p.surface ? `<p class="meta">seen as ${escapeHtml(p.surface)}</p>` : '';
          return `<div class="hit"><b>${escapeHtml(p.path)}#${p.chunk_index}</b>${surface}${scores}<p>${escapeHtml(p.excerpt || '')}</p></div>`;
        })
        .join('');
      const aliases = (d.aliases || []).length
        ? `<p class="meta">aliases ${escapeHtml(d.aliases.join(', '))}</p>`
        : '';
      const files = (d.files || []).length
        ? `<p class="meta">${d.files.length} files · ${escapeHtml(d.files.slice(0, 8).join(', '))}</p>`
        : '';
      const flags = (d.flags || []).length
        ? `<p class="meta flag">${escapeHtml(d.flags.join(' · '))}</p>`
        : '';
      const merges = (d.merges || [])
        .map((m) => `<li>${escapeHtml(m.reason)}: ${escapeHtml((m.surfaces || []).join(' → '))}</li>`)
        .join('');
      card.innerHTML = `
        <button class="x" id="detailClose" type="button" title="close">×</button>
        <div class="kicker">${escapeHtml(d.kind || 'node')}</div>
        <h3>${escapeHtml(d.label || d.id)}</h3>
        <p class="meta">${d.mentions ? `${d.mentions} mentions · ` : ''}degree ${d.degree}${d.withheld ? ' · withheld' : ''}</p>
        ${aliases}${files}${flags}
        ${neighbors ? `<ul>${neighbors}</ul>` : '<p class="meta">no edges</p>'}
        ${passages}
        <details>
          <summary>graph metrics</summary>
          <p class="meta" title="Share of shortest paths that pass through this node. Degree counts frequency; betweenness counts bridges.">betweenness ${Number(d.betweenness || 0).toFixed(3)} · degree ${d.degree}</p>
        </details>
        ${merges ? `<details open><summary>merge history</summary><ul>${merges}</ul></details>` : ''}
        <details>
          <summary>payload</summary>
          <pre>${escapeHtml(JSON.stringify(d.payload, null, 2))}</pre>
        </details>`;
      document.getElementById('detailClose').addEventListener('click', () => card.classList.add('hidden'));
    })
    .catch((err) => {
      card.innerHTML = `<p class="meta">${escapeHtml(String(err))}</p>`;
    });
}

function show(el, on) {
  el.classList.toggle('show', on);
}

flightBtn.addEventListener('click', () => {
  const next = !verse.isFlight();
  verse.setFlight(next);
  flightBtn.textContent = next ? '🚀 flight' : '🛰 orbit';
  flightBtn.title = next
    ? 'arrows move · space thrust · B brake · drag look · type mpcmcp'
    : 'Switch to spaceship flight (6DOF)';
});

document.getElementById('pick').addEventListener('click', async () => {
  try {
    beginWait('choosing a folder');
    const path = await invoke('pick_folder');
    folder = path;
    pathEl.textContent = path;
    loadTune();
    setWaitLabel('scanning');
    const r = await invoke('scan_folder', { path });
    graph = r.graph;
    hits = [];
    focus = null;
    highlight = new Set();
    setReady(true);
    verse.setGraph(graph);
    verse.setFocus(null);
    verse.setHighlight(highlight);
    session.length = 0;
    pushCard('folder', censusText(r.census));
    const extra = graph.truncated ? ' · truncated at 400 nodes' : '';
    log(`${graph.nodes.length} nodes · ${graph.edges.length} edges${extra}`);
  } catch (err) {
    log(String(err));
  }
  endWait();
});

let ingesting = false;

document.getElementById('ingest').addEventListener('click', async () => {
  if (ingesting) {
    log('ingest already running…');
    return;
  }
  if (!folder) {
    log('pick a folder first');
    return;
  }
  ingesting = true;
  const btn = document.getElementById('ingest');
  btn.textContent = 'Ingesting…';
  btn.disabled = true;
  beginWait('ingesting');
  try {
    const r = await invoke('ingest_folder', { path: folder });
    if (r.graph) {
      graph = r.graph;
      verse.setGraph(graph);
    }
    const summary =
      `upserted ${r.points} chunks from ${r.files} files → ${r.collection} (${r.crystal_points} total)` +
      (r.graph ? `\nverse ${r.graph.nodes.length} nodes · ${r.graph.edges.length} edges` : '') +
      `\nentities ${r.entity_stats?.visible ?? 0} · cross-file ${r.entity_stats?.cross_file ?? 0} · relates_to ${r.entity_stats?.relates_to ?? 0} · conflicts ${r.entity_stats?.conflicts ?? 0}` +
      (r.skipped.length ? `\n${r.skipped.slice(0, 8).join('\n')}` : '');
    pushCard('ingest', summary);
    log('ingest done');
    paintStatus(await invoke('lab_status'));
  } catch (err) {
    pushCard('ingest', String(err));
    log(String(err));
  }
  endWait();
  ingesting = false;
  btn.textContent = 'Ingest';
  btn.disabled = !folder;
});

document.getElementById('go').addEventListener('click', async () => {
  const query = document.getElementById('q').value.trim();
  if (!query || !folder) return;
  beginWait('retrieving');
  try {
    const r = await invoke('retrieve', { query, folder, limit: 10 });
    hits = r.hits || [];
    highlight = new Set();
    const ids = [];
    for (const h of hits) {
      highlight.add(h.path);
      highlight.add(`${h.path}#${h.chunk_index}`);
      ids.push(`${h.path}#${h.chunk_index}`);
    }
    verse.setHighlight(highlight);
    const lines = hits.map((h) => {
      const lists = (h.lists || []).join(' ');
      const rrf = h.rrf_score != null ? `rrf ${Number(h.rrf_score).toFixed(4)} · ` : '';
      return `${lists} ${rrf}cos ${Number(h.score).toFixed(3)} · ${h.path}#${h.chunk_index}\n${h.preview}`;
    });
    pushCard(
      `retrieve · ${hits.length}`,
      lines.join('\n\n') || '(none)',
      chips(ids) + lines.map((line) => `<p>${escapeHtml(line)}</p>`).join(''),
    );
    log(`retrieve ${hits.length} · vector ${r.via_vector} · lexical ${r.via_lexical} · graph ${r.via_graph}`);
  } catch (err) {
    log(String(err));
  }
  endWait();
});

function tuneKey() {
  return `crystal-lab-tune:${folder || ''}`;
}

function paintTune(t) {
  document.getElementById('hubSpread').value = String(t.hubSpread);
  document.getElementById('glow').value = String(t.glow);
  document.getElementById('hubVal').textContent = Number(t.hubSpread).toFixed(1);
  document.getElementById('glowVal').textContent = Number(t.glow).toFixed(2);
}

function currentTune() {
  return {
    hubSpread: Number(document.getElementById('hubSpread').value),
    glow: Number(document.getElementById('glow').value),
  };
}

function loadTune() {
  let t = { hubSpread: 4, glow: 0.45 };
  try {
    const raw = localStorage.getItem(tuneKey());
    if (raw) t = { ...t, ...JSON.parse(raw) };
  } catch {
    /* keep the starting tune */
  }
  t.hubSpread = Math.min(15, Math.max(1, Number(t.hubSpread) || 4));
  t.glow = Math.min(1.5, Math.max(0, Number(t.glow) || 0));
  paintTune(t);
  verse.setTune(t);
}

function onTune() {
  const t = currentTune();
  paintTune(t);
  verse.setTune(t);
  if (folder) localStorage.setItem(tuneKey(), JSON.stringify(t));
}

document.getElementById('hubSpread').addEventListener('input', onTune);
document.getElementById('glow').addEventListener('input', onTune);

document.getElementById('ask').addEventListener('click', async () => {
  const question = document.getElementById('chatq').value.trim();
  if (!question) return;
  pushCard('you', question);
  beginWait('asking');
  try {
    const reply = await invoke('chat_ask', { question });
    const answer = typeof reply === 'string' ? reply : reply.answer;
    if (reply.highlight?.length) {
      highlight = new Set(reply.highlight);
      verse.setHighlight(highlight);
    }
    pushCard('answer', answer || '', chips(reply.highlight) + renderMd(answer || ''));
    log('ask done');
  } catch (err) {
    log(String(err));
  }
  endWait();
});

document.getElementById('hop').addEventListener('click', async () => {
  if (!folder || !focus) return;
  beginWait('hop');
  try {
    const ids = await invoke('hop_cmd', { focus });
    highlight = new Set([focus, ...ids]);
    verse.setHighlight(highlight);
    pushCard(`hop · ${ids.length}`, ids.join('\n') || '(none)', chips(ids));
    log(`hop ${ids.length}`);
  } catch (err) {
    log(String(err));
  }
  endWait();
});

document.getElementById('blast').addEventListener('click', async () => {
  if (!folder || !focus) return;
  beginWait('blast');
  try {
    const ids = await invoke('blast_cmd', { focus });
    highlight = new Set([focus, ...ids]);
    verse.setHighlight(highlight);
    pushCard(`blast · ${ids.length}`, ids.join('\n') || '(none)', chips(ids));
    log(`blast ${ids.length}`);
  } catch (err) {
    log(String(err));
  }
  endWait();
});

document.getElementById('btnEndpoint').addEventListener('click', async () => {
  const s = await invoke('get_settings');
  document.getElementById('epUrl').value = s.endpoint?.url || '';
  document.getElementById('epKey').value = s.endpoint?.api_key || '';
  document.getElementById('epModel').value = s.endpoint?.model || '';
  document.getElementById('epTimeout').value = String(s.endpoint?.timeout_secs || 180);
  show(document.getElementById('endpointSheet'), true);
});
document.getElementById('btnPorts').addEventListener('click', async () => {
  const s = await invoke('get_settings');
  document.getElementById('portQ').value = s.qdrant_port || 0;
  document.getElementById('portE').value = s.embed_port || 0;
  document.getElementById('portHint').textContent = lastStatus
    ? `running qdrant ${lastStatus.qdrant_port} · embed ${lastStatus.embed_port} · ${lastStatus.embed_model}`
    : '';
  show(document.getElementById('portsSheet'), true);
});
document.getElementById('epClose').addEventListener('click', () => show(document.getElementById('endpointSheet'), false));
document.getElementById('portClose').addEventListener('click', () => show(document.getElementById('portsSheet'), false));
document.getElementById('welcomeYes').addEventListener('click', async () => {
  await invoke('dismiss_welcome');
  show(document.getElementById('welcome'), false);
  show(document.getElementById('endpointSheet'), true);
});
document.getElementById('welcomeNo').addEventListener('click', async () => {
  await invoke('dismiss_welcome');
  show(document.getElementById('welcome'), false);
});
document.getElementById('epSave').addEventListener('click', async () => {
  try {
    beginWait('checking endpoint');
    const saved = await invoke('save_endpoint', {
      url: document.getElementById('epUrl').value,
      apiKey: document.getElementById('epKey').value,
      model: document.getElementById('epModel').value,
      timeoutSecs: Number(document.getElementById('epTimeout').value) || 180,
    });
    show(document.getElementById('endpointSheet'), false);
    paintStatus(await invoke('lab_status'));
    if (saved.graph) {
      graph = saved.graph;
      verse.setGraph(graph);
    }
    const s = saved.entity_stats || {};
    log(s.deferred ? 'endpoint saved' : 'endpoint saved');
  } catch (err) {
    log(String(err));
  }
  endWait();
});
document.getElementById('epClear').addEventListener('click', async () => {
  try {
    const cleared = await invoke('clear_endpoint');
    show(document.getElementById('endpointSheet'), false);
    paintStatus(await invoke('lab_status'));
    if (cleared.graph) {
      graph = cleared.graph;
      verse.setGraph(graph);
    }
    log('endpoint removed — names stay linked, types return to concept');
  } catch (err) {
    log(String(err));
  }
});
document.getElementById('portSave').addEventListener('click', async () => {
  try {
    await invoke('save_ports', {
      qdrantPort: Number(document.getElementById('portQ').value) || 0,
      embedPort: Number(document.getElementById('portE').value) || 0,
    });
    show(document.getElementById('portsSheet'), false);
    log('ports saved for next launch');
  } catch (err) {
    log(String(err));
  }
});

window.addEventListener('resize', () => verse.resize());

async function refreshStatus() {
  try {
    paintStatus(await invoke('lab_status'));
  } catch (err) {
    statusEl.textContent = String(err);
    statusEl.className = 'bad';
  }
}

listen('engines', (ev) => {
  const payload = ev.payload;
  if (payload === 'ready') {
    if (waiting && waitLabelText.startsWith('loading')) endWait();
    if (!ingesting) log('local engines ready');
  } else if (!ingesting) {
    beginWait('loading engines');
    log(String(payload));
  }
  refreshStatus();
}).catch(() => {});

listen('ingest-progress', (ev) => {
  if (waiting) setWaitLabel(String(ev.payload));
  else log(String(ev.payload));
}).catch(() => {});

const bootPoll = setInterval(async () => {
  await refreshStatus();
  if (lastStatus?.qdrant && lastStatus?.embed) clearInterval(bootPoll);
}, 1000);
setTimeout(() => clearInterval(bootPoll), 90000);

refreshStatus();
invoke('get_settings')
  .then((s) => {
    if (!s.welcome_seen) show(document.getElementById('welcome'), true);
  })
  .catch(() => {});
renderSession();
verse.resize();
