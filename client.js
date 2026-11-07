// ============================================================================
// Amazon 选品分析 · 浏览器半边（技能库 + 指南 两标签面板）。
// ============================================================================
const h = require('react').createElement
const { useState, useEffect } = require('react')

const PANEL_ID = 'sorftime-research'
const BASE = 'sorftime-research'

function PanelIcon(props) {
  return h('svg', { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', ...props },
    h('rect', { x: 2.5, y: 2.5, width: 19, height: 19, rx: 5, fill: '#b3541e' }),
    h('circle', { cx: 11, cy: 11, r: 4.5, stroke: '#ffd9a0', 'stroke-width': 1.8, fill: 'none' }),
    h('path', { d: 'M14.5 14.5L19 19', stroke: '#ffd9a0', 'stroke-width': 1.8, 'stroke-linecap': 'round' }))
}

async function fetchJson(path) {
  const res = await fetch(BASE + path)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `请求失败（${res.status}）`)
  return data
}

function ModuleDetail({ id, onBack }) {
  const [mod, setMod] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    fetchJson(`/api/module?id=${encodeURIComponent(id)}`).then((d) => setMod(d.module)).catch((e) => setError(e.message))
  }, [id])
  if (error) return h('div', { style: styles.error }, error)
  if (!mod) return h('div', { style: styles.muted }, '加载中…')
  return h('div', null,
    h('div', { style: styles.row },
      h('button', { style: styles.chip, onClick: onBack }, '← 返回列表'),
      h('div', { style: styles.modName }, mod.name)),
    h('div', { style: styles.muted, marginBottom: 8 }, mod.description || ''),
    h('pre', { style: styles.body }, mod.body))
}

function ModulesTab() {
  const [modules, setModules] = useState(null)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)
  const [query, setQuery] = useState('')
  useEffect(() => {
    fetchJson('/api/modules').then((d) => setModules(d.modules)).catch((e) => setError(e.message))
  }, [])
  if (error) return h('div', { style: styles.error }, error)
  if (selected) return h(ModuleDetail, { id: selected, onBack: () => setSelected(null) })
  if (modules === null) return h('div', { style: styles.muted }, '加载中…')

  const q = query.trim().toLowerCase()
  const filtered = q ? modules.filter((m) => `${m.name} ${m.description}`.toLowerCase().includes(q)) : modules

  return h('div', null,
    h('input', {
      style: styles.search, placeholder: '搜索 9 个选品技能，如「选品」「关键词」「评论」…',
      value: query, onChange: (e) => setQuery(e.target.value),
    }),
    h('div', { style: styles.grid },
      filtered.map((m) => h('div', {
        key: m.dirName, style: styles.card, onClick: () => setSelected(m.name),
        title: '点击查看完整流程',
      },
        h('div', { style: styles.modName }, m.name),
        h('div', { style: styles.mutedSmall }, m.description || '')))))
}

function GuideTab() {
  return h('div', null,
    h('div', { style: styles.card },
      h('div', { style: styles.sectionTitle }, '怎么用'),
      h('div', { style: styles.stepList },
        h('div', { style: styles.quote }, '「分析下宠物用品类目的选品机会」'),
        h('div', { style: styles.quote }, '「研究一下这个 ASIN 的竞品和关键词」'),
        h('div', { style: styles.quote }, '「分析这个类目 top100 评论找痛点」'),
        '模型先调 sorftime_module 匹配方法技能（产品研究/关键词/类目/评论…），拿到完整流程后照此执行。')),
    h('div', { style: styles.card },
      h('div', { style: styles.sectionTitle }, '1 个工具'),
      h('div', { style: styles.muted, lineHeight: 2 },
        h('b', null, 'sorftime_module'), ' — list 列 9 个技能 / search 关键词匹配 / get 取完整流程正文。')),
    h('div', { style: styles.card },
      h('div', { style: styles.sectionTitle }, 'MCP 数据源'),
      h('div', { style: styles.muted, lineHeight: 1.8 },
        '正文里提到的 Sorftime / Sif / 西柚 / 卖家精灵 MCP 服务需要你在 dsh 里配置对应 MCP 服务器和 token。',
        h('br'), '未配置时模型照样输出分析框架与公开数据部分，数据缺口如实标注 N/A。')))
}

const TABS = [['modules', '技能库'], ['guide', '指南']]

function Panel() {
  const [tab, setTab] = useState('modules')
  return h('div', { style: styles.wrap },
    h('div', { style: styles.tabBar },
      TABS.map(([id, label]) => h('button', {
        key: id, style: tab === id ? styles.tabActive : styles.tab, onClick: () => setTab(id),
      }, label))),
    tab === 'modules' ? h(ModulesTab) : h(GuideTab))
}

const styles = {
  wrap: { padding: 16, overflow: 'auto', height: '100%', boxSizing: 'border-box', fontFamily: '-apple-system, "Segoe UI", "Microsoft YaHei", sans-serif', fontSize: 13, color: '#1a1a1a' },
  tabBar: { display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  tab: { padding: '8px 16px', border: '1px solid #d9d9de', borderRadius: 8, background: '#fff', color: '#1a1a1a', cursor: 'pointer', fontSize: 13 },
  tabActive: { padding: '8px 16px', border: '1px solid #b3541e', borderRadius: 8, background: '#fdf0e7', color: '#b3541e', cursor: 'pointer', fontWeight: 600, fontSize: 13 },
  row: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 },
  chip: { padding: '4px 12px', border: '1px solid #d9d9de', borderRadius: 999, background: '#fff', cursor: 'pointer', fontSize: 12 },
  card: { background: '#fff', border: '1px solid #e3e3e6', borderRadius: 10, padding: 12, marginBottom: 10 },
  sectionTitle: { fontWeight: 700, marginBottom: 6 },
  stepList: { lineHeight: 1.9 },
  quote: { background: '#fdf0e7', borderRadius: 6, padding: '4px 10px', margin: '4px 0', color: '#b3541e' },
  muted: { color: '#8a8a92', lineHeight: 1.8 },
  mutedSmall: { color: '#a0a0a8', fontSize: 12, lineHeight: 1.6 },
  error: { color: '#c0392b', padding: 12 },
  search: { width: '100%', boxSizing: 'border-box', padding: '8px 12px', border: '1px solid #d9d9de', borderRadius: 8, fontSize: 13, marginBottom: 10 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 },
  modName: { fontWeight: 600, color: '#b3541e', marginBottom: 4 },
  body: { background: '#f7f7f8', borderRadius: 8, padding: 12, fontSize: 12, overflow: 'auto', maxHeight: '65vh', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.7 },
}

function apply(ctx) {
  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register({ name: 'sidebar.panellist', id: PANEL_ID, order: 15, label: () => '选品研究' }, PanelIcon))
  ctx.slots.inject('main', () =>
    ctx.slots.register({ name: 'main', key: PANEL_ID }, Panel))
}

exports.isPlugin = true
exports.inject = ['slots']
exports.apply = apply
