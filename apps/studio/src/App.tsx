/**
 * @module studio/App
 *
 * Studio kök bileşeni — Blender tarzı dock editör kabuğu. Üstte menü/çalışma
 * alanı şeridi, solda araç rayı, merkezde viewport + altında konsol, sağda
 * dock (Gezgin + Özellikler). Tüm bölgeler sürüklenebilir ayraçlarla yeniden
 * boyutlanır. Ctrl/Cmd+K komut paleti.
 *
 * `api`/`initialUser` prop'ları önizleme/test içindir; üretimde varsayılan API
 * ve giriş akışı kullanılır.
 */

import type { User } from '@covora/types'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { createStudioApi, type ProjectSummary, type StudioApi } from './api/client.js'
import { CommandPalette, type Command } from './components/CommandPalette.js'
import { Icon, type IconName } from './components/Icon.js'
import { Splitter } from './components/Splitter.js'
import { DashboardPanel } from './components/DashboardPanel.js'
import { IngestGuide } from './components/IngestGuide.js'
import { Login } from './components/Login.js'
import { PacksPanel } from './components/PacksPanel.js'
import { ProcessGraph, ProcessInspector, ProcessRunList } from './components/processes/regions.js'
import { useProcesses } from './components/processes/useProcesses.js'
import { LOG_COLOR, formatTime } from './components/processes/graph.js'
import { ProjectPacksPanel } from './components/ProjectPacksPanel.js'
import { ProvidersPanel } from './components/ProvidersPanel.js'
import { ReviewsPanel } from './components/ReviewsPanel.js'
import { RulesPanel } from './components/RulesPanel.js'
import { SettingsPanel } from './components/SettingsPanel.js'
import { WebhooksPanel } from './components/WebhooksPanel.js'

const serverUrl = import.meta.env.VITE_COVORA_SERVER_URL ?? ''
const defaultApi = createStudioApi({ baseUrl: serverUrl })

type Tab = 'packs' | 'rules' | 'reviews' | 'webhooks' | 'settings' | 'integration'
type View = 'dashboard' | 'project' | 'providers' | 'packs' | 'processes'

const PROJECT_TABS: readonly { readonly id: Tab; readonly icon: IconName; readonly label: string }[] = [
  { id: 'packs', icon: 'packages', label: 'Paketler' },
  { id: 'rules', icon: 'rules', label: 'Kurallar' },
  { id: 'reviews', icon: 'reviews', label: 'Review Geçmişi' },
  { id: 'integration', icon: 'plug', label: 'Entegrasyon' },
  { id: 'webhooks', icon: 'webhook', label: 'Bildirimler' },
  { id: 'settings', icon: 'settings', label: 'Ayarlar' }
]

const NAV: readonly { readonly id: View; readonly icon: IconName; readonly label: string }[] = [
  { id: 'dashboard', icon: 'dashboard', label: 'Genel Bakış' },
  { id: 'processes', icon: 'flow', label: 'Süreçler' },
  { id: 'packs', icon: 'packages', label: 'Review Paketleri' },
  { id: 'providers', icon: 'ai', label: 'AI Sağlayıcılar' }
]

const MENU: readonly string[] = ['Dosya', 'Düzen', 'Görünüm', 'Çalıştır', 'Yardım']

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value))

/** {@link App} props (üretimde boş; önizleme/test için enjeksiyon). */
export interface AppProps {
  readonly api?: StudioApi
  readonly initialUser?: User | null
  /** Önizleme için başlangıç görünümü. */
  readonly initialView?: View
}

/** Studio uygulaması. */
export const App = ({ api = defaultApi, initialUser, initialView }: AppProps = {}): React.JSX.Element => {
  const presetAuth = initialUser !== undefined
  const [user, setUser] = useState<User | null>(initialUser ?? null)
  const [authReady, setAuthReady] = useState(presetAuth)
  const [projects, setProjects] = useState<readonly ProjectSummary[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [view, setView] = useState<View>(initialView ?? 'dashboard')
  const [tab, setTab] = useState<Tab>('packs')
  const [error, setError] = useState<string | null>(null)
  const [newKey, setNewKey] = useState('')
  const [newName, setNewName] = useState('')
  const [copied, setCopied] = useState(false)
  const [cmdkOpen, setCmdkOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)

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
    try {
      await api.upsertProject(key, name)
      setNewKey('')
      setNewName('')
      setAddOpen(false)
      await loadProjects()
      openProject(key)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Bilinmeyen hata')
    }
  }

  const removeProject = async (key: string): Promise<void> => {
    if (!globalThis.confirm(`"${key}" projesi ve tüm kural/review'ları silinsin mi?`)) {
      return
    }
    try {
      await api.deleteProject(key)
      if (selected === key) {
        setSelected(null)
        setView('dashboard')
      }
      await loadProjects()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Bilinmeyen hata')
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
    if (view === 'packs') {
      return <PacksPanel api={api} />
    }
    if (view === 'providers') {
      return <ProvidersPanel api={api} />
    }
    if (selectedProject === null) {
      return <div className="state">Sağdaki Gezgin’den bir proje seç ya da oluştur.</div>
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
          projectKey={selectedProject.key}
          ingestToken={selectedProject.ingestToken}
        />
      )
    }
    if (tab === 'webhooks') {
      return <WebhooksPanel api={api} projectKey={selectedProject.key} />
    }
    return <SettingsPanel api={api} projectKey={selectedProject.key} />
  }

  const isProcesses = view === 'processes'

  return (
    <div className="editor">
      {/* Üst şerit: logo + menüler + çalışma alanı sekmeleri + kullanıcı */}
      <div className="tbar">
        <span className="tbar__logo" />
        <span className="tbar__title">Covora Studio</span>
        <nav className="tbar__menu">
          {MENU.map((item) => (
            <button key={item} type="button" className="tbar__menuitem">
              {item}
            </button>
          ))}
        </nav>
        <span className="tbar__wstabs">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className={view === item.id ? 'wstab is-active' : 'wstab'}
              onClick={() => goView(item.id)}
            >
              <Icon name={item.icon} size={14} />
              {item.label}
            </button>
          ))}
        </span>
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
            </div>
            <div className="area__body console-body">
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
                      <span style={{ color: LOG_COLOR[line.level] }}>{line.message}</span>
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

        {/* Sağ dock: Gezgin + Özellikler */}
        <div className="editor__right" style={{ width: rightW }}>
          <div className="area area--outliner" style={{ height: outlinerH }}>
            <div className="area__head">
              <span className="area__title">{view === 'processes' ? 'Pipeline’lar' : 'Gezgin'}</span>
              <span className="area__spacer" />
              {view !== 'processes' && (
                <button
                  type="button"
                  className="area__btn"
                  title="Proje ekle"
                  onClick={() => setAddOpen((open) => !open)}
                >
                  <Icon name="plus" size={13} />
                </button>
              )}
            </div>
            {view === 'processes' ? (
              <div className="area__body area__body--flush">
                <ProcessRunList
                  proc={proc}
                  projects={projects.map((project) => ({ key: project.key, name: project.name }))}
                />
              </div>
            ) : (
            <div className="area__body outliner">
              <div className="tree__group">Görünümler</div>
              {NAV.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={view === item.id ? 'tree__row is-active' : 'tree__row'}
                  onClick={() => goView(item.id)}
                >
                  <Icon name={item.icon} size={14} />
                  <span>{item.label}</span>
                </button>
              ))}

              <div className="tree__group">Projeler</div>
              {addOpen && (
                <form className="addproj" onSubmit={(event) => void createProject(event)}>
                  <input
                    className="input input--sm"
                    placeholder="anahtar"
                    value={newKey}
                    onChange={(event) => setNewKey(event.target.value)}
                    autoFocus
                  />
                  <input
                    className="input input--sm"
                    placeholder="ad"
                    value={newName}
                    onChange={(event) => setNewName(event.target.value)}
                  />
                  <button className="button button--sm" type="submit">
                    Ekle
                  </button>
                </form>
              )}
              {projects.map((project) => (
                <div
                  key={project.id}
                  className={
                    project.key === selected && view === 'project'
                      ? 'tree__row tree__row--proj is-active'
                      : 'tree__row tree__row--proj'
                  }
                >
                  <button type="button" className="tree__projbtn" onClick={() => openProject(project.key)}>
                    <Icon name="project" size={14} />
                    <span>{project.name}</span>
                  </button>
                  <button
                    type="button"
                    className="tree__del"
                    title="Sil"
                    onClick={() => void removeProject(project.key)}
                  >
                    <Icon name="close" size={12} />
                  </button>
                </div>
              ))}
              {projects.length === 0 && <div className="tree__empty">Henüz proje yok</div>}
            </div>
            )}
          </div>

          <Splitter dir="row" onDrag={(d) => setOutlinerH((h) => clamp(h + d, 120, 520))} />

          <div className="area area--props">
            <div className="area__head">
              <span className="area__title">Özellikler</span>
            </div>
            <div className="area__body props">
              {view === 'processes' ? (
                <ProcessInspector proc={proc} />
              ) : view === 'project' && selectedProject !== null ? (
                <>
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
                  <div className="props__group">Bölümler</div>
                  <div className="props__tabs">
                    {PROJECT_TABS.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={tab === item.id ? 'props__tab is-active' : 'props__tab'}
                        onClick={() => setTab(item.id)}
                      >
                        <Icon name={item.icon} size={14} />
                        <span>{item.label}</span>
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="btn-secondary btn-secondary--sm props__danger"
                    onClick={() => void removeProject(selectedProject.key)}
                  >
                    Projeyi Sil
                  </button>
                </>
              ) : (
                <div className="props__context">
                  <div className="props__name">{activeNav?.label ?? 'Genel Bakış'}</div>
                  <p className="props__desc">
                    {view === 'dashboard'
                      ? 'Tüm projeler genelinde özet, gate oranı ve son review’lar.'
                      : view === 'packs'
                        ? 'Kural koleksiyonları. Projeler bu paketlere abone olur.'
                        : 'AI sağlayıcıları (Ollama / OpenAI-uyumlu). Model yükle/boşalt.'}
                  </p>
                  <div className="props__group">Çalışma alanı</div>
                  <div className="props__stat">
                    <span>Proje</span>
                    <b>{projects.length}</b>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Durum çubuğu */}
      <footer className="statusbar">
        <span className="statusbar__item statusbar__item--ok">● Bağlı</span>
        <span className="statusbar__item">{projects.length} proje</span>
        <span className="statusbar__spacer" />
        <span className="statusbar__item statusbar__item--muted">{viewportTitle}</span>
        <span className="statusbar__item statusbar__item--muted">Covora Studio v1</span>
      </footer>

      {cmdkOpen && <CommandPalette commands={commands} onClose={() => setCmdkOpen(false)} />}
    </div>
  )
}
