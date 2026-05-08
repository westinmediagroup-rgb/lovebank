import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { GOAL_CATEGORIES, todayKey, weekStart } from '../../lib/goals'

const BUDDY = '#7C6FAC'
const BUDDY_P = '#F0EEFF'
const BUDDY_BORDER = '#C4B8E8'

export default function BuddyView() {
  const { buddyId } = useParams()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const messageEndRef = useRef(null)

  const [buddyProfile, setBuddyProfile] = useState(null)
  const [connection, setConnection] = useState(null)
  const [goals, setGoals] = useState([])
  const [checkins, setCheckins] = useState([])
  const [messages, setMessages] = useState([])
  const [messageText, setMessageText] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [showSuggestGoal, setShowSuggestGoal] = useState(false)
  const [suggestCat, setSuggestCat] = useState(null)
  const [suggestTitle, setSuggestTitle] = useState('')
  const [suggestSaving, setSuggestSaving] = useState(false)
  const [tab, setTab] = useState('goals')   // goals | messages

  useEffect(() => { if (profile?.id && buddyId) fetchAll() }, [profile?.id, buddyId])

  async function fetchAll() {
    const wStart = weekStart()

    const [
      { data: bp },
      { data: conn },
    ] = await Promise.all([
      supabase.from('profiles').select('id, display_name, relationship_mode, deposit_streak').eq('id', buddyId).single(),
      supabase.from('buddy_connections')
        .select('*')
        .or(`user_a_id.eq.${profile.id},user_b_id.eq.${profile.id}`)
        .eq('status', 'active')
        .single(),
    ])

    if (!bp || !conn) { navigate('/'); return }

    setBuddyProfile(bp)
    setConnection(conn)

    const [{ data: g }, { data: c }, { data: m }] = await Promise.all([
      supabase.from('goals').select('*').eq('user_id', buddyId).eq('active', true).order('created_at', { ascending: false }),
      supabase.from('goal_checkins').select('goal_id, checked_at').eq('user_id', buddyId).gte('checked_at', wStart),
      supabase.from('buddy_messages').select('*').eq('connection_id', conn.id).order('created_at', { ascending: true }).limit(50),
    ])

    setGoals(g ?? [])
    setCheckins(c ?? [])
    setMessages(m ?? [])
    setLoading(false)
  }

  function isDoneToday(goal) {
    const today = todayKey()
    if (goal.period === 'daily') {
      return checkins.some(c => c.goal_id === goal.id && c.checked_at.startsWith(today))
    }
    const count = checkins.filter(c => c.goal_id === goal.id).length
    return count >= goal.target_count
  }

  async function sendMessage() {
    if (!messageText.trim() || !connection) return
    setSending(true)
    const { data } = await supabase.from('buddy_messages').insert({
      connection_id: connection.id,
      sender_id:     profile.id,
      body:          messageText.trim(),
    }).select().single()

    if (data) {
      setMessages(prev => [...prev, data])
      setMessageText('')
      setTimeout(() => messageEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)

      // Notify buddy
      supabase.functions.invoke('notify-partner', {
        body: {
          recipient_id:      buddyId,
          sender_name:       profile.display_name,
          notification_type: 'buddy_message',
          extra:             {},
        },
      }).catch(() => {})
    }
    setSending(false)
  }

  async function suggestGoal() {
    if (!suggestTitle.trim()) return
    setSuggestSaving(true)
    await supabase.from('goals').insert({
      user_id:      buddyId,
      title:        suggestTitle.trim(),
      category:     suggestCat?.id ?? 'custom',
      period:       'daily',
      suggested_by: profile.id,
    })
    // Send a message about the suggestion
    if (connection) {
      await supabase.from('buddy_messages').insert({
        connection_id: connection.id,
        sender_id:     profile.id,
        body:          `💡 I suggested a goal for you: "${suggestTitle.trim()}"`,
      })
    }
    setShowSuggestGoal(false)
    setSuggestTitle('')
    setSuggestCat(null)
    setSuggestSaving(false)
    await fetchAll()
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--cream)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>Loading…</p>
      </div>
    )
  }

  const doneCount = goals.filter(isDoneToday).length
  const streak = buddyProfile?.deposit_streak ?? 0

  // ── Suggest goal sheet ──────────────────────────────────────────────────
  if (showSuggestGoal) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--cream)', paddingBottom: 40 }}>
        <div className="page-header">
          <button className="btn-back" onClick={() => setShowSuggestGoal(false)}>←</button>
          <p className="page-title">Suggest a goal</p>
          <div style={{ width: 32 }} />
        </div>
        <div className="screen-body">
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20, lineHeight: 1.6 }}>
            This will show up in {buddyProfile?.display_name}'s goals marked "From buddy." They decide whether to keep it.
          </p>

          {/* Category chips */}
          <label style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 10 }}>
            Category (optional)
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
            {GOAL_CATEGORIES.map(cat => (
              <button
                key={cat.id}
                onClick={() => setSuggestCat(suggestCat?.id === cat.id ? null : cat)}
                style={{ padding: '7px 14px', borderRadius: 100, border: suggestCat?.id === cat.id ? `1.5px solid ${BUDDY}` : '1px solid var(--line)', background: suggestCat?.id === cat.id ? BUDDY_P : 'var(--white)', color: suggestCat?.id === cat.id ? BUDDY : 'var(--ink)', fontSize: 13, cursor: 'pointer', transition: 'all 0.15s' }}
              >
                {cat.emoji} {cat.label}
              </button>
            ))}
          </div>

          <label style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
            The goal
          </label>
          <textarea
            className="input"
            value={suggestTitle}
            onChange={e => setSuggestTitle(e.target.value)}
            placeholder="e.g. Call your mom this week"
            rows={3}
            style={{ resize: 'none', marginBottom: 20, fontSize: 14 }}
          />

          <button
            className="btn-primary"
            onClick={suggestGoal}
            disabled={suggestSaving || !suggestTitle.trim()}
            style={{ background: BUDDY }}
          >
            {suggestSaving ? 'Sending…' : `Suggest this to ${buddyProfile?.display_name} →`}
          </button>
        </div>
      </div>
    )
  }

  // ── Main view ────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: 'var(--cream)', paddingBottom: 40 }}>
      <div className="page-header">
        <button className="btn-back" onClick={() => navigate('/')}>←</button>
        <p className="page-title">{buddyProfile?.display_name}</p>
        <div style={{ width: 32 }} />
      </div>

      <div className="screen-body">
        {/* Buddy status card */}
        <div style={{ background: BUDDY_P, border: `1px solid ${BUDDY_BORDER}`, borderRadius: 16, padding: '16px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 600, color: BUDDY }}>
              {buddyProfile?.display_name}
            </p>
            <p style={{ fontSize: 12, color: BUDDY, opacity: 0.8, marginTop: 3 }}>
              {streak >= 2 ? `${streak}-day streak 🔥` : 'Getting started'}
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 28, fontWeight: 700, color: BUDDY, fontFamily: 'var(--font-serif)' }}>{doneCount}</p>
            <p style={{ fontSize: 11, color: BUDDY, opacity: 0.7 }}>of {goals.length} today</p>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 20, background: 'var(--white)', borderRadius: 12, padding: 4, border: '0.5px solid var(--line)' }}>
          {[['goals', 'Goals'], ['messages', 'Messages']].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', fontSize: 13, fontWeight: tab === id ? 600 : 400, background: tab === id ? BUDDY_P : 'transparent', color: tab === id ? BUDDY : 'var(--muted)', cursor: 'pointer', transition: 'all 0.15s' }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Goals tab */}
        {tab === 'goals' && (
          <div>
            {goals.length === 0 && (
              <div style={{ textAlign: 'center', padding: '32px 0' }}>
                <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.7 }}>
                  {buddyProfile?.display_name} hasn't added any goals yet.
                  {'\n'}You can suggest one.
                </p>
              </div>
            )}

            {goals.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                {goals.map(goal => {
                  const done = isDoneToday(goal)
                  return (
                    <div
                      key={goal.id}
                      style={{ background: 'var(--white)', border: done ? `1.5px solid ${BUDDY}` : '1px solid var(--line)', borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14 }}
                    >
                      <div style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0, border: done ? 'none' : `2px solid ${BUDDY_BORDER}`, background: done ? BUDDY : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>
                        {done && <span style={{ color: 'white' }}>✓</span>}
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 14, fontWeight: 500, color: done ? 'var(--muted)' : 'var(--ink)', textDecoration: done ? 'line-through' : 'none' }}>
                          {goal.title}
                        </p>
                        <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
                          {goal.period === 'daily' ? 'Daily' : 'Weekly'} · {done ? 'Done today ✓' : 'Not yet'}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <button
              onClick={() => setShowSuggestGoal(true)}
              style={{ width: '100%', padding: '13px', borderRadius: 14, background: 'transparent', border: `1.5px dashed ${BUDDY_BORDER}`, fontSize: 13, color: BUDDY, cursor: 'pointer', fontWeight: 500 }}
            >
              💡 Suggest a goal for {buddyProfile?.display_name}
            </button>
          </div>
        )}

        {/* Messages tab */}
        {tab === 'messages' && (
          <div>
            {messages.length === 0 && (
              <div style={{ textAlign: 'center', padding: '24px 0 16px' }}>
                <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.7 }}>
                  No messages yet. Send a little encouragement.
                </p>
              </div>
            )}

            {/* Message list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16, maxHeight: 340, overflowY: 'auto' }}>
              {messages.map(msg => {
                const isMine = msg.sender_id === profile.id
                return (
                  <div
                    key={msg.id}
                    style={{ display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start' }}
                  >
                    <div style={{ maxWidth: '78%', padding: '10px 14px', borderRadius: isMine ? '14px 14px 4px 14px' : '14px 14px 14px 4px', background: isMine ? BUDDY : 'var(--white)', border: isMine ? 'none' : '0.5px solid var(--line)' }}>
                      <p style={{ fontSize: 13, color: isMine ? 'white' : 'var(--ink)', lineHeight: 1.5 }}>{msg.body}</p>
                      <p style={{ fontSize: 10, color: isMine ? 'rgba(255,255,255,0.6)' : 'var(--muted)', marginTop: 4 }}>
                        {new Date(msg.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                )
              })}
              <div ref={messageEndRef} />
            </div>

            {/* Message input */}
            <div style={{ display: 'flex', gap: 10 }}>
              <input
                className="input"
                value={messageText}
                onChange={e => setMessageText(e.target.value)}
                placeholder="Send encouragement…"
                style={{ flex: 1, marginBottom: 0 }}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                maxLength={300}
              />
              <button
                onClick={sendMessage}
                disabled={sending || !messageText.trim()}
                style={{ padding: '12px 16px', borderRadius: 12, background: BUDDY, color: 'white', border: 'none', cursor: 'pointer', fontSize: 16, opacity: messageText.trim() ? 1 : 0.4, transition: 'opacity 0.15s' }}
                aria-label="Send"
              >
                ↑
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
