// dsh-sorftime-research 单测（node test/lib.test.mjs 直接跑）。
import assert from 'node:assert/strict'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SKILL_DIRS = [join(ROOT, 'skills', 'sorftime')]

let passed = 0, failed = 0
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`) }
  catch (err) { failed++; console.error(`  ✗ ${name}\n    ${err?.message?.split('\n')[0]}`) }
}

const { listModules, getModule, searchModules } = await import('../lib/modules.js')

await test('modules: 9 个技能全量加载', async () => {
  const list = listModules(SKILL_DIRS)
  assert.equal(list.length, 9)
  assert.ok(list.every((m) => m.name && m.description))
})

await test('modules: get 精确命中 + 未知为 null', async () => {
  const first = listModules(SKILL_DIRS)[0]
  const mod = getModule(SKILL_DIRS, first.name)
  assert.ok(mod.body.length > 200, '正文过短')
  assert.equal(getModule(SKILL_DIRS, 'no-such'), null)
})

await test('modules: search 中英文关键词', async () => {
  assert.ok(searchModules(SKILL_DIRS, 'review').length >= 1, 'review 应命中')
  assert.ok(searchModules(SKILL_DIRS, '关键词').length >= 1, '关键词 应命中')
  assert.equal(searchModules(SKILL_DIRS, 'zzz不存在').length, 0)
})

const host = await import('../src/host.js')

await test('host: 工具 schema + 校验', async () => {
  assert.equal(host.name, 'sorftime-research')
  assert.equal(host.sorftimeModuleTool.parameters.additionalProperties, false)
  await assert.rejects(() => host.sorftimeModuleTool.execute({ action: 'list', bogus: 1 }), /未知参数/)
  await assert.rejects(() => host.sorftimeModuleTool.execute({ action: 'search' }), /需要 keyword/)
  const list = await host.sorftimeModuleTool.execute({ action: 'list' })
  assert.equal(list.ok, true)
})

await test('api: 鉴权深度防御语义', async () => {
  const api = await import('../lib/api.js')
  assert.equal(api.requestRejection({ get: () => undefined }, { headers: {} }), false)
  assert.equal(api.requestRejection({ get: () => ({ requestRejection: () => 403 }) }, { headers: {} }), 403)
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
