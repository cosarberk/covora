/**
 * @module @covora/core
 *
 * Covora'nın çekirdeği. İki sorumluluğu vardır:
 *  1. Kural motoru — deterministik kuralları çalıştırır, LLM-yargı kuralları
 *     için checklist üretir ve doldurulmuş checklist'i işler.
 *  2. Coverage algoritması — kural ağırlıkları ve değerlendirme sonuçlarından
 *     (pass/partial/fail) deterministik olarak yüzdelik/level hesaplar.
 *
 * LLM asla puan üretmez; yalnızca checklist doldurur. Skor bu paketteki
 * algoritma tarafından hesaplanır.
 */

export * from './coverage/index.js'
