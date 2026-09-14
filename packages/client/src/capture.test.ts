/**
 * @module @covora/client/capture.test
 *
 * `captureScreenshot` için birim testleri. `html2canvas` mock'lanır.
 */

import { describe, expect, it, vi } from 'vitest'

vi.mock('html2canvas', () => ({
  default: vi.fn(async () => ({
    toDataURL: (): string => 'data:image/png;base64,ABC123'
  }))
}))

import { captureScreenshot } from './capture.js'

describe('captureScreenshot', () => {
  it('data URL önekini kaldırıp base64 gövdesini döner', async () => {
    const result = await captureScreenshot(document.createElement('div'))

    expect(result).toBe('ABC123')
  })
})
