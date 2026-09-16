/**
 * @module studio/App
 *
 * Studio kök bileşeni. Giriş yapılmadan içerik gösterilmez. Girişten sonra:
 * solda proje yönetimi (liste/oluştur/sil) + Review Paketleri / AI Sağlayıcılar
 * navigasyonu, sağda seçilen projenin paket/kural/review sekmeleri.
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

// Prod'da boş = same-origin (server studio'yu serve eder). Dev'de Vite proxy.
const serverUrl = import.meta.env.VITE_COVORA_SERVER_URL ?? ''
const api = createStudioApi({ baseUrl: serverUrl })

type Tab = 'packs' | 'rules' | 'reviews'
type View = 'dashboard' | 'project' | 'providers' | 'packs'

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

  if (!authReady) {
    return <div className="state state--full">Yükleniyor…</div>
  }

  if (user === null) {
    return <Login api={api} onLogin={(current) => setUser(current)} />
  }

  return (
    <div className="app">
      <header className="header">
        <h1 className="brand">
          Covora <span className="brand__accent">Studio</span>
        </h1>
        <div className="header__user">
          <span className="header__email mono">{user.email}</span>
          <button type="button" className="link-button" onClick={logout}>
            Çıkış
          </button>
        </div>
      </header>

      <div className="layout">
        <aside className="sidebar">
          <button
            type="button"
            className={view === 'dashboard' ? 'nav-item nav-item--active' : 'nav-item'}
            onClick={() => setView('dashboard')}
          >
            📊 Genel Bakış
          </button>
          <div className="sidebar__title">Projeler</div>
          <ul className="project-list">
            {projects.map((project) => (
              <li
                key={project.id}
                className={project.key === selected ? 'project project--active' : 'project'}
              >
                <button
                  type="button"
                  className="project__select"
                  onClick={() => {
                    setSelected(project.key)
                    setView('project')
                  }}
                >
                  <span className="project__name">{project.name}</span>
                  <span className="mono project__key">{project.key}</span>
                </button>
                <button
                  type="button"
                  className="project__del"
                  title="Sil"
                  onClick={() => void removeProject(project.key)}
                >
                  ×
                </button>
              </li>
            ))}
            {projects.length === 0 && <li className="project-empty">Henüz proje yok</li>}
          </ul>

          <form className="new-project" onSubmit={(event) => void createProject(event)}>
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
              Proje Ekle
            </button>
          </form>

          <button
            type="button"
            className={view === 'packs' ? 'nav-item nav-item--active' : 'nav-item'}
            onClick={() => setView('packs')}
          >
            📦 Review Paketleri
          </button>
          <button
            type="button"
            className={view === 'providers' ? 'nav-item nav-item--active' : 'nav-item'}
            onClick={() => setView('providers')}
          >
            ⚙ AI Sağlayıcılar
          </button>
        </aside>

        <main className="main">
          {error !== null && <div className="state state--error">{error}</div>}

          {view === 'dashboard' ? (
            <DashboardPanel
              api={api}
              onOpenProject={(key) => {
                setSelected(key)
                setView('project')
              }}
            />
          ) : view === 'providers' ? (
            <ProvidersPanel api={api} />
          ) : view === 'packs' ? (
            <PacksPanel api={api} />
          ) : selected === null ? (
            <div className="state">Soldan bir proje seç ya da yeni proje oluştur.</div>
          ) : (
            <>
              {selectedProject !== null && (
                <div className="ingest">
                  <span className="ingest__label">Ingest token</span>
                  <code className="ingest__token mono">{selectedProject.ingestToken}</code>
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => void copyToken(selectedProject.ingestToken)}
                  >
                    {copied ? 'Kopyalandı' : 'Kopyala'}
                  </button>
                  <span className="ingest__hint">
                    Pipeline / SDK bu token'ı <span className="mono">x-covora-token</span> ile gönderir.
                  </span>
                </div>
              )}

              <nav className="tabs">
                <button
                  type="button"
                  className={tab === 'packs' ? 'tab tab--active' : 'tab'}
                  onClick={() => setTab('packs')}
                >
                  Paketler
                </button>
                <button
                  type="button"
                  className={tab === 'rules' ? 'tab tab--active' : 'tab'}
                  onClick={() => setTab('rules')}
                >
                  Kurallar
                </button>
                <button
                  type="button"
                  className={tab === 'reviews' ? 'tab tab--active' : 'tab'}
                  onClick={() => setTab('reviews')}
                >
                  Review Geçmişi
                </button>
              </nav>

              {tab === 'packs' ? (
                <ProjectPacksPanel api={api} projectKey={selected} />
              ) : tab === 'rules' ? (
                <RulesPanel
                  api={api}
                  loadRules={loadProjectRules}
                  emptyLabel="Bu proje bir pack'e abone değil ya da abone pack'lerde kural yok."
                />
              ) : (
                <ReviewsPanel api={api} projectKey={selected} />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  )
}
