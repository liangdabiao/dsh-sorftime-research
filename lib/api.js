// 工作台数据面：/sorftime-research 前缀路由。
//   GET  /                       工作台页面（lab/ 静态资源，布局对齐「投资尽调」）
//   GET  /api/catalog            9 个方法技能 + 研究记录 + 生成历史 + 统计
//   GET  /api/module?id=         单个方法技能正文
//   GET  /api/record?id=         单条研究记录
//   GET  /api/history?kind=&q=   生成历史（查方法/新建/更新/删除）
//   POST /api/record/remove      删除研究记录
//   POST /api/history/clear      清空历史（不动研究记录）
//   兼容旧面板：/api/modules、/api/skills、/api/search、/api/health
import { createReadStream, existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { extname, join, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readDir } from './skills.js'
import { listModules, getModule, searchModules } from './modules.js'
import {
  KIND_LABEL, STATUS_LABEL, TYPES, VERDICTS, VERDICT_LABEL,
  clearHistory, deleteRecord, getRecord, listHistory, listRecords, stats
} from './data.js'

const BASE = '/sorftime-research'
const LAB = fileURLToPath(new URL('../lab/', import.meta.url))
const SKILL_DIRS = [fileURLToPath(new URL('../skills/sorftime/', import.meta.url))]

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.md': 'text/markdown; charset=utf-8'
}

function json(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(value))
}

export function requestRejection(ctx, req) {
  const connection = ctx.get('connection')
  if (typeof connection?.requestRejection !== 'function') return false // dsh 0.2.x 宿主已 token 鉴权，服务缺席时放行（fail-closed 会把面板永久 403）
  return connection.requestRejection({ headers: req.headers })
}

function version() {
  try { return JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version } catch { return null }
}

// 只放行 lab/ 里的文件：拒绝 ..、点开头的路径和指到目录外的符号链接
function safeLabFile(rel) {
  if (!rel || String(rel).split('/').some((p) => p.startsWith('.'))) return null
  let base
  try { base = realpathSync(LAB) } catch { return null }
  const file = normalize(join(base, rel))
  if (!file.startsWith(base + sep) || !existsSync(file)) return null
  const real = realpathSync(file)
  return real.startsWith(base + sep) && statSync(real).isFile() ? real : null
}

function serve(req, res, file) {
  res.writeHead(200, {
    'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
    'content-length': statSync(file).size,
    'cache-control': 'no-cache'
  })
  if (req.method === 'HEAD') return res.end()
  createReadStream(file).pipe(res)
}

// 只接受同源页面发来的 JSON
function readJson(req, max = 64 * 1024) {
  return new Promise((resolve, reject) => {
    const origin = req.headers.origin
    if (req.method !== 'POST') return reject(Object.assign(new Error('method'), { status: 405 }))
    if (!/^application\/json\b/.test(req.headers['content-type'] || '')) return reject(Object.assign(new Error('需要 JSON'), { status: 415 }))
    if (origin && origin.replace(/^https?:\/\//, '') !== req.headers.host) return reject(Object.assign(new Error('origin'), { status: 403 }))
    let size = 0
    const chunks = []
    req.on('data', (c) => { size += c.length; if (size > max) req.destroy(); else chunks.push(c) })
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')) } catch (e) { reject(Object.assign(e, { status: 400 })) } })
    req.on('error', reject)
  })
}

// 领域分类：给技能库分组用（按技能名归类，找不到的进「其他」）
const CATEGORY = {
  'product-research': ['选品', '选品调研'],
  'category-selection': ['选品', '品类分析'],
  'keyword-research': ['流量', '关键词'],
  'review-analysis': ['流量', '评论洞察'],
  'amazon-analyse': ['竞品', 'Listing 拆解'],
  'amazon-listing-builder': ['转化', 'Listing 优化'],
  'sellersprite-amazon-research': ['数据源', '卖家精灵'],
  'sif-amazon-research': ['数据源', 'Sif'],
  'xiyou-insight': ['数据源', '西柚洞察']
}

function moduleCatalog(skillDirs) {
  return listModules(skillDirs).map((m) => {
    const full = getModule(skillDirs, m.name)
    const group = CATEGORY[m.dirName] || ['其他', '方法']
    return {
      name: m.name,
      dirName: m.dirName,
      description: m.description,
      group: group[0],
      tag: group[1],
      bodyChars: String(full?.body || '').length
    }
  })
}

function catalog(skillDirs) {
  return {
    version: version(),
    platform: process.platform,
    modules: moduleCatalog(skillDirs),
    records: listRecords({ limit: 100 }),
    history: listHistory({ limit: 60 }),
    stats: stats(),
    types: TYPES,
    statuses: STATUS_LABEL,
    verdicts: VERDICT_LABEL,
    kinds: KIND_LABEL
  }
}

function skillDirsOf(skillDirs) {
  return Array.isArray(skillDirs) && skillDirs.length ? skillDirs : SKILL_DIRS
}

export function registerApi(ctx, { skillDirs = SKILL_DIRS } = {}) {
  return ctx.webServer.register({
    kind: 'prefix',
    path: BASE,
    async handler(req, res) {
      try {
        const rejection = requestRejection(ctx, req)
        if (typeof rejection === 'number') return json(res, rejection, { error: '未授权' })

        const dirs = skillDirsOf(skillDirs)
        const url = new URL(req.url, 'http://x')
        const path = decodeURIComponent(url.pathname.slice(BASE.length)) || '/'

        // ---- API ----
        if (path === '/api/ping' && req.method === 'GET') return json(res, 200, { ok: true, version: version() })
        if ((path === '/api/health' || path === '/health') && req.method === 'GET') return json(res, 200, { ok: true, version: version() })

        if (path === '/api/catalog' && req.method === 'GET') {
          return json(res, 200, { ok: true, ...catalog(dirs) })
        }

        if (path === '/api/module' && req.method === 'GET') {
          const id = url.searchParams.get('id') || ''
          const mod = getModule(dirs, id)
          if (!mod) return json(res, 404, { ok: false, error: `没有技能 ${id}` })
          return json(res, 200, { ok: true, module: { name: mod.name, description: mod.description, body: mod.body, dirName: mod.dirName } })
        }

        if (path === '/api/record' && req.method === 'GET') {
          const id = url.searchParams.get('id') || ''
          const record = getRecord(id)
          if (!record) return json(res, 404, { ok: false, error: '没有这条研究记录' })
          return json(res, 200, { ok: true, record })
        }

        if (path === '/api/history' && req.method === 'GET') {
          const list = listHistory({
            kind: url.searchParams.get('kind') || 'all',
            q: url.searchParams.get('q') || '',
            limit: url.searchParams.get('limit') || 150
          })
          return json(res, 200, { ok: true, list, kinds: KIND_LABEL })
        }

        if (path === '/api/record/remove' && req.method === 'POST') {
          const body = await readJson(req).catch((err) => err)
          if (body instanceof Error) return json(res, body.status || 400, { ok: false, error: body.message })
          const id = String(body.id || '')
          const removed = deleteRecord(id)
          return json(res, removed ? 200 : 404, { ok: removed, id, error: removed ? undefined : '没有这条记录' })
        }

        if (path === '/api/history/clear' && req.method === 'POST') {
          const body = await readJson(req).catch((err) => err)
          if (body instanceof Error) return json(res, body.status || 400, { ok: false, error: body.message })
          clearHistory()
          return json(res, 200, { ok: true })
        }

        // ---- 兼容旧面板 ----
        if ((path === '/api/skills' || path === '/api/modules') && req.method === 'GET') {
          const modules = listModules(dirs)
          return json(res, 200, { count: modules.length, skills: modules, modules })
        }
        if (path === '/api/search' && req.method === 'GET') {
          const keyword = url.searchParams.get('q') || ''
          return json(res, 200, { results: searchModules(dirs, keyword).slice(0, 8) })
        }

        if (path.startsWith('/api/')) return json(res, 404, { ok: false, error: 'not found' })

        // ---- 静态页面 ----
        if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { ok: false, error: 'method' })
        const rel = path === '/' ? 'index.html' : path.replace(/^\/+/, '')
        const file = safeLabFile(rel)
        return file ? serve(req, res, file) : json(res, 404, { ok: false, error: 'not found' })
      } catch (err) {
        return json(res, 500, { ok: false, error: String(err?.message || '内部错误') })
      }
    },
  })
}

export { readDir }
