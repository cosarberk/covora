/**
 * @module @covora/checkers/registry
 *
 * Yerleşik deterministik checker kaydı. Anahtarlar kural kimlikleriyle
 * (kural `key`) eşleşir; bir kuralı bu checker'a bağlamak için kuralın
 * kimliği buradaki bir anahtarla aynı olmalıdır.
 */

import type { CheckerRegistry } from '@covora/core'

import {
  asDeterministicChecker,
  noConsoleChecker,
  noHardcodedUrlChecker,
  noTodoChecker
} from './code.js'

/** Yerleşik code review checker'ları (kural kimliği → checker). */
export const builtinCodeCheckers: CheckerRegistry = {
  'no-todo': asDeterministicChecker(noTodoChecker),
  'no-console': asDeterministicChecker(noConsoleChecker),
  'no-hardcoded-url': asDeterministicChecker(noHardcodedUrlChecker)
}
