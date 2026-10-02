/**
 * @module @covora/server/services/run-sink
 *
 * Core run yürütücüsünün {@link RunSink} arayüzünün sunucu implementasyonu:
 * her çağrıyı DB'ye kalıcılaştırır **ve** canlı olay veri yoluna yayınlar.
 * Adım tanımlarını (ad/sıra) `REVIEW_PIPELINE_STEPS`'ten bildiği için zengin
 * `step.updated` olayları üretir; yeniden sorgu gerektirmez.
 */

import { REVIEW_PIPELINE_STEPS, type RunSink } from '@covora/core'
import { appendLog, finishRun, markRunStarted, updateStep } from '@covora/db'
import type { RunStep } from '@covora/types'
import type { PrismaClient } from '@covora/db'

import type { RunEventBus } from './events.js'

/** {@link createDbRunSink} bağımlılıkları. */
export interface RunSinkDeps {
  readonly prisma: PrismaClient
  readonly bus: RunEventBus
}

interface StepDef {
  readonly name: string
  readonly order: number
}

const STEP_DEFS = new Map<string, StepDef>(
  REVIEW_PIPELINE_STEPS.map((step, order) => [step.key, { name: step.name, order }])
)

const nowIso = (): string => new Date().toISOString()

/**
 * Belirli bir run için DB+yayın yapan bir sink üretir.
 *
 * @param deps - Prisma ve olay veri yolu.
 * @param runId - Bağlı run kimliği.
 * @returns Core yürütücüsüne verilecek {@link RunSink}.
 */
export const createDbRunSink = (deps: RunSinkDeps, runId: string): RunSink => {
  const { prisma, bus } = deps
  const startedAtByStep = new Map<string, string>()

  const emitStep = (step: RunStep): void => {
    bus.publish({ type: 'step.updated', runId, step })
  }

  const buildStep = (
    key: string,
    status: RunStep['status'],
    extras: { readonly startedAt?: string; readonly finishedAt?: string; readonly error?: string }
  ): RunStep => {
    const def = STEP_DEFS.get(key) ?? { name: key, order: 0 }
    return {
      key,
      name: def.name,
      order: def.order,
      status,
      ...(extras.startedAt !== undefined ? { startedAt: extras.startedAt } : {}),
      ...(extras.finishedAt !== undefined ? { finishedAt: extras.finishedAt } : {}),
      ...(extras.error !== undefined ? { error: extras.error } : {})
    }
  }

  return {
    async runStarted() {
      await markRunStarted(prisma, runId)
      bus.publish({ type: 'run.updated', runId, status: 'running', at: nowIso() })
    },

    async stepStarted(key) {
      const at = nowIso()
      startedAtByStep.set(key, at)
      await updateStep(prisma, runId, key, { status: 'running' })
      emitStep(buildStep(key, 'running', { startedAt: at }))
    },

    async stepFinished(key, status, error) {
      await updateStep(prisma, runId, key, error !== undefined ? { status, error } : { status })
      const extras: { startedAt?: string; finishedAt: string; error?: string } = {
        finishedAt: nowIso()
      }
      const startedAt = startedAtByStep.get(key)
      if (startedAt !== undefined) {
        extras.startedAt = startedAt
      }
      if (error !== undefined) {
        extras.error = error
      }
      emitStep(buildStep(key, status, extras))
    },

    async log(level, message, stepKey) {
      const line = await appendLog(
        prisma,
        runId,
        stepKey !== undefined ? { level, message, stepKey } : { level, message }
      )
      bus.publish({ type: 'log.appended', runId, line })
    },

    async runFinished(status, patch) {
      await finishRun(
        prisma,
        runId,
        patch.error !== undefined
          ? { status, delta: patch.delta, error: patch.error }
          : { status, delta: patch.delta }
      )
      bus.publish({ type: 'run.updated', runId, status, at: nowIso() })
    }
  }
}
