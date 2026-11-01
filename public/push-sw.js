// The app's one service worker: it shows push notifications and opens the app where one points, and
// on phones and tablets it's what lets the app be added to the Home Screen (Android's Install needs a
// service worker that answers page loads). It caches nothing: every page comes straight from the site,
// so it can never serve an old version (the app had trouble before with a service worker that did;
// index.html removes any other). Only when there's no connection does it answer with a short page
// saying so, which tries again by itself once the connection is back.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil(Promise.all([
  self.clients.claim(),
  // The browser starts loading the page while this wakes up, so pages open no slower than without it.
  self.registration.navigationPreload ? self.registration.navigationPreload.enable() : null,
])))

self.addEventListener('fetch', event => {
  if (event.request.mode !== 'navigate') return // files, images and the app's data: the browser, as without it
  event.respondWith((async () => {
    try {
      return (await event.preloadResponse) || await fetch(event.request)
    } catch {
      return offlinePage()
    }
  })())
})

const OFFLINE = {
  en: ['You’re offline', 'The app needs a connection. It opens again by itself as soon as there is one.', 'Try again'],
  es: ['Sin conexión', 'La aplicación necesita conexión. Se abrirá sola en cuanto vuelva a haberla.', 'Reintentar'],
}

function offlinePage() {
  const lang = /^es\b/i.test(self.navigator.language || '') ? 'es' : 'en'
  const [title, text, retry] = OFFLINE[lang]
  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>${title}</title>
<style>
:root { color-scheme: light dark }
body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; box-sizing: border-box; text-align: center;
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; background: #F8F4EF; color: #2B2522 }
main { max-width: 320px }
svg { width: 56px; height: 56px; fill: #A85A68 }
h1 { font-size: 1.35rem; font-weight: 600; margin: 16px 0 8px }
p { margin: 0 0 24px; line-height: 1.5; color: #5F5852 }
button { font: inherit; font-weight: 600; border: 0; border-radius: 999px; padding: 12px 28px; background: #F79BA4; color: #2B2522 }
@media (prefers-color-scheme: dark) { body { background: #110E15; color: #F6F1F4 } p { color: #CBC1CA } svg { fill: #F7A9B1 } }
</style></head><body><main>
<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M24 15c0-2.64-2.05-4.78-4.65-4.96C18.67 6.59 15.64 4 12 4c-1.33 0-2.57.36-3.65.97l1.49 1.49C10.51 6.17 11.23 6 12 6c3.04 0 5.5 2.46 5.5 5.5v.5H19c1.66 0 3 1.34 3 3 0 .99-.48 1.85-1.21 2.4l1.41 1.41c1.09-.92 1.8-2.27 1.8-3.81M4.41 3.86 3 5.27l2.77 2.77h-.42C2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h11.73l2 2 1.41-1.41zM6 18c-2.21 0-4-1.79-4-4s1.79-4 4-4h1.73l8 8z"/></svg>
<h1>${title}</h1><p>${text}</p><button type="button" onclick="location.reload()">${retry}</button>
</main><script>addEventListener('online', function () { location.reload() })</script></body></html>`
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
}

self.addEventListener('push', event => {
  let n = {}
  try { n = event.data ? event.data.json() : {} } catch { n = { title: event.data ? event.data.text() : '' } }
  event.waitUntil(self.registration.showNotification(n.title || 'Business Agent', {
    body: n.body || undefined,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: n.tag || undefined,
    data: { link: n.link || '/notifications' },
  }))
})

// Tapped: the app's tab if one is open (taken to the page), otherwise a new one.
self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = new URL(event.notification.data && event.notification.data.link || '/notifications', self.location.origin).href
  event.waitUntil((async () => {
    const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const tab = tabs.find(c => new URL(c.url).origin === self.location.origin)
    if (tab) {
      await tab.focus()
      if ('navigate' in tab) await tab.navigate(url).catch(() => {})
      return
    }
    await self.clients.openWindow(url)
  })())
})
