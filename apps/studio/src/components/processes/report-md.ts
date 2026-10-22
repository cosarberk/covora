/**
 * @module studio/components/processes/report-md
 *
 * Seçili bir review run'ından (durum, adımlar, kural sonuçları, coverage, gate,
 * origin, AI değerlendirmesi) insan-okunur bir Markdown rapor üretir. Tamamen
 * istemci tarafında, mevcut run/report verisinden derlenir; backend'e dokunmaz.
 * Tablolar GFM biçimindedir ve sonuçlar renkli tiklerle gösterilir.
 */

import type { ManagementRule, ReviewRun, RuleResult } from '@covora/types'

import type { RunReport } from '../../api/client.js'
import { RUN_STATUS_LABEL, STEP_STATUS_LABEL, formatDuration } from './graph.js'

/** Adım anahtarını okunur başlığa çevirir. */
const STEP_TITLE: Record<string, string> = {
  ingest: 'Girdi (ingest)',
  deterministic: 'Deterministik',
  llm: 'AI (LLM)',
  coverage: 'Coverage',
  gate: 'Gate',
  persist: 'Kayıt',
  notify: 'Bildirim'
}

/** Sonucu renkli tik + etiketle gösterir (önizlemede görsel geri bildirim). */
const OUTCOME_MD: Record<RuleResult['outcome'], string> = {
  pass: '✅ GEÇTİ',
  partial: '🟡 KISMİ',
  fail: '❌ KALDI'
}

/** Markdown tablo hücresi için metni güvenli hale getirir (| ve newline). */
const cell = (text: string): string => text.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim()

/** ISO tarihi yerel okunur biçime çevirir. */
const formatDate = (iso?: string): string =>
  iso !== undefined ? new Date(iso).toLocaleString('tr-TR') : '—'

/**
 * Seçili run için Markdown rapor üretir.
 *
 * @param run - Açık run.
 * @param report - Rapor (kural sonuçları + coverage/gate); yoksa null.
 * @param rules - Projenin kuralları (başlık/tip eşlemesi için).
 * @returns Markdown metni.
 */
export const buildRunReportMarkdown = (
  run: ReviewRun,
  report: RunReport | null,
  rules: readonly ManagementRule[]
): string => {
  const ruleByKey = new Map(rules.map((rule) => [rule.key, rule]))
  const coverage = report?.outcome?.coverage ?? null
  const gate = report?.outcome?.gate ?? null
  const results = report?.results ?? []

  const out: string[] = []
  out.push('# Review Raporu')
  out.push('')
  out.push(
    `**Tür:** ${run.kind} · **Skor:** ${
      run.score === null || run.score === undefined ? '—' : run.score.toFixed(1)
    } · **Seviye:** ${run.level ?? '—'} · **Gate:** ${
      run.gatePassed === null || run.gatePassed === undefined
        ? '—'
        : run.gatePassed
          ? '✅ GEÇTİ'
          : '❌ KALDI'
    }`
  )
  out.push('')
  out.push('## Genel')
  out.push('')
  out.push(`- **Durum:** ${RUN_STATUS_LABEL[run.status]}`)
  out.push(`- **codeHash:** \`${run.codeHash}\``)
  out.push(`- **Başlangıç:** ${formatDate(run.startedAt)}`)
  out.push(`- **Süre:** ${formatDuration(run.startedAt, run.finishedAt) ?? '—'}`)
  if (run.origin !== undefined) {
    const label = run.origin.source ?? 'kaynak'
    const branch = run.origin.branch !== undefined ? ` (${run.origin.branch})` : ''
    out.push(
      run.origin.refUrl !== undefined
        ? `- **Kaynak:** [${label}${branch}](${run.origin.refUrl})`
        : `- **Kaynak:** ${label}${branch}`
    )
  }
  out.push('')

  // Adımlar
  out.push('## Adımlar')
  out.push('')
  out.push('| Adım | Durum | Süre |')
  out.push('| --- | --- | --- |')
  for (const step of run.steps) {
    const title = STEP_TITLE[step.key] ?? step.key
    const dur = formatDuration(step.startedAt, step.finishedAt) ?? '—'
    out.push(`| ${cell(title)} | ${STEP_STATUS_LABEL[step.status]} | ${dur} |`)
  }
  out.push('')

  // Kural sonuçları
  out.push('## Kural Sonuçları')
  out.push('')
  if (results.length === 0) {
    out.push('_Kural sonucu yok._')
  } else {
    out.push('| Kural | Tip | Sonuç | Ağırlık | Not |')
    out.push('| --- | --- | --- | --- | --- |')
    for (const result of results) {
      const rule = ruleByKey.get(result.ruleId)
      const title = rule?.title ?? result.ruleId
      const type = rule?.evaluation === 'llm' ? 'AI' : rule?.evaluation === 'deterministic' ? 'det' : '—'
      const weight = rule?.weight ?? '—'
      const note = result.note !== undefined && result.note.length > 0 ? result.note : '—'
      out.push(
        `| ${cell(title)} | ${type} | ${OUTCOME_MD[result.outcome]} | ${weight} | ${cell(note)} |`
      )
    }
  }
  out.push('')

  // Coverage
  if (coverage !== null) {
    out.push('## Coverage')
    out.push('')
    out.push(`- **Kazanılan / Toplam ağırlık:** ${coverage.earnedWeight.toFixed(2)} / ${coverage.totalWeight.toFixed(2)}`)
    out.push(`- **Skor:** ${coverage.score.toFixed(1)} (${coverage.level})`)
    out.push(
      `- **Uyumsuz blocker:** ${
        coverage.failedBlockers.length > 0 ? coverage.failedBlockers.join(', ') : 'yok'
      }`
    )
    out.push('')
  }

  // Gate
  if (gate !== null) {
    out.push('## Gate Kararı')
    out.push('')
    out.push(`**${gate.passed ? '✅ GEÇTİ — merge serbest' : '❌ KALDI'}**`)
    if (!gate.passed && gate.reasons.length > 0) {
      out.push('')
      for (const reason of gate.reasons) {
        out.push(`- ${reason}`)
      }
    }
    out.push('')
  }

  // AI değerlendirmesi: AI (llm) kurallarının notları, okunur biçimde.
  const aiResults = results.filter((result) => ruleByKey.get(result.ruleId)?.evaluation === 'llm')
  if (aiResults.length > 0) {
    out.push('## AI Değerlendirmesi')
    out.push('')
    for (const result of aiResults) {
      const title = ruleByKey.get(result.ruleId)?.title ?? result.ruleId
      out.push(`### ${title} — ${OUTCOME_MD[result.outcome]}`)
      out.push('')
      out.push(result.note !== undefined && result.note.length > 0 ? result.note : '_Not yok._')
      out.push('')
    }
  }

  return out.join('\n')
}
