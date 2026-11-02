/**
 * @module @covora/db/repositories/pack
 *
 * Review Pack veri erişimi: pack CRUD, proje aboneliği ve yerleşik (built-in)
 * paketlerin seed'i.
 */

import type {
  Pack,
  ReviewKind,
  ReviewScope,
  ReviewSurface,
  RuleEvaluationType,
  Severity
} from '@covora/types'
import type { PrismaClient } from '@prisma/client'

import { toPack } from '../mappers.js'

/** Yeni pack için gerekli alanlar. */
export interface PackInput {
  readonly key: string
  readonly name: string
  readonly description?: string
  readonly kind: ReviewKind
}

/**
 * Tüm pack'leri listeler.
 *
 * @param prisma - Prisma client.
 * @returns Pack listesi.
 */
export const listPacks = async (prisma: PrismaClient): Promise<Pack[]> => {
  const packs = await prisma.pack.findMany({ orderBy: [{ kind: 'asc' }, { name: 'asc' }] })
  return packs.map(toPack)
}

/**
 * Bir projenin abone olduğu pack'leri listeler.
 *
 * @param prisma - Prisma client.
 * @param projectId - Proje kimliği.
 * @returns Pack listesi.
 */
export const listPacksByProject = async (
  prisma: PrismaClient,
  projectId: string
): Promise<Pack[]> => {
  const packs = await prisma.pack.findMany({
    where: { projects: { some: { projectId } } },
    orderBy: { name: 'asc' }
  })
  return packs.map(toPack)
}

/**
 * Yeni pack oluşturur (builtin değil).
 *
 * @param prisma - Prisma client.
 * @param input - Pack alanları.
 * @returns Oluşturulan pack.
 */
export const createPack = async (prisma: PrismaClient, input: PackInput): Promise<Pack> => {
  const pack = await prisma.pack.create({
    data: {
      key: input.key,
      name: input.name,
      description: input.description ?? '',
      kind: input.kind,
      builtin: false
    }
  })
  return toPack(pack)
}

/**
 * Bir pack'i siler (yerleşik pack'ler silinemez).
 *
 * @param prisma - Prisma client.
 * @param id - Pack kimliği.
 */
export const deletePack = async (prisma: PrismaClient, id: string): Promise<void> => {
  await prisma.pack.deleteMany({ where: { id, builtin: false } })
}

/**
 * Bir projeyi bir pack'e abone eder (idempotent).
 *
 * @param prisma - Prisma client.
 * @param projectId - Proje kimliği.
 * @param packId - Pack kimliği.
 */
export const assignPackToProject = async (
  prisma: PrismaClient,
  projectId: string,
  packId: string
): Promise<void> => {
  await prisma.projectPack.upsert({
    where: { projectId_packId: { projectId, packId } },
    create: { projectId, packId },
    update: {}
  })
}

/**
 * Bir projenin bir pack aboneliğini kaldırır.
 *
 * @param prisma - Prisma client.
 * @param projectId - Proje kimliği.
 * @param packId - Pack kimliği.
 */
export const removePackFromProject = async (
  prisma: PrismaClient,
  projectId: string,
  packId: string
): Promise<void> => {
  await prisma.projectPack.deleteMany({ where: { projectId, packId } })
}

interface BuiltinRule {
  readonly key: string
  readonly title: string
  readonly evaluation: RuleEvaluationType
  /** Kapsam; verilmezse changes. project = ArchUnit (tüm depo). */
  readonly scope?: ReviewScope
  /** UI ekran tipi; verilmezse genel. */
  readonly surface?: ReviewSurface
  /** Tek görüntüden doğrulanabilir mi; verilmezse true. false = davranışsal. */
  readonly visual?: boolean
  /** LLM/checklist bağlamı: kuralın ayrıntılı talimatı. */
  readonly description?: string
  readonly severity: Severity
  readonly weight: number
}

interface BuiltinPack {
  readonly key: string
  readonly name: string
  readonly kind: ReviewKind
  readonly rules: readonly BuiltinRule[]
}

const BUILTIN_PACKS: readonly BuiltinPack[] = [
  {
    key: 'code-temel',
    name: 'Temel Code Review',
    kind: 'code',
    rules: [
      { key: 'no-todo', title: 'Kodda TODO/FIXME olmamalı', evaluation: 'deterministic', severity: 'warning', weight: 2 },
      { key: 'no-console', title: 'console.* çağrısı olmamalı', evaluation: 'deterministic', severity: 'warning', weight: 1 },
      { key: 'no-hardcoded-url', title: 'Gömülü URL olmamalı', evaluation: 'deterministic', severity: 'warning', weight: 1 },
      { key: 'no-cyclic-imports', title: 'Dairesel import olmamalı (ArchUnit)', evaluation: 'deterministic', scope: 'project', severity: 'blocker', weight: 3 }
    ]
  },
  {
    // Yeten plugin konvansiyonu: tüm yapı/mimari/manifest kuralları tek pakette.
    // Bir plugin projesine abone edilince elle kural girmeye gerek kalmaz.
    key: 'plugin-standartlari',
    name: 'FE Plugin Standartları',
    kind: 'code',
    rules: [
      // Hijyen (dosya-içi)
      { key: 'no-todo', title: 'Kodda TODO/FIXME olmamalı', evaluation: 'deterministic', severity: 'warning', weight: 2 },
      { key: 'no-console', title: 'console.* çağrısı olmamalı', evaluation: 'deterministic', severity: 'warning', weight: 2 },
      { key: 'no-hardcoded-url', title: 'Gömülü URL olmamalı', evaluation: 'deterministic', severity: 'warning', weight: 2 },
      { key: 'no-explicit-any', title: "TypeScript 'any' kullanılmamalı", evaluation: 'deterministic', severity: 'warning', weight: 2 },
      { key: 'no-ts-ignore', title: '@ts-ignore/@ts-nocheck olmamalı', evaluation: 'deterministic', severity: 'warning', weight: 2 },
      { key: 'no-default-export', title: 'Default export olmamalı (barrel uyumu)', evaluation: 'deterministic', severity: 'warning', weight: 2 },
      { key: 'max-file-lines', title: 'Dosya 300 satırı aşmamalı', evaluation: 'deterministic', severity: 'warning', weight: 1 },
      { key: 'i18n-no-bare-text', title: 'JSX içinde çıplak metin olmamalı (i18n)', evaluation: 'deterministic', severity: 'warning', weight: 2 },
      { key: 'react-hook-order', title: 'React: state hookları useEffect\'ten önce gelmeli', evaluation: 'deterministic', severity: 'warning', weight: 1 },
      { key: 'no-css', title: 'CSS yasak (stiller obje olmalı)', evaluation: 'deterministic', severity: 'warning', weight: 2 },
      { key: 'no-raw-html', title: 'Ham HTML yasak (sadece Yeten UI)', evaluation: 'deterministic', severity: 'blocker', weight: 3 },
      // Yapı / mimari (ArchUnit, scope=project)
      { key: 'required-project-structure', title: 'Zorunlu src klasör yapısı', evaluation: 'deterministic', scope: 'project', severity: 'blocker', weight: 3 },
      { key: 'folders-kebab-case', title: 'Tüm klasörler kebab-case', evaluation: 'deterministic', scope: 'project', severity: 'warning', weight: 2 },
      { key: 'all-files-are-index', title: 'Tüm dosyalar index olmalı', evaluation: 'deterministic', scope: 'project', severity: 'warning', weight: 2 },
      { key: 'barrel-structure', title: 'Barrel export yapısı zorunlu', evaluation: 'deterministic', scope: 'project', severity: 'blocker', weight: 3 },
      { key: 'no-deep-import', title: 'Deep import yasak', evaluation: 'deterministic', scope: 'project', severity: 'blocker', weight: 3 },
      { key: 'layer-dependencies', title: 'Katman bağımlılık kuralları', evaluation: 'deterministic', scope: 'project', severity: 'blocker', weight: 3 },
      { key: 'no-cyclic-imports', title: 'Dairesel import olmamalı', evaluation: 'deterministic', scope: 'project', severity: 'blocker', weight: 3 },
      // Plugin'e özel
      { key: 'plugin-manifest-valid', title: 'PluginManifest eksiksiz ve kurallı', evaluation: 'deterministic', scope: 'project', severity: 'blocker', weight: 3 },
      { key: 'plugin-vite-config', title: 'vite.config plugin build kuralları', evaluation: 'deterministic', scope: 'project', severity: 'blocker', weight: 3 },
      { key: 'plugin-name-consistency', title: 'Plugin isim tutarlılığı', evaluation: 'deterministic', scope: 'project', severity: 'warning', weight: 2 }
    ]
  },
  {
    key: 'ui-temel',
    name: 'Temel UI Review',
    kind: 'ui',
    rules: [
      { key: 'header-exists', title: 'Sayfada header bulunmalı', evaluation: 'deterministic', severity: 'blocker', weight: 3 },
      { key: 'has-primary-action', title: 'Primary aksiyon butonu bulunmalı', evaluation: 'deterministic', severity: 'warning', weight: 2 },
      { key: 'layout-tutarli', title: 'Görsel hiyerarşi ve boşluklar tutarlı mı', evaluation: 'llm', severity: 'warning', weight: 2 }
    ]
  },
  {
    // UI standart kuralları. Ekran tipine (surface) göre gruplanır: `genel`
    // kurallar her UI review'ında, `liste`/`onizleme`/`form` yalnızca o ekran
    // tipi review edilirken değerlendirilir. Davranışsal (tek görüntüden
    // görülemeyen) kurallar visual=false ile işaretlenir ve görsel modele
    // gönderilmez. Tüm değerlendirmeler LLM (görsel yargı) ile yapılır.
    key: 'ui-standart',
    name: 'UI Standartları',
    kind: 'ui',
    rules: [
      // ---- GENEL (her ekranda geçerli) ----
      { key: 'ui-genel-buton-iki-kelime', surface: 'genel', evaluation: 'llm', severity: 'warning', weight: 2,
        title: 'Buton isimleri en fazla iki kelime',
        description: 'Tüm butonların metni en fazla iki kelimeden oluşmalı. Daha uzun buton etiketleri kuralı ihlal eder.' },
      { key: 'ui-genel-menu-iki-kelime', surface: 'genel', evaluation: 'llm', severity: 'warning', weight: 2,
        title: 'Menü isimleri en fazla iki kelime',
        description: 'Tüm menü öğesi isimleri en fazla iki kelimeden oluşmalı.' },
      { key: 'ui-genel-primary-onay-modali', surface: 'genel', evaluation: 'llm', visual: false, severity: 'blocker', weight: 3,
        title: 'Primary aksiyonda onay modalı',
        description: 'Her primary aksiyon butonu, işlem öncesi "emin misiniz?" (evet/hayır) onay modalı açmalı. DAVRANIŞSAL kural: tek ekran görüntüsünden doğrulanamaz.' },
      { key: 'ui-genel-ayrilma-uyarisi', surface: 'genel', evaluation: 'llm', visual: false, severity: 'warning', weight: 2,
        title: 'İşlem ortasında ayrılma uyarısı',
        description: 'İşlem ortasında sayfadan ayrılmak istendiğinde kullanıcı uyarılmalı. DAVRANIŞSAL kural: tek ekran görüntüsünden doğrulanamaz.' },
      { key: 'ui-genel-form-tablo-drawer', surface: 'genel', evaluation: 'llm', visual: false, severity: 'warning', weight: 2,
        title: 'Form ek bilgi: tablo + sağ drawer',
        description: 'Form ek bilgi girişlerinde veriler form içinde tablo olarak gösterilmeli; veri girişi ise ekranın sağında açılan drawer içinde yapılmalı. DAVRANIŞSAL kural.' },

      // ---- LİSTELEME EKRANI ----
      { key: 'ui-liste-sarmalayici-border', surface: 'liste', evaluation: 'llm', severity: 'warning', weight: 2,
        title: 'Ekran sarmalayıcı border içinde',
        description: 'Tüm listeleme ekranı, onu saran tek bir border (çerçeve) içinde olmalı.' },
      { key: 'ui-liste-baslik-sol-koyu', surface: 'liste', evaluation: 'llm', severity: 'warning', weight: 2,
        title: 'Başlık sola yaslı ve koyu',
        description: 'Header kısmında sola yaslı sayfa başlığı olmalı; başlık en fazla iki kelime ve koyu renk olmalı.' },
      { key: 'ui-liste-buton-area-sag', surface: 'liste', evaluation: 'llm', severity: 'warning', weight: 2,
        title: 'Sağ buton alanı ve renk sırası',
        description: 'Header sağında buton alanı olmalı (zorunlu değil). 1 buton: primary mavi. 2 buton: en sağda primary mavi, 2. secondary gri. 3 buton: en sağda primary mavi, 2. secondary gri, 3. ghost (transparent). Buton metni en fazla iki kelime.' },
      { key: 'ui-liste-header-divider', surface: 'liste', evaluation: 'llm', severity: 'info', weight: 1,
        title: 'Header altında divider',
        description: 'Header bölümünün hemen altında gri bir divider (çizgi) olmalı.' },
      { key: 'ui-liste-toolbar-icon-only', surface: 'liste', evaluation: 'llm', severity: 'warning', weight: 2,
        title: 'Tabloda icon-only toolbar',
        description: 'Tablo header bölümünde en az 3 butonlu toolbar olmalı; butonlar sadece icon (yazısız). Zorunlu 3 buton: sırala/filtrele, kolonlar, tam ekran. Filtrele ikonunun hemen yanında aşağı ok işareti olmalı.' },
      { key: 'ui-liste-filtre-grid-4', surface: 'liste', evaluation: 'llm', severity: 'warning', weight: 2,
        title: 'Filtre alanı dörtlü grid',
        description: 'Toolbar altında filtre alanı olmalı, en az bir filtre bulunmalı. Filtreler dörtlü (4 sütunlu) grid olarak yan yana hizalanmalı. Az filtre varsa boşluk doldurulmamalı; filtre alanları kendi grid hücresini aşıp full-width olmamalı.' },
      { key: 'ui-liste-tablo-baslik-gri', surface: 'liste', evaluation: 'llm', severity: 'warning', weight: 2,
        title: 'Tablo başlıkları büyük harf gri',
        description: 'Tablo başlıkları büyük harfli ve secondary gri renk olmalı; başlık satırı arkaplanı gri tonda olmalı.' },
      { key: 'ui-liste-durum-chip', surface: 'liste', evaluation: 'llm', severity: 'warning', weight: 2,
        title: 'Durumlar soft chip',
        description: 'Tablo içindeki durum göstergeleri soft chip olmalı: success açık yeşil, error kırmızı, warning sarı, taslak gibi durumlar secondary gri.' },
      { key: 'ui-liste-islem-hizali', surface: 'liste', evaluation: 'llm', severity: 'warning', weight: 2,
        title: 'İşlem butonları aynı hizada',
        description: 'İşlemler "İşlemler" başlığı altında olmalı ve tüm satırlarda butonlar aynı hizada kalmalı. Yetkisiz buton gizlenmemeli; disabled olarak görünmeli ki hiza bozulmasın.' },
      { key: 'ui-liste-footer-pagination', surface: 'liste', evaluation: 'llm', severity: 'warning', weight: 2,
        title: 'Footer: pagination + kayıt bilgisi',
        description: 'Tablonun footer bölümünde sağa yaslı pagination, sola yaslı toplam kayıt ve aralık bilgisi gösterilmeli.' },

      // ---- ÖN İZLEME EKRANI ----
      { key: 'ui-onizleme-baslik-sol-koyu', surface: 'onizleme', evaluation: 'llm', severity: 'warning', weight: 2,
        title: 'Başlık sola yaslı ve koyu',
        description: 'Header kısmında sola yaslı sayfa başlığı olmalı; en fazla iki kelime ve koyu renk.' },
      { key: 'ui-onizleme-buton-area-sag', surface: 'onizleme', evaluation: 'llm', severity: 'warning', weight: 2,
        title: 'Sağ buton alanı ve renk sırası',
        description: 'Header sağında buton alanı (zorunlu değil). 1 buton primary mavi; 2 buton en sağda primary + secondary gri; 3 buton primary + secondary + ghost. Metin en fazla iki kelime.' },
      { key: 'ui-onizleme-header-divider', surface: 'onizleme', evaluation: 'llm', severity: 'info', weight: 1,
        title: 'Header altında divider',
        description: 'Header bölümünün hemen altında gri divider olmalı.' },
      { key: 'ui-onizleme-a4-layout', surface: 'onizleme', evaluation: 'llm', severity: 'warning', weight: 2,
        title: 'Sağda navigation + ortada A4',
        description: 'Ön izleme alanı: ekranın sağında tepede navigation, ekranın ortasında A4 alanı biçiminde açılmalı.' },
      { key: 'ui-onizleme-a4-ad-status', surface: 'onizleme', evaluation: 'llm', severity: 'info', weight: 1,
        title: 'A4 başında ad + status',
        description: 'A4 içeriğinde genel olarak sola yaslı ön izlemenin adı, sağa yaslı status görünümü; hemen altında ana içerik başlığı olmalı.' },
      { key: 'ui-onizleme-bolum-basligi', surface: 'onizleme', evaluation: 'llm', severity: 'warning', weight: 2,
        title: 'Bölüm başlığı + aktif nav tutarlı',
        description: 'Her içerik başlangıcında o an primary seçili navigation ile sayfadaki bölüm adı tutarlı olmalı. Bölüm başlığı primary renkte kutu içinde adım sayısı ve primary renkte başlık; hemen altında divider olmalı. Gösterge kartları varsa border içinde, title üstte value altta.' },
      { key: 'ui-onizleme-title-value', surface: 'onizleme', evaluation: 'llm', severity: 'warning', weight: 2,
        title: 'Sol title / sağ value',
        description: 'İçerikler ağırlıklı olarak solda title, hemen sağında value olacak şekilde iki divider arasında gösterilmeli (e-devlet içerik görünümü gibi).' },
      { key: 'ui-onizleme-belge-atac', surface: 'onizleme', evaluation: 'llm', severity: 'info', weight: 1,
        title: 'Belge: ataç ikonu + koyu ad',
        description: 'Belge gösterimlerinin başında ataç ikonu ile dosya adı koyu şekilde yazılı gösterilmeli.' },
      { key: 'ui-onizleme-bos-tire', surface: 'onizleme', evaluation: 'llm', severity: 'warning', weight: 2,
        title: 'Boş değerler sadece "-"',
        description: 'Boş değerler null/undefined vb. değil, sadece "-" olarak gösterilmeli.' },

      // ---- FORM EKRANI ----
      { key: 'ui-form-baslik-sol-koyu', surface: 'form', evaluation: 'llm', severity: 'warning', weight: 2,
        title: 'Başlık sola yaslı ve koyu',
        description: 'Header kısmında sola yaslı sayfa başlığı olmalı; en fazla iki kelime ve koyu renk.' },
      { key: 'ui-form-buton-area-sag', surface: 'form', evaluation: 'llm', severity: 'warning', weight: 2,
        title: 'Sağ buton alanı + sil butonu',
        description: 'Header sağında buton alanı (zorunlu değil); 1/2/3 buton renk sırası primary mavi → secondary gri → ghost. "Formu sil" butonu transparent, kırmızı yazı ve kırmızı border rengine sahip olmalı.' },
      { key: 'ui-form-header-divider', surface: 'form', evaluation: 'llm', severity: 'info', weight: 1,
        title: 'Header altında divider',
        description: 'Header bölümünün hemen altında gri divider olmalı.' },
      { key: 'ui-form-a4-layout', surface: 'form', evaluation: 'llm', severity: 'warning', weight: 2,
        title: 'Sağda navigation + ortada A4, sıralı',
        description: 'Form alanı: sağda tepede navigation, ortada A4 biçiminde. A4 içinde her giriş alanı doğru sırayla gösterilmeli. Bölüm başlığı primary kutuda adım sayısı + primary başlık, altında divider; aktif navigation ile tutarlı.' },
      { key: 'ui-form-alan-baslik-koyu', surface: 'form', evaluation: 'llm', severity: 'warning', weight: 2,
        title: 'Alan başlığı koyu, description yasak',
        description: 'Her giriş alanı sırası: önce koyu siyah tonda başlık, sonra giriş componenti. Başlık altında ayrı açıklama (description) metni KESİNLİKLE yasak.' },
      { key: 'ui-form-readonly-disable', surface: 'form', evaluation: 'llm', severity: 'warning', weight: 2,
        title: 'Dolu read-only disabled görünüm',
        description: 'Dolu veriyle read-only gösterilen alanlar, içeriği dolu ve disabled renkte input olarak görünmeli.' },
      { key: 'ui-form-placeholder-description', surface: 'form', evaluation: 'llm', severity: 'info', weight: 1,
        title: 'Açıklama placeholder olarak',
        description: 'Boş bir giriş alanıysa açıklama (description) ayrı metin değil, input placeholder olarak yazılmış olmalı.' },
      { key: 'ui-form-step-navigation', surface: 'form', evaluation: 'llm', severity: 'warning', weight: 2,
        title: 'Adım navigasyonu: Önceki/Sonraki',
        description: 'Her navigation bir aşamadır. İlk aşamada A4 footer alanında en sağda primary mavi "Sonraki" butonu olmalı. Diğer aşamalarda solda ghost (transparent) "Önceki", en sağda primary mavi "Sonraki" butonu olmalı.' }
    ]
  }
]

/**
 * Yerleşik pack'leri ve kurallarını oluşturur/günceller (idempotent). Sunucu
 * başlangıcında çağrılır.
 *
 * @param prisma - Prisma client.
 */
export const ensureBuiltinPacks = async (prisma: PrismaClient): Promise<void> => {
  for (const builtin of BUILTIN_PACKS) {
    const pack = await prisma.pack.upsert({
      where: { key: builtin.key },
      create: { key: builtin.key, name: builtin.name, description: '', kind: builtin.kind, builtin: true },
      update: { name: builtin.name, builtin: true }
    })
    for (const rule of builtin.rules) {
      await prisma.rule.upsert({
        where: { packId_key: { packId: pack.id, key: rule.key } },
        create: {
          packId: pack.id,
          key: rule.key,
          title: rule.title,
          description: rule.description ?? '',
          kind: builtin.kind,
          evaluation: rule.evaluation,
          scope: rule.scope ?? 'changes',
          surface: rule.surface ?? 'genel',
          visual: rule.visual ?? true,
          severity: rule.severity,
          weight: rule.weight
        },
        update: {
          title: rule.title,
          description: rule.description ?? '',
          evaluation: rule.evaluation,
          scope: rule.scope ?? 'changes',
          surface: rule.surface ?? 'genel',
          visual: rule.visual ?? true,
          severity: rule.severity,
          weight: rule.weight
        }
      })
    }
  }
}
