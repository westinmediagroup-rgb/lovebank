// Email notification sender — runs every 5 minutes
// Picks up unsent notifications and sends via Supabase Auth emails (or Resend)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const FROM_EMAIL     = 'Love Bank <noreply@lovebank.app>'

const TEMPLATES: Record<string, (payload: Record<string, string>) => { subject: string; html: string }> = {
  confirmation_request: (p) => ({
    subject: `${p.logger_name} logged a deposit — confirm it`,
    html: `<p><strong>${p.logger_name}</strong> logged a deposit for you: <em>${p.deposit_type?.replace(/_/g, ' ')}</em> worth <strong>+${p.final_value} tokens</strong>.</p><p>Open Love Bank to confirm, adjust, or flag it.</p>`,
  }),
  deposit_auto_confirmed: (p) => ({
    subject: `Your deposit was auto-confirmed · +${p.final_value} tokens`,
    html: `<p>Your deposit was auto-confirmed after 24 hours. <strong>+${p.final_value} tokens</strong> have been added to your balance.</p>`,
  }),
  deposit_flagged: (p) => ({
    subject: 'A deposit has been flagged',
    html: `<p>A deposit has been flagged for review. Both you and your partner have been notified. Open Love Bank to see what's happening.</p>`,
  }),
  nibble_warning: (_p) => ({
    subject: 'Nibble is circling 😈',
    html: `<p><strong>Nibble is here.</strong> Neither of you has made a deposit in 3+ days. He's draining your account. One deposit sends him packing.</p>`,
  }),
  nibble_repelled: (_p) => ({
    subject: 'Nibble has been repelled ✓',
    html: `<p>A deposit was logged and Nibble has left the building. Keep the streak alive.</p>`,
  }),
  partner_joined: (p) => ({
    subject: `${p.partner_name} has joined Love Bank`,
    html: `<p><strong>${p.partner_name}</strong> accepted your invite and completed their profile. Your couple score is now live — open Love Bank to see it.</p>`,
  }),
  weekly_balance_sheet: (p) => ({
    subject: `Your weekly Love Bank balance sheet`,
    html: `<p>Your week in review: <strong>${p.net_change >= '0' ? '+' : ''}${p.net_change} tokens</strong>. Couple score: <strong>${p.couple_score}</strong> (${p.health_state}).</p><p>Open Love Bank for the full breakdown.</p>`,
  }),
}

Deno.serve(async () => {
  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY not set' }), { status: 500 })
  }

  // Fetch unsent notifications with recipient email
  const { data: notifications } = await supabase
    .from('notification_queue')
    .select('*, recipient:recipient_id(id, display_name)')
    .eq('sent', false)
    .limit(50)

  if (!notifications?.length) {
    return new Response(JSON.stringify({ ok: true, sent: 0 }), { headers: { 'Content-Type': 'application/json' } })
  }

  // Get recipient emails from auth.users
  const recipientIds = [...new Set(notifications.map(n => n.recipient_id))]
  const emailMap: Record<string, string> = {}

  for (const id of recipientIds) {
    const { data: { user } } = await supabase.auth.admin.getUserById(id)
    if (user?.email) emailMap[id] = user.email
  }

  let sent = 0
  for (const notif of notifications) {
    const email = emailMap[notif.recipient_id]
    if (!email) continue

    const template = TEMPLATES[notif.type]
    if (!template) continue

    const { subject, html } = template(notif.payload ?? {})

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:    FROM_EMAIL,
        to:      [email],
        subject,
        html:    `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;">${html}<hr style="margin:24px 0;border:none;border-top:1px solid #e8e2d8;"><p style="font-size:12px;color:#8c8278;">Love Bank · Your relationship, invested daily</p></div>`,
      }),
    })

    if (res.ok) {
      await supabase.from('notification_queue').update({
        sent:    true,
        sent_at: new Date().toISOString(),
      }).eq('id', notif.id)
      sent++
    }
  }

  return new Response(JSON.stringify({ ok: true, sent }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
