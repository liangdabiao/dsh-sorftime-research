// 接口验收：起一个本地 http 挂 registerApi 的 handler，用真实 fetch 打一遍工作台接口。
// 不碰真实数据目录（DSH_HOME 指到 .tmp/），不联网。
import { createServer } from 'node:http'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(process.cwd(), '.tmp', 'api-test')
rmSync(ROOT, { recursive: true, force: true })
mkdirSync(ROOT, { recursive: true })
process.env.DSH_HOME = join(ROOT, 'home')

const data = await import('../lib/data.js')
const { registerApi } = await import('../lib/api.js')

let handler = null
registerApi({ get: () => undefined, webServer: { register(cfg) { handler = cfg.handler; return () => {} } } }, { skillDirs: [join(process.cwd(), 'skills', 'sorftime')] })
if (!handler) throw new Error('registerApi 没注册 handler')

const server = createServer((req, res) => handler(req, res))
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${server.address().port}`
const P = '/sorftime-research'

let failed = 0
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`) }
const get = async (path) => {
  const res = await fetch(base + path)
  return { status: res.status, type: res.headers.get('content-type') || '', text: await res.text() }
}
const postJson = async (path, body) => {
  const res = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) })
  return { status: res.status, json: JSON.parse((await res.text()) || '{}') }
}

try {
  // ── 造数据：两条研究记录 + 三次方法查询
  data.logLookup('product-research', { action: 'get' })
  data.logLookup('keyword-research', { action: 'search', keyword: '关键词' })
  data.logLookup('review-analysis', { action: 'get' })
  const r1 = data.saveRecord({
    topic: '宠物饮水机类目', type: 'category', marketplace: 'US', category: 'Pet Supplies',
    skills: ['category-selection', 'keyword-research'], status: 'done', verdict: 'watch',
    findings: '1. 头部品牌 CR5 约 48%\n2. 300 reviews 以下链接占 31%\n3. 均价 $34，毛利空间可做',
    reportPath: 'reports/pet-water-fountain.md'
  })
  const r2 = data.saveRecord({
    topic: 'ASIN B0TEST1234', type: 'competitor', marketplace: 'US', asin: 'B0TEST1234',
    skills: ['amazon-analyse'], status: 'done', verdict: 'no-go',
    findings: '自然流量 72% 来自 3 个词，品牌词占比 41%，进入门槛高'
  })

  const ping = await get(`${P}/api/ping`)
  check('ping', ping.status === 200 && JSON.parse(ping.text).version === '0.3.0', ping.text)

  const cat = JSON.parse((await get(`${P}/api/catalog`)).text)
  check('catalog: 9 个方法', cat.ok && cat.modules.length === 9, `modules=${cat.modules.length}`)
  check('catalog: 方法带分组', cat.modules.every((m) => m.group && m.tag) && cat.modules.some((m) => m.group === '选品'), cat.modules.map((m) => m.group).join(','))
  check('catalog: 两条记录', cat.records.length === 2, cat.records.map((r) => r.topic).join(' / '))
  check('catalog: 统计', cat.stats.records === 2 && cat.stats.done === 2 && cat.stats.lookups === 3 && cat.stats.events === 5, JSON.stringify(cat.stats).slice(0, 150))
  check('catalog: 结论分布', cat.stats.byVerdict.watch === 1 && cat.stats.byVerdict['no-go'] === 1)
  check('catalog: 常用方法', cat.stats.topModules.length >= 1, cat.stats.topModules.map((m) => `${m.name}(${m.count})`).join(' '))

  const mod = JSON.parse((await get(`${P}/api/module?id=product-research`)).text)
  check('module: 正文', mod.ok && mod.module.body.length > 500 && mod.module.name === 'product-research', `${mod.module.body.length} 字`)
  const noMod = await get(`${P}/api/module?id=nope`)
  check('module: 不存在 404', noMod.status === 404)

  const rec = JSON.parse((await get(`${P}/api/record?id=${encodeURIComponent(r1.id)}`)).text)
  check('record: 详情', rec.ok && rec.record.verdict === 'watch' && rec.record.findings.includes('CR5'), rec.record.topic)
  const noRec = await get(`${P}/api/record?id=nope`)
  check('record: 不存在 404', noRec.status === 404)

  const hi = JSON.parse((await get(`${P}/api/history?kind=lookup`)).text)
  check('history: 只看查方法', hi.list.length === 3 && hi.list.every((e) => e.kind === 'lookup'), hi.list.map((e) => e.module).join(','))

  // ── 删除记录
  const del = await postJson(`${P}/api/record/remove`, { id: r2.id })
  check('record/remove', del.status === 200 && del.json.ok === true)
  const afterDel = JSON.parse((await get(`${P}/api/catalog`)).text)
  check('删除后只剩一条', afterDel.records.length === 1 && afterDel.records[0].id === r1.id)

  // ── 静态页面
  const page = await get(`${P}/`)
  check('静态页面 index.html', page.status === 200 && page.text.includes('选品研究'), `${page.status} ${page.type}`)
  const css = await get(`${P}/app.css`)
  check('静态页面 app.css', css.status === 200 && css.type.includes('css'))
  const js = await get(`${P}/app.js`)
  check('静态页面 app.js', js.status === 200 && js.text.includes('renderRecords'))
  const traversal = await get(`${P}/..%2f..%2fpackage.json`)
  check('静态页面越界被拒', traversal.status === 404, String(traversal.status))

  // ── 兼容旧面板 + 清空历史
  const legacy = JSON.parse((await get(`${P}/api/modules`)).text)
  check('兼容 /api/modules', legacy.count === 9 && legacy.modules.length === 9)
  const search = JSON.parse((await get(`${P}/api/search?q=review`)).text)
  check('兼容 /api/search', search.results.length >= 1, search.results[0]?.name)
  const health = JSON.parse((await get(`${P}/api/health`)).text)
  check('兼容 /api/health', health.ok === true)
  const cleared = await postJson(`${P}/api/history/clear`, {})
  const afterClear = JSON.parse((await get(`${P}/api/catalog`)).text)
  check('history/clear', cleared.json.ok === true && afterClear.history.length === 0 && afterClear.records.length === 1)
} finally {
  server.close()
}

console.log(failed ? `\n${failed} 项失败` : '\n全部通过')
process.exit(failed ? 1 : 0)
