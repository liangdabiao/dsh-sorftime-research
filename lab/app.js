// 选品研究工作台 · 页面逻辑（无框架，hash 路由 + fetch /api/*）
// 布局对齐「投资尽调」：左侧 rail，右侧按路由渲染；
// 「发起研究 / 用这个方法研究」通过 postMessage 让宿主开新对话并填好指令。
const app = document.getElementById('app')
const navRecords = document.getElementById('nav-records')
const navHistory = document.getElementById('nav-history')
const navSkills = document.getElementById('nav-skills')
const railFoot = document.getElementById('rail-foot')
const viewer = document.getElementById('viewer')
const viewerTitle = document.getElementById('viewer-title')
const viewerBody = document.getElementById('viewer-body')
const viewerCopy = document.getElementById('viewer-copy')
const toastEl = document.getElementById('toast')

// 页面挂在 /sorftime-research/ 下，接口同前缀
const BASE = location.pathname.replace(/\/+$/, '') || '/sorftime-research'

const state = { catalog: null, q: '', type: 'all', verdict: 'all', group: 'all', kind: 'all', current: null }

const TYPE_LABEL = {
  product: '选品调研', keyword: '关键词研究', category: '品类选择', review: '评论分析',
  listing: 'Listing 优化', competitor: '竞品分析', market: '市场调研'
}
const STATUS_LABEL = { planning: '规划中', running: '进行中', done: '已完成' }
const VERDICT = {
  go: ['ok', '推荐做'],
  watch: ['gold', '观望'],
  'no-go': ['bad', '放弃'],
  none: ['grey', '未结论']
}
const KIND = { lookup: '查方法', save: '新建记录', update: '更新记录', delete: '删除记录' }
const KIND_TONE = { lookup: 'grey', save: 'ok', update: 'solid', delete: 'bad' }

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const date = (iso) => (iso ? String(iso).slice(0, 10) : '')
const shortTime = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 16)
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
const typeLabel = (t) => TYPE_LABEL[t] || t || ''
const verdictOf = (v) => VERDICT[v] || VERDICT.none
const kindLabel = (k) => KIND[k] || k || ''

async function api(path, opts) {
  const res = await fetch(BASE + path, opts)
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body.ok === false) throw new Error(body.error || `请求失败（${res.status}）`)
  return body
}
async function post(path, payload) {
  return api(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload || {}) })
}
function copy(text) {
  const value = String(text || '')
  if (!value) return
  try { navigator.clipboard?.writeText(value) } catch { /* ignore */ }
  toast('已复制到剪贴板')
}

// ---------------------------------------------------------------- 宿主通信 / 主题

addEventListener('message', (e) => {
  if (e.origin !== location.origin) return
  const m = e.data
  if (m && m.type === 'sorftime-research:scheme' && m.scheme) document.documentElement.dataset.scheme = m.scheme
  if (m && m.type === 'sorftime-research:start-failed') toast('开新对话失败：' + (m.message || ''))
})

function start(prompt) {
  try {
    parent.postMessage({ type: 'sorftime-research:start', prompt }, location.origin)
    toast('已把任务填进新对话，确认后发送即可')
  } catch {
    toast('当前环境开不了新对话，请手动复制：\n' + prompt)
  }
}

let toastTimer
function toast(text) {
  toastEl.textContent = text
  toastEl.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3400)
}

// ---------------------------------------------------------------- viewer

let viewerCopyText = ''
function openViewer({ title, copyText = '', html = '' }) {
  viewer.hidden = false
  viewerTitle.textContent = title || ''
  viewerBody.innerHTML = html
  viewerCopy.hidden = !copyText
  viewerCopyText = copyText
}
function closeViewer() {
  viewer.hidden = true
  viewerBody.innerHTML = ''
}
document.getElementById('viewer-close').addEventListener('click', closeViewer)
viewer.addEventListener('click', (e) => { if (e.target === viewer) closeViewer() })
addEventListener('keydown', (e) => { if (e.key === 'Escape' && !viewer.hidden) closeViewer() })
viewerCopy.addEventListener('click', () => copy(viewerCopyText))

// ---------------------------------------------------------------- 路由

const route = () => location.hash.replace(/^#\/?/, '').split('?')[0]

function render() {
  const r = route()
  document.querySelectorAll('.nav a').forEach((a) => {
    const v = a.dataset.view
    const on = (v === 'home' && r === '') || (v === 'records' && (r.startsWith('records') || r.startsWith('r/'))) ||
      (v === 'history' && r.startsWith('history')) || (v === 'new' && r === 'new') ||
      (v === 'skills' && (r.startsWith('skills') || r.startsWith('s/'))) || (v === 'guide' && r === 'guide')
    if (on) a.setAttribute('aria-current', 'true')
    else a.removeAttribute('aria-current')
  })
  if (r === '') return renderHome()
  if (r.startsWith('skills')) return renderSkills()
  if (r.startsWith('s/')) return renderSkill(decodeURIComponent(r.slice(2)))
  if (r.startsWith('records')) return renderRecords()
  if (r.startsWith('r/')) return renderRecord(decodeURIComponent(r.slice(2)))
  if (r.startsWith('history')) return renderHistory()
  if (r === 'new') return renderNew()
  if (r === 'guide') return renderGuide()
  return renderHome()
}

function wrap(html) {
  app.innerHTML = `<div class="wrap">${html}</div>`
}
function bindGo() {
  app.querySelectorAll('[data-go]').forEach((el) => el.addEventListener('click', () => { location.hash = el.dataset.go }))
}
function bindHistory() {
  app.querySelectorAll('[data-ev]').forEach((el) => el.addEventListener('click', () => openEvent(el.dataset.ev)))
}

// ---------------------------------------------------------------- 概览

function renderHome() {
  const d = state.catalog
  const s = d.stats
  wrap(`
    <header class="head">
      <span class="eyebrow">Amazon Research</span>
      <h1>选品研究工作台</h1>
      <p>9 套 Amazon 选品分析方法（Sorftime / 卖家精灵 / Sif / 西柚），加上一本「研究记录」：
         每次分析完把结论、用过的方法、报告路径存下来，下次直接翻。模型查了哪个方法也会记进生成历史。</p>
    </header>

    <div class="stats">
      <div class="stat accent"><b>${s.records}</b><small>研究记录</small></div>
      <div class="stat jade"><b>${s.done}</b><small>已完成</small></div>
      <div class="stat"><b>${s.lookups}</b><small>查方法次数</small></div>
      <div class="stat gold"><b>${s.events}</b><small>历史事件</small></div>
      <div class="stat"><b>${d.modules.length}</b><small>方法技能</small></div>
    </div>

    ${s.records ? `
      <div class="sec-head"><h2>最近结论</h2><a class="more" href="#/records">全部 →</a></div>
      <div class="grid">${d.records.slice(0, 3).map(recordCard).join('')}</div>`
    : `<div class="sec-head"><h2>还没有研究记录</h2></div>
       <div class="empty-box"><b>先跑一次分析</b>在「发起研究」里填要研究什么（类目 / 产品 / ASIN / 关键词），
       模型会匹配方法技能、按流程分析，最后用 sorftime_research 存一条结论。</div>`}

    <div class="sec-head"><h2>最近动作</h2><a class="more" href="#/history">全部 →</a>
      <span class="sub">查方法 / 新建记录 / 更新 / 删除</span></div>
    ${d.history.length ? `<div class="panel">${d.history.slice(0, 6).map(eventRow).join('')}</div>`
      : `<div class="empty-box"><b>还没有历史</b>模型查一次方法技能就会留一笔。</div>`}

    <div class="sec-head"><h2>下一步</h2></div>
    <div class="grid">
      <div class="card" data-go="#/new">
        <div class="card-top"><span class="dot" style="background:var(--accent)"></span><span class="card-title">发起一次研究</span></div>
        <div class="card-sub">类目 / 产品 / 关键词 / 评论 → 打开新对话并带上「选方法 → 跑流程 → 存结论」指令</div>
      </div>
      <div class="card" data-go="#/skills">
        <div class="card-top"><span class="dot" style="background:var(--jade)"></span><span class="card-title">翻方法技能库</span></div>
        <div class="card-sub">9 套方法的完整流程，可一键拿去用</div>
      </div>
      <div class="card" data-go="#/history">
        <div class="card-top"><span class="dot" style="background:var(--gold)"></span><span class="card-title">生成历史</span></div>
        <div class="card-sub">谁查了哪个方法、什么时候存的结论</div>
      </div>
      <div class="card" data-go="#/guide">
        <div class="card-top"><span class="dot" style="background:var(--ink-3)"></span><span class="card-title">研究流程</span></div>
        <div class="card-sub">四步流程、数据源 MCP、常见坑</div>
      </div>
    </div>
  `)
  bindGo()
  bindHistory()
}

function recordCard(r) {
  const [tone, label] = verdictOf(r.verdict)
  return `<div class="card rec-card" data-go="#/r/${encodeURIComponent(r.id)}">
    <div class="card-top">
      <span class="dot" style="background:var(--accent)"></span>
      <span class="card-title">${esc(r.topic)}</span>
      <span class="badge ${tone}">${label}</span>
    </div>
    <div class="meta-row" style="margin-bottom:6px">
      <span class="badge grey">${esc(typeLabel(r.type))}</span>
      ${r.marketplace ? `<span class="badge grey">${esc(r.marketplace)}</span>` : ''}
      ${r.asin ? `<span class="badge grey">${esc(r.asin)}</span>` : ''}
      <span class="badge ${r.status === 'done' ? 'ok' : 'grey'}">${esc(STATUS_LABEL[r.status] || r.status)}</span>
    </div>
    <div class="findings clamp">${esc(r.findings || '（还没有写核心发现）')}</div>
    <div class="card-foot">
      ${r.skills && r.skills.length ? `<span>方法 ${r.skills.length} 个</span>` : ''}
      <span class="grow"></span>
      <span>${date(r.updatedAt)}</span>
    </div>
  </div>`
}

function eventRow(e) {
  return `<div class="hrow" data-ev="${esc(e.id)}">
    <span class="when">${esc(shortTime(e.at))}</span>
    <span class="badge ${KIND_TONE[e.kind] || 'grey'}">${esc(kindLabel(e.kind))}</span>
    <span class="what">
      <b>${e.module ? esc(e.module) : esc(e.topic || e.recordId || '')}</b>
      <div>${esc(e.summary || '')}</div>
    </span>
  </div>`
}

// ---------------------------------------------------------------- 技能库

function renderSkills() {
  const d = state.catalog
  const groups = ['all', ...new Set(d.modules.map((m) => m.group))]
  const needle = state.q.trim().toLowerCase()
  const list = d.modules.filter((m) => {
    const hitGroup = state.group === 'all' || m.group === state.group
    const hitQ = !needle || `${m.name} ${m.description} ${m.group} ${m.tag}`.toLowerCase().includes(needle)
    return hitGroup && hitQ
  })
  wrap(`
    <header class="head">
      <h1>方法技能库</h1>
      <p>${d.modules.length} 套方法，按用途分组。点开看完整流程，也可以直接「用这个方法研究」——会带着该方法正文开新对话。</p>
    </header>
    <div class="toolbar">
      <input class="search" id="q" placeholder="搜方法 / 关键词，如「选品」「关键词」「评论」" value="${esc(state.q)}">
    </div>
    <div class="group-bar">
      ${groups.map((g) => `<button class="pill" data-group="${esc(g)}" aria-pressed="${state.group === g}">${g === 'all' ? '全部' : esc(g)}</button>`).join('')}
    </div>
    ${list.length ? `<div class="grid">${list.map((m) => `
      <div class="card skill-card" data-go="#/s/${encodeURIComponent(m.name)}">
        <div class="tag">${esc(m.group)} · ${esc(m.tag)}</div>
        <div class="card-title">${esc(m.name)}</div>
        <div class="desc">${esc(m.description)}</div>
        <div class="card-foot"><span>${m.bodyChars} 字流程</span><span class="grow"></span><span>打开 →</span></div>
      </div>`).join('')}</div>`
      : `<div class="empty-box"><b>没有匹配的方法</b>换个关键词或分组试试。</div>`}
  `)
  const q = document.getElementById('q')
  q.addEventListener('input', (e) => {
    state.q = e.target.value
    renderSkills()
    setTimeout(() => { const n = document.getElementById('q'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length) } }, 0)
  })
  app.querySelectorAll('[data-group]').forEach((b) => b.addEventListener('click', () => { state.group = b.dataset.group; renderSkills() }))
  bindGo()
}

async function renderSkill(name) {
  app.innerHTML = '<div class="loading">读取方法正文…</div>'
  let data
  try {
    data = await api(`/api/module?id=${encodeURIComponent(name)}`)
  } catch (err) {
    wrap(`<div class="empty-box"><b>读不到这个方法</b>${esc(err.message)}</div>`)
    return
  }
  const m = data.module
  const used = (state.catalog.records || []).filter((r) => (r.skills || []).includes(m.name))
  wrap(`
    <header class="head">
      <a class="card-sub" href="#/skills">← 方法技能库</a>
      <h1 style="margin-top:6px">${esc(m.name)}</h1>
      <p>${esc(m.description)}</p>
    </header>
    <div class="actions" style="margin-bottom:14px">
      <button class="btn" id="use">用这个方法研究 →</button>
      <button class="btn ghost" id="copy">复制全文</button>
    </div>
    <div class="panel"><div class="skill-body">${esc(m.body)}</div></div>
    ${used.length ? `<div class="sec-head"><h2>用过这个方法的记录</h2></div>
      <div class="grid">${used.slice(0, 6).map(recordCard).join('')}</div>` : ''}
  `)
  bindGo()
  document.getElementById('copy').addEventListener('click', () => copy(m.body))
  document.getElementById('use').addEventListener('click', () => start(
    `用「${m.name}」这个方法做一次 Amazon 选品研究。

先 sorftime_module action=get id=${m.name} 拿完整流程（如果已经拿到，直接照做），按它的步骤执行：
数据采集 → 分析 → 结论。数据源用已配置的 Sorftime/卖家精灵/Sif/西柚 MCP，没有配置的部分输出框架并标注 N/A。

完成后用 sorftime_research action=save 存一条记录：
topic=这次研究什么、type=<按方法选 product/keyword/category/review/listing/competitor/market>、marketplace=<站点>、
skills=["${m.name}"]、status=done、verdict=go/watch/no-go、findings=核心发现（含关键数据点）、reportPath=<报告路径，如果有>。
侧栏「选品研究 · 研究记录」里能看到这条结论。`))
}

// ---------------------------------------------------------------- 研究记录

function renderRecords() {
  const d = state.catalog
  const needle = state.q.trim().toLowerCase()
  const list = (d.records || []).filter((r) => {
    const hitType = state.type === 'all' || r.type === state.type
    const hitV = state.verdict === 'all' || (r.verdict || 'none') === state.verdict
    const hitQ = !needle || `${r.topic} ${r.category} ${r.asin} ${r.findings}`.toLowerCase().includes(needle)
    return hitType && hitV && hitQ
  })
  wrap(`
    <header class="head">
      <h1>研究记录</h1>
      <p>共 ${d.records.length} 条结论卡。每条记录写清研究主题、方法、结论（推荐 / 观望 / 放弃）和核心发现。</p>
    </header>
    <div class="toolbar">
      ${['all', 'product', 'keyword', 'category', 'review', 'listing', 'competitor', 'market'].map((t) => `
        <button class="pill" data-type="${t}" aria-pressed="${state.type === t}">${t === 'all' ? '全部类型' : typeLabel(t)}</button>`).join('')}
    </div>
    <div class="toolbar">
      ${['all', 'go', 'watch', 'no-go', 'none'].map((v) => `
        <button class="pill" data-verdict="${v}" aria-pressed="${state.verdict === v}">${v === 'all' ? '全部结论' : verdictOf(v)[1]}</button>`).join('')}
      <input class="search" id="q" placeholder="搜主题 / 类目 / ASIN / 发现" value="${esc(state.q)}">
    </div>
    ${list.length ? `<div class="grid">${list.map(recordCard).join('')}</div>`
      : `<div class="empty-box"><b>没有匹配的记录</b>换个筛选条件，或去「发起研究」跑一轮。</div>`}
  `)
  app.querySelectorAll('[data-type]').forEach((b) => b.addEventListener('click', () => { state.type = b.dataset.type; renderRecords() }))
  app.querySelectorAll('[data-verdict]').forEach((b) => b.addEventListener('click', () => { state.verdict = b.dataset.verdict; renderRecords() }))
  const q = document.getElementById('q')
  q.addEventListener('input', (e) => {
    state.q = e.target.value
    renderRecords()
    setTimeout(() => { const n = document.getElementById('q'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length) } }, 0)
  })
  bindGo()
}

async function renderRecord(id) {
  app.innerHTML = '<div class="loading">读取记录…</div>'
  let data
  try {
    data = await api(`/api/record?id=${encodeURIComponent(id)}`)
  } catch (err) {
    wrap(`<div class="empty-box"><b>读不到这条记录</b>${esc(err.message)}</div>`)
    return
  }
  const r = data.record
  const [tone, verdictLabel] = verdictOf(r.verdict)
  const events = (state.catalog.history || []).filter((e) => e.recordId === r.id)
  wrap(`
    <header class="head">
      <a class="card-sub" href="#/records">← 研究记录</a>
      <div class="detail-head" style="margin-top:6px">
        <h1>${esc(r.topic)}</h1>
        <span class="badge ${tone}">${verdictLabel}</span>
        <span class="badge grey">${esc(typeLabel(r.type))}</span>
        <span class="badge grey">${esc(r.marketplace || 'US')}</span>
        ${r.asin ? `<span class="badge grey">${esc(r.asin)}</span>` : ''}
        <span class="badge ${r.status === 'done' ? 'ok' : 'grey'}">${esc(STATUS_LABEL[r.status] || r.status)}</span>
      </div>
      <p style="margin-top:6px">建 ${esc(shortTime(r.createdAt))} · 改 ${esc(shortTime(r.updatedAt))}${r.category ? ` · 类目：${esc(r.category)}` : ''}</p>
    </header>

    <div class="actions" style="margin-bottom:14px">
      <button class="btn ghost" id="continue">在对话里继续这条研究</button>
      ${r.reportPath ? '<button class="btn ghost" id="copy-report">复制报告路径</button>' : ''}
      <button class="btn danger" id="remove">删除</button>
    </div>

    <div class="sec-head"><h2>核心发现</h2></div>
    <div class="panel"><div class="findings">${esc(r.findings || '（还没有写核心发现）')}</div></div>

    <div class="sec-head"><h2>用过的方法</h2></div>
    ${r.skills && r.skills.length ? `<div class="panel"><div class="meta-row">
      ${r.skills.map((s) => `<span class="badge run" style="cursor:pointer" data-skill="${esc(s)}">${esc(s)}</span>`).join('')}
    </div></div>` : '<div class="empty-box"><b>没有记录方法</b>下次 save 时把用到的方法名填进 skills。</div>'}

    ${r.reportPath ? `<div class="sec-head"><h2>报告</h2></div>
      <div class="panel"><div class="card-sub" style="font-family:Consolas,monospace;font-size:11.5px;word-break:break-all">${esc(r.reportPath)}</div></div>` : ''}

    <div class="sec-head"><h2>这条记录的变更</h2><a class="more" href="#/history">全部 →</a></div>
    ${events.length ? `<div class="panel">${events.map(eventRow).join('')}</div>`
      : '<div class="empty-box"><b>还没有变更记录</b></div>'}
  `)
  bindHistory()
  app.querySelectorAll('[data-skill]').forEach((el) => el.addEventListener('click', () => { location.hash = '#/s/' + encodeURIComponent(el.dataset.skill) }))
  const cont = document.getElementById('continue')
  if (cont) cont.addEventListener('click', () => start(
    `继续研究「${r.topic}」（记录 id=${r.id}，${typeLabel(r.type)} · ${r.marketplace || 'US'}${r.asin ? ` · ${r.asin}` : ''}）。` +
    `先 sorftime_research action=get id=${r.id} 看已有结论和用过的方法，再补充新数据/新角度，` +
    `最后用 action=save id=${r.id} 更新这条记录（findings 追加新的数据点与判断）。`))
  const copyReport = document.getElementById('copy-report')
  if (copyReport) copyReport.addEventListener('click', () => copy(r.reportPath))
  const remove = document.getElementById('remove')
  if (remove) remove.addEventListener('click', async () => {
    if (!confirm(`删除研究记录「${r.topic}」？`)) return
    try {
      await post('/api/record/remove', { id: r.id })
      await boot()
      location.hash = '#/records'
      toast('已删除')
    } catch (err) { toast('删除失败：' + err.message) }
  })
}

// ---------------------------------------------------------------- 生成历史

function renderHistory() {
  const d = state.catalog
  const needle = state.q.trim().toLowerCase()
  const list = (d.history || []).filter((e) => {
    const hitKind = state.kind === 'all' || e.kind === state.kind
    const hitQ = !needle || `${e.summary} ${e.module || ''} ${e.topic || ''}`.toLowerCase().includes(needle)
    return hitKind && hitQ
  })
  wrap(`
    <header class="head">
      <h1>生成历史</h1>
      <p>查方法（模型每次 get/search 技能都记一笔）、新建记录、更新、删除：${d.stats.events} 条。点任意一行看当次详情。</p>
    </header>
    <div class="toolbar">
      ${['all', 'lookup', 'save', 'update', 'delete'].map((k) => `
        <button class="pill" data-kind="${k}" aria-pressed="${state.kind === k}">${k === 'all' ? '全部' : kindLabel(k)}</button>`).join('')}
      <input class="search" id="h-q" placeholder="搜方法 / 主题 / 摘要" value="${esc(state.q)}">
    </div>
    ${list.length ? `<div class="panel">${list.map(eventRow).join('')}</div>`
      : `<div class="empty-box"><b>没有匹配的历史</b>换个筛选条件，或先去查一次方法。</div>`}
    <div class="toolbar" style="margin-top:16px">
      <button class="btn ghost small" id="clear">清空历史</button>
      <span class="card-sub muted" style="font-size:11px">只删记录，不动研究记录本身。</span>
    </div>
  `)
  app.querySelectorAll('[data-kind]').forEach((b) => b.addEventListener('click', () => { state.kind = b.dataset.kind; renderHistory() }))
  const q = document.getElementById('h-q')
  q.addEventListener('input', (e) => {
    state.q = e.target.value
    if (q._t) clearTimeout(q._t)
    q._t = setTimeout(() => renderHistory(), 240)
  })
  document.getElementById('clear').addEventListener('click', async () => {
    if (!confirm('清空全部生成历史？（研究记录不会删）')) return
    try {
      await post('/api/history/clear', {})
      await boot()
      toast('历史已清空')
    } catch (err) { toast('清空失败：' + err.message) }
  })
  bindHistory()
}

function openEvent(id) {
  const e = (state.catalog.history || []).find((x) => x.id === id)
  if (!e) { toast('找不到这条记录'); return }
  openViewer({
    title: `${kindLabel(e.kind)} · ${e.module || e.topic || ''}`,
    copyText: e.summary || '',
    html: `
      <div class="detail-head" style="margin-bottom:8px">
        <h1 style="font-size:19px;margin:0">${esc(e.module || e.topic || e.recordId || '')}</h1>
        <span class="badge ${KIND_TONE[e.kind] || 'grey'}">${esc(kindLabel(e.kind))}</span>
        ${e.action ? `<span class="badge grey">${esc(e.action)}</span>` : ''}
      </div>
      <div class="card-sub muted" style="margin-bottom:10px">${esc(shortTime(e.at))} · ${esc(e.summary || '')} · event ${esc(e.id)}</div>
      ${e.module ? `<div class="actions" style="margin-top:12px"><button class="btn ghost small" id="open-skill">打开方法正文</button></div>` : ''}
      ${e.recordId && e.kind !== 'delete' ? `<div class="actions" style="margin-top:8px"><button class="btn ghost small" id="open-record">打开研究记录</button></div>` : ''}
    `
  })
  const openSkill = document.getElementById('open-skill')
  if (openSkill) openSkill.addEventListener('click', () => { closeViewer(); location.hash = '#/s/' + encodeURIComponent(e.module) })
  const openRecord = document.getElementById('open-record')
  if (openRecord) openRecord.addEventListener('click', () => { closeViewer(); location.hash = '#/r/' + encodeURIComponent(e.recordId) })
}

// ---------------------------------------------------------------- 发起研究

function renderNew() {
  const types = state.catalog.types || TYPE_LABEL
  wrap(`
    <header class="head">
      <span class="eyebrow">Match → Analyze → Save</span>
      <h1>发起研究</h1>
      <p>填好之后会打开一个新对话，指令已经写全：模型先 sorftime_module 匹配方法 → 按流程跑分析 → 用 sorftime_research 存结论。</p>
    </header>

    <div class="panel">
      <div class="form">
        <label class="fld full">研究什么
          <input id="f-topic" placeholder="如：宠物饮水机类目 / ASIN B0XXXXXXX / 关键词 dog water fountain">
        </label>
        <label class="fld">研究类型
          <select id="f-type">
            ${Object.entries(types).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}
          </select>
        </label>
        <label class="fld">站点
          <select id="f-market">
            <option value="US">US 美国</option><option value="GB">GB 英国</option><option value="DE">DE 德国</option>
            <option value="FR">FR 法国</option><option value="JP">JP 日本</option><option value="CA">CA 加拿大</option>
          </select>
        </label>
        <label class="fld">ASIN（可选）<input id="f-asin" placeholder="10 位 ASIN"></label>
        <label class="fld">类目（可选）<input id="f-category" placeholder="如 Pet Supplies > Dogs"></label>
        <label class="fld full">想回答的问题（可选）
          <textarea id="f-question" rows="3" placeholder="如：这个类目还有没有低评论、高需求的细分机会？头部品牌垄断程度如何？"></textarea>
        </label>
      </div>
      <div class="actions" style="margin-top:14px">
        <button class="btn" id="f-go">让模型自己选方法 →</button>
        <button class="btn ghost" id="f-skill">先去方法库挑一个 →</button>
      </div>
      <div class="note" style="margin-top:12px">
        数据源需要你在 dsh 里配置对应的 MCP（Sorftime / 卖家精灵 / Sif / 西柚）和 token；没配置时模型会输出分析框架和公开数据部分，数据缺口标 N/A。
      </div>
    </div>
  `)
  bindGo()
  document.getElementById('f-go').addEventListener('click', () => {
    const topic = document.getElementById('f-topic').value.trim()
    if (!topic) return toast('先填要研究什么')
    const type = document.getElementById('f-type').value
    const market = document.getElementById('f-market').value
    const asin = document.getElementById('f-asin').value.trim()
    const category = document.getElementById('f-category').value.trim()
    const question = document.getElementById('f-question').value.trim()
    start(`做一次 Amazon 选品研究：${topic}（类型：${TYPE_LABEL[type] || type}，站点：${market}${asin ? `，ASIN：${asin}` : ''}${category ? `，类目：${category}` : ''}）。

${question ? `我想回答的问题：${question}\n` : ''}
请用 sorftime-research 插件推进：
1. 先 sorftime_module action=search 匹配最合适的方法（如「选品」「关键词」「评论」），get 拿完整流程。
2. 按该流程执行：数据采集 → 分析 → 结论。数据源优先用已配置的 MCP（Sorftime/卖家精灵/Sif/西柚）；没配置的项明确标注 N/A，不要编数据。
3. 得出结论后用 sorftime_research action=save 存记录：topic="${topic}"、type=${type}、marketplace=${market}${asin ? `、asin=${asin}` : ''}${category ? `、category="${category}"` : ''}、skills=[用过的方法名]、status=done、verdict=go/watch/no-go、findings=核心发现（含关键数据点）、reportPath=报告路径（如果写了报告）。
4. 交付时给我：一句话结论 + 3–5 条关键证据 + 风险点 + 下一步建议。
侧栏「选品研究」里能看到这条研究记录和这次查过的方法。`)
  })
  document.getElementById('f-skill').addEventListener('click', () => { location.hash = '#/skills' })
}

// ---------------------------------------------------------------- 研究流程

function renderGuide() {
  const d = state.catalog
  const groups = {}
  for (const m of d.modules || []) (groups[m.group] = groups[m.group] || []).push(m)
  wrap(`
    <header class="head">
      <span class="eyebrow">Workflow</span>
      <h1>选品研究流程</h1>
      <p>数据 → 方法 → 结论 → 存档。方法库是 9 套实战流程；研究记录负责把每次结论留档，避免重复造轮子。</p>
    </header>

    <div class="grid">
      <div class="card plain">
        <div class="card-top"><span class="card-title" style="color:var(--accent-ink)">01 · 定问题</span></div>
        <div class="card-sub">先想清楚要回答什么：值不值得做？机会在哪个细分？头部垄断多高？问题不清，数据越多越乱。</div>
      </div>
      <div class="card plain">
        <div class="card-top"><span class="card-title" style="color:var(--jade)">02 · 选方法</span></div>
        <div class="card-sub">sorftime_module search「选品 / 关键词 / 评论 / 类目 / Listing」，get 拿完整流程——9 套方法各有分工，别拿评论分析的套路做选品。</div>
      </div>
      <div class="card plain">
        <div class="card-top"><span class="card-title" style="color:var(--gold)">03 · 跑数据</span></div>
        <div class="card-sub">接上 Sorftime / 卖家精灵 / Sif / 西柚 MCP 取真实数据；缺项标注 N/A，不要编。数据源优先级：自己的 MCP 数据 &gt; 公开信息 &gt; 推断。</div>
      </div>
      <div class="card plain">
        <div class="card-top"><span class="card-title" style="color:var(--ink-2)">04 · 存档结论</span></div>
        <div class="card-sub">sorftime_research save：主题、类型、方法、结论（go/watch/no-go）、核心发现、报告路径。下次研究同一类目直接翻记录，顺着改。</div>
      </div>
    </div>

    <div class="sec-head"><h2>9 套方法</h2></div>
    <div class="panel">
      <table>
        <thead><tr><th style="width:110px">分组</th><th>用途</th><th>方法</th></tr></thead>
        <tbody>${Object.entries(groups).map(([g, mods]) => `<tr>
          <td><b>${esc(g)}</b></td>
          <td class="card-sub">${mods.map((m) => esc(m.tag)).join(' / ')}</td>
          <td class="card-sub">${mods.map((m) => `<a href="#/s/${encodeURIComponent(m.name)}" style="color:var(--accent-ink)">${esc(m.name)}</a>`).join('、')}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>

    <div class="sec-head"><h2>常见问题</h2></div>
    <div class="panel">
      <dl class="kv">
        <dt>要数据源吗</dt><dd>要。Sorftime / 卖家精灵 / Sif / 西柚都是 MCP 服务，需要在 dsh 里配置服务器和 token；没配时模型输出框架 + 公开数据，缺项标 N/A。</dd>
        <dt>记录会丢吗</dt><dd>不会。研究记录存 $DSH_HOME/sorftime-research/records.json，历史在 history.json。</dd>
        <dt>为什么历史里有「查方法」</dt><dd>模型每次 get/search 方法技能都会记一笔：能看出某个结论是靠哪套方法得出的，也方便复用。</dd>
        <dt>结论怎么写</dt><dd>verdict 三档：go 推荐做 / watch 观望 / no-go 放弃；findings 写数据点和判断，别只写「不错」。</dd>
        <dt>能改吗</dt><dd>能。对页面里点「在对话里继续这条研究」，模型会 get 原记录、补数据、再 save 更新同一条（历史里留更新记录）。</dd>
      </dl>
    </div>
  `)
  bindGo()
}

// ---------------------------------------------------------------- 启动

async function boot() {
  try {
    state.catalog = await api('/api/catalog')
    const s = state.catalog.stats
    navRecords.textContent = s.records || ''
    navHistory.textContent = s.events || ''
    navSkills.textContent = (state.catalog.modules || []).length || ''
    railFoot.innerHTML = `
      <span class="txt">${s.records} 条记录（完成 ${s.done}）· ${s.lookups} 次查方法</span>
      <span class="txt">方法 ${(state.catalog.modules || []).length} 套 · 历史 ${s.events} 条</span>
      <span class="txt">${s.topModules.length ? '常用：' + esc(s.topModules[0].name) : '还没有常用方法'}</span>
      <span class="txt">v${esc(state.catalog.version || '')}</span>`
  } catch (err) {
    app.innerHTML = `<div class="wrap"><div class="empty-box"><b>读不到工作台数据</b>${esc(err.message)}<br>
      插件可能刚装好，刷新页面再试；如果一直这样，看看 DSH 的插件日志。</div></div>`
    return
  }
  render()
}

addEventListener('hashchange', render)
boot()
