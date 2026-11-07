// Amazon 选品分析面板。
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readDir } from './skills.js'
const BASE = '/sorftime-research'
const SKILL_DIRS = [join(dirname(fileURLToPath(import.meta.url)), '..', 'skills', 'sorftime')]

function json(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(value))
}
export function requestRejection(ctx, req) {
  const connection = ctx.get('connection')
  if (typeof connection?.requestRejection !== 'function') return 403
  return connection.requestRejection({ headers: req.headers })
}
export function registerApi(ctx, { skillDirs }) {
  return ctx.webServer.register({
    kind: 'prefix', path: BASE,
    async handler(req, res) {
      try {
        const r = requestRejection(ctx, req)
        if (typeof r === 'number') return json(res, r, { error: '未授权' })
        const url = new URL(req.url, 'http://x')
        const path = url.pathname.slice(BASE.length) || '/'
        if (path === '/api/health') return json(res, 200, { ok: true })
        if (path === '/api/skills') {
          const skills = skillDirs.flatMap((d) => readDir(d)).map((s) => ({ name: s.name, description: s.description }))
          return json(res, 200, { count: skills.length, skills })
        }
        json(res, 404, { error: 'not found' })
      } catch (err) { json(res, 500, { error: err?.message }) }
    },
  })
}
