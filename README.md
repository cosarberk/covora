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

### 3. Server

`apps/server/.env` (bkz. `.env.example`):

```
PORT=4000
DATABASE_URL=postgresql://covora:covora@localhost:5432/covora
COVORA_AUTH_SECRET=en-az-16-karakterlik-gizli
```

> AI sağlayıcıları (Ollama / OpenAI-uyumlu) **ENV'den verilmez**; sunucu açıldıktan
> sonra Studio → **AI Sağlayıcılar** sayfasından eklenir ve DB'ye kaydedilir.
> Aktif sağlayıcı yoksa review'ın AI adımı `degraded` olur (deterministik kurallar
> yine çalışır); sunucu sağlayıcısız da sorunsuz açılır.

```bash
pnpm --filter @covora/server dev    # ya da build + start
```

### 4. AI sağlayıcısı ekle (Studio'dan)

Studio → **AI Sağlayıcılar** → tür (`ollama` / `openai-uyumlu`), endpoint, model
(ve gerekiyorsa API anahtarı), review türü (ui/code) seç, **aktifleştir**. Örn.
Ollama için `http://<host>:11434` + `qwen3-vl:8b`. Sağlık/durumu aynı sayfadan
canlı kontrol edilir. Sağlayıcının modeli sıcak tutması (ör. `OLLAMA_KEEP_ALIVE`)
tamamen o backend'in operasyonel meselesidir; Covora'ya gömülü değildir.

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
AI sağlayıcısı (Ollama ya da OpenAI-uyumlu bir uç nokta) ayrı yaşar ve Covora'ya
**Studio → AI Sağlayıcılar** sayfasından, DB'ye kaydedilerek tanıtılır — server
ortam değişkeniyle değil. Böylece sağlayıcı türü/adresi çalışırken değiştirilebilir
ve hiçbir backend koda/deployment'a gömülü olmaz.

## ⚠️ Yayınlama (npm publish)

Tüm paketler `"private": true`. Bu makinedeki npm hesabı yayın için
**kullanılmamalıdır**. Yayına geçmeden önce kendi registry'nizi kurun,
`.npmrc` içindeki registry satırlarını doldurun ve yalnızca yayınlanacak
paketlerin `private` bayrağını kaldırın.
