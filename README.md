# Covora

Self-hosted, kural tabanlı **UI & code review** platformu. Review sonuçlarını
ikili (geçti/kaldı) değil, kurallara uyum derecesini gösteren bir **coverage /
level** olarak üretir.

## Temel ilkeler

- **LLM puan vermez.** LLM yalnızca checklist doldurur (`pass` / `partial` /
  `fail`). Coverage skorunu, kural ağırlıklarına göre `@covora/core`
  içindeki deterministik algoritma hesaplar.
- **Kurallar iki tiptir:** _deterministik_ (koddan/DOM'dan kesin ölçülür,
  LLM'e gitmez) ve _LLM-yargı_ (checklist'e girer).
- **İki review türü, tek motor:** UI review (vision modeli) ve code review
  (kod modeli) aynı kural motoru + coverage algoritması üzerinde çalışır;
  yalnızca girdi ve LLM sağlayıcısı değişir.

## Yapı

```
covora/
├── apps/
│   ├── server/   # motor + REST API (Fastify)
│   └── studio/   # yönetim arayüzü — kural editörü + coverage panosu (React/Vite)
├── packages/
│   ├── core/     # kural motoru + coverage algoritması (çekirdek, saf TS)
│   ├── types/    # paylaşılan tipler + zod şemaları (tek doğruluk kaynağı)
│   ├── client/   # host uygulamaya gömülen SDK (ekran/kod yakalar, gönderir)
│   └── cli/      # bağımsız komut satırı arayüzü
├── docker-compose.yml   # postgres + server + studio
└── turbo.json
```

## Geliştirme

```bash
pnpm install      # bağımlılıklar
pnpm dev          # tüm paketleri geliştirme modunda çalıştır
pnpm build        # tümünü derle
pnpm typecheck    # tip denetimi
pnpm test         # testler
```

## ⚠️ Yayınlama (npm publish)

Tüm paketler şu an `"private": true`. Bu makinedeki npm hesabı yayın için
**kullanılmamalıdır**. Yayına geçmeden önce kendi registry'nizi kurun,
`.npmrc` içindeki registry satırlarını doldurun ve yalnızca yayınlanacak
paketlerin `private` bayrağını kaldırın.
