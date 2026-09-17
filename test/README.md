# Covora — İlk uçtan uca UI review testi

Bu klasör, Covora'yı **sıfırdan** bir kullanıcı gibi denemek için en basit senaryodur:
panele birkaç kural ekle → hazır `index.html`'i tarayıcıda aç → **Review** butonuna bas
→ sonucun panelde gerçekten göründüğünü doğrula.

> Ön koşul: CORS içeren sürüm (server) canlıda olmalı ve `@covora/client` bundle'ı
> build edilmiş olmalı. İkisi de aşağıda anlatıldı.

---

## 1) Studio'da kuralları hazırla

Giriş yap (varsayılan `admin@covora.local` / `covora-admin`).

### a. Proje oluştur
Sol alttan **Proje Ekle**: anahtar `test-ui`, ad `Test UI`.

### b. Kuralları içeren bir pack'e abone ol
İki yol var:

**Kolay yol —** hazır `ui-temel` paketi zaten aşağıdaki 3 kuralı içerir:
proje → **Paketler** sekmesi → `ui-temel` satırında **Abone** yap. Bitti.

**Elle yol (kuralları kendin eklemek istersen) —** sol menü **Review Paketleri**
→ yeni pack ekle: anahtar `test-ui-pack`, ad `Test UI`, tür `ui` → oluştur →
satırında **Kurallar** → aşağıdaki 3 kuralı ekle. Sonra proje → **Paketler** →
bu paketi **Abone** yap.

| Anahtar (key)        | Başlık                                    | Değerlendirme   | Önem    | Ağırlık |
| -------------------- | ----------------------------------------- | --------------- | ------- | ------- |
| `header-exists`      | Sayfada header bulunmalı                  | `deterministic` | blocker | 3       |
| `has-primary-action` | Birincil aksiyon butonu bulunmalı         | `deterministic` | warning | 2       |
| `layout-tutarli`     | Görsel hiyerarşi ve boşluklar tutarlı olmalı | `llm`        | warning | 2       |

> **Önemli:** deterministik kuralların anahtarları **birebir** `header-exists` ve
> `has-primary-action` olmalı — SDK bu kontrolleri DOM'da bu isimlerle üretip
> gönderiyor, sunucu bu anahtarla eşliyor. Yanlış yazarsan eşleşmez.
>
> **Hızlı ilk test:** yalnızca 2 deterministik kuralı ekle → LLM/vision gerekmez,
> sonuç **anında** döner. `layout-tutarli`'yi eklersen vision modeli devreye girer
> (CPU'da yavaş, 1-3 dk) — ama gerçek AI review'ı da görürsün.

### c. AI Sağlayıcı (yalnızca `layout-tutarli` eklediysen gerekir)
**AI Sağlayıcılar** → `ui` türü için aktif sağlayıcı: `http://ollama:11434`,
model `qwen3-vl:8b`, aktif.

### d. Ingest token'ı kopyala
Proje başlığındaki **Ingest token → Kopyala**. Birazdan HTML'e yapıştıracaksın.

---

## 2) SDK bundle'ını hazırla

Covora repo kökünde bir kez build et:

```bash
pnpm --filter @covora/client build
```

Çıktı: `packages/client/dist/covora-client.global.js` (~200 KB, `html2canvas` dahil
her şey gömülü, `window.Covora` global'ini tanımlar). Bu dosyayı bu `test/`
klasörünün içine kopyala:

```bash
cp packages/client/dist/covora-client.global.js test/
```

`index.html` bunu `<script src="./covora-client.global.js"></script>` ile yükler.

---

## 3) index.html'i ayarla

`index.html`'in en üstündeki `window.COVORA_CONFIG` bloğunu doldur:

```js
window.COVORA_CONFIG = {
  serverUrl: 'https://covora.yeten2.com', // kendi Covora URL'in
  projectKey: 'test-ui',
  ingestToken: 'BURAYA-KOPYALADIGIN-TOKEN'
}
```

---

## 4) Çalıştır

`test/index.html`'i tarayıcıda aç (çift tıkla — `file://` çalışır, CORS `*` açık).
Sağ alttaki **🔍 Covora Review** butonuna bas.

- SDK sayfanın ekran görüntüsünü alır + DOM kontrollerini çalıştırır → Covora'ya yollar.
- Sonuç (coverage + gate) hem **sayfada** (buton üstünde) hem **panelde** görünür.
- Yalnızca deterministik kurallarda: anında. Vision kuralı varsa: 1-3 dk bekle.

Bu sayfa `header-exists` ✔ ve `has-primary-action` ✔ karşılar; yani gate **geçmeli**.
Denemek için HTML'den `<header>`'ı silersen → `header-exists` **fail** → coverage düşer,
gate (blocker) **kalır**.

---

## 5) Panelde doğrula

Studio → proje `test-ui` → **Review Geçmişi**: yeni kayıt, skor, gate, Δ.
**Genel Bakış**'ta da sayaçlar ve son review görünür. Çalışıyorsa test tamam. ✅

---

## Sorun giderme

- **CORS hatası** (konsolda `blocked by CORS`): CORS'lu server sürümü henüz canlı
  değil. Yeni image'ı deploy et.
- **401 / Geçersiz ingest token**: token yanlış ya da proje anahtarı uyuşmuyor.
- **Vision çok yavaş / takılıyor**: `qwen3-vl:8b` Ollama'da inik mi? İlk çağrı model
  yüklemesi uzun sürer. Sadece 2 deterministik kuralla test et.
- **Deterministik kural hep fail**: anahtarları birebir `header-exists` /
  `has-primary-action` yazdığından emin ol.
