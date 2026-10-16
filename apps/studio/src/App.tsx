/**
 * @module studio/App
 *
 * Studio kök bileşeni — dock editör kabuğu. Üstte logo + konum (breadcrumb) +
 * komut paleti + kullanıcı; solda tek navigasyon rayı; merkezde viewport +
 * altında konsol; sağda ekrana özel dock (navigator + inspector ya da bağlam
 * paneli). Tüm bölgeler sürüklenebilir ayraçlarla yeniden boyutlanır.
 * Ctrl/Cmd+K komut paleti.
 *
 * `api`/`initialUser` prop'ları önizleme/test içindir; üretimde varsayılan API
 * ve giriş akışı kullanılır.
 */

import type { GitProvider, User } from '@covora/types'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { createStudioApi, type ProjectSummary, type StudioApi } from './api/client.js'
import { CommandPalette, type Command } from './components/CommandPalette.js'
import { Icon, type IconName } from './components/Icon.js'
import { Splitter } from './components/Splitter.js'
import { DashboardPanel } from './components/DashboardPanel.js'
import { IntegrationsPanel } from './components/IntegrationsPanel.js'
import { IngestGuide } from './components/IngestGuide.js'
import { Login } from './components/Login.js'
import { ConfirmHost, ToastHost, confirmDialog, toast } from './components/overlays.js'
import { PacksPanel } from './components/PacksPanel.js'
import { ProcessGraph, ProcessInspector, ProcessRunList } from './components/processes/regions.js'
import { useProcesses } from './components/processes/useProcesses.js'
import { LOG_COLOR, copyToClipboard, formatTime, logsToText } from './components/processes/graph.js'
import { ProjectPacksPanel } from './components/ProjectPacksPanel.js'
import { ProvidersPanel } from './components/ProvidersPanel.js'
import { ReviewsPanel } from './components/ReviewsPanel.js'
import { RulesPanel } from './components/RulesPanel.js'
import { SettingsPanel } from './components/SettingsPanel.js'
import { WebhooksPanel } from './components/WebhooksPanel.js'

const serverUrl = import.meta.env.VITE_COVORA_SERVER_URL ?? ''
const defaultApi = createStudioApi({ baseUrl: serverUrl })

type Tab = 'packs' | 'rules' | 'reviews' | 'webhooks' | 'settings' | 'integration'
type View = 'dashboard' | 'projects' | 'project' | 'providers' | 'packs' | 'processes' | 'integrations'

const PROJECT_TABS: readonly { readonly id: Tab; readonly icon: IconName; readonly label: string }[] = [
  { id: 'rules', icon: 'rules', label: 'Kurallar' },
  { id: 'packs', icon: 'packages', label: 'Abone Paketler' },
  { id: 'reviews', icon: 'reviews', label: 'Review Geçmişi' },
  { id: 'integration', icon: 'plug', label: 'Entegrasyon' },
  { id: 'webhooks', icon: 'webhook', label: 'Bildirimler' },
  { id: 'settings', icon: 'settings', label: 'Ayarlar' }
]

const NAV: readonly { readonly id: View; readonly icon: IconName; readonly label: string }[] = [
  { id: 'dashboard', icon: 'dashboard', label: 'Genel Bakış' },
  { id: 'projects', icon: 'project', label: 'Projeler' },
  { id: 'processes', icon: 'flow', label: 'Süreçler' },
  { id: 'packs', icon: 'packages', label: 'Review Paketleri' },
  { id: 'providers', icon: 'ai', label: 'AI Sağlayıcılar' },
  { id: 'integrations', icon: 'plug', label: 'Bağlamalar' }
]

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value))

/** {@link App} props (üretimde boş; önizleme/test için enjeksiyon). */
export interface AppProps {
  readonly api?: StudioApi
  readonly initialUser?: User | null
  /** Önizleme için başlangıç görünümü. */
  readonly initialView?: View
  /** Önizleme için açılacak proje anahtarı (project görünümünde). */
  readonly initialProjectKey?: string
}

/** Studio uygulaması. */
export const App = ({
  api = defaultApi,
  initialUser,
  initialView,
  initialProjectKey
}: AppProps = {}): React.JSX.Element => {
  const presetAuth = initialUser !== undefined
  const [user, setUser] = useState<User | null>(initialUser ?? null)
  const [authReady, setAuthReady] = useState(presetAuth)
  const [projects, setProjects] = useState<readonly ProjectSummary[]>([])
  const [selected, setSelected] = useState<string | null>(initialProjectKey ?? null)
  const [view, setView] = useState<View>(initialView ?? 'dashboard')
  const [tab, setTab] = useState<Tab>('packs')
  const [error, setError] = useState<string | null>(null)
  const [newKey, setNewKey] = useState('')
  const [newName, setNewName] = useState('')
  const [newGitProvider, setNewGitProvider] = useState<GitProvider | ''>('')
  const [newGitRepoUrl, setNewGitRepoUrl] = useState('')
  const [newGitToken, setNewGitToken] = useState('')
  const [pullKey, setPullKey] = useState<string | null>(null)
  const [pullRef, setPullRef] = useState('')
  const [pulling, setPulling] = useState(false)
  const [copied, setCopied] = useState(false)
  const [cmdkOpen, setCmdkOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [online, setOnline] = useState<boolean>(() => globalThis.navigator?.onLine ?? true)

  // Dock bölge boyutları (px) — sürüklenebilir.
  const [rightW, setRightW] = useState(300)
  const [bottomH, setBottomH] = useState(150)
  const [outlinerH, setOutlinerH] = useState(280)

  useEffect(() => {
    if (presetAuth) {
      return
    }
    api.onUnauthorized(() => setUser(null))
    if (!api.hasSession()) {
      setAuthReady(true)
      return
    }
    void api
      .me()
      .then((current) => setUser(current))
      .catch(() => setUser(null))
      .finally(() => setAuthReady(true))
  }, [api, presetAuth])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setCmdkOpen((open) => !open)
        return
      }
      if (event.key === 'Escape') {
        setCmdkOpen(false)
        return
      }
      // Çalışma alanı kısayolları (1-4) — bir alana yazarken devre dışı.
      const tag = (document.activeElement?.tagName ?? '').toUpperCase()
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        return
      }
      if (!event.metaKey && !event.ctrlKey && !event.altKey) {
        const index = Number(event.key) - 1
        const target = NAV[index]
        if (target !== undefined) {
          event.preventDefault()
          setView(target.id)
          setSelected(null)
        }
      }
    }
    globalThis.addEventListener('keydown', onKey)
    return () => globalThis.removeEventListener('keydown', onKey)
  }, [])

  // Gerçek çevrimiçi/çevrimdışı durumu (statusbar göstergesi için).
  useEffect(() => {
    const goOnline = (): void => setOnline(true)
    const goOffline = (): void => setOnline(false)
    globalThis.addEventListener('online', goOnline)
    globalThis.addEventListener('offline', goOffline)
    return () => {
      globalThis.removeEventListener('online', goOnline)
      globalThis.removeEventListener('offline', goOffline)
    }
  }, [])

  const loadProjectRules = useCallback(
    () => (selected === null ? Promise.resolve([]) : api.listRules(selected)),
    [api, selected]
  )

  const loadProjects = useCallback(async (): Promise<void> => {
    setError(null)
    try {
      setProjects(await api.listProjects())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Bilinmeyen hata')
    }
  }, [api])

  useEffect(() => {
    if (user !== null) {
      void loadProjects()
    }
  }, [user, loadProjects])

  const selectedProject = useMemo(
    () => projects.find((project) => project.key === selected) ?? null,
    [projects, selected]
  )

  // Süreçler durumu (yalnızca o görünüm aktifken ağ/akış yapar).
  const proc = useProcesses(api, view === 'processes')

  // Konsol otomatik kaydırma: yeni log geldikçe (ve run ilk açıldığında konsol
  // zaten doluyken) her zaman dibe kaydır. rAF ile layout/paint sonrası çalışır
  // ki scrollHeight güncel olsun; aksi halde ilk açılışta top'ta takılı kalıyordu.
  const consoleBodyRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = consoleBodyRef.current
    if (el === null) {
      return
    }
    const id = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight
    })
    return () => cancelAnimationFrame(id)
  }, [proc.logs, proc.openRunId])

  // Konsoldaki tüm logları panoya kopyalar.
  const copyConsoleLogs = useCallback((): void => {
    if (proc.logs.length === 0) {
      toast.info('Kopyalanacak log yok')
      return
    }
    void copyToClipboard(logsToText(proc.logs)).then((ok) =>
      ok
        ? toast.success(`${proc.logs.length} log satırı kopyalandı`)
        : toast.error('Kopyalanamadı (pano erişimi yok)')
    )
  }, [proc.logs])

  const openProject = useCallback((key: string): void => {
    setSelected(key)
    setView('project')
    setTab('packs')
  }, [])

  const goView = useCallback((next: View): void => {
    setView(next)
    setSelected(null)
  }, [])

  const createProject = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    const key = newKey.trim()
    const name = newName.trim()
    if (key.length === 0 || name.length === 0) {
      return
    }
    const repoUrl = newGitRepoUrl.trim()
    const token = newGitToken.trim()
    // Git bağlantısı opsiyonel: yalnızca sağlayıcı ya da adres verildiyse gönder.
    const git =
      newGitProvider !== '' || repoUrl.length > 0
        ? {
            ...(newGitProvider !== '' ? { gitProvider: newGitProvider } : {}),
            ...(repoUrl.length > 0 ? { gitRepoUrl: repoUrl } : {}),
            ...(token.length > 0 ? { gitToken: token } : {})
          }
        : undefined
    try {
      await api.upsertProject(key, name, git)
      setNewKey('')
      setNewName('')
      setNewGitProvider('')
      setNewGitRepoUrl('')
      setNewGitToken('')
      setAddOpen(false)
      await loadProjects()
      openProject(key)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Bilinmeyen hata')
    }
  }

  const startPull = async (): Promise<void> => {
    if (pullKey === null) {
      return
    }
    setPulling(true)
    try {
      const ref = pullRef.trim()
      const result = await api.pullReview(pullKey, ref.length > 0 ? ref : undefined)
      toast.success(`Depo çekildi, review kuyruğa alındı (#${result.runId.slice(-6)})`)
      setPullKey(null)
      setPullRef('')
      setView('processes')
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Depo çekilemedi')
    } finally {
      setPulling(false)
    }
  }

  const removeProject = async (key: string): Promise<void> => {
    const ok = await confirmDialog({
      title: 'Projeyi sil',
      message: `"${key}" projesi ve tüm kural/review'ları kalıcı olarak silinecek. Bu işlem geri alınamaz.`,
      confirmLabel: 'Sil',
      danger: true
    })
    if (!ok) {
      return
    }
    try {
      await api.deleteProject(key)
      if (selected === key) {
        setSelected(null)
        setView('dashboard')
      }
      await loadProjects()
      toast.success(`"${key}" silindi`)
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Proje silinemedi')
    }
  }

  const copyToken = async (value: string): Promise<void> => {
    try {
      await globalThis.navigator?.clipboard?.writeText(value)
      setCopied(true)
      globalThis.setTimeout(() => setCopied(false), 1500)
    } catch {
      setError('Panoya kopyalanamadı')
    }
  }

  const logout = (): void => {
    api.logout()
    setUser(null)
    setSelected(null)
    setProjects([])
    setView('dashboard')
  }

  const commands = useMemo<Command[]>(() => {
    const viewCmds: Command[] = NAV.map((item) => ({
      id: `view:${item.id}`,
      icon: '▸',
      label: item.label,
      hint: 'Görünüm',
      run: () => goView(item.id)
    }))
    const projectCmds: Command[] = projects.map((project) => ({
      id: `project:${project.key}`,
      icon: '▢',
      label: project.name,
      hint: project.key,
      run: () => openProject(project.key)
    }))
    return [...viewCmds, ...projectCmds]
  }, [projects, openProject, goView])

  if (!authReady) {
    return <div className="boot">Yükleniyor…</div>
  }

  if (user === null) {
    return <Login api={api} onLogin={(current) => setUser(current)} />
  }

  const activeNav = NAV.find((item) => item.id === view)
  const viewportTitle =
    view === 'project' && selectedProject !== null
      ? `${selectedProject.name} · ${PROJECT_TABS.find((t) => t.id === tab)?.label ?? ''}`
      : (activeNav?.label ?? 'Genel Bakış')
  const viewportIcon: IconName =
    view === 'project'
      ? (PROJECT_TABS.find((t) => t.id === tab)?.icon ?? 'project')
      : (activeNav?.icon ?? 'dashboard')

  const renderCentral = (): React.JSX.Element => {
    if (view === 'dashboard') {
      return <DashboardPanel api={api} onOpenProject={openProject} />
    }
    if (view === 'processes') {
      return <ProcessGraph proc={proc} />
    }
    if (view === 'projects') {
      return (
        <>
          <div className="projgrid">
            <button type="button" className="projcard projcard--add" onClick={() => setAddOpen(true)}>
              <Icon name="plus" size={20} />
              <span>Yeni proje</span>
            </button>
            {projects.map((project) => (
              <div key={project.id} className="projcard">
                <button type="button" className="projcard__open" onClick={() => openProject(project.key)}>
                  <span className="projcard__icon"><Icon name="project" size={16} /></span>
                  <span className="projcard__name">{project.name}</span>
                  <span className="projcard__key mono">{project.key}</span>
                </button>
                <div className="projcard__foot">
                  <button type="button" className="link-button" onClick={() => openProject(project.key)}>Aç</button>
                  {project.gitRepoUrl !== null && (
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => {
                        setPullRef('')
                        setPullKey(project.key)
                      }}
                    >
                      Depodan review
                    </button>
                  )}
                  <button type="button" className="link-button link-button--danger" onClick={() => void removeProject(project.key)}>Sil</button>
                </div>
              </div>
            ))}
            {projects.length === 0 && (
              <div className="state projgrid__empty">Henüz proje yok. "Yeni proje" ile başla.</div>
            )}
          </div>
          {addOpen && (
            <div className="modal-backdrop" onClick={() => setAddOpen(false)}>
              <div className="modal" onClick={(event) => event.stopPropagation()}>
                <div className="modal__title">Yeni proje</div>
                <form className="modal__form" onSubmit={(event) => void createProject(event)}>
                  <input
                    className="input input--sm"
                    placeholder="anahtar (örn. web-app)"
                    value={newKey}
                    onChange={(event) => setNewKey(event.target.value)}
                    autoFocus
                  />
                  <input
                    className="input input--sm"
                    placeholder="görünen ad"
                    value={newName}
                    onChange={(event) => setNewName(event.target.value)}
                  />
                  <div className="projcard__git">
                    <span className="projcard__git-label">Git bağlantısı (opsiyonel)</span>
                    <select
                      className="select select--sm"
                      value={newGitProvider}
                      onChange={(event) => setNewGitProvider(event.target.value as GitProvider | '')}
                    >
                      <option value="">sağlayıcı yok</option>
                      <option value="github">GitHub</option>
                      <option value="gitlab">GitLab</option>
                      <option value="gitea">Gitea</option>
                      <option value="generic">Jenerik</option>
                    </select>
                    <input
                      className="input input--sm"
                      placeholder="depo adresi (https://github.com/firma/repo)"
                      value={newGitRepoUrl}
                      onChange={(event) => setNewGitRepoUrl(event.target.value)}
                    />
                    <input
                      className="input input--sm"
                      type="password"
                      placeholder="erişim jetonu (opsiyonel)"
                      value={newGitToken}
                      onChange={(event) => setNewGitToken(event.target.value)}
                    />
                  </div>
                  <div className="modal__actions">
                    <button type="button" className="btn-secondary" onClick={() => setAddOpen(false)}>
                      Vazgeç
                    </button>
                    <button className="button" type="submit">Oluştur</button>
                  </div>
                </form>
              </div>
            </div>
          )}
          {pullKey !== null && (
            <div className="modal-backdrop" onClick={() => !pulling && setPullKey(null)}>
              <div className="modal" onClick={(event) => event.stopPropagation()}>
                <div className="modal__title">Depodan review başlat</div>
                <div className="modal__msg">
                  Covora, <b>{pullKey}</b> projesinin kayıtlı git bağlantısıyla depoyu kendisi
                  çekip bir code review kuyruğa alır.
                </div>
                <form
                  className="modal__form"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void startPull()
                  }}
                >
                  <input
                    className="input input--sm"
                    placeholder="dal (boş bırakılırsa varsayılan dal)"
                    value={pullRef}
                    onChange={(event) => setPullRef(event.target.value)}
                    autoFocus
                  />
                  <div className="modal__actions">
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setPullKey(null)}
                      disabled={pulling}
                    >
                      Vazgeç
                    </button>
                    <button className="button" type="submit" disabled={pulling}>
                      {pulling ? 'Çekiliyor…' : 'Başlat'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </>
      )
    }
    if (view === 'packs') {
      return <PacksPanel api={api} />
    }
    if (view === 'providers') {
      return <ProvidersPanel api={api} />
    }
    if (view === 'integrations') {
      return <IntegrationsPanel api={api} />
    }
    if (selectedProject === null) {
      return <div className="state">Bir proje seçili değil. Projeler ekranından bir proje aç.</div>
    }
    if (tab === 'packs') {
      return <ProjectPacksPanel api={api} projectKey={selectedProject.key} />
    }
    if (tab === 'rules') {
      return (
        <RulesPanel
          api={api}
          loadRules={loadProjectRules}
          emptyLabel="Bu proje bir pack'e abone değil ya da abone pack'lerde kural yok."
        />
      )
    }
    if (tab === 'reviews') {
      return <ReviewsPanel api={api} projectKey={selectedProject.key} />
    }
    if (tab === 'integration') {
      return (
        <IngestGuide
          api={api}
          projectKey={selectedProject.key}
          ingestToken={selectedProject.ingestToken}
          onRotated={() => void loadProjects()}
        />
      )
    }
    if (tab === 'webhooks') {
      return <WebhooksPanel api={api} projectKey={selectedProject.key} />
    }
    return <SettingsPanel api={api} projectKey={selectedProject.key} />
  }

  // Sağ dock'un bağlam (Özellikler) gövdesi — global ekranlarda ekrana özel.
  const renderDockContext = (): React.JSX.Element => {
    if (view === 'packs') {
      return (
        <>
          <div className="props__name">Review Paketleri</div>
          <p className="props__desc">
            Kural koleksiyonları. Her pack tek bir türe (UI ya da kod) aittir; projeler
            paketlere abone olup kuralları miras alır.
          </p>
          <div className="props__group">İpuçları</div>
          <ul className="props__hints">
            <li>Yerleşik paketler silinemez.</li>
            <li>Bir paketin kurallarını "Kurallar" ile aç/düzenle.</li>
            <li>UI paketleri UI review'da, kod paketleri kod review'da çalışır.</li>
          </ul>
        </>
      )
    }
    if (view === 'providers') {
      return (
        <>
          <div className="props__name">AI Sağlayıcılar</div>
          <p className="props__desc">
            Ollama / OpenAI-uyumlu LLM uç noktaları. AI kuralları bu sağlayıcılarla
            değerlendirilir.
          </p>
          <div className="props__group">İpuçları</div>
          <ul className="props__hints">
            <li>Modeli "RAM'e yükle" ile ısıtıp ilk-istek gecikmesini düşür.</li>
            <li>"Sağlık" ile uç noktanın erişilebilirliğini test et.</li>
            <li>AI'sız (deterministik) kurallar sağlayıcı gerektirmez.</li>
          </ul>
        </>
      )
    }
    if (view === 'integrations') {
      return (
        <>
          <div className="props__name">Bağlamalar</div>
          <p className="props__desc">
            Jira gibi 3. parti sistemleri çalışma-alanı geneli bağla. Dış sistemin
            uç noktası ve gizli erişim jetonu burada tutulur.
          </p>
          <div className="props__group">Notlar</div>
          <ul className="props__hints">
            <li>Git sağlayıcıları (GitHub/GitLab) buraya değil, projenin git bağlantısına girer.</li>
            <li>Jeton gizlidir; kaydedildikten sonra geri gösterilmez.</li>
            <li>Otomasyon kuralları (task → MR kontrolü, çıktıdan bug kaydı) yakında.</li>
          </ul>
        </>
      )
    }
    if (view === 'projects') {
      return (
        <>
          <div className="props__name">Projeler</div>
          <p className="props__desc">
            Her proje; abone paketleri, kuralları, review geçmişi, entegrasyon token'ı ve
            bildirimleriyle bağımsız bir review birimidir.
          </p>
          <div className="props__stat">
            <span>Toplam proje</span>
            <b>{projects.length}</b>
          </div>
        </>
      )
    }
    // dashboard
    return (
      <>
        <div className="props__name">Çalışma alanı</div>
        <div className="props__stat">
          <span>Proje</span>
          <b>{projects.length}</b>
        </div>
        <p className="props__desc">
          Tüm projeler genelinde özet, gate oranı, sağlayıcı sağlığı ve son review'lar
          merkezdeki panodadır.
        </p>
      </>
    )
  }

  // Sağ dock — ekrana özel. Süreçler ve proje çalışma alanı iki bölgeli
  // (navigator + inspector); diğer global ekranlar tek bağlam paneli.
  const renderDock = (): React.JSX.Element => {
    if (view === 'processes') {
      return (
        <>
          <div className="area area--outliner" style={{ height: outlinerH }}>
            <div className="area__head">
              <span className="area__title">Pipeline’lar</span>
            </div>
            <div className="area__body area__body--flush">
              <ProcessRunList
                proc={proc}
                projects={projects.map((project) => ({ key: project.key, name: project.name }))}
              />
            </div>
          </div>
          <Splitter dir="row" onDrag={(d) => setOutlinerH((h) => clamp(h + d, 120, 520))} />
          <div className="area area--props">
            <div className="area__head">
              <span className="area__title">Özellikler</span>
            </div>
            <div className="area__body props">
              <ProcessInspector proc={proc} />
            </div>
          </div>
        </>
      )
    }

    if (view === 'project' && selectedProject !== null) {
      return (
        <>
          <div className="area area--outliner" style={{ height: outlinerH }}>
            <div className="area__head">
              <Icon name="project" size={13} />
              <span className="area__title">Bölümler</span>
            </div>
            <div className="area__body outliner">
              {PROJECT_TABS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={tab === item.id ? 'tree__row is-active' : 'tree__row'}
                  onClick={() => setTab(item.id)}
                >
                  <Icon name={item.icon} size={14} />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </div>
          <Splitter dir="row" onDrag={(d) => setOutlinerH((h) => clamp(h + d, 120, 520))} />
          <div className="area area--props">
            <div className="area__head">
              <span className="area__title">Proje</span>
            </div>
            <div className="area__body props">
              <div className="props__name">{selectedProject.name}</div>
              <div className="props__key mono">{selectedProject.key}</div>
              <div className="props__row">
                <span className="props__label">Ingest token</span>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => void copyToken(selectedProject.ingestToken)}
                >
                  {copied ? 'Kopyalandı ✓' : 'Kopyala'}
                </button>
              </div>
              <code className="props__token mono">{selectedProject.ingestToken}</code>
              <button
                type="button"
                className="btn-secondary btn-secondary--sm props__danger"
                onClick={() => void removeProject(selectedProject.key)}
              >
                Projeyi Sil
              </button>
            </div>
          </div>
        </>
      )
    }

    return (
      <div className="area area--props area--dockfull">
        <div className="area__head">
          <Icon name={viewportIcon} size={13} />
          <span className="area__title">Bağlam</span>
        </div>
        <div className="area__body props">{renderDockContext()}</div>
      </div>
    )
  }

  const isProcesses = view === 'processes'

  return (
    <div className="editor">
      {/* Üst şerit: logo + konum (breadcrumb) + komut paleti + kullanıcı */}
      <div className="tbar">
        <span className="tbar__logo" />
        <span className="tbar__title">Covora Studio</span>
        <nav className="crumbs" aria-label="Konum">
          <button
            type="button"
            className={view === 'project' ? 'crumb crumb--link' : 'crumb crumb--cur'}
            onClick={() => view === 'project' && goView('projects')}
          >
            <Icon name={view === 'project' ? 'project' : viewportIcon} size={13} />
            {view === 'project' ? 'Projeler' : (activeNav?.label ?? 'Genel Bakış')}
          </button>
          {view === 'project' && selectedProject !== null && (
            <>
              <span className="crumb__sep">›</span>
              <span className="crumb crumb--cur">{selectedProject.name}</span>
              <span className="crumb__sep">·</span>
              <span className="crumb crumb--muted">
                {PROJECT_TABS.find((t) => t.id === tab)?.label ?? ''}
              </span>
            </>
          )}
        </nav>
        <span className="tbar__spacer" />
        <button type="button" className="cmdk-trigger" onClick={() => setCmdkOpen(true)}>
          <Icon name="search" size={13} />
          <span>Git…</span>
          <kbd>⌘K</kbd>
        </button>
        <span className="avatar">{(user.email[0] ?? '?').toUpperCase()}</span>
        <button type="button" className="tbar__icon" onClick={logout} title="Çıkış">
          <Icon name="logout" size={16} />
        </button>
      </div>

      <div className="editor__body">
        {/* Sol araç rayı */}
        <div className="toolrail">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className={view === item.id ? 'tool is-active' : 'tool'}
              onClick={() => goView(item.id)}
              title={item.label}
            >
              <Icon name={item.icon} size={19} />
            </button>
          ))}
          <span className="toolrail__spacer" />
          <button
            type="button"
            className="tool"
            onClick={() => setCmdkOpen(true)}
            title="Komut paleti"
          >
            <Icon name="search" size={19} />
          </button>
        </div>

        {/* Merkez: viewport + alt konsol */}
        <div className="editor__center">
          <div className={isProcesses ? 'area area--flush' : 'area'}>
            <div className="area__head">
              <Icon name={viewportIcon} size={14} />
              <span className="area__title">{viewportTitle}</span>
              <span className="area__spacer" />
              {view === 'dashboard' && <span className="area__tag">viewport</span>}
            </div>
            <div className={isProcesses ? 'area__body area__body--flush' : 'area__body'}>
              {error !== null && <div className="state state--error">{error}</div>}
              {renderCentral()}
            </div>
          </div>

          <Splitter dir="row" onDrag={(d) => setBottomH((h) => clamp(h - d, 90, 420))} />

          <div className="area area--console" style={{ height: bottomH }}>
            <div className="area__head">
              <Icon name="reviews" size={13} />
              <span className="area__title">Konsol</span>
              {view === 'processes' && proc.openRunId !== null && proc.logs.length > 0 && (
                <button
                  type="button"
                  className="icon-button area__head-action"
                  title="Tüm logları kopyala"
                  aria-label="Tüm logları kopyala"
                  onClick={copyConsoleLogs}
                >
                  <Icon name="copy" size={13} />
                </button>
              )}
            </div>
            <div className="area__body console-body" ref={consoleBodyRef}>
              {view === 'processes' && proc.openRunId !== null ? (
                proc.logs.length === 0 ? (
                  <div className="cline cline__dim">Log bekleniyor…</div>
                ) : (
                  proc.logs.map((line) => (
                    <div key={line.seq} className="cline">
                      <span className="cline__ts">{formatTime(line.at)}</span>
                      {line.stepKey !== undefined && (
                        <span className="cline__step">{line.stepKey}</span>
                      )}
                      <span
                        className="cline__msg"
                        style={{ color: LOG_COLOR[line.level] }}
                      >
                        {line.message}
                      </span>
                    </div>
                  ))
                )
              ) : (
                <>
                  <div className="cline">
                    <span className="cline__ts">hazır</span>
                    <span className="cline__ok">●</span> Covora Studio · {projects.length} proje yüklü
                  </div>
                  <div className="cline">
                    <span className="cline__ts">görünüm</span>
                    <span className="cline__dim">{viewportTitle}</span>
                  </div>
                  <div className="cline cline__dim">
                    Canlı pipeline logları Süreçler görünümünde akar.
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <Splitter dir="col" onDrag={(d) => setRightW((w) => clamp(w - d, 230, 560))} />

        {/* Sağ dock: ekrana özel (navigator + inspector ya da bağlam paneli) */}
        <div className="editor__right" style={{ width: rightW }}>{renderDock()}</div>
      </div>

      {/* Durum çubuğu */}
      <footer className="statusbar">
        <span
          className={online ? 'statusbar__item statusbar__item--ok' : 'statusbar__item statusbar__item--fail'}
        >
          ● {online ? 'Bağlı' : 'Çevrimdışı'}
        </span>
        <span className="statusbar__item">{projects.length} proje</span>
        <span className="statusbar__spacer" />
        <span className="statusbar__item statusbar__item--muted">{viewportTitle}</span>
        <span className="statusbar__item statusbar__item--muted">Covora Studio v1</span>
      </footer>

      {cmdkOpen && <CommandPalette commands={commands} onClose={() => setCmdkOpen(false)} />}
      <ToastHost />
      <ConfirmHost />
    </div>
  )
}
