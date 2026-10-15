/**
 * @module @covora/server/services/providers/openai
 *
 * OpenAI-uyumlu (`/v1/chat/completions`) sağlayıcı adapter'ı. vLLM, llama.cpp
 * server, TGI, LM Studio ve OpenAI API'nin kendisi dahil geniş bir ekosistemi
 * kapsar. `LlmProvider` arayüzünü uygular; vision girdisi `image_url` içeriğiyle
 * taşınır. İstekler `node:http` tabanlı {@link postJson} ile yapılır (fetch'in
 * kapatılamayan header zaman aşımı olmadığından, yavaş/soğuk modelde bağlantı
 * kesilmez; `timeoutMs` 0 ise süresiz beklenir).
 */

import type { FillChecklistResult, LlmProvider } from '@covora/core'
import { postJson, reconcileChecklist } from '@covora/provider-ollama'
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
  /** İstek zaman aşımı (ms). 0 = süresiz bekle. */
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

const openAiResponseSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1)
})

const systemPrompt = (kind: ReviewKind): string => {
  const subject = kind === 'ui' ? 'kullanıcı arayüzü ekran görüntüsünü' : 'kaynak kodu'
  const role = kind === 'ui' ? 'arayüz (UI)' : 'kod'
  return [
    'DİL KURALI (EN ÖNEMLİSİ): Tüm "note" açıklamalarını MUTLAKA ve YALNIZCA',
    'TÜRKÇE yaz. İngilizce tek kelime bile kullanma.',
    `Sen bir ${role} inceleme asistanısın.`,
    `Sana ${subject} ve bir kontrol listesi verilecek.`,
    'Her madde için yalnızca "pass", "partial" veya "fail" sonucunu ve kısa bir not döndür.',
    'Puan HESAPLAMA; sadece her maddeyi değerlendir.',
    'ÇOK ÖNEMLİ — KURALLARA KESİNLİKLE UY:',
    'Yalnızca sana verilen numaralı kontrol listesi maddelerini yanıtla; sonuç',
    'sayısı madde sayısıyla TAM OLARAK aynı olmalı. Her sonucun "ruleId" alanı,',
    'maddenin başındaki parantez içindeki kimlikle KARAKTER KARAKTER AYNI olmalı.',
    'KENDİ kural adlarını (ör. "no-unused-vars", "no-console", "WCAG21_H1") ASLA',
    'ÜRETME; madde EKLEME veya ÇIKARMA. Birden çok gözlemini TEK sonucun "note"',
    'alanında birleştir. TÜM notları/açıklamaları TÜRKÇE yaz (İngilizce yazma).',
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

/**
 * İçerik parçalarını log'a yazılabilir metne çevirir. Görüntüler (base64) çok
 * büyük olduğundan içerik yerine yalnızca boyut yazılır; metin birebir korunur.
 */
const contentPartsToText = (parts: readonly ContentPart[]): string =>
  parts
    .map((part) =>
      part.type === 'text'
        ? part.text
        : `[image_url: ${Math.round((part.image_url.url.length * 3) / 4 / 1024)} KB]`
    )
    .join('\n')

const buildUserContent = (input: ReviewInput, items: readonly ChecklistItem[]): ContentPart[] => {
  const itemsBlock = formatItems(items)
  // Küçük modeller dil talimatını system'de bazen atlıyor; user mesajında da yinele.
  const trReminder = '\n\nÖNEMLİ: Tüm "note" açıklamalarını Türkçe yaz.'
  if (input.kind === 'ui') {
    return [
      {
        type: 'text',
        text: `Aşağıdaki kontrol listesini ekran görüntüsüne göre doldur:\n\n${itemsBlock}${trReminder}`
      },
      { type: 'image_url', image_url: { url: toDataUrl(input.screenshot) } }
    ]
  }
  const filesBlock = input.files.map((file) => `--- ${file.path} ---\n${file.content}`).join('\n\n')
  return [
    {
      type: 'text',
      text: `Aşağıdaki kontrol listesini kaynak koda göre doldur:\n\n${itemsBlock}\n\nKaynak dosyalar:\n${filesBlock}${trReminder}`
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

/**
 * OpenAI-uyumlu bir {@link LlmProvider} oluşturur.
 *
 * @param config - Sağlayıcı yapılandırması.
 * @returns Yapılandırılmış sağlayıcı.
 */
export const createOpenAiProvider = (config: OpenAiProviderConfig): LlmProvider => {
  const endpoint = `${config.baseUrl.replace(/\/$/, '')}/chat/completions`
  return {
    kind: config.kind,
    async fillChecklist(input, items): Promise<FillChecklistResult> {
      if (items.length === 0) {
        return { results: [] }
      }
      const systemContent = systemPrompt(input.kind)
      const userContent = buildUserContent(input, items)
      const data = await postJson(
        endpoint,
        {
          model: config.model,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemContent },
            { role: 'user', content: userContent }
          ]
        },
        { apiKey: config.apiKey ?? null, timeoutMs: config.timeoutMs ?? 0 }
      )
      const rawResponse = openAiResponseSchema.parse(data).choices[0]!.message.content
      const resultsByRuleId = parseResults(rawResponse)
      const results = reconcileChecklist(items, resultsByRuleId)
      return {
        results,
        trace: {
          prompt: `### system\n${systemContent}\n\n### user\n${contentPartsToText(userContent)}`,
          rawResponse
        }
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
  const endpoint = `${config.baseUrl.replace(/\/$/, '')}/chat/completions`
  return {
    async send(messages) {
      const data = await postJson(
        endpoint,
        {
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
        },
        { apiKey: config.apiKey ?? null, timeoutMs: config.timeoutMs ?? 0 }
      )
      return openAiResponseSchema.parse(data).choices[0]!.message.content
    }
  }
}
