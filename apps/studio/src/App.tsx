/**
 * @module studio/App
 *
 * Studio kök bileşeni: proje seçimi ve kural/review sekmeleri.
 */

import { useState } from 'react'

import { createStudioApi } from './api/client.js'
import { ReviewsPanel } from './components/ReviewsPanel.js'
import { RulesPanel } from './components/RulesPanel.js'

// Prod'da boş = same-origin (nginx API'yi server'a proxy'ler). Dev'de Vite proxy devreye girer.
const serverUrl = import.meta.env.VITE_COVORA_SERVER_URL ?? ''
const api = createStudioApi({ baseUrl: serverUrl })

type Tab = 'rules' | 'reviews'

/** Studio uygulaması. */
export const App = (): React.JSX.Element => {
  const [projectKeyInput, setProjectKeyInput] = useState('')
  const [activeProject, setActiveProject] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('rules')

  const openProject = (): void => {
    const trimmed = projectKeyInput.trim()
    if (trimmed.length > 0) {
      setActiveProject(trimmed)
    }
  }

  return (
    <div className="app">
      <header className="header">
        <h1 className="brand">
          Covora <span className="brand__accent">Studio</span>
        </h1>
        <div className="project-picker">
          <input
            className="input"
            placeholder="Proje anahtarı (örn. anasayfa-plugin)"
            value={projectKeyInput}
            onChange={(event) => setProjectKeyInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                openProject()
              }
            }}
          />
          <button className="button" type="button" onClick={openProject}>
            Aç
          </button>
        </div>
      </header>

      {activeProject === null ? (
        <div className="state">Başlamak için bir proje anahtarı girin.</div>
      ) : (
        <main className="main">
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
            <RulesPanel api={api} projectKey={activeProject} />
          ) : (
            <ReviewsPanel api={api} projectKey={activeProject} />
          )}
        </main>
      )}
    </div>
  )
}
