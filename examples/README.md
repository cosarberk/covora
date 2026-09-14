# Covora entegrasyon örnekleri

## Pipeline'da code review gate (`gitlab-ci.example.yml`)

`covora review` komutu, verilen dosyaları Covora sunucusuna gönderir ve
**merge gate** kararını çıkış koduna yansıtır:

| Çıkış kodu | Anlam |
|-----------|-------|
| `0` | Gate geçti (coverage yeterli, fail olan blocker yok) |
| `1` | Gate kaldı — merge engellenmeli |
| `2` | Çalıştırma hatası (dosya yok, sunucuya ulaşılamadı) |

"Pipeline geçmeden merge olmasın" için iki adım:

1. Yukarıdaki job'ı repo'nun `.gitlab-ci.yml`'ine ekleyin.
2. GitLab'da hedef dalı **protected** yapıp bu job'ı **required** olarak
   işaretleyin. Böylece gate kırmızıysa merge butonu kilitlenir.

## UI review (mock-shell)

UI review ekran görüntüsü gerektirdiği için CLI'dan değil, host uygulamaya
(mock-shell) gömülen `@covora/client` SDK'sından tetiklenir:

```ts
import { createCovoraClient } from '@covora/client'

const covora = createCovoraClient({ serverUrl, projectKey: 'anasayfa-plugin' })
const sonuc = await covora.reviewUi(codeHash) // ekranı yakalar → coverage + gate
```
