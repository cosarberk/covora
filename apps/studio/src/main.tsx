/**
 * @module @covora/studio
 *
 * Covora yönetim arayüzünün (studio) giriş noktası. Bu iskelet adımında
 * yalnızca uygulamayı bağlar; kural editörü ve review/coverage panosu
 * sonraki adımlarda eklenecektir.
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Kök element (#root) bulunamadı')
}

createRoot(rootElement).render(
  <StrictMode>
    <h1>Covora Studio</h1>
  </StrictMode>
)
