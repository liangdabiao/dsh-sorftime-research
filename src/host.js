// Amazon 选品分析 · Host 半边（9 个方法技能 + sorftime_module 查询 + sorftime_research 研究记录 + 工作台数据面）。
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSkillProvider } from '../lib/skills.js'
import { registerApi } from '../lib/api.js'
import { listModules, getModule, searchModules } from '../lib/modules.js'
import {
  KIND_LABEL, STATUS_LABEL, TYPES, VERDICT_LABEL, VERDICTS,
  deleteRecord, getRecord, listHistory, listRecords, logLookup, saveRecord, stats
} from '../lib/data.js'

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
  if (problems.length) throw new Error(`参数有误：${problems.join('；')}。`)
}

const str = (description, extra = {}) => ({ type: 'string', description, ...extra })
const num = (description, extra = {}) => ({ type: 'number', description, ...extra })
const arr = (description) => ({ type: 'array', description, items: { type: 'string' } })
const text = (value) => [{ type: 'text', text: value }]

const OUTPUT = {
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['ok', 'summary'],
    properties: {
      ok: { type: 'boolean' },
      summary: { type: 'string', description: '给模型看的回执' },
      data: { type: 'string', description: '可选：列表/正文/记录详情' },
    },
  },
  render: (_args, value) => text(value.data ? `${value.summary}\n\n${value.data}` : value.summary),
}

const result = (ok, summary, data = '') => ({ ok, summary, data })

// ---------------------------------------------------------------------------
// 工具 1：sorftime_module —— 9 个方法技能查询（查过就记一笔 lookup 历史）
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
      for (const m of found.slice(0, 3)) logLookup(m.name, { action: 'search', keyword: args.keyword })
      return result(true, `匹配到 ${found.length} 个技能：`,
        found.map((m) => `- ${m.name}：${m.description}\n  命中：…${m.snippet}…`).join('\n'))
    }
    if (!args.id) throw new Error('get 需要 id。')
    const mod = getModule(skillDirs, args.id)
    if (!mod) return result(false, `没有找到技能 ${args.id}（先 search/list 找名字）。`)
    logLookup(mod.name, { action: 'get' })
    return result(true, `技能「${mod.name}」完整流程（照此执行分析）：`, mod.body)
  },
}

// ---------------------------------------------------------------------------
// 工具 2：sorftime_research —— 研究记录（结论卡：产品/词/类目/评论/Listing…）
// ---------------------------------------------------------------------------
const RESEARCH_PARAMS = {
  type: 'object',
  additionalProperties: false,
  required: ['action'],
  properties: {
    action: str('save 存结论；list 列表；get 详情；delete 删除；history 生成历史；stats 汇总', { enum: ['save', 'list', 'get', 'delete', 'history', 'stats'] }),
    id: str('save 传 id 表示更新；get/delete 传 id'),
    topic: str('save：研究什么（产品/类目/ASIN 的一句话）'),
    type: str(`save：研究类型`, { enum: Object.keys(TYPES) }),
    marketplace: str('save：站点，如 US / GB / DE，默认 US'),
    asin: str('save：ASIN（可选）'),
    category: str('save：类目名（可选）'),
    skills: arr('save：用了哪些方法技能（sorftime_module 里的名字）'),
    status: str('save：规划中 / 进行中 / 已完成', { enum: ['planning', 'running', 'done'] }),
    verdict: str('save：结论', { enum: VERDICTS }),
    findings: str('save：核心发现（多行，可写数据点与判断）'),
    reportPath: str('save：报告文件路径（可选）'),
    confirm: str('delete 必须传 "yes"', { enum: ['yes'] }),
    kind: str('history：只看某一类事件', { enum: ['all', 'lookup', 'save', 'update', 'delete'] }),
    q: str('list/history：关键词'),
    limit: num('list/history：最多几条，默认 20'),
  }
}

function recordLine(r) {
  return `${r.topic}｜${TYPES[r.type] || r.type}${r.marketplace ? ` · ${r.marketplace}` : ''}${r.verdict && r.verdict !== 'none' ? ` · ${VERDICT_LABEL[r.verdict]}` : ''}｜${STATUS_LABEL[r.status] || r.status}｜id=${r.id}`
}

export const sorftimeResearchTool = {
  name: 'sorftime_research',
  description:
    '存/查亚马逊选品研究记录（结论卡，持久化）：save 存一次研究的主题、类型、站点、ASIN、用过的方法技能、结论（go/watch/no-go）、核心发现与报告路径；' +
    'list 列记录、get 详情、delete 删除、history 看生成历史（含查过哪些方法）、stats 汇总。' +
    '用户让「分析某类目/产品/关键词/评论」并跑完一轮分析后就该 save 一条，侧栏「选品研究」工作台能看到全部结论。',
  parameters: RESEARCH_PARAMS,
  timeoutMs: 30_000,
  output: OUTPUT,
  async execute(args) {
    check(args, this.parameters)

    if (args.action === 'save') {
      const record = saveRecord({
        id: args.id, topic: args.topic, type: args.type, marketplace: args.marketplace,
        asin: args.asin, category: args.category, skills: args.skills, status: args.status,
        verdict: args.verdict, findings: args.findings, reportPath: args.reportPath
      })
      return result(true, `研究记录「${record.topic}」已保存（${TYPES[record.type]}${record.verdict !== 'none' ? ` · ${VERDICT_LABEL[record.verdict]}` : ''}，id=${record.id}）。用户可在侧栏「选品研究 · 研究记录」查看。`)
    }

    if (args.action === 'list') {
      const list = listRecords({ type: args.type || 'all', q: args.q, limit: Math.min(100, Number(args.limit) || 20) })
      if (!list.length) return result(true, '还没有研究记录', '跑完一次分析后用 save 存一条，之后能在这里回看结论。')
      return result(true, `共 ${list.length} 条研究记录：`, list.map(recordLine).join('\n'))
    }

    if (args.action === 'get') {
      if (!args.id) throw new Error('get 需要 id（list 里能看到）。')
      const r = getRecord(args.id)
      if (!r) return result(false, `没有记录 ${args.id}。`)
      return result(true, `研究记录「${r.topic}」`, [
        `类型：${TYPES[r.type] || r.type}｜站点：${r.marketplace || 'US'}${r.asin ? `｜ASIN：${r.asin}` : ''}${r.category ? `｜类目：${r.category}` : ''}`,
        `状态：${STATUS_LABEL[r.status] || r.status}｜结论：${VERDICT_LABEL[r.verdict] || r.verdict}`,
        r.skills && r.skills.length ? `用过的方法：${r.skills.join(' / ')}` : '',
        r.findings ? `\n核心发现：\n${r.findings}` : '',
        r.reportPath ? `\n报告：${r.reportPath}` : '',
        `\n建 ${String(r.createdAt).slice(0, 16).replace('T', ' ')}｜改 ${String(r.updatedAt).slice(0, 16).replace('T', ' ')}`
      ].filter(Boolean).join('\n'))
    }

    if (args.action === 'delete') {
      if (!args.id) throw new Error('delete 需要 id。')
      if (args.confirm !== 'yes') return result(false, '删除记录请用 confirm:"yes"。')
      return deleteRecord(args.id) ? result(true, `记录 ${args.id} 已删除。`) : result(false, `没有记录 ${args.id}。`)
    }

    if (args.action === 'history') {
      const list = listHistory({ kind: args.kind || 'all', q: args.q, limit: Math.min(100, Number(args.limit) || 20) })
      if (!list.length) return result(true, '还没有生成历史', '查一次方法技能或存一条记录，这里就会留档。')
      return result(true, `最近 ${list.length} 条历史：`,
        list.map((e) => `- ${String(e.at).slice(0, 16).replace('T', ' ')} ${KIND_LABEL[e.kind] || e.kind}｜${e.summary}｜id=${e.id}`).join('\n'))
    }

    // stats
    const s = stats()
    const types = Object.entries(s.byType).map(([k, v]) => `${TYPES[k] || k} ${v}`).join('、') || '无'
    return result(true, `共 ${s.records} 条研究记录（完成 ${s.done}），历史 ${s.events} 条（查方法 ${s.lookups} 次）`, [
      `类型分布：${types}`,
      `结论分布：推荐 ${s.byVerdict.go}｜观望 ${s.byVerdict.watch}｜放弃 ${s.byVerdict['no-go']}｜未结论 ${s.byVerdict.none}`,
      s.topModules.length ? `最常用的方法：${s.topModules.map((m) => `${m.name}(${m.count})`).join('、')}` : '',
      s.lastEventAt ? `最近动作：${String(s.lastEventAt).replace('T', ' ').slice(0, 16)}` : ''
    ].filter(Boolean).join('\n'))
  },
}

const skillDirsRef = { dirs: [] }

export function apply(ctx) {
  const skillDirs = [join(dirname(fileURLToPath(import.meta.url)), '..', 'skills', 'sorftime')]
  skillDirsRef.dirs = skillDirs
  ctx.effect(() => ctx.tools.register(sorftimeModuleTool), `${name}: tool modules`)
  ctx.effect(() => ctx.tools.register(sorftimeResearchTool), `${name}: tool research`)
  ctx.effect(() => ctx.skills.registerProvider(() => createSkillProvider(skillDirs)), `${name}: skills`)
  ctx.effect(() => registerApi(ctx, { skillDirs }), `${name}: routes`)
}
