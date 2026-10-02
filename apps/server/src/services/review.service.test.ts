/**
 * @module @covora/server/services/review.test
 *
 * `enqueueReview` için birim testleri. Tüm bağımlılıklar mock'lanır.
 */

import type { ReviewInput, ReviewRun } from '@covora/types'
import { describe, expect, it, vi } from 'vitest'

import { createRunEventBus } from './events.js'
import { enqueueReview, ProjectNotFoundError, type EnqueueReviewDeps } from './review.service.js'

const uiInput: ReviewInput = { kind: 'ui', screenshot: 'base64' }

const sampleRun: ReviewRun = {
  id: 'run-1',
  projectKey: 'my-plugin',
  kind: 'ui',
  codeHash: 'abc123',
  status: 'queued',
  steps: [],
  createdAt: new Date().toISOString(),
  delta: null
}

const buildDeps = (overrides: Partial<EnqueueReviewDeps> = {}): EnqueueReviewDeps => ({
  findProjectByKey: vi.fn(async () => ({ id: 'p1' })),
  createRun: vi.fn(async () => ({ id: 'run-1' })),
  getQueuePosition: vi.fn(async () => 2),
  getRun: vi.fn(async () => sampleRun),
  bus: createRunEventBus(),
  ...overrides
})

describe('enqueueReview', () => {
  it('run yaratır, kuyruk sırasını döner ve run.created yayınlar', async () => {
    const bus = createRunEventBus()
    const events: string[] = []
    bus.subscribe('run-1', (event) => events.push(event.type))
    const deps = buildDeps({ bus })

    const result = await enqueueReview(deps, {
      projectKey: 'my-plugin',
      input: uiInput,
      codeHash: 'abc123'
    })

    expect(result).toEqual({ runId: 'run-1', status: 'queued', queuePosition: 2 })
    expect(deps.createRun).toHaveBeenCalledOnce()
    expect(events).toContain('run.created')
  })

  it('proje bulunamazsa ProjectNotFoundError fırlatır', async () => {
    const deps = buildDeps({ findProjectByKey: vi.fn(async () => null) })

    await expect(
      enqueueReview(deps, { projectKey: 'yok', input: uiInput, codeHash: 'x' })
    ).rejects.toBeInstanceOf(ProjectNotFoundError)
  })
})
