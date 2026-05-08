import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'

const BUDDY = '#7C6FAC'
const BUDDY_P = '#F0EEFF'
const BUDDY_BORDER = '#C4B8E8'

const APP_URL = 'https://love-bank-app-pied.vercel.app'

export default function BuddyInvite() {
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [connection, setConnection] = useState(null)  // existing active connection
  const [inviteToken, setInviteToken] = useState(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [creating, setCreating] = useState(false)

  useEffect(() => { if (profile?.id) fetchConnection() }, [profile?.id])

  async function fetchConnection() {
    // Look for any active or pending connection
    const { data } = await supabase
      .from('buddy_connections')
      .select('*, buddy:profiles!buddy_connections_user_b_id_fkey(display_name, relationship_mode)')
      .or(`user_a_id.eq.${profile.id},user_b_id.eq.${profile.id}`)
      .in('status', ['active', 'pending'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (data) {
      if (data.status === 'active') {
        setConnection(data)
      } else if (data.status === 'pending' && data.user_a_id === profile.id) {
        setInviteToken(data.token)
      }
    }
    setLoading(false)
  }

  async function createInvite() {
    setCreating(true)
    const { data, error } = await supabase
      .from('buddy_connections')
      .insert({ user_a_id: profile.id })
      .select()
      .single()

    if (!error && data) setInviteToken(data.token)
    setCreating(false)
  }

  function inviteLink() {
    return `${APP_URL}/buddy/accept/${inviteToken}`
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(inviteLink())
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      setCopied(false)
    }
  }

  async function disconnectBuddy() {
    if (!connection) return
    await supabase.from('buddy_connections').update({ status: 'paused' }).eq('id', connection.id)
    setConnection(null)
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--cream)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>Loading…</p>
      </div>
    )
  }

  // ── Already have an active buddy ─────────────────────────────────────────
  if (connection) {
    const buddy = connection.buddy
    const isUserA = connection.user_a_id === profile.id
    const buddyName = buddy?.display_name ?? 'Your buddy'
    const buddyId = isUserA ? connection.user_b_id : connection.user_a_id

    return (
      <div style={{ minHeight: '100vh', background: 'var(--cream)', paddingBottom: 40 }}>
        <div className="page-header">
          <button className="btn-back" onClick={() => navigate('/')}>←</button>
          <p className="page-title">Buddy</p>
          <div style={{ width: 32 }} />
        </div>
        <div className="screen-body">
          {/* Active buddy card */}
          <div style={{ background: BUDDY_P, border: `1px solid ${BUDDY_BORDER}`, borderRadius: 16, padding: '20px 18px', marginBottom: 20, textAlign: 'center' }}>
            <p style={{ fontSize: 32, marginBottom: 8 }}>🤝</p>
            <p style={{ fontSize: 16, fontWeight: 600, color: BUDDY, marginBottom: 4 }}>Buddied up with {buddyName}</p>
            <p style={{ fontSize: 13, color: BUDDY, opacity: 0.8, lineHeight: 1.6 }}>
              You can see each other's goals and send encouragement.
            </p>
          </div>

          <button
            className="btn-primary"
            onClick={() => navigate(`/buddy/${buddyId}`)}
            style={{ marginBottom: 12 }}
          >
            See {buddyName}'s progress →
          </button>

          <button
            onClick={disconnectBuddy}
            style={{ width: '100%', padding: '12px', borderRadius: 100, background: 'transparent', border: 'none', fontSize: 13, color: 'var(--muted)', cursor: 'pointer' }}
          >
            Remove buddy
          </button>
        </div>
      </div>
    )
  }

  // ── Invite link exists ───────────────────────────────────────────────────
  if (inviteToken) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--cream)', paddingBottom: 40 }}>
        <div className="page-header">
          <button className="btn-back" onClick={() => navigate('/')}>←</button>
          <p className="page-title">Invite a buddy</p>
          <div style={{ width: 32 }} />
        </div>
        <div className="screen-body">
          <div style={{ background: BUDDY_P, border: `1px solid ${BUDDY_BORDER}`, borderRadius: 16, padding: '20px 18px', marginBottom: 20 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: BUDDY, marginBottom: 6 }}>Your invite link is ready</p>
            <p style={{ fontSize: 12, color: BUDDY, opacity: 0.8, lineHeight: 1.6, marginBottom: 16 }}>
              Share this with one person. When they accept, you'll be connected as buddies.
            </p>
            {/* Link preview */}
            <div style={{ background: 'rgba(124,111,172,0.12)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, wordBreak: 'break-all' }}>
              <p style={{ fontSize: 11, color: BUDDY, fontFamily: 'monospace', lineHeight: 1.6 }}>{inviteLink()}</p>
            </div>
            <button
              onClick={copyLink}
              style={{ width: '100%', padding: '13px', borderRadius: 100, background: BUDDY, color: 'white', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
            >
              {copied ? '✓ Copied!' : 'Copy link'}
            </button>
          </div>

          <div style={{ background: 'var(--white)', border: '0.5px solid var(--line)', borderRadius: 14, padding: '16px 18px' }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 8 }}>What your buddy can see</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                ['✓', 'Your active goals'],
                ['✓', 'Which goals you checked in today'],
                ['✓', 'Your streak count'],
                ['✗', 'Your deposits or score details'],
                ['✗', 'Your private notes'],
              ].map(([icon, text]) => (
                <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 12, color: icon === '✓' ? 'var(--teal)' : 'var(--muted)', fontWeight: 700, flexShrink: 0 }}>{icon}</span>
                  <p style={{ fontSize: 13, color: icon === '✓' ? 'var(--ink2)' : 'var(--muted)' }}>{text}</p>
                </div>
              ))}
            </div>
          </div>

          <p style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', marginTop: 16, lineHeight: 1.6 }}>
            Waiting for them to accept. Once they do, you'll both be connected.
          </p>
        </div>
      </div>
    )
  }

  // ── No connection yet ────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: 'var(--cream)', paddingBottom: 40 }}>
      <div className="page-header">
        <button className="btn-back" onClick={() => navigate('/')}>←</button>
        <p className="page-title">Buddy system</p>
        <div style={{ width: 32 }} />
      </div>
      <div className="screen-body">
        <div style={{ textAlign: 'center', padding: '12px 0 32px' }}>
          <p style={{ fontSize: 48, marginBottom: 16 }}>🤝</p>
          <p style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)', marginBottom: 10 }}>Invite a buddy</p>
          <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.7 }}>
            A buddy is someone who keeps you honest — a friend, family member, or anyone you trust to show up for you.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 32 }}>
          {[
            { icon: '👀', label: 'They see your goals', desc: "Not your score or private deposits — just what you're working on." },
            { icon: '💬', label: 'You can message each other', desc: 'Short encouragement notes when it matters.' },
            { icon: '🎯', label: 'They can suggest goals', desc: 'If they know what you need better than you do.' },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '14px 16px', background: 'var(--white)', borderRadius: 14, border: '1px solid var(--line)' }}>
              <span style={{ fontSize: 22, flexShrink: 0, marginTop: 2 }}>{item.icon}</span>
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: 3 }}>{item.label}</p>
                <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>{item.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <button
          className="btn-primary"
          onClick={createInvite}
          disabled={creating}
          style={{ background: BUDDY }}
        >
          {creating ? 'Creating link…' : 'Generate invite link →'}
        </button>
      </div>
    </div>
  )
}
