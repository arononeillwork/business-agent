import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { applyPreferences, cachedPreferences } from './app/Appearance'

// Open in the person's text size, contrast and font straight away (their theme follows on mount).
applyPreferences(cachedPreferences())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
