/**
 * @module @covora/checkers/code.test
 *
 * Code review checker'ları için birim testleri.
 */

import type { ReviewInput, Rule } from '@covora/types'
import { describe, expect, it } from 'vitest'

import {
  allFilesAreIndexChecker,
  asDeterministicChecker,
  barrelStructureChecker,
  foldersKebabCaseChecker,
  i18nNoBareTextChecker,
  layerDependenciesChecker,
  maxFileLinesChecker,
  noConsoleChecker,
  noDeepImportChecker,
  noDefaultExportChecker,
  noExplicitAnyChecker,
  noHardcodedUrlChecker,
  noTodoChecker,
  noTsIgnoreChecker,
  pluginManifestValidChecker,
  reactHookOrderChecker,
  requiredProjectStructureChecker
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

  it("dil filtresi eşleşmeyen dosyaları checker'a göstermez", async () => {
    // console.log bir .py dosyasında; checker ts/js'e bakar → görmez → pass.
    const checker = asDeterministicChecker(noConsoleChecker, ['ts', 'js'])
    const input: ReviewInput = { kind: 'code', files: [{ path: 'main.py', content: 'console.log(1)' }] }
    const result = await checker(rule, input)
    expect(result.outcome).toBe('pass')
  })
})

describe('hijyen kuralları', () => {
  it('maxFileLines 300 satırı aşan dosyayı yakalar', () => {
    const content = Array.from({ length: 301 }, () => 'x').join('\n')
    expect(maxFileLinesChecker([{ path: 'a.ts', content }]).outcome).toBe('fail')
  })

  it('noExplicitAny `: any` kullanımını yakalar', () => {
    expect(noExplicitAnyChecker([{ path: 'a.ts', content: 'let x: any' }]).outcome).toBe('fail')
    expect(noExplicitAnyChecker([{ path: 'a.ts', content: 'let x: string' }]).outcome).toBe('pass')
  })

  it('noTsIgnore @ts-ignore yorumunu yakalar', () => {
    expect(noTsIgnoreChecker([{ path: 'a.ts', content: '// @ts-ignore' }]).outcome).toBe('fail')
  })

  it('noDefaultExport manifest/config dışında default export yakalar', () => {
    expect(noDefaultExportChecker([{ path: 'src/x/index.ts', content: 'export default x' }]).outcome).toBe('fail')
    expect(noDefaultExportChecker([{ path: 'src/index.ts', content: 'export default manifest' }]).outcome).toBe('pass')
    expect(noDefaultExportChecker([{ path: 'vite.config.ts', content: 'export default cfg' }]).outcome).toBe('pass')
  })
})

describe('yapı / ArchUnit kuralları', () => {
  const structure = [
    'api',
    'components',
    'constants',
    'hooks',
    'langs',
    'pages',
    'service',
    'store',
    'types',
    'utils'
  ].map((dir) => ({ path: `src/${dir}/index.ts`, content: '' }))

  it('requiredProjectStructure tam yapıda pass, eksikte fail', () => {
    const full = [...structure, { path: 'src/index.ts', content: '' }]
    expect(requiredProjectStructureChecker(full).outcome).toBe('pass')
    const missing = full.filter((f) => f.path !== 'src/hooks/index.ts')
    expect(requiredProjectStructureChecker(missing).outcome).toBe('fail')
  })

  it('foldersKebabCase PascalCase klasörü tam yolla yakalar', () => {
    const bad = foldersKebabCaseChecker([{ path: 'src/components/FormRow/index.tsx', content: '' }])
    expect(bad.outcome).toBe('fail')
    // Not yalnızca segment adını değil, nerede olduğunu (tam yol) vermeli.
    expect(bad.note).toContain('src/components/FormRow')
    expect(
      foldersKebabCaseChecker([{ path: 'src/components/form-row/index.tsx', content: '' }]).outcome
    ).toBe('pass')
  })

  it('allFilesAreIndex index olmayan dosyayı yakalar', () => {
    expect(allFilesAreIndexChecker([{ path: 'src/utils/x/helper.ts', content: '' }]).outcome).toBe('fail')
    expect(allFilesAreIndexChecker([{ path: 'src/utils/x/index.ts', content: '' }]).outcome).toBe('pass')
  })

  it('barrelStructure aggregator child re-export etmiyorsa fail', () => {
    const files = [
      { path: 'src/index.ts', content: 'export default {}' },
      { path: 'src/hooks/index.ts', content: "export * from './use-a-hook'" },
      { path: 'src/hooks/use-a-hook/index.ts', content: 'export const useA = () => {}' },
      { path: 'src/hooks/use-b-hook/index.ts', content: 'export const useB = () => {}' }
    ]
    // use-b-hook re-export edilmemiş → fail
    expect(barrelStructureChecker(files).outcome).toBe('fail')
    const fixed = [
      { path: 'src/index.ts', content: 'export default {}' },
      { path: 'src/hooks/index.ts', content: "export * from './use-a-hook'\nexport * from './use-b-hook'" },
      { path: 'src/hooks/use-a-hook/index.ts', content: 'export const useA = () => {}' },
      { path: 'src/hooks/use-b-hook/index.ts', content: 'export const useB = () => {}' }
    ]
    expect(barrelStructureChecker(fixed).outcome).toBe('pass')
  })

  it('noDeepImport aynı katman kardeşine izin verir, katmanlar-arası deep import yasak', () => {
    // Aynı katman (components içinde kardeş) → izinli
    const sibling = [{ path: 'src/components/a/index.tsx', content: "import {B} from '../b'" }]
    expect(noDeepImportChecker(sibling).outcome).toBe('pass')
    // Katmanlar-arası: pages → hooks alt modülüne deep import → yasak
    const cross = [{ path: 'src/pages/x/index.tsx', content: "import {useA} from '../../hooks/use-a-hook'" }]
    expect(noDeepImportChecker(cross).outcome).toBe('fail')
    // Katmanlar-arası barrel kullanımı → izinli
    const barrel = [{ path: 'src/pages/x/index.tsx', content: "import {useA} from '../../hooks'" }]
    expect(noDeepImportChecker(barrel).outcome).toBe('pass')
  })

  it('layerDependencies pages→hooks izinli, hooks→api yasak (satır numaralı)', () => {
    const ok = [{ path: 'src/pages/x/index.tsx', content: "import {useA} from '../../hooks'" }]
    expect(layerDependenciesChecker(ok).outcome).toBe('pass')
    const bad = [{ path: 'src/hooks/use-a-hook/index.ts', content: "\nimport {get} from '../../api'" }]
    const result = layerDependenciesChecker(bad)
    expect(result.outcome).toBe('fail')
    // İhlalin satır numarası notta görünmeli (debugger-grade).
    expect(result.note).toContain('index.ts:2')
  })
})

describe('react / i18n kuralları', () => {
  it('i18nNoBareText çıplak metni yakalar, generic/çeviriyi yakalamaz', () => {
    expect(i18nNoBareTextChecker([{ path: 'a.tsx', content: '<button>Kaydet</button>' }]).outcome).toBe('fail')
    // Generic tip sözdizimi (< ardından / gelmez) → yanlış yakalanmamalı.
    expect(i18nNoBareTextChecker([{ path: 'a.tsx', content: 'const f = (): Promise<void> => x' }]).outcome).toBe('pass')
    // t(...) ile çeviri → { } içerdiği için yakalanmaz.
    expect(i18nNoBareTextChecker([{ path: 'a.tsx', content: '<span>{t("key")}</span>' }]).outcome).toBe('pass')
  })

  it('reactHookOrder useState useEffect\'ten sonra ise yakalar', () => {
    const bad = [
      { path: 'a.tsx', content: 'useEffect(() => {}, [])\nconst [x, setX] = useState(0)' }
    ]
    expect(reactHookOrderChecker(bad).outcome).toBe('fail')
    const ok = [
      { path: 'a.tsx', content: 'const [x, setX] = useState(0)\nuseEffect(() => {}, [])' }
    ]
    expect(reactHookOrderChecker(ok).outcome).toBe('pass')
    // useCallback'in effect'ten sonra gelmesi normal → pass.
    const memo = [
      { path: 'a.tsx', content: 'useEffect(() => {}, [])\nconst f = useCallback(() => {}, [])' }
    ]
    expect(reactHookOrderChecker(memo).outcome).toBe('pass')
  })
})

describe('plugin kuralları', () => {
  it('pluginManifestValid eksik/kuralsız manifesti yakalar', () => {
    const bad = [{ path: 'src/index.ts', content: "const manifest = { name: 'hab', displayName: 'Hab' }" }]
    // version/routes/... eksik + displayName büyük harf değil → fail
    expect(pluginManifestValidChecker(bad).outcome).toBe('fail')
  })

  it('pluginManifestValid manifest dosyası yoksa pass (plugin değil)', () => {
    expect(pluginManifestValidChecker([{ path: 'src/x/index.ts', content: '' }]).outcome).toBe('pass')
  })
})
