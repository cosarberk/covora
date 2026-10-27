/**
 * @module @covora/flow/nodes/domain
 *
 * Domain node'ları — gerçek covora review hattını Blueprint node'ları olarak
 * açar: Proje → Kaynak (dosya çek) → Değerlendir → Skorla (coverage) → Kapı
 * (gate) → Bildir. Her node `ctx.services` üzerinden server tarafından enjekte
 * edilen GERÇEK servisi çağırır (dekoratif değil). Metadata (port/param) burada
 * tanımlı olduğu için frontend de aynı defterden paleti ve node gövdesini çizer.
 */

import type { FlowServices, NodeTypeDef } from '../node-type.js'
import { COVERAGE_T, FILESET_T, GATE_T, NOTIFICATION_T, PROJECT_T, RULE_RESULTS_T } from '../types.js'

const asString = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v))

/** Bağlı `project` portundaki değerden proje anahtarını çıkarır. */
const projectKeyOf = (project: unknown): string => {
  const key = (project as { key?: unknown } | null)?.key
  if (typeof key !== 'string' || key.length === 0) {
    throw new Error('Geçersiz proje girişi: anahtar yok')
  }
  return key
}

/** Enjekte edilmemiş bir servis metodunu net hatayla bildirir. */
const requireService = <K extends keyof FlowServices>(
  services: FlowServices,
  name: K
): NonNullable<FlowServices[K]> => {
  const fn = services[name]
  if (fn === undefined) {
    throw new Error(`Servis bağlı değil: ${String(name)} (bu node yalnızca server motorunda çalışır)`)
  }
  return fn as NonNullable<FlowServices[K]>
}

/** Projeyi anahtarına göre çözer (hattın başı). */
export const projectNode: NodeTypeDef = {
  type: 'project',
  category: 'Kaynak',
  label: 'Proje',
  glyph: '◆',
  description: 'Bir covora projesini anahtarına göre çözer; hattın başlangıcıdır.',
  inputs: [],
  outputs: [{ name: 'project', label: 'proje', type: PROJECT_T }],
  params: [{ name: 'projectKey', label: 'proje anahtarı', control: 'text', placeholder: 'ornek-proje' }],
  execute: async ({ params, services, log }) => {
    const resolve = requireService(services, 'resolveProject')
    const key = asString(params.projectKey)
    if (key.length === 0) throw new Error('Proje anahtarı boş')
    const project = await resolve(key)
    if (project === null) throw new Error(`Proje bulunamadı: ${key}`)
    await log('info', `Proje çözüldü: ${project.name} (${project.key})`)
    return { project }
  }
}

/** Projeden dosya kümesini çeker (tüm proje ya da değişen dosyalar). */
export const sourceNode: NodeTypeDef = {
  type: 'source',
  category: 'Kaynak',
  label: 'Kaynak',
  glyph: '⎘',
  description: 'Projenin kod deposundan dosyaları çeker (tüm proje ya da base→head değişenleri).',
  inputs: [{ name: 'project', label: 'proje', type: PROJECT_T, required: true }],
  outputs: [{ name: 'files', label: 'dosyalar', type: FILESET_T }],
  params: [
    { name: 'mode', label: 'kapsam', control: 'select', options: ['project', 'changes'], default: 'project' },
    { name: 'ref', label: 'dal/ref', control: 'text', placeholder: '(varsayılan dal)' },
    { name: 'base', label: 'base', control: 'text', placeholder: 'changes için' },
    { name: 'head', label: 'head', control: 'text', placeholder: 'changes için' }
  ],
  execute: async ({ inputs, params, services, log }) => {
    const pull = requireService(services, 'pullFiles')
    const key = projectKeyOf(inputs.project)
    const mode = asString(params.mode) === 'changes' ? 'changes' : 'project'
    const ref = asString(params.ref)
    const base = asString(params.base)
    const head = asString(params.head)
    const files = await pull(key, {
      mode,
      ...(ref.length > 0 ? { ref } : {}),
      ...(base.length > 0 ? { base } : {}),
      ...(head.length > 0 ? { head } : {})
    })
    await log('info', `${files.count} dosya çekildi (${files.mode}, ${files.ref}@${files.head})`)
    return { files }
  }
}

/** Kuralları dosya kümesine göre değerlendirir (deterministik + LLM). */
export const evaluateNode: NodeTypeDef = {
  type: 'evaluate',
  category: 'İnceleme',
  label: 'Değerlendir',
  glyph: '✓',
  description: 'Projenin etkin kurallarını dosyalara göre değerlendirir (deterministik checker + LLM yargı).',
  inputs: [
    { name: 'project', label: 'proje', type: PROJECT_T, required: true },
    { name: 'files', label: 'dosyalar', type: FILESET_T, required: true }
  ],
  outputs: [{ name: 'ruleResults', label: 'kural sonuçları', type: RULE_RESULTS_T }],
  params: [{ name: 'kind', label: 'tür', control: 'select', options: ['code', 'ui'], default: 'code' }],
  execute: async ({ inputs, params, services, log }) => {
    const evaluate = requireService(services, 'evaluate')
    const key = projectKeyOf(inputs.project)
    const kind = asString(params.kind) || 'code'
    const files = (inputs.files as { files?: unknown } | null)?.files
    const ruleResults = await evaluate(key, { kind, files })
    await log('info', `${ruleResults.total} kural değerlendirildi`)
    return { ruleResults }
  }
}

/** Kural sonuçlarından deterministik coverage skoru hesaplar. */
export const coverageNode: NodeTypeDef = {
  type: 'coverage',
  category: 'İnceleme',
  label: 'Skorla',
  glyph: '▣',
  description: 'Kural sonuçları ve ağırlıklardan deterministik coverage yüzdesi/seviyesi üretir.',
  inputs: [
    { name: 'project', label: 'proje', type: PROJECT_T, required: true },
    { name: 'ruleResults', label: 'kural sonuçları', type: RULE_RESULTS_T, required: true }
  ],
  outputs: [{ name: 'coverage', label: 'coverage', type: COVERAGE_T }],
  params: [{ name: 'kind', label: 'tür', control: 'select', options: ['code', 'ui'], default: 'code' }],
  execute: async ({ inputs, params, services, log }) => {
    const score = requireService(services, 'scoreCoverage')
    const key = projectKeyOf(inputs.project)
    const kind = asString(params.kind) || 'code'
    const coverage = await score(key, { kind, ruleResults: inputs.ruleResults })
    await log('info', `Coverage: %${coverage.score.toFixed(1)} (${coverage.level})`)
    return { coverage }
  }
}

/** Coverage'a göre merge gate kararını üretir. */
export const gateNode: NodeTypeDef = {
  type: 'gate',
  category: 'İnceleme',
  label: 'Kapı',
  glyph: '⛉',
  description: 'Coverage skorunu gate politikasına göre değerlendirir (geç/kal + gerekçeler).',
  inputs: [
    { name: 'project', label: 'proje', type: PROJECT_T, required: true },
    { name: 'coverage', label: 'coverage', type: COVERAGE_T, required: true }
  ],
  outputs: [{ name: 'gate', label: 'kapı', type: GATE_T }],
  execute: async ({ inputs, services, log }) => {
    const gateFn = requireService(services, 'evaluateGate')
    const key = projectKeyOf(inputs.project)
    const gate = await gateFn(key, inputs.coverage)
    await log(gate.passed ? 'info' : 'warn', gate.passed ? 'Kapı: GEÇTİ' : `Kapı: KALDI (${gate.reasons.join('; ')})`)
    return { gate }
  }
}

/** Gate kararını yapılandırılmış kanallara (webhook vb.) bildirir. */
export const notifyNode: NodeTypeDef = {
  type: 'notify',
  category: 'Eylem',
  label: 'Bildir',
  glyph: '✉',
  description: 'Gate kararını projenin aktif webhook/kanal entegrasyonlarına iletir.',
  inputs: [
    { name: 'project', label: 'proje', type: PROJECT_T, required: true },
    { name: 'gate', label: 'kapı', type: GATE_T, required: true }
  ],
  outputs: [{ name: 'notification', label: 'bildirim', type: NOTIFICATION_T }],
  execute: async ({ inputs, services, log }) => {
    const notify = requireService(services, 'notify')
    const key = projectKeyOf(inputs.project)
    const notification = await notify(key, inputs.gate)
    await log('info', `Bildirim: ${notification.delivered} iletildi, ${notification.failed} başarısız`)
    return { notification }
  }
}

/** Tüm domain node'ları (hattın sırası). */
export const DOMAIN_NODES: readonly NodeTypeDef[] = [
  projectNode,
  sourceNode,
  evaluateNode,
  coverageNode,
  gateNode,
  notifyNode
]
