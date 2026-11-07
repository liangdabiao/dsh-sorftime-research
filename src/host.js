// Amazon 选品分析 · Host 半边（技能 + sorftime_module 原生工具 + 面板数据面）。
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSkillProvider } from '../lib/skills.js'
import { registerApi } from '../lib/api.js'
import { listModules, getModule, searchModules } from '../lib/modules.js'

export const name = 'sorftime-research'
export const inject = ['tools', 'skills', 'webServer', 'connection']

function check(args, spec) {
  const problems = []
  for (const key of spec.required || []) {
    if (args?.[key] === undefined) problems.push(`缺少必填参数 ${key}`)
  }
  for (const [key, rule] of Object.entries(spec.properties || {})) {
    const value = args?.[key]
    if (value === undefined) continue
    if (rule.enum && !rule.enum.includes(value)) problems.push(`${key} 只能是 ${rule.enum.join(' / ')} 之一`)
  }
  for (const key of Object.keys(args || {})) {
    if (!spec.properties || !(key in spec.properties)) problems.push(`未知参数 ${key}`)
  }
  if (problems.length) throw new Error(`sorftime_module 参数有误：${problems.join('；')}。`)
}

const str = (description, extra = {}) => ({ type: 'string', description, ...extra })
const num = (description, extra = {}) => ({ type: 'number', description, ...extra })
const text = (value) => [{ type: 'text', text: value }]

const OUTPUT = {
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['ok', 'summary'],
    properties: {
      ok: { type: 'boolean' },
      summary: { type: 'string', description: '给模型看的回执' },
      data: { type: 'string', description: '可选：模块列表/正文' },
    },
  },
  render: (_args, value) => text(value.data ? `${value.summary}\n\n${value.data}` : value.summary),
}

const result = (ok, summary, data = '') => ({ ok, summary, data })

// ---------------------------------------------------------------------------
// 工具：sorftime_module —— 9 个 Amazon 选品分析技能查询
// ---------------------------------------------------------------------------
export const sorftimeModuleTool = {
  name: 'sorftime_module',
  description:
    '查询 9 个 Amazon 选品分析方法技能（产品研究、关键词研究、类目选择、竞品分析、Listing 构建、评论分析、Sif/卖家精灵/西柚数据洞察等）。' +
    '做亚马逊选品/市场分析前先 search 匹配方法技能，get 拿完整流程后照此执行；正文里提到的 Sorftime/Sif/卖家精灵 MCP 需要用户配置，未配置时输出框架并标注数据缺口。',
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['action'],
    properties: {
      action: str('list 列全部技能；search 关键词搜索；get 取完整正文', { enum: ['list', 'search', 'get'] }),
      id: str('get：技能名（list/search 里能看到）'),
      keyword: str('search：关键词，如「选品」「关键词」「评论」「review」「类目」'),
      limit: num('search：最多返回条数，默认 8'),
    },
  },
  output: OUTPUT,
  async execute(args) {
    check(args, this.parameters)
    const skillDirs = skillDirsRef.dirs
    if (args.action === 'list') {
      const mods = listModules(skillDirs)
      return result(true, `共 ${mods.length} 个选品分析技能：`,
        mods.map((m) => `- ${m.name}：${m.description}`).join('\n'))
    }
    if (args.action === 'search') {
      if (!args.keyword) throw new Error('search 需要 keyword。')
      const found = searchModules(skillDirs, args.keyword).slice(0, args.limit || 8)
      if (!found.length) return result(false, `没有匹配「${args.keyword}」的技能，试试 list 看全部。`)
      return result(true, `匹配到 ${found.length} 个技能：`,
        found.map((m) => `- ${m.name}：${m.description}\n  命中：…${m.snippet}…`).join('\n'))
    }
    if (!args.id) throw new Error('get 需要 id。')
    const mod = getModule(skillDirs, args.id)
    if (!mod) return result(false, `没有找到技能 ${args.id}（先 search/list 找名字）。`)
    return result(true, `技能「${mod.name}」完整流程（照此执行分析）：`, mod.body)
  },
}

const skillDirsRef = { dirs: [] }

export function apply(ctx) {
  const skillDirs = [join(dirname(fileURLToPath(import.meta.url)), '..', 'skills', 'sorftime')]
  skillDirsRef.dirs = skillDirs
  ctx.effect(() => ctx.tools.register(sorftimeModuleTool), `${name}: tool modules`)
  ctx.effect(() => ctx.skills.registerProvider(() => createSkillProvider(skillDirs)), `${name}: skills`)
  ctx.effect(() => registerApi(ctx, { skillDirs }), `${name}: routes`)
}
