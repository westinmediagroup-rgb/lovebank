// Love Bank Service Worker — handles web push notifications

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))

self.addEventListener('push', event => {
  let data = {}
  try { data = event.data?.json() ?? {} } catch { data = { title: 'Love Bank', body: event.data?.text() } }

  const title   = data.title ?? 'Love Bank'
  const options = {
    body:    data.body   ?? 'You have a new notification.',
    icon:    '/favicon.svg',
    badge:   '/favicon.svg',
    tag:     data.tag    ?? 'love-bank',
    renotify: true,
    data:    { url: data.url ?? '/' },
    actions: data.actions ?? [],
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      // Focus existing tab if open
      const existing = clients.find(c => c.url.includes(self.location.origin))
      if (existing) return existing.focus().then(c => c.navigate(url))
      return self.clients.openWindow(url)
    })
  )
})
