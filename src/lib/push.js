import { supabase } from './supabase'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

/** Convert a URL-safe base64 string to a Uint8Array (required by pushManager.subscribe) */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw     = atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

/** Returns true if the browser supports push notifications */
export function isPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

/** Returns the current push subscription (null if not subscribed) */
export async function getPushSubscription() {
  if (!isPushSupported()) return null
  try {
    const reg = await navigator.serviceWorker.ready
    return await reg.pushManager.getSubscription()
  } catch {
    return null
  }
}

/** Register SW, request permission, subscribe, and save to Supabase. Returns true on success. */
export async function subscribeToPush(userId) {
  if (!isPushSupported()) return false

  // Request permission
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return false

  try {
    const reg = await navigator.serviceWorker.ready
    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly:      true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })

    const sub = subscription.toJSON()
    await supabase.from('push_subscriptions').upsert({
      user_id:  userId,
      endpoint: sub.endpoint,
      p256dh:   sub.keys.p256dh,
      auth:     sub.keys.auth,
    }, { onConflict: 'user_id,endpoint' })

    return true
  } catch (err) {
    console.error('Push subscribe error:', err)
    return false
  }
}

/** Unsubscribe from push and remove from Supabase */
export async function unsubscribeFromPush(userId) {
  if (!isPushSupported()) return

  try {
    const reg = await navigator.serviceWorker.ready
    const subscription = await reg.pushManager.getSubscription()
    if (!subscription) return

    const endpoint = subscription.endpoint
    await subscription.unsubscribe()
    await supabase.from('push_subscriptions')
      .delete()
      .eq('user_id', userId)
      .eq('endpoint', endpoint)
  } catch (err) {
    console.error('Push unsubscribe error:', err)
  }
}

/** Register the service worker on app startup (silent, no permission prompt) */
export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return
  try {
    await navigator.serviceWorker.register('/sw.js')
  } catch (err) {
    console.error('SW registration failed:', err)
  }
}
