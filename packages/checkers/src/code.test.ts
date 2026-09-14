/**
 * @module @covora/checkers/code.test
 *
 * Code review checker'ları için birim testleri.
 */

import type { ReviewInput, Rule } from '@covora/types'
import { describe, expect, it } from 'vitest'

import {
  asDeterministicChecker,
  noConsoleChecker,
  noHardcodedUrlChecker,
  noTodoChecker
} from './code.js'

const codeInput = (content: string): ReviewInput => ({
  kind: 'code',
  files: [{ path: 'src/a.ts', content }]
})

const rule: Rule = {
  id: 'no-todo',
  title: 'TODO yok',
  description: '',
  kind: 'code',
  evaluation: 'deterministic',
  severity: 'warning',
  weight: 1
}

describe('noTodoChecker', () => {
  it('temiz kodda pass döner', () => {
    expect(noTodoChecker([{ path: 'a.ts', content: 'const x = 1' }]).outcome).toBe('pass')
  })

  it('TODO içeren kodda fail döner ve dosyayı belirtir', () => {
    const result = noTodoChecker([{ path: 'a.ts', content: '// TODO: sonra' }])
    expect(result.outcome).toBe('fail')
    expect(result.note).toContain('a.ts')
  })
})

describe('noConsoleChecker', () => {
  it('console.log içeren kodda fail döner', () => {
    expect(noConsoleChecker([{ path: 'a.ts', content: 'console.log(1)' }]).outcome).toBe('fail')
  })
})

describe('noHardcodedUrlChecker', () => {
  it('gömülü URL içeren kodda fail döner', () => {
    expect(
      noHardcodedUrlChecker([{ path: 'a.ts', content: 'const u = "https://x.com"' }]).outcome
    ).toBe('fail')
  })
})

describe('asDeterministicChecker', () => {
  it('code girdisinde checker sonucunu RuleResult olarak döner', async () => {
    const checker = asDeterministicChecker(noTodoChecker)
    const result = await checker(rule, codeInput('temiz'))
    expect(result).toEqual({ ruleId: 'no-todo', outcome: 'pass' })
  })

  it('code olmayan girdide fail döner', async () => {
    const checker = asDeterministicChecker(noTodoChecker)
    const uiInput: ReviewInput = { kind: 'ui', screenshot: 'x' }
    const result = await checker(rule, uiInput)
    expect(result.outcome).toBe('fail')
  })
})
