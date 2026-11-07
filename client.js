// Amazon 选品分析面板。
const h = require('react').createElement
const { useState, useEffect } = require('react')
const PANEL_ID = 'sorftime-research'
const BASE = 'sorftime-research'

function PanelIcon(props) {
  return h('svg', { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', ...props },
    h('rect', { x: 2.5, y: 2.5, width: 19, height: 19, rx: 5, fill: '#e67e22' }),
    h('text', { x: 12, y: 15, 'font-size': 7, 'font-weight': 'bold', fill: '#fff', 'text-anchor': 'middle' }, 'SF'))
}

function Panel() {
  const [skills, setSkills] = useState(null)
  useEffect(() => {
    fetch(BASE + '/api/skills').then(r => r.json()).then(d => setSkills(d.skills)).catch(() => {})
  }, [])
  return h('div', { style: { padding: 16, overflow: 'auto', height: '100%', fontFamily: 'sans-serif', fontSize: 13 } },
    h('div', { style: { fontWeight: 700, marginBottom: 8, color: '#e67e22' } }, 'Amazon 选品分析技能集（7 个 MCP 技能）'),
    h('div', { style: { color: '#666', marginBottom: 12 } }, '需配置 Sorftime/Sif/西柚/卖家精灵等 MCP 服务器。未配置时只输出分析框架和公开数据部分。'),
    skills?.map(s => h('div', { key: s.name, style: { background: '#fff', border: '1px solid #e3e3e6', borderRadius: 8, padding: 10, marginBottom: 6 } },
      h('div', { style: { fontWeight: 600, color: '#e67e22' } }, '/' + s.name),
      h('div', { style: { color: '#666', marginTop: 4 } }, s.description.slice(0, 150)))),
    !skills ? h('div', { color: '#999' }, '加载中…') : null)
}

function apply(ctx) {
  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register({ name: 'sidebar.panellist', id: PANEL_ID, order: 25, label: () => '选品分析' }, PanelIcon))
  ctx.slots.inject('main', () =>
    ctx.slots.register({ name: 'main', key: PANEL_ID }, Panel))
}
exports.isPlugin = true
exports.inject = ['slots']
exports.apply = apply
