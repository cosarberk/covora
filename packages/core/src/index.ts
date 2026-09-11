/**
 * @module @covora/core
 *
 * Covora'nın çekirdeği. İki sorumluluğu vardır:
 *  1. Kural motoru (engine) — deterministik kuralları checker'larla, LLM-yargı
 *     kuralları sağlayıcı üzerinden değerlendirir ve akışı orkestre eder.
 *  2. Coverage algoritması — kural ağırlıkları ve değerlendirme sonuçlarından
 *     (pass/partial/fail) deterministik olarak yüzdelik/level ve gate kararı
 *     hesaplar.
 *
 * LLM asla puan üretmez; yalnızca checklist doldurur. Skor bu paketteki
 * algoritma tarafından hesaplanır.
 */

export * from './coverage/index.js'
export * from './engine/index.js'
