import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { applyPreferences, cachedPreferences } from './app/Appearance'
import { setLanguage, startingLanguage } from './i18n'

// A tab opened before a deploy asks for page code the deploy replaced: reload once to pick up
// the new version instead of showing a broken page.
window.addEventListener('vite:preloadError', event => {
  const key = 'reloaded-for-new-version'
  try {
    if (Date.now() - Number(sessionStorage.getItem(key) ?? 0) < 10_000) return
    sessionStorage.setItem(key, String(Date.now()))
  } catch { /* storage blocked: still reload */ }
  event.preventDefault()
  location.reload()
})

// Open in the person's text size, contrast and font straight away (their theme follows on mount).
applyPreferences(cachedPreferences())

// And in their language: the Spanish text is fetched first when that's the one, so nothing flickers.
void setLanguage(startingLanguage()).catch(() => { /* stays in English */ }).finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
