/**
 * @module @covora/provider-ollama/prompt
 *
 * Ollama sohbet mesajlarının ve yanıt şemasının (structured output) üretimi.
 */

import type { ChecklistItem, ReviewInput, ReviewKind } from '@covora/types'

/** Ollama sohbet mesajı. */
export interface OllamaMessage {
  readonly role: 'system' | 'user'
  readonly content: string
  readonly images?: readonly string[]
}

/**
 * Review türüne göre sistem talimatını üretir. LLM'e skor hesaplamamasını,
 * yalnızca her maddeyi değerlendirmesini söyler.
 *
 * @param kind - Review türü.
 * @returns Sistem mesajı içeriği.
 */
const systemPromptFor = (kind: ReviewKind): string => {
  const subject = kind === 'ui' ? 'kullanıcı arayüzü ekran görüntüsünü' : 'kaynak kodu'
  const role = kind === 'ui' ? 'arayüz (UI)' : 'kod'
  return [
    `Sen bir ${role} inceleme asistanısın.`,
    `Sana ${subject} ve bir kontrol listesi verilecek.`,
    'Her madde için yalnızca "pass", "partial" veya "fail" sonucunu ve kısa bir not döndür.',
    'Puan HESAPLAMA; sadece her maddeyi değerlendir.',
    'Yanıtı istenen JSON şemasına birebir uygun ver ve her sonucu ilgili ruleId ile eşle.'
  ].join(' ')
}

/**
 * Bir checklist maddesini insan-okunur tek satıra dönüştürür.
 */
const formatItem = (item: ChecklistItem, index: number): string => {
  const suffix = item.description.length > 0 ? ` — ${item.description}` : ''
  return `${index + 1}. (${item.ruleId}) ${item.title}${suffix}`
}

/**
 * Review girdisi ve checklist'ten Ollama sohbet mesajlarını üretir. UI'da
 * ekran görüntüsü `images` olarak, code'da dosyalar metin olarak eklenir.
 *
 * @param input - Review girdisi.
 * @param items - Checklist maddeleri.
 * @returns Ollama'ya gönderilecek mesaj dizisi.
 */
export const buildChecklistMessages = (
  input: ReviewInput,
  items: readonly ChecklistItem[]
): OllamaMessage[] => {
  const system: OllamaMessage = { role: 'system', content: systemPromptFor(input.kind) }
  const itemsBlock = items.map(formatItem).join('\n')

  if (input.kind === 'ui') {
    return [
      system,
      {
        role: 'user',
        content: `Aşağıdaki kontrol listesini ekran görüntüsüne göre doldur:\n\n${itemsBlock}`,
        images: [input.screenshot]
      }
    ]
  }

  const filesBlock = input.files.map((file) => `--- ${file.path} ---\n${file.content}`).join('\n\n')
  return [
    system,
    {
      role: 'user',
      content: `Aşağıdaki kontrol listesini kaynak koda göre doldur:\n\n${itemsBlock}\n\nKaynak dosyalar:\n${filesBlock}`
    }
  ]
}

/**
 * Ollama `format` alanı için JSON şeması (structured output). Modelin yalnızca
 * bu yapıda yanıt vermesini zorlar.
 */
export const checklistResponseFormat = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          ruleId: { type: 'string' },
          outcome: { type: 'string', enum: ['pass', 'partial', 'fail'] },
          note: { type: 'string' }
        },
        required: ['ruleId', 'outcome']
      }
    }
  },
  required: ['results']
} as const
