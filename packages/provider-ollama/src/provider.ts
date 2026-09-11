/**
 * @module @covora/provider-ollama/provider
 *
 * `LlmProvider` arayüzünün Ollama implementasyonu. Checklist'i modele
 * doldurtur, yanıtı zod ile ayrıştırır ve eksik/geçersiz sonuçları güvenli
 * biçimde `fail` sayar.
 */

import type { LlmProvider } from '@covora/core'
import { checklistOutcomeSchema, type ChecklistItem, type ReviewInput, type RuleResult } from '@covora/types'
import { z } from 'zod'

import { callOllamaChat } from './client.js'
import { ollamaProviderConfigSchema, type OllamaProviderInput } from './config.js'
import { buildChecklistMessages, checklistResponseFormat } from './prompt.js'

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
    ): Promise<readonly RuleResult[]> {
      if (items.length === 0) {
        return []
      }

      const messages = buildChecklistMessages(input, items)
      const content = await callOllamaChat(resolvedConfig, messages, checklistResponseFormat)
      const resultsByRuleId = parseResults(content)

      return items.map((item) => {
        const result = resultsByRuleId.get(item.ruleId)
        if (result === undefined) {
          return {
            ruleId: item.ruleId,
            outcome: 'fail',
            note: 'Model bu madde için sonuç döndürmedi'
          }
        }
        return result
      })
    }
  }
}
