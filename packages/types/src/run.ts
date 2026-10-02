/**
 * @module @covora/types/run
 *
 * Review Run (pipeline) domain sözleşmesi. Bir review artık senkron bir
 * istek-yanıt değil; kuyruğa alınan, adımlardan (step/job) oluşan, her adımı
 * loglanan ve durumu bir durum makinesiyle ilerleyen kalıcı bir **çalışma
 * (run)**'dır. Studio'daki "Süreçler" ekranı, SDK'daki ilerleme bildirimleri
 * ve webhook'lar bu kontrata dayanır.
 *
 * Tasarım ilkeleri:
 * - **Run durumu ≠ review sonucu.** Run durumu yürütme yaşam döngüsünü
 *   (kuyrukta mı, koşuyor mu, bitti mi) anlatır; gate'in geçip geçmediği ayrı
 *   bir sonuçtur. Gate "kaldı" olsa bile run başarıyla tamamlanmış olabilir.
 * - **Adımlar veri-güdümlüdür.** Bilinen adım anahtarları sabittir ama şema
 *   `key`'i serbest string tutar; yeni adım eklemek çekirdeği değiştirmez.
 * - **Zaman damgaları ISO string**'tir (kod tabanının geri kalanıyla tutarlı).
 */

import { z } from 'zod'

import { reviewKindSchema } from './rule.js'
import { reviewOutcomeSchema } from './review.js'

/**
 * Bir run'ın yürütme yaşam döngüsü durumu.
 * - `queued`: kuyruğa alındı, henüz bir worker almadı.
 * - `running`: bir worker tarafından yürütülüyor.
 * - `succeeded`: tüm adımlar beklendiği gibi tamamlandı (gate kararı ayrıdır).
 * - `degraded`: run tamamlandı ama bir ya da daha fazla adım başarısız oldu
 *   (örn. AI adımı patladı; deterministik kısım yine de sonuç üretti).
 * - `failed`: run yürütülemedi; kurtarılabilir bir sonuç üretilemedi.
 * - `cancelled`: kullanıcı ya da sistem tarafından iptal edildi.
 */
export const runStatusSchema = z.enum([
  'queued',
  'running',
  'succeeded',
  'degraded',
  'failed',
  'cancelled'
])

/** {@link runStatusSchema} tip çıkarımı. */
export type RunStatus = z.infer<typeof runStatusSchema>

/**
 * Bir run'ın artık değişmeyeceği (terminal) durumları. Durum makinesi bu
 * kümedeki bir duruma ulaştığında geçişi durdurur.
 */
export const TERMINAL_RUN_STATUSES: readonly RunStatus[] = [
  'succeeded',
  'degraded',
  'failed',
  'cancelled'
]

/**
 * Tek bir adımın (job/stage) durumu.
 * - `pending`: henüz başlamadı.
 * - `running`: yürütülüyor.
 * - `succeeded`: başarıyla tamamlandı.
 * - `skipped`: koşullar gereği atlandı (örn. bu türde LLM kuralı yok).
 * - `failed`: adım hata verdi.
 * - `cancelled`: run iptal edildiği için durduruldu.
 */
export const stepStatusSchema = z.enum([
  'pending',
  'running',
  'succeeded',
  'skipped',
  'failed',
  'cancelled'
])

/** {@link stepStatusSchema} tip çıkarımı. */
export type StepStatus = z.infer<typeof stepStatusSchema>

/** Bir adımın artık değişmeyeceği (terminal) durumları. */
export const TERMINAL_STEP_STATUSES: readonly StepStatus[] = [
  'succeeded',
  'skipped',
  'failed',
  'cancelled'
]

/**
 * Bilinen (yerleşik) adım anahtarları. Pipeline'ın varsayılan iskeleti bu
 * sırayla koşar. Şema serbest string kabul eder; bu liste yalnızca sabit
 * referans ve UI etiketleri içindir.
 */
export const RUN_STEP_KEYS = [
  'ingest',
  'deterministic',
  'llm',
  'coverage',
  'gate',
  'persist',
  'notify'
] as const

/** {@link RUN_STEP_KEYS} birleşimi. */
export type RunStepKey = (typeof RUN_STEP_KEYS)[number]

/** Log satırının önem seviyesi. */
export const logLevelSchema = z.enum(['debug', 'info', 'warn', 'error'])

/** {@link logLevelSchema} tip çıkarımı. */
export type LogLevel = z.infer<typeof logLevelSchema>

/**
 * Bir run'a (ve opsiyonel olarak bir adıma) ait tek bir log satırı. GitLab
 * job konsolundaki satırların karşılığıdır; canlı olarak akar ve kalıcı olarak
 * saklanır.
 */
export const runLogLineSchema = z.object({
  /** Satırın run içindeki artan sıra numarası (stream'de sıralama/boşluk tespiti için). */
  seq: z.number().int().nonnegative(),
  /** Oluşturulma zamanı (ISO 8601). */
  at: z.string().min(1),
  /** Önem seviyesi. */
  level: logLevelSchema,
  /** İlgili adımın anahtarı (run geneli satırlarda yok). */
  stepKey: z.string().min(1).optional(),
  /** İnsan-okunur log metni. */
  message: z.string()
})

/** {@link runLogLineSchema} tip çıkarımı. */
export type RunLogLine = z.infer<typeof runLogLineSchema>

/**
 * Bir run içindeki tek bir adım (job/stage). Durumu, zamanlaması ve varsa hata
 * özeti taşınır; log satırları ayrı akış/koleksiyon olarak tutulur.
 */
export const runStepSchema = z.object({
  /** Kararlı adım anahtarı (bkz. {@link RUN_STEP_KEYS}). */
  key: z.string().min(1),
  /** UI'da gösterilecek okunur ad. */
  name: z.string().min(1),
  /** Adımın run iskeletindeki sırası (0'dan). */
  order: z.number().int().nonnegative(),
  /** Adım durumu. */
  status: stepStatusSchema,
  /** Başlangıç zamanı (ISO; başlamadıysa yok). */
  startedAt: z.string().min(1).optional(),
  /** Bitiş zamanı (ISO; bitmediyse yok). */
  finishedAt: z.string().min(1).optional(),
  /** Terminal duruma getiren hatanın kısa özeti (varsa). */
  error: z.string().optional()
})

/** {@link runStepSchema} tip çıkarımı. */
export type RunStep = z.infer<typeof runStepSchema>

/**
 * Bir review run'ının tam görünümü. Studio "Süreçler" ekranı ve SDK bu modeli
 * tüketir. `outcome` yalnızca run bir sonuç ürettiğinde (succeeded/degraded)
 * bulunur.
 */
export const reviewRunSchema = z.object({
  /** Run kimliği. */
  id: z.string().min(1),
  /** Bağlı proje anahtarı. */
  projectKey: z.string().min(1),
  /** Review türü (ui/code). */
  kind: reviewKindSchema,
  /** Review edilen kodun/durumun hash'i. */
  codeHash: z.string().min(1),
  /** Yürütme durumu. */
  status: runStatusSchema,
  /** Kuyruktaki sıra (yalnızca `queued` iken anlamlı; 1 = sıradaki ilk iş). */
  queuePosition: z.number().int().positive().optional(),
  /** Pipeline adımları (sıralı). */
  steps: z.array(runStepSchema),
  /** Oluşturulma zamanı (ISO). */
  createdAt: z.string().min(1),
  /** İşlenmeye başlama zamanı (ISO; henüz başlamadıysa yok). */
  startedAt: z.string().min(1).optional(),
  /** Tamamlanma/terminal zamanı (ISO; henüz bitmediyse yok). */
  finishedAt: z.string().min(1).optional(),
  /** Run bir sonuç ürettiyse coverage + gate çıktısı (tam ayrıntı). */
  outcome: reviewOutcomeSchema.optional(),
  /** Üretilen review'ın coverage skoru (0-100; henüz yoksa null). */
  score: z.number().min(0).max(100).nullable().optional(),
  /** Coverage seviyesi (henüz yoksa null). */
  level: z.string().nullable().optional(),
  /** Gate geçti mi (henüz yoksa null). */
  gatePassed: z.boolean().nullable().optional(),
  /** Önceki aynı tür run'a göre skor farkı (ilk run'da null). */
  delta: z.number().nullable().optional(),
  /** Run `failed` olduğunda kök hata özeti. */
  error: z.string().optional()
})

/** {@link reviewRunSchema} tip çıkarımı. */
export type ReviewRun = z.infer<typeof reviewRunSchema>

/**
 * Canlı yayın (SSE) olay sözleşmesi. Studio ve SDK bu ayrımlı birleşimi
 * dinleyerek run'ı gerçek zamanlı izler. Her olay bağımsız anlamlıdır;
 * istemci koptuğunda son görülen `seq`/durumla yeniden bağlanabilir.
 */
export const runEventSchema = z.discriminatedUnion('type', [
  /** Run oluşturuldu / kuyruğa alındı. */
  z.object({
    type: z.literal('run.created'),
    run: reviewRunSchema
  }),
  /** Run durumu ya da kuyruk sırası değişti. */
  z.object({
    type: z.literal('run.updated'),
    runId: z.string().min(1),
    status: runStatusSchema,
    queuePosition: z.number().int().positive().optional(),
    at: z.string().min(1)
  }),
  /** Bir adımın durumu değişti. */
  z.object({
    type: z.literal('step.updated'),
    runId: z.string().min(1),
    step: runStepSchema
  }),
  /** Yeni bir log satırı eklendi. */
  z.object({
    type: z.literal('log.appended'),
    runId: z.string().min(1),
    line: runLogLineSchema
  }),
  /** Run terminal duruma ulaştı; nihai görünüm taşınır. */
  z.object({
    type: z.literal('run.finished'),
    run: reviewRunSchema
  })
])

/** {@link runEventSchema} tip çıkarımı. */
export type RunEvent = z.infer<typeof runEventSchema>

/** Bir run'ın özet (liste) görünümü — "Süreçler" tablosundaki satır. */
export const runSummarySchema = z.object({
  id: z.string().min(1),
  projectKey: z.string().min(1),
  kind: reviewKindSchema,
  codeHash: z.string().min(1),
  status: runStatusSchema,
  queuePosition: z.number().int().positive().optional(),
  score: z.number().min(0).max(100).nullable(),
  level: z.string().nullable(),
  gatePassed: z.boolean().nullable(),
  delta: z.number().nullable(),
  createdAt: z.string().min(1),
  startedAt: z.string().min(1).optional(),
  finishedAt: z.string().min(1).optional()
})

/** {@link runSummarySchema} tip çıkarımı. */
export type RunSummary = z.infer<typeof runSummarySchema>
