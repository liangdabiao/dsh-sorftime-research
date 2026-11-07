// Amazon 选品分析 · Host 半边。
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSkillProvider } from '../lib/skills.js'
import { registerApi } from '../lib/api.js'

export const name = 'sorftime-research'
export const inject = ['skills', 'webServer', 'connection']

export function apply(ctx) {
  const skillDirs = [join(dirname(fileURLToPath(import.meta.url)), '..', 'skills', 'sorftime')]
  ctx.effect(() => ctx.skills.registerProvider(() => createSkillProvider(skillDirs)), `${name}: skills`)
  ctx.effect(() => registerApi(ctx, { skillDirs }), `${name}: routes`)
}
