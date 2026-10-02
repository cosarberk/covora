/**
 * @module @covora/db/repositories/run
 *
 * Review run (pipeline) veri erişimi ve DB-destekli iş kuyruğu. Run'lar
 * `queued` olarak yaratılır; bir worker `claimNextQueued` ile atomik olarak
 * birini kapar (`running`), adımlar ve loglar ilerledikçe güncellenir ve run
 * terminal duruma getirilir. Ekstra altyapı gerektirmez; yatay ölçekte bir
 * mesaj kuyruğu transport'u bu fonksiyonların arkasına takılabilir.
 */

import { REVIEW_PIPELINE_STEPS } from '@covora/core'
import type {
  LogLevel,
  ReviewInput,
  ReviewKind,
  ReviewRun,
  RunLogLine,
  RunStatus,
  RunSummary,
  StepStatus
} from '@covora/types'
import type { Prisma, PrismaClient } from '@prisma/client'

import { toReviewRun, toRunLogLine, toRunSummary } from '../mappers.js'

/** Yeni run oluşturma girdisi. */
export interface CreateRunInput {
  readonly projectId: string
  readonly kind: ReviewKind
  readonly codeHash: string
  /** Review girdisi (worker işleyene dek saklanır). */
  readonly input: ReviewInput
}

/** Bir worker tarafından kapılan (claim edilen) run. */
export interface ClaimedRun {
  readonly id: string
  readonly projectId: string
  readonly projectKey: string
  readonly kind: ReviewKind
  readonly codeHash: string
  /** Saklanan ham girdi; çağıran taraf şema ile doğrular. */
  readonly input: unknown
  readonly attempts: number
}

/**
 * Yeni bir run'ı `queued` olarak yaratır ve pipeline adımlarını `pending`
 * tohumlar.
 *
 * @param prisma - Prisma client.
 * @param input - Run alanları.
 * @returns Oluşturulan run'ın kimliği.
 */
export const createRun = async (
  prisma: PrismaClient,
  input: CreateRunInput
): Promise<{ readonly id: string }> => {
  const run = await prisma.reviewRun.create({
    data: {
      projectId: input.projectId,
      kind: input.kind,
      codeHash: input.codeHash,
      input: input.input as unknown as Prisma.InputJsonValue,
      status: 'queued',
      steps: {
        create: REVIEW_PIPELINE_STEPS.map((step, order) => ({
          key: step.key,
          name: step.name,
          order,
          status: 'pending'
        }))
      }
    },
    select: { id: true }
  })
  return { id: run.id }
}

/**
 * Sıradaki `queued` run'ı atomik olarak kapar ve `running` yapar. Yarışı
 * koşullu `updateMany` ile çözer; başka bir worker aynı anda kaptıysa `null`
 * döner (çağıran yeniden dener).
 *
 * @param prisma - Prisma client.
 * @returns Kapılan run ya da (kuyruk boş/yarış kaybedildi) null.
 */
export const claimNextQueued = async (prisma: PrismaClient): Promise<ClaimedRun | null> => {
  const candidate = await prisma.reviewRun.findFirst({
    where: { status: 'queued' },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      projectId: true,
      kind: true,
      codeHash: true,
      input: true,
      project: { select: { key: true } }
    }
  })
  if (candidate === null) {
    return null
  }

  const claim = await prisma.reviewRun.updateMany({
    where: { id: candidate.id, status: 'queued' },
    data: { status: 'running', startedAt: new Date(), attempts: { increment: 1 } }
  })
  if (claim.count !== 1) {
    return null
  }

  const claimed = await prisma.reviewRun.findUnique({
    where: { id: candidate.id },
    select: { attempts: true }
  })
  return {
    id: candidate.id,
    projectId: candidate.projectId,
    projectKey: candidate.project.key,
    kind: candidate.kind,
    codeHash: candidate.codeHash,
    input: candidate.input,
    attempts: claimed?.attempts ?? 1
  }
}

/** Run'ı `running` olarak işaretler ve başlangıç zamanını (boşsa) damgalar. */
export const markRunStarted = async (prisma: PrismaClient, runId: string): Promise<void> => {
  await prisma.reviewRun.updateMany({
    where: { id: runId, startedAt: null },
    data: { status: 'running', startedAt: new Date() }
  })
}

/** Bir adımın durumunu ve zaman damgalarını günceller. */
export const updateStep = async (
  prisma: PrismaClient,
  runId: string,
  key: string,
  patch: { readonly status: StepStatus; readonly error?: string | null }
): Promise<void> => {
  const now = new Date()
  const data: Prisma.RunStepUpdateManyMutationInput = { status: patch.status }
  if (patch.status === 'running') {
    data.startedAt = now
  }
  if (patch.status === 'succeeded' || patch.status === 'failed' || patch.status === 'skipped' || patch.status === 'cancelled') {
    data.finishedAt = now
  }
  if (patch.error !== undefined) {
    data.error = patch.error
  }
  await prisma.runStep.updateMany({ where: { runId, key }, data })
}

/**
 * Bir run'a (ve opsiyonel bir adıma) log satırı ekler. Sıra numarası (`seq`)
 * mevcut satır sayısından türetilir.
 *
 * @returns Eklenen log satırı (yayın için).
 */
export const appendLog = async (
  prisma: PrismaClient,
  runId: string,
  line: { readonly level: LogLevel; readonly message: string; readonly stepKey?: string }
): Promise<RunLogLine> => {
  // seq, mevcut en yüksek + 1 olarak üretilir. Nadir eşzamanlı yazımda unique
  // (runId, seq) çakışırsa (P2002) birkaç kez yeniden denenir; böylece bir log
  // satırı asla run'ı düşürmez.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const last = await prisma.runLog.findFirst({
      where: { runId },
      orderBy: { seq: 'desc' },
      select: { seq: true }
    })
    const seq = last === null ? 0 : last.seq + 1
    try {
      const created = await prisma.runLog.create({
        data: {
          runId,
          seq,
          level: line.level,
          message: line.message,
          stepKey: line.stepKey ?? null
        }
      })
      return toRunLogLine(created)
    } catch (error) {
      const code = (error as { code?: string }).code
      if (code === 'P2002' && attempt < 4) {
        continue
      }
      throw error
    }
  }
  // Ulaşılamaz; tip tatmini için.
  throw new Error('Log satırı yazılamadı')
}

/** Run'ı terminal duruma getirir. */
export const finishRun = async (
  prisma: PrismaClient,
  runId: string,
  patch: { readonly status: RunStatus; readonly delta: number | null; readonly error?: string }
): Promise<void> => {
  await prisma.reviewRun.update({
    where: { id: runId },
    data: {
      status: patch.status,
      finishedAt: new Date(),
      delta: patch.delta,
      ...(patch.error !== undefined ? { error: patch.error } : {})
    }
  })
}

/**
 * Kuyrukta bekleyen bir run'ı iptal eder (`cancelled`). Yalnızca `queued`
 * durumundakiler iptal edilebilir; işlenmeye başlamış run'lar etkilenmez.
 *
 * @returns İptal edildiyse `true`.
 */
export const cancelQueuedRun = async (
  prisma: PrismaClient,
  runId: string
): Promise<boolean> => {
  const result = await prisma.reviewRun.updateMany({
    where: { id: runId, status: 'queued' },
    data: { status: 'cancelled', finishedAt: new Date() }
  })
  return result.count === 1
}

/** Üretilen review kaydını run'a bağlar. */
export const linkReview = async (
  prisma: PrismaClient,
  runId: string,
  reviewId: string
): Promise<void> => {
  await prisma.reviewRun.update({ where: { id: runId }, data: { reviewId } })
}

/**
 * Bir run'ın kuyruktaki 1-tabanlı sırasını hesaplar (yalnızca `queued` iken).
 *
 * @returns Sıra numarası ya da (kuyrukta değilse) undefined.
 */
export const getQueuePosition = async (
  prisma: PrismaClient,
  runId: string
): Promise<number | undefined> => {
  const run = await prisma.reviewRun.findUnique({
    where: { id: runId },
    select: { status: true, createdAt: true }
  })
  if (run === null || run.status !== 'queued') {
    return undefined
  }
  return prisma.reviewRun.count({
    where: { status: 'queued', createdAt: { lte: run.createdAt } }
  })
}

/** Bir run'ı (adımları ve kuyruk sırasıyla) tam görünüm olarak getirir. */
export const getRun = async (prisma: PrismaClient, runId: string): Promise<ReviewRun | null> => {
  const run = await prisma.reviewRun.findUnique({
    where: { id: runId },
    include: {
      steps: true,
      project: { select: { key: true } },
      review: { select: { score: true, level: true, gatePassed: true } }
    }
  })
  if (run === null) {
    return null
  }
  const queuePosition = run.status === 'queued' ? await getQueuePosition(prisma, runId) : undefined
  return toReviewRun(run, run.project.key, run.steps, run.review, queuePosition)
}

/** Bir run'ın log satırlarını (opsiyonel olarak verilen seq'ten sonrasını) getirir. */
export const getRunLogs = async (
  prisma: PrismaClient,
  runId: string,
  afterSeq?: number
): Promise<RunLogLine[]> => {
  const logs = await prisma.runLog.findMany({
    where: { runId, ...(afterSeq !== undefined ? { seq: { gt: afterSeq } } : {}) },
    orderBy: { seq: 'asc' }
  })
  return logs.map(toRunLogLine)
}

/** Run'ları (opsiyonel proje filtresiyle, yeniden eskiye) liste satırı olarak getirir. */
export const listRuns = async (
  prisma: PrismaClient,
  options: { readonly projectId?: string; readonly limit?: number } = {}
): Promise<RunSummary[]> => {
  const runs = await prisma.reviewRun.findMany({
    where: options.projectId !== undefined ? { projectId: options.projectId } : {},
    orderBy: { createdAt: 'desc' },
    take: options.limit ?? 50,
    include: {
      project: { select: { key: true } },
      review: { select: { score: true, level: true, gatePassed: true } }
    }
  })
  return runs.map((run) => toRunSummary(run, run.project.key, run.review))
}
