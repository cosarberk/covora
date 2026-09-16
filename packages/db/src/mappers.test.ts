/**
 * @module @covora/db/mappers.test
 *
 * Prisma → domain dönüştürücüleri için birim testleri (saf, DB gerektirmez).
 */

import type { ProjectConfig as PrismaProjectConfig, Rule as PrismaRule } from '@prisma/client'
import { describe, expect, it } from 'vitest'

import { toCoverageConfig, toDomainRule, toGatePolicy } from './mappers.js'

const prismaRule: PrismaRule = {
  id: 'cuid-1',
  packId: 'pack-1',
  key: 'r-key',
  title: 'Başlık',
  description: 'Açıklama',
  kind: 'ui',
  evaluation: 'llm',
  severity: 'warning',
  weight: 2,
  prompt: null,
  enabled: true,
  createdAt: new Date(),
  updatedAt: new Date()
}

const prismaConfig: PrismaProjectConfig = {
  id: 'cfg-1',
  projectId: 'p-1',
  partialCredit: 0.5,
  levels: [
    { id: 'good', minScore: 75 },
    { id: 'poor', minScore: 0 }
  ],
  gateMinScore: 60,
  gateBlockOnFailedBlockers: true
}

describe('toDomainRule', () => {
  it('Prisma kuralını domain kuralına çevirir (id = key)', () => {
    const rule = toDomainRule(prismaRule)

    expect(rule.id).toBe('r-key')
    expect(rule.title).toBe('Başlık')
    expect(rule.kind).toBe('ui')
    expect(rule.weight).toBe(2)
  })
})

describe('toCoverageConfig', () => {
  it("levels JSON'unu doğrular ve CoverageConfig üretir", () => {
    const config = toCoverageConfig(prismaConfig)

    expect(config.partialCredit).toBe(0.5)
    expect(config.levels).toHaveLength(2)
  })

  it('geçersiz levels JSON için hata fırlatır', () => {
    const invalid = { ...prismaConfig, levels: [{ id: 'x' }] }

    expect(() => toCoverageConfig(invalid)).toThrow()
  })
})

describe('toGatePolicy', () => {
  it('gate alanlarını GatePolicy nesnesine çevirir', () => {
    const policy = toGatePolicy(prismaConfig)

    expect(policy.minScore).toBe(60)
    expect(policy.blockOnFailedBlockers).toBe(true)
  })
})
