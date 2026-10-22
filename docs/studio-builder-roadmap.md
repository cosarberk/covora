# Studio Builder — Yol Haritası (ileride, acele değil)

> Amaç: Studio'yu Langflow benzeri **görsel bir akış builder'ına** çevirmek —
> kartlar (node'lar) sürükle-bırak eklenir, handle'larla birbirine bağlanır ve
> kullanıcı **kendi review akışını kendisi** kurar; bu akış backend'de
> çalıştırılabilir. Şimdi yapılmıyor; unutulmaması için not.

## Neden ulaşılabilir (elimizdeki zemin)
- **Görselleştirme zaten var:** Studio "Süreçler" ekranı React Flow + custom
  node'larla pipeline'ı (ingest → deterministic → llm → coverage → gate →
  persist → notify) ve kural kartlarını çiziyor.
- **Pipeline veri-güdümlü tasarlı:** `packages/types/src/run.ts` — adım `key`'i
  serbest string; yeni adım eklemek çekirdeği değiştirmiyor.
- **Hazır parçalar:** SSE canlı event'ler, run başına kural snapshot'ı,
  deps-injected `executeReviewRun`, checker registry + catalog, pack/scope/mode.

## İki iş parçası
1. **Builder UI** (orta efor, düşük risk): React Flow ile node paleti,
   sürükle-bırak, handle bağlantıları, graph'ı JSON olarak kaydet/yükle.
2. **Çalıştırılabilir graph (asıl zor kısım):** Bugün `execute.ts` **sabit sıra**
   koşuyor. Serbest akış için gerekenler:
   - **Port/tip sistemi** — her node ne tüketir/üretir: `files`, `ruleResults`,
     `coverage`, `gate`, `notification`.
   - **Graph interpreter** — sabit pipeline yerine kullanıcı DAG'ını topolojik
     sırayla yürüten yorumlayıcı.
   - **Doğrulama** — tip-uyumlu bağlantı, döngü tespiti, zorunlu giriş kontrolü.
   - **Kalıcılık** — graph proje bazında saklanır + versiyonlanır (snapshot
     mantığı zaten var).

## Node kataloğu taslağı
| Kategori | Node örnekleri | Üretir |
|----------|----------------|--------|
| Source   | git-clone, git-diff, push-ingest | `files` |
| Filter   | ignore (.covoraignore/glob), mode (changes/project) | `files` |
| Evaluate | checker-group (deterministik), archunit-group, llm-judge | `ruleResults` |
| Score    | coverage | `coverage` |
| Decision | gate (policy), **branch/condition** (gate kaldıysa…) | `gate` / dallanma |
| Act      | persist, notify (webhook), **jira-task**, re-review | `notification` |

## Aşamalı plan (riski düşük tutmak için)
- **Faz 1 (80/20):** Kartlar **mevcut pipeline'ı yapılandırır** — source seç,
  pack seç, mode, ignore, gate politikası, notify hedefi. Node'lar sabit ama
  bağlanır/ayarlanır. Hızlı "builder hissi", düşük risk.
- **Faz 2:** **Koşul/branch** node'ları (gate kaldıysa Jira bug aç; project
  mode'da ArchUnit grubunu koştur). Interpreter'ın ilk gerçek hali.
- **Faz 3:** **Tam serbest DAG executor** — genel yorumlayıcı, rastgele node
  grafiği. En büyük parça; Faz 1–2 üstüne oturur.

## İlişkili fikirler
- Bağlamalar (Integrations) sayfası: Jira task → otomatik MR review → çıktıya
  göre bug task'ları (builder'ın "Act" node'larıyla örtüşür).
- Config-driven / DSL ArchUnit kuralları: builder'daki "evaluate" node'larının
  parametreleştirilmiş hali.
