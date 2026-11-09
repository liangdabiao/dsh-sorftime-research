// Amazon 选品研究 · 研究记录与生成历史持久化（$DSH_HOME/sorftime-research/）。
//
//   records.json   [{ id, topic, type, marketplace, asin, category, skills[], status,
//                     verdict, findings, reportPath, createdAt, updatedAt }]
//   history.json   [{ id, at, kind: lookup|save|update|delete, module?, recordId?, topic?, summary }]
//
// 「研究记录」是模型跑完一次选品/关键词/评论分析后存下来的结论卡；
// 「生成历史」除了记录每一次保存，还会记下模型查了哪个方法技能（lookup），
// 页面上能看出「这个结论用了哪套方法」。
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const DATA_DIR = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'sorftime-research')
const RECORDS_FILE = join(DATA_DIR, 'records.json')
const HISTORY_FILE = join(DATA_DIR, 'history.json')
const MAX_RECORDS = 200
const MAX_HISTORY = 400

export const TYPES = {
  product: '选品调研',
  keyword: '关键词研究',
  category: '品类选择',
  review: '评论分析',
  listing: 'Listing 优化',
  competitor: '竞品分析',
  market: '市场调研'
}
export const STATUSES = ['planning', 'running', 'done']
export const STATUS_LABEL = { planning: '规划中', running: '进行中', done: '已完成' }
export const VERDICTS = ['go', 'watch', 'no-go', 'none']
export const VERDICT_LABEL = { go: '推荐做', watch: '观望', 'no-go': '放弃', none: '未结论' }
export const KIND_LABEL = { lookup: '查方法', save: '新建记录', update: '更新记录', delete: '删除记录' }

export function ensureDirs() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
}

function readJson(file, fallback) {
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8'))
    return raw ?? fallback
  } catch {
    return fallback
  }
}

function writeJson(file, value) {
  ensureDirs()
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  try {
    renameSync(tmp, file)
  } catch (err) {
    writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
    throw err
  }
}

const nowIso = () => new Date().toISOString()

// ---------------------------------------------------------------- 研究记录

function loadRecords() {
  const raw = readJson(RECORDS_FILE, [])
  return Array.isArray(raw) ? raw : []
}

export function listRecords({ type, verdict, q, limit = 100 } = {}) {
  let list = loadRecords()
  if (type && type !== 'all') list = list.filter((r) => r.type === type)
  if (verdict && verdict !== 'all') list = list.filter((r) => (r.verdict || 'none') === verdict)
  if (q) {
    const needle = String(q).toLowerCase()
    list = list.filter((r) => `${r.topic} ${r.category} ${r.asin} ${r.findings}`.toLowerCase().includes(needle))
  }
  return list.slice(0, Math.max(1, Math.min(MAX_RECORDS, Number(limit) || 100)))
}

export function getRecord(id) {
  return loadRecords().find((r) => r.id === id) || null
}

// save：新建或整体更新一条研究记录（topic + type 必填）。
export function saveRecord(input) {
  const records = loadRecords()
  const prev = input.id ? records.find((r) => r.id === input.id) : null
  const at = nowIso()
  const record = {
    id: input.id && prev ? input.id : `sr-${Date.now().toString(36)}`,
    topic: String(input.topic ?? prev?.topic ?? '').slice(0, 200),
    type: TYPES[input.type] ? input.type : (prev?.type || 'product'),
    marketplace: String(input.marketplace ?? prev?.marketplace ?? 'US').slice(0, 12),
    asin: String(input.asin ?? prev?.asin ?? '').slice(0, 20),
    category: String(input.category ?? prev?.category ?? '').slice(0, 200),
    skills: Array.isArray(input.skills) ? input.skills.map(String).slice(0, 10) : (prev?.skills || []),
    status: STATUSES.includes(input.status) ? input.status : (prev?.status || 'planning'),
    verdict: VERDICTS.includes(input.verdict) ? input.verdict : (prev?.verdict || 'none'),
    findings: String(input.findings ?? prev?.findings ?? '').slice(0, 4000),
    reportPath: String(input.reportPath ?? prev?.reportPath ?? '').slice(0, 500),
    createdAt: prev?.createdAt || at,
    updatedAt: at
  }
  if (!record.topic) throw new Error('save 需要 topic（研究什么：产品/类目/ASIN）。')
  const next = prev ? records.map((r) => (r.id === record.id ? record : r)) : [record, ...records]
  writeJson(RECORDS_FILE, next.slice(0, MAX_RECORDS))
  appendHistory({
    kind: prev ? 'update' : 'save',
    recordId: record.id,
    topic: record.topic,
    summary: `${prev ? '更新' : '新建'}「${record.topic}」：${TYPES[record.type]}${record.verdict && record.verdict !== 'none' ? ` · ${VERDICT_LABEL[record.verdict]}` : ''}`
  })
  return record
}

export function deleteRecord(id) {
  const records = loadRecords()
  const record = records.find((r) => r.id === id)
  if (!record) return false
  writeJson(RECORDS_FILE, records.filter((r) => r.id !== id))
  appendHistory({ kind: 'delete', recordId: record.id, topic: record.topic, summary: `删除记录「${record.topic}」` })
  return true
}

// ---------------------------------------------------------------- 生成历史

function loadHistory() {
  const raw = readJson(HISTORY_FILE, [])
  return Array.isArray(raw) ? raw : []
}

function appendHistory(event) {
  const list = loadHistory()
  list.unshift({ id: `sh-${Date.now().toString(36)}-${list.length + 1}`, at: nowIso(), ...event })
  writeJson(HISTORY_FILE, list.slice(0, MAX_HISTORY))
}

// 模型每查一次方法技能就记一笔：能看出某个结论是靠哪套方法得出的。
export function logLookup(module, { action = 'get', keyword = '' } = {}) {
  if (!module) return null
  const list = loadHistory()
  list.unshift({
    id: `sh-${Date.now().toString(36)}-${list.length + 1}`,
    at: nowIso(),
    kind: 'lookup',
    module,
    action,
    keyword,
    summary: action === 'search' ? `查方法：${module}（搜索「${keyword}」）` : `查方法：${module}`
  })
  writeJson(HISTORY_FILE, list.slice(0, MAX_HISTORY))
  return list[0]
}

export function listHistory({ kind, q, limit = 100 } = {}) {
  let list = loadHistory()
  if (kind && kind !== 'all') list = list.filter((e) => e.kind === kind)
  if (q) {
    const needle = String(q).toLowerCase()
    list = list.filter((e) => `${e.summary} ${e.module || ''} ${e.topic || ''}`.toLowerCase().includes(needle))
  }
  return list.slice(0, Math.max(1, Math.min(MAX_HISTORY, Number(limit) || 100)))
}

export function clearHistory() {
  writeJson(HISTORY_FILE, [])
  return true
}

// ---------------------------------------------------------------- 统计

export function stats(history = loadHistory(), records = loadRecords()) {
  const byType = {}
  for (const r of records) byType[r.type] = (byType[r.type] || 0) + 1
  const byVerdict = { go: 0, watch: 0, 'no-go': 0, none: 0 }
  for (const r of records) byVerdict[r.verdict || 'none'] = (byVerdict[r.verdict || 'none'] || 0) + 1
  const lookups = history.filter((e) => e.kind === 'lookup').length
  const moduleUse = {}
  for (const e of history) if (e.kind === 'lookup' && e.module) moduleUse[e.module] = (moduleUse[e.module] || 0) + 1
  const topModules = Object.entries(moduleUse).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count }))
  return {
    records: records.length,
    done: records.filter((r) => r.status === 'done').length,
    events: history.length,
    lookups,
    byType,
    byVerdict,
    topModules,
    lastAt: records.length ? records.map((r) => r.updatedAt || '').sort().at(-1) : null,
    lastEventAt: history.length ? history[0].at : null
  }
}
