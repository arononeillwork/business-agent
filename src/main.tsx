import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { applyPreferences, cachedPreferences } from './app/Appearance'
import { reloadForNewVersion } from './app/newVersion'
import { setLanguage, startingLanguage } from './i18n'
import { listenForErrors } from './app/errorReports'

// A tab opened before a deploy asks for page code the deploy replaced: reload to pick up the new
// version instead of showing a broken page (src/app/newVersion.tsx). Prevented, the failed import
// gives nothing and the page waits for the reload; not, it fails and the page says so.
window.addEventListener('vite:preloadError', event => {
  if (reloadForNewVersion()) event.preventDefault()
})

// What the browser sees go wrong is reported to The Business Agent (src/app/errorReports.ts).
listenForErrors()

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
