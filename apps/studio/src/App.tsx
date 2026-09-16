/**
 * @module studio/App
 *
 * Studio kök bileşeni. Giriş yapılmadan içerik gösterilmez. Girişten sonra:
 * üstte marka + kullanıcı, solda navigasyon (Genel Bakış / Review Paketleri /
 * AI Sağlayıcılar) ve proje listesi, sağda sayfa başlıklı içerik.
 */

import type { User } from '@covora/types'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { createStudioApi, type ProjectSummary } from './api/client.js'
import { DashboardPanel } from './components/DashboardPanel.js'
import { Login } from './components/Login.js'
import { PacksPanel } from './components/PacksPanel.js'
import { ProjectPacksPanel } from './components/ProjectPacksPanel.js'
import { ProvidersPanel } from './components/ProvidersPanel.js'
import { ReviewsPanel } from './components/ReviewsPanel.js'
import { RulesPanel } from './components/RulesPanel.js'
import { SettingsPanel } from './components/SettingsPanel.js'
import { WebhooksPanel } from './components/WebhooksPanel.js'

// Prod'da boş = same-origin (server studio'yu serve eder). Dev'de Vite proxy.
const serverUrl = import.meta.env.VITE_COVORA_SERVER_URL ?? ''
const api = createStudioApi({ baseUrl: serverUrl })

type Tab = 'packs' | 'rules' | 'reviews' | 'webhooks' | 'settings'
type View = 'dashboard' | 'project' | 'providers' | 'packs'

const PROJECT_TABS: readonly { readonly id: Tab; readonly label: string }[] = [
  { id: 'packs', label: 'Paketler' },
  { id: 'rules', label: 'Kurallar' },
  { id: 'reviews', label: 'Review Geçmişi' },
  { id: 'webhooks', label: 'Bildirimler' },
  { id: 'settings', label: 'Ayarlar' }
]

/** Studio uygulaması. */
export const App = (): React.JSX.Element => {
  const [user, setUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [projects, setProjects] = useState<readonly ProjectSummary[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [view, setView] = useState<View>('dashboard')
  const [tab, setTab] = useState<Tab>('packs')
  const [error, setError] = useState<string | null>(null)
  const [newKey, setNewKey] = useState('')
  const [newName, setNewName] = useState('')
  const [copied, setCopied] = useState(false)

  // Oturum: sayfa açılışında kayıtlı token'ı doğrula; 401'de otomatik çıkış.
  useEffect(() => {
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
  }, [])

  const loadProjectRules = useCallback(
    () => (selected === null ? Promise.resolve([]) : api.listRules(selected)),
    [selected]
  )

  const loadProjects = useCallback(async (): Promise<void> => {
    setError(null)
    try {
      setProjects(await api.listProjects())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Bilinmeyen hata')
    }
  }, [])

  useEffect(() => {
    if (user !== null) {
      void loadProjects()
    }
  }, [user, loadProjects])

  const selectedProject = useMemo(
    () => projects.find((project) => project.key === selected) ?? null,
    [projects, selected]
  )

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
      await loadProjects()
      setSelected(key)
      setView('project')
      setTab('packs')
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
  }

  const openProject = (key: string): void => {
    setSelected(key)
    setView('project')
    setTab('packs')
  }

  if (!authReady) {
    return <div className="state state--full">Yükleniyor…</div>
  }

  if (user === null) {
    return <Login api={api} onLogin={(current) => setUser(current)} />
  }

  const navItem = (id: View, icon: string, label: string): React.JSX.Element => (
    <button
      type="button"
      className={view === id ? 'navitem is-active' : 'navitem'}
      onClick={() => setView(id)}
    >
      <span className="navitem__icon">{icon}</span>
      {label}
    </button>
  )

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__brand">
          Covora <span>Studio</span>
        </div>
        <div className="topbar__right">
          <span className="topbar__user">{user.email}</span>
          <button type="button" className="btn-secondary" onClick={logout}>
            Çıkış
          </button>
        </div>
      </header>

      <div className="shell">
        <aside className="nav">
          <div className="nav__section">
            <div className="nav__label">Genel</div>
            {navItem('dashboard', '📊', 'Genel Bakış')}
            {navItem('packs', '📦', 'Review Paketleri')}
            {navItem('providers', '⚙️', 'AI Sağlayıcılar')}
          </div>

          <div className="nav__section nav__section--grow">
            <div className="nav__label">Projeler</div>
            <div className="projects">
              {projects.map((project) => (
                <div
                  key={project.id}
                  className={
                    project.key === selected && view === 'project' ? 'proj is-active' : 'proj'
                  }
                >
                  <button type="button" className="proj__btn" onClick={() => openProject(project.key)}>
                    <span className="proj__name">{project.name}</span>
                    <span className="proj__key">{project.key}</span>
                  </button>
                  <button
                    type="button"
                    className="proj__del"
                    title="Sil"
                    onClick={() => void removeProject(project.key)}
                  >
                    ×
                  </button>
                </div>
              ))}
              {projects.length === 0 && <div className="proj-empty">Henüz proje yok</div>}
            </div>

            <form className="addproj" onSubmit={(event) => void createProject(event)}>
              <input
                className="input"
                placeholder="anahtar (örn. anasayfa-plugin)"
                value={newKey}
                onChange={(event) => setNewKey(event.target.value)}
              />
              <input
                className="input"
                placeholder="ad"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
              />
              <button className="button" type="submit">
                + Proje Ekle
              </button>
            </form>
          </div>
        </aside>

        <main className="content">
          <div className="page">
            {error !== null && <div className="state state--error">{error}</div>}

            {view === 'dashboard' ? (
              <>
                <div className="page__head">
                  <div>
                    <h1 className="page__title">Genel Bakış</h1>
                    <p className="page__sub">Tüm projeler genelinde özet ve son review'lar.</p>
                  </div>
                </div>
                <DashboardPanel api={api} onOpenProject={openProject} />
              </>
            ) : view === 'packs' ? (
              <>
                <div className="page__head">
                  <div>
                    <h1 className="page__title">Review Paketleri</h1>
                    <p className="page__sub">
                      Kural koleksiyonlarını yönet. Projeler bu paketlere abone olur.
                    </p>
                  </div>
                </div>
                <PacksPanel api={api} />
              </>
            ) : view === 'providers' ? (
              <>
                <div className="page__head">
                  <div>
                    <h1 className="page__title">AI Sağlayıcılar</h1>
                    <p className="page__sub">
                      Ollama uç noktalarını ve modellerini yönet (ui / code için ayrı).
                    </p>
                  </div>
                </div>
                <ProvidersPanel api={api} />
              </>
            ) : selectedProject === null ? (
              <div className="state">Soldan bir proje seç ya da yeni proje oluştur.</div>
            ) : (
              <>
                <div className="page__head">
                  <div>
                    <h1 className="page__title">{selectedProject.name}</h1>
                    <p className="page__sub mono">{selectedProject.key}</p>
                  </div>
                  <div className="page__actions">
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => void removeProject(selectedProject.key)}
                    >
                      Projeyi Sil
                    </button>
                  </div>
                </div>

                <div className="ingest">
                  <span className="ingest__label">Ingest token</span>
                  <code className="ingest__token mono">{selectedProject.ingestToken}</code>
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => void copyToken(selectedProject.ingestToken)}
                  >
                    {copied ? 'Kopyalandı ✓' : 'Kopyala'}
                  </button>
                  <span className="ingest__hint">
                    Pipeline / SDK bu token'ı <span className="mono">x-covora-token</span> başlığıyla
                    gönderir.
                  </span>
                </div>

                <nav className="tabs">
                  {PROJECT_TABS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={tab === item.id ? 'tab tab--active' : 'tab'}
                      onClick={() => setTab(item.id)}
                    >
                      {item.label}
                    </button>
                  ))}
                </nav>

                {tab === 'packs' ? (
                  <ProjectPacksPanel api={api} projectKey={selected as string} />
                ) : tab === 'rules' ? (
                  <RulesPanel
                    api={api}
                    loadRules={loadProjectRules}
                    emptyLabel="Bu proje bir pack'e abone değil ya da abone pack'lerde kural yok."
                  />
                ) : tab === 'reviews' ? (
                  <ReviewsPanel api={api} projectKey={selected as string} />
                ) : tab === 'webhooks' ? (
                  <WebhooksPanel api={api} projectKey={selected as string} />
                ) : (
                  <SettingsPanel api={api} projectKey={selected as string} />
                )}
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
