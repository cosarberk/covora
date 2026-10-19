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
    scope: 'changes',
    languages: ['*']
  },
  {
    key: 'no-console',
    title: 'console.* çağrısı olmamalı',
    description: 'Üretim kodunda console.log/debug/info/warn/error çağrılarını tespit eder.',
    kind: 'code',
    scope: 'changes',
    languages: ['ts', 'js']
  },
  {
    key: 'no-hardcoded-url',
    title: 'Gömülü URL olmamalı',
    description: 'Koda gömülü http(s) adreslerini arar (yapılandırmaya taşınmalı).',
    kind: 'code',
    scope: 'changes',
    languages: ['*']
  },
  {
    key: 'no-cyclic-imports',
    title: 'Dairesel import olmamalı (ArchUnit)',
    description:
      'Tüm projenin göreli import grafiğini kurar ve dairesel bağımlılık (A→B→A) tespit eder. Proje-geneli çalışır; yalnızca tüm depo çekildiğinde anlamlıdır.',
    kind: 'code',
    scope: 'project',
    languages: ['ts', 'js']
  },
  {
    key: 'max-file-lines',
    title: 'Dosya 300 satırı aşmamalı',
    description: 'Bir dosya 300 satırı aşıyorsa bölünmeli; aşan dosyaları satır sayısıyla raporlar.',
    kind: 'code',
    scope: 'changes',
    languages: ['*']
  },
  {
    key: 'no-explicit-any',
    title: "TypeScript 'any' kullanılmamalı",
    description: ": any, as any, <any>, any[] kalıplarını arar; tip güvenliğini zayıflatan any kullanımını yakalar.",
    kind: 'code',
    scope: 'changes',
    languages: ['ts']
  },
  {
    key: 'no-ts-ignore',
    title: '@ts-ignore/@ts-nocheck olmamalı',
    description: 'Tip hatalarını bastıran @ts-ignore ve @ts-nocheck yorumlarını tespit eder.',
    kind: 'code',
    scope: 'changes',
    languages: ['ts']
  },
  {
    key: 'no-default-export',
    title: 'Default export olmamalı (barrel uyumu)',
    description:
      "export default kullanımını yakalar (barrel 'export *' uyumu için). Manifest (src/index.ts) ve *.config.* dosyaları muaftır.",
    kind: 'code',
    scope: 'changes',
    languages: ['ts', 'js']
  },
  {
    key: 'i18n-no-bare-text',
    title: 'JSX içinde çıplak metin olmamalı (i18n)',
    description:
      "JSX kapanış etiketinden önceki çevrilmemiş düz metni (>metin</) arar; hepsi t(...) ile çevrilmeli. Generic/tip sözdizimini yanlış yakalamaz.",
    kind: 'code',
    scope: 'changes',
    languages: ['ts']
  },
  {
    key: 'react-hook-order',
    title: 'React: state hookları useEffect\'ten önce gelmeli',
    description:
      "useState/useRef/useMemo gibi deklarasyon hook'larının useEffect/useLayoutEffect'ten önce tanımlanmasını kontrol eder.",
    kind: 'code',
    scope: 'changes',
    languages: ['ts']
  },
  {
    key: 'required-project-structure',
    title: 'Zorunlu src klasör yapısı (ArchUnit)',
    description:
      'src altında api/components/constants/hooks/langs/pages/service/store/types/utils ve index.ts bulunmalı; beklenmeyen klasör olmamalı.',
    kind: 'code',
    scope: 'project',
    languages: ['ts']
  },
  {
    key: 'folders-kebab-case',
    title: 'Tüm klasörler kebab-case (ArchUnit)',
    description: 'Tüm klasör adlarının kebab-case kuralına uyup uymadığını kontrol eder.',
    kind: 'code',
    scope: 'project',
    languages: ['*']
  },
  {
    key: 'all-files-are-index',
    title: 'Tüm dosyalar index olmalı (ArchUnit)',
    description:
      'src altındaki tüm kaynak dosyalarının index.ts/index.tsx olmasını zorunlu kılar (dosya adı = bağlı olduğu klasör). Test ve .d.ts dosyaları muaftır.',
    kind: 'code',
    scope: 'project',
    languages: ['ts']
  },
  {
    key: 'barrel-structure',
    title: 'Barrel export yapısı zorunlu (ArchUnit)',
    description:
      "Kod içeren her klasörde index barrel'ı bulunmalı ve aggregator index'leri alt modüllerini export ... from './child' ile yeniden ihraç etmelidir.",
    kind: 'code',
    scope: 'project',
    languages: ['ts']
  },
  {
    key: 'no-deep-import',
    title: 'Deep import yasak (ArchUnit)',
    description:
      "Bir modüle dışarıdan erişim yalnızca klasör barrel'ı üzerinden yapılmalı ('../hooks' ✓, '../hooks/x-hook' ✗).",
    kind: 'code',
    scope: 'project',
    languages: ['ts']
  },
  {
    key: 'layer-dependencies',
    title: 'Katman bağımlılık kuralları (ArchUnit)',
    description:
      'Mimari katman kurallarını zorunlu kılar: ör. pages yalnızca hooks/components; hooks yalnızca service/constants/utils; utils bağımsız olmalı.',
    kind: 'code',
    scope: 'project',
    languages: ['ts']
  },
  {
    key: 'plugin-manifest-valid',
    title: 'PluginManifest eksiksiz ve kurallı (Plugin)',
    description:
      'src/index.ts manifest\'ini doğrular: zorunlu alanlar, named+default export, displayName büyük harf, version semver, name slug.',
    kind: 'code',
    scope: 'project',
    languages: ['*']
  },
  {
    key: 'plugin-vite-config',
    title: 'vite.config plugin build kuralları (Plugin)',
    description:
      "vite.config.ts build kurallarını doğrular: entry src/index.ts, formats ['iife'], outDir dist, minify, footer ve external↔globals eşleşmesi.",
    kind: 'code',
    scope: 'project',
    languages: ['*']
  },
  {
    key: 'plugin-name-consistency',
    title: 'Plugin isim tutarlılığı (Plugin)',
    description:
      'manifest.name base alınarak package.json (<base>-plugin), vite name (<Base>Plugin), fileName ve footer globalinin tutarlı türetildiğini doğrular.',
    kind: 'code',
    scope: 'project',
    languages: ['*']
  }
]
