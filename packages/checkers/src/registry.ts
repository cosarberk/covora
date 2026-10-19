/**
 * @module @covora/checkers/registry
 *
 * Yerleşik deterministik checker kaydı. Anahtarlar kural kimlikleriyle
 * (kural `key`) eşleşir; bir kuralı bu checker'a bağlamak için kuralın
 * kimliği buradaki bir anahtarla aynı olmalıdır.
 */

import type { CheckerRegistry } from '@covora/core'

import {
  allFilesAreIndexChecker,
  asDeterministicChecker,
  barrelStructureChecker,
  foldersKebabCaseChecker,
  i18nNoBareTextChecker,
  layerDependenciesChecker,
  maxFileLinesChecker,
  noConsoleChecker,
  noCyclicImportsChecker,
  noDeepImportChecker,
  noDefaultExportChecker,
  noExplicitAnyChecker,
  noHardcodedUrlChecker,
  noTodoChecker,
  noTsIgnoreChecker,
  pluginManifestValidChecker,
  pluginNameConsistencyChecker,
  pluginViteConfigChecker,
  reactHookOrderChecker,
  requiredProjectStructureChecker
} from './code.js'

/** Yerleşik code review checker'ları (kural kimliği → checker). */
export const builtinCodeCheckers: CheckerRegistry = {
  // --- Dilden bağımsız hijyen ---
  'no-todo': asDeterministicChecker(noTodoChecker, ['*']),
  'no-hardcoded-url': asDeterministicChecker(noHardcodedUrlChecker, ['*']),
  'max-file-lines': asDeterministicChecker(maxFileLinesChecker, ['*']),
  // --- TS/JS hijyen (dosya-içi) ---
  'no-console': asDeterministicChecker(noConsoleChecker, ['ts', 'js']),
  'no-explicit-any': asDeterministicChecker(noExplicitAnyChecker, ['ts']),
  'no-ts-ignore': asDeterministicChecker(noTsIgnoreChecker, ['ts']),
  'no-default-export': asDeterministicChecker(noDefaultExportChecker, ['ts', 'js']),
  'i18n-no-bare-text': asDeterministicChecker(i18nNoBareTextChecker, ['ts']),
  'react-hook-order': asDeterministicChecker(reactHookOrderChecker, ['ts']),
  // --- ArchUnit tarzı (scope=project): proje yapısı / mimari ---
  'no-cyclic-imports': asDeterministicChecker(noCyclicImportsChecker, ['ts', 'js']),
  'required-project-structure': asDeterministicChecker(requiredProjectStructureChecker, ['ts']),
  'folders-kebab-case': asDeterministicChecker(foldersKebabCaseChecker, ['*']),
  'all-files-are-index': asDeterministicChecker(allFilesAreIndexChecker, ['ts']),
  'barrel-structure': asDeterministicChecker(barrelStructureChecker, ['ts']),
  'no-deep-import': asDeterministicChecker(noDeepImportChecker, ['ts']),
  'layer-dependencies': asDeterministicChecker(layerDependenciesChecker, ['ts']),
  // --- Plugin'e özel (manifest / vite / isim tutarlılığı) ---
  'plugin-manifest-valid': asDeterministicChecker(pluginManifestValidChecker, ['*']),
  'plugin-vite-config': asDeterministicChecker(pluginViteConfigChecker, ['*']),
  'plugin-name-consistency': asDeterministicChecker(pluginNameConsistencyChecker, ['*'])
}
