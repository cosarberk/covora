/**
 * @module studio/App
 *
 * Studio kök bileşeni: sol tarafta proje yönetimi (liste/oluştur/sil), seçilen
 * projenin kural ve review sekmeleri sağda.
 */

import { useCallback, useEffect, useState } from 'react'

import { createStudioApi, type ProjectSummary } from './api/client.js'
import { ProvidersPanel } from './components/ProvidersPanel.js'
import { ReviewsPanel } from './components/ReviewsPanel.js'
import { RulesPanel } from './components/RulesPanel.js'

// Prod'da boş = same-origin (server studio'yu serve eder). Dev'de Vite proxy.
const serverUrl = import.meta.env.VITE_COVORA_SERVER_URL ?? ''
const api = createStudioApi({ baseUrl: serverUrl })

type Tab = 'rules' | 'reviews'

/** Studio uygulaması. */
export const App = (): React.JSX.Element => {
  const [projects, setProjects] = useState<readonly ProjectSummary[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [view, setView] = useState<'project' | 'providers'>('project')
  const [tab, setTab] = useState<Tab>('rules')
  const [error, setError] = useState<string | null>(null)
  const [newKey, setNewKey] = useState('')
  const [newName, setNewName] = useState('')

  const loadProjects = useCallback(async (): Promise<void> => {
    setError(null)
    try {
      setProjects(await api.listProjects())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Bilinmeyen hata')
    }
  }, [])

  useEffect(() => {
    void loadProjects()
  }, [loadProjects])

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

  return (
    <div className="app">
      <header className="header">
        <h1 className="brand">
          Covora <span className="brand__accent">Studio</span>
        </h1>
      </header>

      <div className="layout">
        <aside className="sidebar">
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
            className={view === 'providers' ? 'nav-item nav-item--active' : 'nav-item'}
            onClick={() => setView('providers')}
          >
            ⚙ AI Sağlayıcılar
          </button>
        </aside>

        <main className="main">
          {error !== null && <div className="state state--error">{error}</div>}

          {view === 'providers' ? (
            <ProvidersPanel api={api} />
          ) : selected === null ? (
            <div className="state">Soldan bir proje seç ya da yeni proje oluştur.</div>
          ) : (
            <>
              <nav className="tabs">
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

              {tab === 'rules' ? (
                <RulesPanel api={api} projectKey={selected} />
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
