import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'

const BUDDY = '#7C6FAC'
const BUDDY_P = '#F0EEFF'
const BUDDY_BORDER = '#C4B8E8'

export default function BuddyAccept() {
  const { token } = useParams()
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [connection, setConnection] = useState(null)
  const [inviter, setInviter] = useState(null)
  const [status, setStatus] = useState('loading')   // loading | ready | self | already | accepted | error
  const [accepting, setAccepting] = useState(false)

  useEffect(() => {
    if (profile?.id && token) fetchInvite()
  }, [profile?.id, token])

  async function fetchInvite() {
    const { data, error } = await supabase
      .from('buddy_connections')
      .select('*, inviter:profiles!buddy_connections_user_a_id_fkey(id, display_name, relationship_mode)')
      .eq('token', token)
      .eq('status', 'pending')
      .single()

    if (error || !data) { setStatus('error'); return }

    // Can't accept your own invite
    if (data.user_a_id === profile.id) { setStatus('self'); return }

    // Check if already buddied with someone
    const { data: existing } = await supabase
      .from('buddy_connections')
      .select('id')
      .or(`user_a_id.eq.${profile.id},user_b_id.eq.${profile.id}`)
      .eq('status', 'active')
      .limit(1)
      .single()

    if (existing) { setStatus('already'); return }

    setConnection(data)
    setInviter(data.inviter)
    setStatus('ready')
  }

  async function accept() {
    if (!connection) return
    setAccepting(true)

    const { error } = await supabase
      .from('buddy_connections')
      .update({
        user_b_id:   profile.id,
        status:      'active',
        accepted_at: new Date().toISOString(),
      })
      .eq('id', connection.id)

    if (error) { setStatus('error'); setAccepting(false); return }

    // Notify the inviter
    supabase.functions.invoke('notify-partner', {
      body: {
        recipient_id:      connection.user_a_id,
        sender_name:       profile.display_name,
        notification_type: 'buddy_accepted',
        extra:             {},
      },
    }).catch(() => {})

    setStatus('accepted')
    setAccepting(false)
  }

  // ── States ──────────────────────────────────────────────────────────────

  if (status === 'loading') {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--cream)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>Checking invite…</p>
      </div>
    )
  }

  if (status === 'accepted') {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--cream)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 24px' }}>
        <p style={{ fontSize: 48, marginBottom: 16 }}>🤝</p>
        <p style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)', marginBottom: 10, textAlign: 'center' }}>
          You're buddied up with {inviter?.display_name}
        </p>
        <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.7, textAlign: 'center', marginBottom: 32 }}>
          You can see each other's goals. Keep each other honest.
        </p>
        <button
          className="btn-primary"
          onClick={() => navigate('/')}
          style={{ background: BUDDY, maxWidth: 280 }}
        >
          Go to my dashboard →
        </button>
      </div>
    )
  }

  if (status === 'self') {
    return (
      <InviteState
        emoji="😅"
        title="That's your own invite"
        body="You can't be your own buddy. Share this link with someone else."
        cta="Go home"
        onCta={() => navigate('/')}
      />
    )
  }

  if (status === 'already') {
    return (
      <InviteState
        emoji="🤝"
        title="You already have a buddy"
        body="You can only have one buddy at a time. Remove your current buddy first if you want to connect with someone new."
        cta="Go home"
        onCta={() => navigate('/')}
      />
    )
  }

  if (status === 'error') {
    return (
      <InviteState
        emoji="🔗"
        title="This link isn't valid"
        body="The invite may have already been used or expired. Ask your buddy to send a new one."
        cta="Go home"
        onCta={() => navigate('/')}
      />
    )
  }

  // ── Ready to accept ──────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: 'var(--cream)', paddingBottom: 40 }}>
      <div className="page-header">
        <button className="btn-back" onClick={() => navigate('/')}>←</button>
        <p className="page-title">Buddy invite</p>
        <div style={{ width: 32 }} />
      </div>
      <div className="screen-body">
        {/* Inviter card */}
        <div style={{ background: BUDDY_P, border: `1px solid ${BUDDY_BORDER}`, borderRadius: 16, padding: '24px 20px', marginBottom: 24, textAlign: 'center' }}>
          <p style={{ fontSize: 40, marginBottom: 12 }}>🤝</p>
          <p style={{ fontSize: 18, fontWeight: 700, color: BUDDY, marginBottom: 6 }}>
            {inviter?.display_name} wants to be your buddy
          </p>
          <p style={{ fontSize: 13, color: BUDDY, opacity: 0.8, lineHeight: 1.7 }}>
            You'll be able to see each other's goals and check-ins. A little accountability goes a long way.
          </p>
        </div>

        {/* What you're agreeing to */}
        <div style={{ background: 'var(--white)', border: '0.5px solid var(--line)', borderRadius: 14, padding: '16px 18px', marginBottom: 24 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 12 }}>What this means</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              `${inviter?.display_name} can see your active goals`,
              `${inviter?.display_name} can see when you check in`,
              'You can send each other short encouragement notes',
              'Either of you can end the connection anytime',
            ].map(item => (
              <div key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{ fontSize: 12, color: 'var(--teal)', fontWeight: 700, flexShrink: 0, marginTop: 2 }}>✓</span>
                <p style={{ fontSize: 13, color: 'var(--ink2)', lineHeight: 1.5 }}>{item}</p>
              </div>
            ))}
          </div>
        </div>

        <button
          className="btn-primary"
          onClick={accept}
          disabled={accepting}
          style={{ background: BUDDY, marginBottom: 12 }}
        >
          {accepting ? 'Connecting…' : `Accept — buddy up with ${inviter?.display_name} →`}
        </button>
        <button
          onClick={() => navigate('/')}
          style={{ width: '100%', padding: '12px', borderRadius: 100, background: 'transparent', border: 'none', fontSize: 13, color: 'var(--muted)', cursor: 'pointer' }}
        >
          No thanks
        </button>
      </div>
    </div>
  )
}

function InviteState({ emoji, title, body, cta, onCta }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--cream)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 32px', textAlign: 'center' }}>
      <p style={{ fontSize: 48, marginBottom: 16 }}>{emoji}</p>
      <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', marginBottom: 10 }}>{title}</p>
      <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.7, marginBottom: 32 }}>{body}</p>
      <button className="btn-primary" onClick={onCta} style={{ maxWidth: 240 }}>{cta}</button>
    </div>
  )
}
