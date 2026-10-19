#!/usr/bin/env node
/**
 * @module @covora/cli/bin
 *
 * `covora` komut satırı giriş noktası.
 */

import { Command } from 'commander'

import type { ReviewScope } from '@covora/types'

import { changedPaths, collectPaths, deriveCodeHash, loadIgnoreMatcher } from './collect.js'
import { ReviewExitCode, runReviewCommand } from './review-command.js'

const program = new Command()

program.name('covora').description('Covora review komut satırı arayüzü')

program
  .command('review')
  .description('Yerel bir projeyi (klasör veya git değişenleri) code review sunucusuna gönderir ve gate kararını uygular')
  .argument('[path]', 'Taranacak klasör (depo kökünden çalıştır; src öneki korunur)', '.')
  .requiredOption('--server <url>', 'Covora sunucu adresi')
  .requiredOption('--project <key>', 'Proje anahtarı')
  .requiredOption('--token <token>', 'Projenin ingest token değeri (studio > proje)')
  .option('--mode <mode>', 'Review kapsamı: changes | project (ArchUnit için project)', 'changes')
  .option('--changed', "Yalnızca git'e göre değişen dosyaları gönder (diff review)")
  .option('--base <ref>', '--changed için karşılaştırma tabanı (dal/tag/sha)')
  .option('--ignore <patterns>', 'Dışlanacak desenler (virgülle; .covoraignore ile birleşir)')
  .option('--code-hash <hash>', 'Review edilen kodun hash değeri (verilmezse git HEAD sha)')
  .action(
    async (
      path: string,
      options: {
        server: string
        project: string
        token: string
        mode: string
        changed?: boolean
        base?: string
        ignore?: string
        codeHash?: string
      }
    ): Promise<void> => {
      if (options.mode !== 'changes' && options.mode !== 'project') {
        console.error("--mode yalnızca 'changes' veya 'project' olabilir")
        process.exit(ReviewExitCode.error)
      }
      // --changed kullanılırsa kapsam doğal olarak değişen-dosyalardır (changes).
      const mode: ReviewScope = options.changed === true ? 'changes' : (options.mode as ReviewScope)

      const ignore = await loadIgnoreMatcher(options.ignore)

      let files: string[]
      try {
        files =
          options.changed === true
            ? await changedPaths(options.base, ignore)
            : await collectPaths(path, ignore)
      } catch (error) {
        console.error(`Dosyalar toplanamadı: ${error instanceof Error ? error.message : String(error)}`)
        process.exit(ReviewExitCode.error)
        return
      }

      if (files.length === 0) {
        console.error(
          options.changed === true
            ? "Git'e göre değişen (uygun) dosya bulunamadı"
            : 'Taranan yolda incelenecek dosya bulunamadı'
        )
        process.exit(ReviewExitCode.error)
      }

      const codeHash = options.codeHash ?? (await deriveCodeHash())
      console.log(`${files.length} dosya gönderiliyor (mode: ${mode}, hash: ${codeHash})`)

      const exitCode = await runReviewCommand({
        server: options.server,
        project: options.project,
        token: options.token,
        codeHash,
        files,
        mode
      })
      process.exit(exitCode)
    }
  )

await program.parseAsync(process.argv)
