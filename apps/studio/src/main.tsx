/**
 * @module studio/main
 *
 * Covora studio uygulamasının giriş noktası.
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App.js'
import './index.css'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Kök element (#root) bulunamadı')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
)
