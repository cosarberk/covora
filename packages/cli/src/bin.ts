#!/usr/bin/env node
/**
 * @module @covora/cli/bin
 *
 * `covora` komut satırı giriş noktası.
 */

import { Command } from 'commander'

import { runReviewCommand } from './review-command.js'

const program = new Command()

program.name('covora').description('Covora review komut satırı arayüzü')

program
  .command('review')
  .description('Kaynak dosyaları code review sunucusuna gönderir ve gate kararını uygular')
  .requiredOption('--server <url>', 'Covora sunucu adresi')
  .requiredOption('--project <key>', 'Proje anahtarı')
  .requiredOption('--code-hash <hash>', 'Review edilen kodun hash değeri')
  .argument('<files...>', 'Review edilecek dosya yolları')
  .action(
    async (
      files: string[],
      options: { server: string; project: string; codeHash: string }
    ): Promise<void> => {
      const exitCode = await runReviewCommand({
        server: options.server,
        project: options.project,
        codeHash: options.codeHash,
        files
      })
      process.exit(exitCode)
    }
  )

await program.parseAsync(process.argv)
