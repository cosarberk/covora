/**
 * @module @covora/server/services/providers/openai
 *
 * OpenAI-uyumlu (`/v1/chat/completions`) sağlayıcı adapter'ı. vLLM, llama.cpp
 * server, TGI, LM Studio ve OpenAI API'nin kendisi dahil geniş bir ekosistemi
 * kapsar. `LlmProvider` arayüzünü uygular; vision girdisi `image_url` içeriğiyle
 * taşınır. Ollama adapter'ıyla aynı sözleşmeye uyar; motor hangisini
 * kullandığını bilmez.
 */

import type { LlmProvider } from '@covora/core'
import {
  checklistOutcomeSchema,
  type ChatMessage,
  type ChecklistItem,
  type ReviewInput,
  type ReviewKind,
  type RuleResult
} from '@covora/types'
import { z } from 'zod'

/** OpenAI-uyumlu sağlayıcı yapılandırması. */
export interface OpenAiProviderConfig {
  /** Temel adres; `/v1` dahil olmalı (örn. http://vllm:8000/v1). */
  readonly baseUrl: string
  /** Model kimliği. */
  readonly model: string
  /** Bu sağlayıcının işlediği review türü. */
  readonly kind: ReviewKind
  /** Gizli API anahtarı (varsa `Authorization: Bearer`). */
  readonly apiKey?: string | null
  /** İstek zaman aşımı (ms). CPU çıkarımı yavaş olabileceği için yüksek. */
  readonly timeoutMs?: number
}

const checklistResponseSchema = z.object({
  results: z.array(
    z.object({
      ruleId: z.string(),
      outcome: checklistOutcomeSchema,
      note: z.string().optional()
    })
  )
})

/** OpenAI içerik parçası (metin ya da görüntü). */
type ContentPart =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'image_url'; readonly image_url: { readonly url: string } }

const systemPrompt = (kind: ReviewKind): string => {
  const subject = kind === 'ui' ? 'kullanıcı arayüzü ekran görüntüsünü' : 'kaynak kodu'
  const role = kind === 'ui' ? 'arayüz (UI)' : 'kod'
  return [
    `Sen bir ${role} inceleme asistanısın.`,
    `Sana ${subject} ve bir kontrol listesi verilecek.`,
    'Her madde için yalnızca "pass", "partial" veya "fail" sonucunu ve kısa bir not döndür.',
    'Puan HESAPLAMA; sadece her maddeyi değerlendir.',
    'Yanıtı {"results":[{"ruleId","outcome","note"}]} JSON şemasına birebir uygun ver.'
  ].join(' ')
}

const formatItems = (items: readonly ChecklistItem[]): string =>
  items
    .map((item, index) => {
      const suffix = item.description.length > 0 ? ` — ${item.description}` : ''
      return `${index + 1}. (${item.ruleId}) ${item.title}${suffix}`
    })
    .join('\n')

/** Base64/dataURL ekran görüntüsünü OpenAI'nin beklediği data URL'ye çevirir. */
const toDataUrl = (screenshot: string): string =>
  screenshot.startsWith('data:') ? screenshot : `data:image/png;base64,${screenshot}`

const buildUserContent = (input: ReviewInput, items: readonly ChecklistItem[]): ContentPart[] => {
  const itemsBlock = formatItems(items)
  if (input.kind === 'ui') {
    return [
      { type: 'text', text: `Aşağıdaki kontrol listesini ekran görüntüsüne göre doldur:\n\n${itemsBlock}` },
      { type: 'image_url', image_url: { url: toDataUrl(input.screenshot) } }
    ]
  }
  const filesBlock = input.files.map((file) => `--- ${file.path} ---\n${file.content}`).join('\n\n')
  return [
    {
      type: 'text',
      text: `Aşağıdaki kontrol listesini kaynak koda göre doldur:\n\n${itemsBlock}\n\nKaynak dosyalar:\n${filesBlock}`
    }
  ]
}

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

const openAiResponseSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1)
})

/**
 * OpenAI-uyumlu bir {@link LlmProvider} oluşturur.
 *
 * @param config - Sağlayıcı yapılandırması.
 * @returns Yapılandırılmış sağlayıcı.
 */
export const createOpenAiProvider = (config: OpenAiProviderConfig): LlmProvider => {
  const timeoutMs = config.timeoutMs ?? 120_000

  return {
    kind: config.kind,
    async fillChecklist(input, items) {
      if (items.length === 0) {
        return []
      }

      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(config.apiKey !== undefined && config.apiKey !== null && config.apiKey.length > 0
              ? { authorization: `Bearer ${config.apiKey}` }
              : {})
          },
          body: JSON.stringify({
            model: config.model,
            temperature: 0,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: systemPrompt(input.kind) },
              { role: 'user', content: buildUserContent(input, items) }
            ]
          }),
          signal: controller.signal
        })

        if (!response.ok) {
          throw new Error(`OpenAI-uyumlu istek başarısız: ${response.status} ${response.statusText}`)
        }

        const parsed = openAiResponseSchema.parse(await response.json())
        const resultsByRuleId = parseResults(parsed.choices[0]!.message.content)

        return items.map((item): RuleResult => {
          const result = resultsByRuleId.get(item.ruleId)
          return (
            result ?? {
              ruleId: item.ruleId,
              outcome: 'fail',
              note: 'Model bu madde için sonuç döndürmedi'
            }
          )
        })
      } finally {
        clearTimeout(timer)
      }
    }
  }
}

/** OpenAI-uyumlu serbest-metin sohbet istemcisi. */
export interface OpenAiChat {
  send(messages: readonly ChatMessage[]): Promise<string>
}

/**
 * OpenAI-uyumlu bir sohbet istemcisi oluşturur (structured output olmadan,
 * serbest metin). Görseller `image_url` içeriğiyle taşınır.
 *
 * @param config - baseUrl / model / apiKey / timeout.
 * @returns {@link OpenAiChat}.
 */
export const createOpenAiChat = (config: Omit<OpenAiProviderConfig, 'kind'>): OpenAiChat => {
  const timeoutMs = config.timeoutMs ?? 120_000

  return {
    async send(messages) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(config.apiKey !== undefined && config.apiKey !== null && config.apiKey.length > 0
              ? { authorization: `Bearer ${config.apiKey}` }
              : {})
          },
          body: JSON.stringify({
            model: config.model,
            messages: messages.map((message) =>
              message.images !== undefined && message.images.length > 0
                ? {
                    role: message.role,
                    content: [
                      { type: 'text', text: message.content },
                      ...message.images.map(
                        (image): ContentPart => ({
                          type: 'image_url',
                          image_url: { url: toDataUrl(image) }
                        })
                      )
                    ]
                  }
                : { role: message.role, content: message.content }
            )
          }),
          signal: controller.signal
        })
        if (!response.ok) {
          throw new Error(`OpenAI-uyumlu sohbet başarısız: ${response.status} ${response.statusText}`)
        }
        const parsed = openAiResponseSchema.parse(await response.json())
        return parsed.choices[0]!.message.content
      } finally {
        clearTimeout(timer)
      }
    }
  }
}
