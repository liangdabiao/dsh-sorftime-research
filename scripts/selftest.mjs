// 离线自检：9 个技能快照 + 工具 schema + 面板 API 健康。零网络。
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SKILL_DIRS = [join(ROOT, 'skills', 'sorftime')]
const { createSkillProvider } = await import('../lib/skills.js')
const { listModules } = await import('../lib/modules.js')

let failed = 0
const step = async (name, fn) => {
  process.stdout.write(`- ${name} … `)
  try { await fn(); console.log('ok') } catch (err) { failed++; console.log('失败'); console.error(`  ${err.message}`) }
}

await step('9 个方法技能快照完整', async () => {
  const mods = listModules(SKILL_DIRS)
  if (mods.length !== 9) throw new Error(`技能数 ${mods.length} ≠ 9`)
  for (const m of mods) {
    if (!existsSync(join(SKILL_DIRS[0], m.dirName, 'SKILL.md'))) throw new Error(`${m.dirName} 缺 SKILL.md`)
    if (!m.description || m.description.length < 10) throw new Error(`${m.name} 描述过短`)
  }
})

await step('provider：正文 + 插件使用说明', async () => {
  const provider = createSkillProvider(SKILL_DIRS)
  const candidates = await provider.list()
  if (candidates.length !== 9) throw new Error(`候选 ${candidates.length} ≠ 9`)
  for (const c of candidates.slice(0, 3)) {
    const skill = await provider.get(c)
    if (skill.content.length < 3000) throw new Error(`${c.name} 正文过短（${skill.content.length}）`)
    if (!skill.content.includes('MCP')) throw new Error(`${c.name} 缺 MCP 数据源说明`)
  }
})

await step('工具 schema + 参数校验', async () => {
  const host = await import('../src/host.js')
  if (host.name !== 'sorftime-research') throw new Error('插件名不对')
  if (host.sorftimeModuleTool.parameters.additionalProperties !== false) throw new Error('module 工具应拒绝未知参数')
  if (host.sorftimeResearchTool.parameters.additionalProperties !== false) throw new Error('research 工具应拒绝未知参数')
  try {
    await host.sorftimeModuleTool.execute({ action: 'search' })
    throw new Error('search 没 keyword 应该报错')
  } catch (err) {
    if (!/keyword/.test(err.message)) throw err
  }
})

await step('面板 API 健康（内存 ctx 模拟）', async () => {
  process.env.DSH_HOME = join(ROOT, '.tmp', 'selftest-home')
  const { registerApi } = await import('../lib/api.js')
  const captured = []
  const fakeRes = { writeHead() { return this }, end(chunk) { captured.push(String(chunk)) } }
  const fakeCtx = { get: () => ({ requestRejection: () => false }), webServer: { register: async ({ handler }) => { globalThis.__sfHandler = handler } } }
  await registerApi(fakeCtx, { skillDirs: SKILL_DIRS })
  await globalThis.__sfHandler({ method: 'GET', url: '/sorftime-research/api/health', headers: {} }, fakeRes)
  if (!JSON.parse(captured.at(-1)).ok) throw new Error('health 错误')
  await globalThis.__sfHandler({ method: 'GET', url: '/sorftime-research/api/catalog', headers: {} }, fakeRes)
  const cat = JSON.parse(captured.at(-1))
  if (!cat.ok || cat.modules.length !== 9) throw new Error(`catalog 不对：${cat.modules?.length} 个方法`)
})

if (failed > 0) { console.error(`\n自检失败 ${failed} 项`); process.exit(1) }
console.log('\n全部通过。')
