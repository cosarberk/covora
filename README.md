# Covora

Self-hosted, kural tabanlı **UI & code review** platformu. Review sonuçlarını
ikili (geçti/kaldı) değil, kurallara uyum derecesini gösteren bir **coverage /
level** olarak üretir ve bir **merge gate** kararına bağlar.

## Temel ilkeler

- **LLM puan vermez.** LLM yalnızca checklist doldurur (`pass` / `partial` /
  `fail`). Coverage skorunu, kural ağırlıklarına göre `@covora/core` içindeki
  deterministik algoritma hesaplar.
- **Kurallar iki tiptir:** _deterministik_ (koddan/DOM'dan kesin ölçülür,
  LLM'e gitmez) ve _LLM-yargı_ (checklist'e girer).
- **İki review türü, tek motor:** UI review (vision modeli) ve code review
  (kod modeli) aynı kural motoru + coverage algoritması üzerinde çalışır.
- **Her şey yapılandırmadan:** eşikler, ağırlıklar, gate politikası DB'den.
  Kural değişiklikleri audit log'lu.

## Yapı

```
covora/
├── apps/
│   ├── server/   # motor + REST API (Fastify)
│   └── studio/   # yönetim arayüzü — kural editörü + coverage panosu (React/Vite)
├── packages/
│   ├── core/            # kural motoru + coverage/gate algoritması (saf TS)
│   ├── types/           # paylaşılan tipler + zod şemaları (tek doğruluk kaynağı)
│   ├── provider-ollama/ # LlmProvider'ın Ollama (Qwen3-VL) implementasyonu
│   ├── db/              # Prisma persistence (kurallar, review, audit, config)
│   ├── client/          # host uygulamaya gömülen SDK (ekran/kod yakalar)
│   └── cli/             # bağımsız komut satırı arayüzü (ertelendi)
├── docker-compose.yml   # postgres + server + studio
└── turbo.json
```

## Geliştirme

```bash
pnpm install      # bağımlılıklar (Prisma client otomatik generate edilir)
pnpm build        # tümünü derle
pnpm typecheck    # tip denetimi
pnpm test         # birim testleri (32)
```

## Çalıştırma (canlı)

Sıra önemli — üç dış bağımlılık gerekir: **Postgres**, **Ollama**, ve
migration.

### 1. Postgres

```bash
docker compose up -d postgres
```

### 2. Veritabanı şemasını uygula

```bash
cd packages/db
export DATABASE_URL="postgresql://covora:covora@localhost:5432/covora"
pnpm db:migrate        # geliştirme; prod'da: pnpm db:deploy
```

### 3. Ollama (self-host, GPU'suz olabilir)

Uzak/yerel bir Ollama sunucusunda modelleri hazırla:

```bash
ollama pull qwen3-vl:8b       # UI (vision) review
ollama pull qwen3-coder:7b    # code review
```

### 4. Server

`apps/server/.env` (bkz. `.env.example`):

```
PORT=4000
DATABASE_URL=postgresql://covora:covora@localhost:5432/covora
OLLAMA_UI_BASE_URL=http://<ollama-host>:11434
OLLAMA_UI_MODEL=qwen3-vl:8b
OLLAMA_CODE_BASE_URL=http://<ollama-host>:11434
OLLAMA_CODE_MODEL=qwen3-coder:7b
```

```bash
pnpm --filter @covora/server dev    # ya da build + start
```

### 5. Studio

```bash
pnpm --filter @covora/studio dev    # http://localhost:4100
```

## Client SDK ile entegrasyon

Host uygulamaya (örn. mock-shell) gömülür. Ekranı yakalayıp review'ı tek
çağrıda çalıştırır:

```ts
import { createCovoraClient } from '@covora/client'

const covora = createCovoraClient({
  serverUrl: 'http://<covora-server>:4000',
  projectKey: 'anasayfa-plugin'
})

// Bir "Review" butonundan:
const sonuc = await covora.reviewUi(codeHash)
// sonuc.coverage.score / sonuc.coverage.level / sonuc.gate.passed
```

## REST API (özet)

| Yöntem | Yol | Açıklama |
|--------|-----|----------|
| `POST` | `/reviews` | Review çalıştır (projectKey + input + codeHash) |
| `GET`  | `/health` | Sağlık kontrolü |
| `POST` | `/projects` | Proje oluştur/güncelle |
| `GET`  | `/projects/:key/rules` | Kuralları listele |
| `POST` | `/projects/:key/rules` | Kural oluştur (audit'li) |
| `PATCH`| `/rules/:id` | Kural güncelle (audit'li) |
| `GET`  | `/projects/:key/reviews` | Review geçmişi |

Audit aktörü `x-covora-user` başlığından okunur.

## Deployment

Docker image'lar `docker-compose.yml` üzerinden (postgres + server + studio).
Ollama ayrı bir (tercihen GPU'lu) sunucuda yaşar; server ona `OLLAMA_*`
değişkenleriyle bağlanır. k8s dağıtımı için image'lar worker node'lara,
Ollama uzak sunucuya yerleştirilir.

## ⚠️ Yayınlama (npm publish)

Tüm paketler `"private": true`. Bu makinedeki npm hesabı yayın için
**kullanılmamalıdır**. Yayına geçmeden önce kendi registry'nizi kurun,
`.npmrc` içindeki registry satırlarını doldurun ve yalnızca yayınlanacak
paketlerin `private` bayrağını kaldırın.
