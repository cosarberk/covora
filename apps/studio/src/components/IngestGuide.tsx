/**
 * @module studio/components/IngestGuide
 *
 * Projeye review göndermek için entegrasyon rehberi. Ingest token'ı tek başına
 * işe yaramaz; bu ekran token + sunucu + proje anahtarını hazır kopyalanabilir
 * snippet'lere gömer (cURL, Node SDK, CLI, GitHub Actions, tarayıcı/UI). Amaç:
 * kullanıcı kopyala-yapıştır ile dakikalar içinde review göndermeye başlasın.
 */

import { useMemo, useState } from 'react'

import { Icon } from './Icon.js'

/** {@link IngestGuide} props. */
export interface IngestGuideProps {
  readonly projectKey: string
  readonly ingestToken: string
}

type Tab = 'curl' | 'sdk-ui' | 'sdk-code' | 'cli' | 'ci'

const TABS: readonly { readonly id: Tab; readonly label: string }[] = [
  { id: 'curl', label: 'cURL' },
  { id: 'sdk-ui', label: 'Node SDK · UI' },
  { id: 'sdk-code', label: 'Node SDK · Kod' },
  { id: 'cli', label: 'CLI' },
  { id: 'ci', label: 'GitHub Actions' }
]

/** Kopyalanabilir kod bloğu. */
const CodeBlock = ({ code }: { readonly code: string }): React.JSX.Element => {
  const [copied, setCopied] = useState(false)
  const copy = async (): Promise<void> => {
    try {
      await globalThis.navigator?.clipboard?.writeText(code)
      setCopied(true)
      globalThis.setTimeout(() => setCopied(false), 1500)
    } catch {
      /* panoya erişilemedi; sessiz geç */
    }
  }
  return (
    <div className="codeblock">
      <button type="button" className="codeblock__copy" onClick={() => void copy()}>
        <Icon name="copy" size={13} />
        {copied ? 'Kopyalandı' : 'Kopyala'}
      </button>
      <pre className="codeblock__pre">
        <code>{code}</code>
      </pre>
    </div>
  )
}

/** Entegrasyon rehberi. */
export const IngestGuide = ({ projectKey, ingestToken }: IngestGuideProps): React.JSX.Element => {
  const [tab, setTab] = useState<Tab>('curl')
  const [revealed, setRevealed] = useState(false)

  const server =
    typeof globalThis.location !== 'undefined' ? globalThis.location.origin : 'https://covora.ornek'

  const snippets = useMemo<Record<Tab, string>>(
    () => ({
      curl: `curl -X POST "${server}/reviews" \\
  -H "content-type: application/json" \\
  -H "x-covora-token: ${ingestToken}" \\
  -d '{
    "projectKey": "${projectKey}",
    "codeHash": "'"$(git rev-parse HEAD)"'",
    "input": {
      "kind": "code",
      "files": [
        { "path": "src/app.ts", "content": "export const x = 1\\n" }
      ]
    }
  }'
# 202 Accepted → { "runId": "...", "status": "queued" }
# Sonucu izle: GET ${server}/reviews/<runId>?projectKey=${projectKey}`,

      'sdk-ui': `import { createCovoraClient } from '@covora/client'

const covora = createCovoraClient({
  serverUrl: '${server}',
  projectKey: '${projectKey}',
  ingestToken: '${ingestToken}' // tarayıcıda açığa çıkmaması için proxy arkasında tutun
})

// O anki ekranı yakalayıp UI review çalıştırır, bitene kadar izler:
const run = await covora.reviewUi(crypto.randomUUID(), document.body, {
  onProgress: (event) => console.log(event.type)
})

console.log(run.status, run.score, run.gatePassed)`,

      'sdk-code': `import { createCovoraClient } from '@covora/client'

const covora = createCovoraClient({
  serverUrl: '${server}',
  projectKey: '${projectKey}',
  ingestToken: '${ingestToken}'
})

const run = await covora.review({
  codeHash: 'abc123',
  input: {
    kind: 'code',
    files: [{ path: 'src/app.ts', content: sourceCode }]
  }
})

if (!run.gatePassed) {
  throw new Error('Merge gate kaldı: ' + run.score)
}`,

      cli: `# Kod review'ı pipeline'dan gönder (gate kalırsa çıkış kodu != 0):
npx @covora/cli review \\
  --server ${server} \\
  --project ${projectKey} \\
  --token ${ingestToken} \\
  --code-hash $(git rev-parse HEAD) \\
  "src/**/*.ts"`,

      ci: `name: Covora Review
on: [pull_request]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Covora code review (gate)
        run: >
          npx @covora/cli review
          --server \${{ secrets.COVORA_SERVER }}
          --project ${projectKey}
          --token \${{ secrets.COVORA_TOKEN }}
          --code-hash \${{ github.sha }}
          "src/**/*.ts"
# Gate kalırsa adım başarısız olur ve PR bloklanır.
# COVORA_TOKEN'ı repo Secrets'a ekleyin (token'ı YAML'a gömmeyin).`
    }),
    [server, projectKey, ingestToken]
  )

  const masked = `${ingestToken.slice(0, 6)}${'•'.repeat(Math.max(0, ingestToken.length - 10))}${ingestToken.slice(-4)}`

  return (
    <div className="ingest">
      <div className="page__head">
        <div>
          <h1 className="page__title">Entegrasyon</h1>
          <p className="page__sub">
            Pipeline’ından ya da uygulamandan Covora’ya review gönder. Aşağıdakini kopyala-yapıştır.
          </p>
        </div>
      </div>

      <div className="ingest-creds">
        <div className="cred">
          <span className="cred__label">Sunucu</span>
          <code className="cred__val mono">{server}</code>
        </div>
        <div className="cred">
          <span className="cred__label">Proje anahtarı</span>
          <code className="cred__val mono">{projectKey}</code>
        </div>
        <div className="cred cred--token">
          <span className="cred__label">Ingest token</span>
          <code className="cred__val mono">{revealed ? ingestToken : masked}</code>
          <button type="button" className="link-button" onClick={() => setRevealed((v) => !v)}>
            {revealed ? 'Gizle' : 'Göster'}
          </button>
        </div>
        <p className="ingest-warn">
          Token, projene review gönderme yetkisi verir — gizli tutun, istemci koduna gömmek yerine
          sunucu/CI ortam değişkeninde saklayın.
        </p>
      </div>

      <div className="ingest-tabs">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={tab === item.id ? 'ingest-tab is-active' : 'ingest-tab'}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <CodeBlock code={snippets[tab]} />
    </div>
  )
}
