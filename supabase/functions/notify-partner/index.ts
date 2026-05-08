import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── VAPID Web Push helpers ─────────────────────────────────────────────────

function b64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function b64urlToUint8(str: string): Uint8Array {
  const pad = str.length % 4 ? '='.repeat(4 - str.length % 4) : ''
  const b64 = (str + pad).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0))
}

async function buildVapidAuthHeader(endpoint: string): Promise<string> {
  const privateKeyB64 = Deno.env.get('VAPID_PRIVATE_KEY')!
  const publicKeyB64  = Deno.env.get('VAPID_PUBLIC_KEY')!

  const url       = new URL(endpoint)
  const audience  = `${url.protocol}//${url.host}`
  const expiry    = Math.floor(Date.now() / 1000) + 12 * 3600

  const header  = b64url(new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const payload = b64url(new TextEncoder().encode(JSON.stringify({ aud: audience, exp: expiry, sub: 'mailto:hello@luvbank.xyz' })))
  const sigInput = `${header}.${payload}`

  const privateKey = await crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', d: privateKeyB64, x: publicKeyB64.slice(0, 43), y: publicKeyB64.slice(43, 86), key_ops: ['sign'] },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, ['sign'],
  )

  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    new TextEncoder().encode(sigInput),
  )

  const jwt = `${sigInput}.${b64url(sig)}`
  return `vapid t=${jwt}, k=${publicKeyB64}`
}

async function encryptPushPayload(
  payload: string,
  p256dhB64: string,
  authB64: string,
): Promise<{ ciphertext: ArrayBuffer; salt: Uint8Array; localPublicKey: ArrayBuffer }> {
  const p256dh   = b64urlToUint8(p256dhB64)
  const authBytes = b64urlToUint8(authB64)

  // Import recipient public key
  const recipientKey = await crypto.subtle.importKey(
    'raw', p256dh,
    { name: 'ECDH', namedCurve: 'P-256' },
    false, [],
  )

  // Generate local ephemeral key pair
  const localPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey', 'deriveBits'])
  const localPublicKey = await crypto.subtle.exportKey('raw', localPair.publicKey)

  // ECDH shared secret
  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: recipientKey },
    localPair.privateKey, 256,
  )

  // HKDF to derive content encryption key and nonce
  const salt = crypto.getRandomValues(new Uint8Array(16))

  const prk = await crypto.subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey', 'deriveBits'])

  // auth_info  = "Content-Encoding: auth\0"
  const authInfo = new TextEncoder().encode('Content-Encoding: auth\0')
  const authSecret = await crypto.subtle.importKey('raw', authBytes, 'HKDF', false, ['deriveBits'])

  // IKM = HKDF-extract with auth as salt
  const ikm = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: authBytes, info: authInfo },
    prk, 256,
  )

  // Key info
  const keyInfo   = new Uint8Array([...new TextEncoder().encode('Content-Encoding: aesgcm\0'), 0x00, 0x41, ...new Uint8Array(p256dh), 0x00, 0x41, ...new Uint8Array(localPublicKey)])
  const nonceInfo = new Uint8Array([...new TextEncoder().encode('Content-Encoding: nonce\0'),  0x00, 0x41, ...new Uint8Array(p256dh), 0x00, 0x41, ...new Uint8Array(localPublicKey)])

  const ikmKey = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  const [contentKeyBits, nonceBits] = await Promise.all([
    crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: keyInfo },   ikmKey, 128),
    crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: nonceInfo }, ikmKey, 96),
  ])

  const contentKey = await crypto.subtle.importKey('raw', contentKeyBits, 'AES-GCM', false, ['encrypt'])

  // Pad and encrypt
  const plaintext = new TextEncoder().encode(payload)
  const padded    = new Uint8Array(plaintext.length + 2)
  padded.set([0, 0])  // 2-byte padding length prefix = 0
  padded.set(plaintext, 2)

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonceBits },
    contentKey, padded,
  )

  return { ciphertext, salt, localPublicKey }
}

async function sendWebPush(
  endpoint: string,
  p256dh: string,
  auth: string,
  payload: object,
): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    const json = JSON.stringify(payload)
    const { ciphertext, salt, localPublicKey } = await encryptPushPayload(json, p256dh, auth)
    const vapidAuth = await buildVapidAuthHeader(endpoint)

    const res = await fetch(endpoint, {
      method:  'POST',
      headers: {
        'Authorization':   vapidAuth,
        'Content-Type':    'application/octet-stream',
        'Content-Encoding': 'aesgcm',
        'Encryption':      `salt=${b64url(salt)}`,
        'Crypto-Key':      `dh=${b64url(localPublicKey)}`,
        'TTL':             '86400',
      },
      body: ciphertext,
    })

    if (res.ok || res.status === 201) return { ok: true, status: res.status }
    const text = await res.text()
    return { ok: false, status: res.status, error: text }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

// ── Main handler ───────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { recipient_id, sender_name, message_type, notification_type, extra } = await req.json()

    if (!recipient_id || !sender_name) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Look up recipient profile + email + push subscriptions
    const [{ data: profile }, { data: pushSubs }, { data: authUser }] = await Promise.all([
      supabase.from('profiles').select('phone_number, reminders_sms, reminders_email, display_name').eq('id', recipient_id).single(),
      supabase.from('push_subscriptions').select('endpoint, p256dh, auth').eq('user_id', recipient_id),
      supabase.auth.admin.getUserById(recipient_id),
    ])

    const recipientEmail = (authUser as any)?.user?.email

    if (!profile) {
      return new Response(JSON.stringify({ error: 'Recipient not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Build notification content
    const typeLabel =
      notification_type === 'deposit_confirmation' ? 'deposit waiting for confirmation' :
      notification_type === 'repair_request'       ? 'repair attempt' :
      message_type === 'voice_note'                ? 'voice note' :
      message_type === 'affirmation'               ? 'affirmation' :
      'message'

    const pushTitle = 'Love Bank 💛'
    const pushBody  =
      notification_type === 'deposit_confirmation' ? `${sender_name} logged a deposit — tap to confirm it.` :
      notification_type === 'repair_request'       ? `${sender_name} attempted a repair.` :
      `${sender_name} sent you a ${typeLabel}.`

    const pushUrl =
      notification_type === 'deposit_confirmation' && extra?.deposit_id ? `/deposit/${extra.deposit_id}` : '/'

    const results: Record<string, unknown> = {}

    /* ── Web push notifications ── */
    if (pushSubs && pushSubs.length > 0) {
      const pushResults = await Promise.all(
        pushSubs.map(async (sub: { endpoint: string; p256dh: string; auth: string }) => {
          const result = await sendWebPush(sub.endpoint, sub.p256dh, sub.auth, {
            title: pushTitle,
            body:  pushBody,
            url:   pushUrl,
            tag:   notification_type ?? 'message',
          })
          // Remove stale subscriptions (gone/invalid endpoints)
          if (!result.ok && (result.status === 404 || result.status === 410)) {
            await supabase.from('push_subscriptions').delete()
              .eq('user_id', recipient_id).eq('endpoint', sub.endpoint)
          }
          return result
        })
      )
      results.push = pushResults
    }

    /* ── Email notification ── */
    if (profile.reminders_email && recipientEmail) {
      const resendKey = Deno.env.get('RESEND_API_KEY')!
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Love Bank <hello@luvbank.xyz>',
          to: recipientEmail,
          subject: `💛 ${sender_name} — ${typeLabel}`,
          html: `
            <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#FFFDF7">
              <p style="font-size:26px;font-weight:700;color:#C97B2A;margin:0 0 24px">Love Bank 🏦</p>
              <p style="font-size:18px;font-weight:600;color:#1a1a18;margin:0 0 12px">
                ${pushBody}
              </p>
              <p style="font-size:15px;color:#555;line-height:1.7;margin:0 0 28px">
                Open the app to see it and keep your Love Bank growing.
              </p>
              <a href="https://love-bank-app-pied.vercel.app${pushUrl}"
                 style="display:inline-block;background:#C97B2A;color:#fff;font-size:15px;font-weight:600;
                        padding:14px 28px;border-radius:100px;text-decoration:none">
                Open Love Bank →
              </a>
              <p style="font-size:12px;color:#aaa;margin-top:36px">#LoveBank</p>
            </div>
          `,
        }),
      })
      const emailData = await emailRes.json()
      results.email = emailRes.ok ? { sent: true, id: emailData.id } : { sent: false, error: emailData }
    }

    /* ── SMS notification (active once A2P clears) ── */
    if (profile.reminders_sms && profile.phone_number) {
      const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')!
      const authToken  = Deno.env.get('TWILIO_AUTH_TOKEN')!
      const fromNumber = Deno.env.get('TWILIO_PHONE_NUMBER')!
      const smsBody    = `💛 ${pushBody} https://love-bank-app-pied.vercel.app`

      const twilioRes = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${btoa(`${accountSid}:${authToken}`)}`,
            'Content-Type':  'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ To: profile.phone_number, From: fromNumber, Body: smsBody }),
        },
      )
      const twilioData = await twilioRes.json()
      results.sms = twilioRes.ok ? { sent: true, sid: twilioData.sid } : { sent: false, error: twilioData.code }
    }

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('notify-partner error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
