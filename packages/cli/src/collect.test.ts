/**
 * @module @covora/cli/collect.test
 *
 * Dışlama (ignore) eşleştiricisi birim testleri.
 */

import { describe, expect, it } from 'vitest'

import { makeIgnoreMatcher } from './collect.js'

describe('makeIgnoreMatcher', () => {
  it('düz isim her seviyede klasör/dosya ile eşleşir', () => {
    const ignore = makeIgnoreMatcher(['tests', 'api'])
    expect(ignore('tests/x.ts')).toBe(true)
    expect(ignore('src/tests/x.ts')).toBe(true)
    expect(ignore('src/api/index.ts')).toBe(true)
    expect(ignore('src/components/index.ts')).toBe(false)
  })

  it('yol deseni (src/api) o yola ve altına sabitlenir', () => {
    const ignore = makeIgnoreMatcher(['src/api'])
    expect(ignore('src/api/index.ts')).toBe(true)
    expect(ignore('src/api')).toBe(true)
    // Başka yerdeki api dışlanmaz (sabitlenmiş yol).
    expect(ignore('src/features/api/index.ts')).toBe(false)
  })

  it('ayırıcısız glob dosya adına göre eşleşir', () => {
    const ignore = makeIgnoreMatcher(['*.test.ts'])
    expect(ignore('src/utils/x/index.test.ts')).toBe(true)
    expect(ignore('src/utils/x/index.ts')).toBe(false)
  })

  it('** glob tam yola göre eşleşir', () => {
    const ignore = makeIgnoreMatcher(['**/*.stories.tsx'])
    expect(ignore('src/components/a/button.stories.tsx')).toBe(true)
    expect(ignore('src/components/a/index.tsx')).toBe(false)
  })

  it('yorum ve boş satırları yok sayar', () => {
    const ignore = makeIgnoreMatcher(['# yorum', '', '  tests  '])
    expect(ignore('tests/x.ts')).toBe(true)
    expect(ignore('src/x.ts')).toBe(false)
  })
})
