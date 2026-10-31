// The app's one service worker: it shows push notifications and opens the app where one points.
// It caches nothing and handles no requests, so pages always come straight from the site (the app
// had trouble before with a service worker serving an old version; index.html removes any other).
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))

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
