// Amazon 选品分析技能集单测。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const { createSkillProvider } = await import('../lib/skills.js')
const api = await import('../lib/api.js')

test('7 个技能全部可解析且无引号', async () => {
  const provider = createSkillProvider([join(ROOT, 'skills', 'sorftime')])
  const candidates = await provider.list()
  assert.equal(candidates.length, 7)
  for (const c of candidates) {
    assert.ok(!c.name.includes('"'), `${c.name} 有引号`)
    assert.match(c.name, /^[a-z0-9]+(-[a-z0-9]+)*$/, `${c.name} 不合规范`)
    assert.ok(c.description.length > 20, `${c.name} desc 太短`)
  }
})

test('addendum：MCP 配置说明 + 工作区约定', async () => {
  const provider = createSkillProvider([join(ROOT, 'skills', 'sorftime')])
  const c = (await provider.list())[0]
  const skill = await provider.get(c)
  assert.match(skill.content, /MCP/, '应提 MCP')
  assert.match(skill.content, /工作区/, '应有工作区约定')
})

test('面板 API 鉴权', () => {
  assert.equal(api.requestRejection({ get: () => undefined }, { headers: {} }), 403)
})

test('LICENSE 为 MIT', () => {
  assert.match(readFileSync(join(ROOT, 'LICENSE'), 'utf8'), /MIT/)
})
