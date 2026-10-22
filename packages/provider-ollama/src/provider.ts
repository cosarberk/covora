/**
 * @module @covora/provider-ollama/provider
 *
 * `LlmProvider` arayüzünün Ollama implementasyonu. Checklist'i modele
 * doldurtur, yanıtı zod ile ayrıştırır ve eksik/geçersiz sonuçları güvenli
 * biçimde `fail` sayar.
 */

import type { FillChecklistResult, LlmProvider } from '@covora/core'
import { checklistOutcomeSchema, type ChecklistItem, type ReviewInput, type RuleResult } from '@covora/types'
import { z } from 'zod'

import { callOllamaChat } from './client.js'
import { ollamaProviderConfigSchema, type OllamaProviderInput } from './config.js'
import { buildChecklistMessages, checklistResponseFormat, type OllamaMessage } from './prompt.js'

/**
 * Mesaj dizisini log'a yazılabilir tek bir metne çevirir. Görüntüler (base64
 * ekran görüntüsü) çok büyük olduğundan içerikleri değil yalnızca boyutları
 * yazılır; metin içerik (code dosyaları dahil) birebir korunur.
 */
const messagesToPromptText = (messages: readonly OllamaMessage[]): string =>
  messages
    .map((message) => {
      const images =
        message.images !== undefined && message.images.length > 0
          ? `\n[images: ${message.images.map((img) => `${Math.round((img.length * 3) / 4 / 1024)} KB`).join(', ')}]`
          : ''
      return `### ${message.role}\n${message.content}${images}`
    })
    .join('\n\n')

/** Modelin döndürmesi beklenen structured yanıt. */
const checklistResponseSchema = z.object({
  results: z.array(
    z.object({
      ruleId: z.string(),
      outcome: checklistOutcomeSchema,
      note: z.string().optional()
    })
  )
})

/**
 * Model yanıt metnini kural kimliğine göre sonuç eşlemesine çevirir. Geçersiz
 * JSON ya da şema uyumsuzluğunda boş eşleme döner (çağıran taraf eksikleri
 * fail sayar).
 *
 * @param content - Model yanıtının ham içeriği.
 * @returns ruleId → {@link RuleResult} eşlemesi.
 */
const parseResults = (content: string): Map<string, RuleResult> => {
  const map = new Map<string, RuleResult>()

  let data: unknown
  try {
    data = JSON.parse(content)
  } catch {
    return map
  }

  const parsed = checklistResponseSchema.safeParse(data)
  if (!parsed.success) {
    return map
  }

  for (const result of parsed.data.results) {
    map.set(
      result.ruleId,
      result.note !== undefined
        ? { ruleId: result.ruleId, outcome: result.outcome, note: result.note }
        : { ruleId: result.ruleId, outcome: result.outcome }
    )
  }

  return map
}

/** Sonuç şiddet sırası: fail en kötü. */
const OUTCOME_RANK: Record<RuleResult['outcome'], number> = { pass: 0, partial: 1, fail: 2 }

/** İki sonuçtan daha kötü olanı seçer (birleştirme için). */
const worstOutcome = (a: RuleResult['outcome'], b: RuleResult['outcome']): RuleResult['outcome'] =>
  OUTCOME_RANK[a] >= OUTCOME_RANK[b] ? a : b

/**
 * Birden fazla (yanlış etiketli) model sonucunu tek bir kurala birleştirir.
 * Sonuç = en kötü outcome; not = tüm notlar + modelin kullandığı etiketler.
 */
const mergeInto = (ruleId: string, list: readonly RuleResult[]): RuleResult => {
  const outcome = list.reduce<RuleResult['outcome']>((acc, r) => worstOutcome(acc, r.outcome), 'pass')
  const notes = list.map((r) => r.note).filter((n): n is string => n !== undefined && n.length > 0)
  const labels = list.map((r) => r.ruleId).join(', ')
  const body = notes.length > 0 ? notes.join(' ') : 'Model not vermedi.'
  return { ruleId, outcome, note: `${body} (model alt-değerlendirmeleri: ${labels})` }
}

/**
 * Model yanıtını checklist maddeleriyle uzlaştırır. Önce ruleId birebir eşleşir;
 * eşleşmeyen maddeler için model yine de (yanlış etiketle) sonuç döndürmüşse
 * yanıtı o maddeye bağlar — tek madde sorulduysa tüm yanıtları o maddeye
 * BİRLEŞTİRİR, çok madde sorulduysa sırayla eşler. Böylece modelin gerçek
 * değerlendirmesi "sonuç döndürmedi" denip çöpe atılmaz. Yalnızca model hiçbir
 * geçerli sonuç üretmediyse madde başarısız sayılır.
 */
export const reconcileChecklist = (
  items: readonly ChecklistItem[],
  resultsByRuleId: Map<string, RuleResult>
): RuleResult[] => {
  const itemIds = new Set(items.map((item) => item.ruleId))
  const unmatched = [...resultsByRuleId.values()].filter((r) => !itemIds.has(r.ruleId))
  let cursor = 0
  return items.map((item): RuleResult => {
    const exact = resultsByRuleId.get(item.ruleId)
    if (exact !== undefined) {
      return exact
    }
    if (unmatched.length === 0) {
      return {
        ruleId: item.ruleId,
        outcome: 'fail',
        note: 'Model geçerli bir sonuç döndürmedi (boş ya da şema dışı yanıt).'
      }
    }
    if (items.length === 1) {
      return mergeInto(item.ruleId, unmatched)
    }
    const positional = unmatched[cursor]
    cursor += 1
    if (positional !== undefined) {
      return {
        ruleId: item.ruleId,
        outcome: positional.outcome,
        note: `${positional.note ?? 'Model not vermedi.'} (model etiketi: ${positional.ruleId})`
      }
    }
    return {
      ruleId: item.ruleId,
      outcome: 'fail',
      note: 'Model bu maddeye karşılık bir sonuç döndürmedi.'
    }
  })
}

/**
 * Ollama tabanlı bir {@link LlmProvider} oluşturur.
 *
 * @param config - Sağlayıcı yapılandırması (baseUrl, model, kind, timeout).
 * @returns Yapılandırılmış sağlayıcı.
 */
export const createOllamaProvider = (config: OllamaProviderInput): LlmProvider => {
  const resolvedConfig = ollamaProviderConfigSchema.parse(config)

  return {
    kind: resolvedConfig.kind,
    async fillChecklist(
      input: ReviewInput,
      items: readonly ChecklistItem[]
    ): Promise<FillChecklistResult> {
      if (items.length === 0) {
        return { results: [] }
      }

      const messages = buildChecklistMessages(input, items)
      const content = await callOllamaChat(resolvedConfig, messages, checklistResponseFormat)
      const resultsByRuleId = parseResults(content)
      const results = reconcileChecklist(items, resultsByRuleId)

      return {
        results,
        trace: { prompt: messagesToPromptText(messages), rawResponse: content }
      }
    }
  }
}
