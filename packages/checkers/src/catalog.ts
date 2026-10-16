/**
 * @module @covora/checkers/catalog
 *
 * Yerleşik deterministik checker kataloğu (tanıtıcı bilgi). Kural oluştururken
 * studio bu listeyi gösterir; kullanıcı anahtarı tahmin etmeden checker seçer.
 * Buradaki her `key`, {@link builtinCodeCheckers} içindeki bir anahtarla birebir
 * aynı olmalıdır (kural → checker eşleşmesi bu anahtarla kurulur).
 */

import type { CheckerInfo } from '@covora/types'

/** Yerleşik code review checker'larının kataloğu. */
export const CHECKER_CATALOG: readonly CheckerInfo[] = [
  {
    key: 'no-todo',
    title: 'Kodda TODO/FIXME olmamalı',
    description: 'Kaynakta TODO/FIXME/XXX işaretlerini arar; bulursa dosya:satır ile raporlar.',
    kind: 'code',
    scope: 'changes'
  },
  {
    key: 'no-console',
    title: 'console.* çağrısı olmamalı',
    description: 'Üretim kodunda console.log/debug/info/warn/error çağrılarını tespit eder.',
    kind: 'code',
    scope: 'changes'
  },
  {
    key: 'no-hardcoded-url',
    title: 'Gömülü URL olmamalı',
    description: 'Koda gömülü http(s) adreslerini arar (yapılandırmaya taşınmalı).',
    kind: 'code',
    scope: 'changes'
  },
  {
    key: 'no-cyclic-imports',
    title: 'Dairesel import olmamalı (ArchUnit)',
    description:
      'Tüm projenin göreli import grafiğini kurar ve dairesel bağımlılık (A→B→A) tespit eder. Proje-geneli çalışır; yalnızca tüm depo çekildiğinde anlamlıdır.',
    kind: 'code',
    scope: 'project'
  }
]
