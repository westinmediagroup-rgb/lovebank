import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { getSoloHealthState, SOLO_DEPOSIT_LABELS, SOLO_SELF_DEPOSIT_TYPES, SOLO_SOCIAL_DEPOSIT_TYPES } from '../../lib/scoring'
import { ACCOUNTANTS, getAccountantMessage } from '../../lib/accountants'
import { todayKey, weekStart } from '../../lib/goals'
import NavBtn from '../../components/NavBtn'
import MessagePrompt from '../../components/MessagePrompt'

const BUDDY = 'var(--buddy)'
const BUDDY_P = 'var(--buddy-p)'
const BUDDY_BORDER = 'var(--buddy-border)'

/* ─── Vault icons ──────────────────────────────────────────────── */
const SELF_ICONS   = ['✨', '🌱', '💎', '🕊️', '🧘', '📝', '❤️']
const SOCIAL_ICONS = ['💛', '🤝', '🌟', '☮️', '💫', '🌸']

/* ─── Daily vault component ─────────────────────────────────────── */

function DailyVault({ todayDeposits, totalTypes, category }) {
  const isAmber = category === 'self'

  // Count unique deposit types done today in this category
  const unique = new Set(
    todayDeposits
      .filter(d => d.deposit_category === category)
      .map(d => d.deposit_type)
  )
  const count  = unique.size
  const fill   = Math.min(count / totalTypes, 1)
  const isFull = fill >= 1
  const icons  = isAmber ? SELF_ICONS : SOCIAL_ICONS

  if (count === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '12px 0 4px' }}>
        <div style={{
          width: 110, height: 140,
          borderRadius: 22,
          border: '1.5px solid var(--line)',
          background: 'rgba(255,255,255,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <p style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', lineHeight: 1.6, padding: '0 10px' }}>
            Empty — start filling your vault
          </p>
        </div>
        <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>0 / {totalTypes} today</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '12px 0 4px' }}>
      {/* Glass container */}
      <div
        style={{
          position: 'relative',
          width: 110, height: 140,
          borderRadius: 22,
          border: isFull
            ? `2px solid ${isAmber ? 'var(--amber)' : 'var(--teal)'}`
            : '1.5px solid rgba(255,255,255,0.7)',
          background: 'rgba(255,255,255,0.25)',
          backdropFilter: 'blur(8px)',
          overflow: 'hidden',
          animation: isFull ? 'celebrate 0.6s ease' : undefined,
          boxShadow: isFull
            ? `0 0 20px ${isAmber ? 'rgba(212,130,30,0.3)' : 'rgba(26,122,96,0.3)'}`
            : '0 2px 12px rgba(0,0,0,0.06)',
        }}
      >
        {/* Rising fill */}
        <div style={{
          position: 'absolute',
          bottom: 0, left: 0, right: 0,
          height: `${fill * 100}%`,
          background: isAmber
            ? 'linear-gradient(to top, rgba(212,130,30,0.35), rgba(240,168,74,0.15))'
            : 'linear-gradient(to top, rgba(26,122,96,0.35), rgba(26,122,96,0.1))',
          transition: 'height 1s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }} />

        {/* Floating icons */}
        {Array.from({ length: count }).map((_, i) => (
          <FloatingIcon
            key={i}
            icon={icons[i % icons.length]}
            index={i}
            total={count}
            containerHeight={140}
          />
        ))}
      </div>

      {/* Count label */}
      <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
        {count} / {totalTypes} today
        {isFull && <span style={{ color: isAmber ? 'var(--amber)' : 'var(--teal)', fontWeight: 600 }}> · Full! 🎉</span>}
      </p>
    </div>
  )
}

function FloatingIcon({ icon, index, total, containerHeight }) {
  // Arrange icons in a rough grid inside the container
  const cols = total <= 3 ? total : Math.min(3, total)
  const col  = index % cols
  const row  = Math.floor(index / cols)

  const left   = 14 + (col * (80 / Math.max(cols - 1, 1)))
  const bottom = 12 + (row * 38)

  const duration   = 1.8 + (index * 0.35)
  const delay      = index * 0.18
  const fontSize   = total <= 3 ? 26 : total <= 6 ? 22 : 18

  return (
    <div
      style={{
        position: 'absolute',
        left: `${Math.min(left, 72)}%`,
        bottom: Math.min(bottom, containerHeight - 30),
        fontSize,
        animation: `vaultFloat ${duration}s ease-in-out ${delay}s infinite alternate, vaultPopIn 0.5s ease ${delay}s both`,
        userSelect: 'none',
        pointerEvents: 'none',
      }}
    >
      {icon}
    </div>
  )
}

/* ─── Main dashboard ─────────────────────────────────────────── */

export default function SoloDashboard() {
  const { profile } = useAuth()
  const navigate    = useNavigate()

  const [recentDeposits, setRecentDeposits] = useState([])
  const [todayDeposits,  setTodayDeposits]  = useState([])
  const [goals,          setGoals]          = useState([])
  const [goalCheckins,   setGoalCheckins]   = useState([])
  const [buddyConn,      setBuddyConn]      = useState(null)
  const [buddyProfile,   setBuddyProfile]   = useState(null)
  const [loading, setLoading]               = useState(true)

  const selfTotal   = Object.keys(SOLO_SELF_DEPOSIT_TYPES).length    // 7
  const socialTotal = Object.keys(SOLO_SOCIAL_DEPOSIT_TYPES).length  // 6

  useEffect(() => {
    if (!profile?.id) return
    fetchData()
  }, [profile?.id])

  async function fetchData() {
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    const wStart = weekStart()

    const [{ data: recent }, { data: today }, { data: g }, { data: gc }, { data: conn }] = await Promise.all([
      supabase
        .from('deposits')
        .select('*')
        .eq('logger_id', profile.id)
        .is('couple_id', null)
        .order('created_at', { ascending: false })
        .limit(8),
      supabase
        .from('deposits')
        .select('deposit_type, deposit_category, created_at')
        .eq('logger_id', profile.id)
        .is('couple_id', null)
        .gte('created_at', startOfDay.toISOString()),
      supabase.from('goals').select('*').eq('user_id', profile.id).eq('active', true).order('created_at', { ascending: false }).limit(5),
      supabase.from('goal_checkins').select('goal_id, checked_at').eq('user_id', profile.id).gte('checked_at', wStart),
      supabase.from('buddy_connections').select('*').or(`user_a_id.eq.${profile.id},user_b_id.eq.${profile.id}`).eq('status', 'active').limit(1).single(),
    ])

    setRecentDeposits(recent ?? [])
    setTodayDeposits(today ?? [])
    setGoals(g ?? [])
    setGoalCheckins(gc ?? [])

    if (conn) {
      setBuddyConn(conn)
      const buddyId = conn.user_a_id === profile.id ? conn.user_b_id : conn.user_a_id
      const { data: bp } = await supabase.from('profiles').select('id, display_name, deposit_streak').eq('id', buddyId).single()
      setBuddyProfile(bp)
    }

    setLoading(false)
  }

  function isGoalDoneToday(goal) {
    const today = todayKey()
    if (goal.period === 'daily') {
      return goalCheckins.some(c => c.goal_id === goal.id && c.checked_at.startsWith(today))
    }
    return goalCheckins.filter(c => c.goal_id === goal.id).length >= goal.target_count
  }

  async function quickCheckIn(goal) {
    if (isGoalDoneToday(goal)) return
    const { data } = await supabase.from('goal_checkins').insert({ goal_id: goal.id, user_id: profile.id }).select().single()
    if (data) setGoalCheckins(prev => [...prev, data])
  }

  const score       = profile?.current_score ?? 0
  const state       = getSoloHealthState(score)
  const streak      = profile?.deposit_streak ?? 0
  const hasActivity = recentDeposits.length > 0
  const accountant  = ACCOUNTANTS.find(a => a.id === profile?.accountant) ?? ACCOUNTANTS[0]

  const accountantMsg = getAccountantMessage(profile?.accountant ?? 'fox', {
    state, nibbleActive: false, streak, hasActivity, partnerPronouns: null,
  })

  const selfDeposits   = recentDeposits.filter(d => d.deposit_category === 'self')
  const socialDeposits = recentDeposits.filter(d => d.deposit_category === 'social')

  const STATE_COLOR = {
    Thriving:  'var(--teal)',
    Balanced:  'var(--teal)',
    Growing:   'var(--amber)',
    Drifting:  'var(--amber)',
    Struggling:'var(--red)',
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--cream)', paddingBottom: 100 }}>

      {/* Header */}
      <div style={{ padding: '20px 20px 0' }}>
        <p style={{ fontFamily: 'var(--font-serif)', fontSize: 16, color: 'var(--amber)' }}>Love Bank</p>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
          Good {timeOfDay()}, {profile?.display_name}
        </p>
      </div>

      <div style={{ padding: '16px 20px' }}>

        {/* Personal score card */}
        <div style={{ background: 'var(--white)', border: '0.5px solid var(--line)', borderRadius: 16, padding: '24px 20px', marginBottom: 12, textAlign: 'center' }}>
          <p style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
            Your balance
          </p>
          <p style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(40px,16vw,64px)', fontWeight: 700, color: 'var(--ink)', lineHeight: 1 }}>
            {score}
          </p>
          <p style={{ fontSize: 14, color: STATE_COLOR[state] ?? 'var(--muted)', fontWeight: 500, marginTop: 8 }}>
            {state}
          </p>
          {streak >= 2 && (
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
              {streak}-day streak
            </p>
          )}
        </div>

        {/* Accountant message */}
        <div style={{ background: 'var(--white)', border: '0.5px solid var(--line)', borderRadius: 14, padding: '14px 16px', marginBottom: 20 }}>
          <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>
            {accountant.emoji} {accountant.name}
          </p>
          <p style={{ fontSize: 13, color: 'var(--ink2)', lineHeight: 1.7, fontStyle: 'italic' }}>
            "{accountantMsg}"
          </p>
        </div>

        {/* Affirmation prompt */}
        <MessagePrompt partnerId={null} partnerName={null} coupleId={null} dark={false} />

        {/* ── Goals ── */}
        {!loading && goals.length > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <p style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Today's goals</p>
              <button onClick={() => navigate('/goals')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: BUDDY }}>Manage →</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
              {goals.map(goal => {
                const done = isGoalDoneToday(goal)
                return (
                  <div
                    key={goal.id}
                    style={{ background: 'var(--white)', border: done ? `1.5px solid ${BUDDY}` : '1px solid var(--line)', borderRadius: 12, padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 12, transition: 'all 0.2s' }}
                  >
                    <button
                      onClick={() => quickCheckIn(goal)}
                      disabled={done}
                      style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0, border: done ? 'none' : `2px solid ${BUDDY_BORDER}`, background: done ? BUDDY : 'transparent', cursor: done ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, transition: 'all 0.2s' }}
                      aria-label={done ? 'Done' : 'Mark complete'}
                    >
                      {done && <span style={{ color: 'white', fontSize: 11 }}>✓</span>}
                    </button>
                    <p style={{ fontSize: 13, fontWeight: 500, color: done ? 'var(--muted)' : 'var(--ink)', textDecoration: done ? 'line-through' : 'none', flex: 1 }}>{goal.title}</p>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {!loading && goals.length === 0 && (
          <button
            onClick={() => navigate('/goals')}
            style={{ width: '100%', padding: '13px 16px', borderRadius: 14, background: 'transparent', border: `1.5px dashed ${BUDDY_BORDER}`, marginBottom: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
          >
            <span style={{ fontSize: 18 }}>🎯</span>
            <div style={{ textAlign: 'left' }}>
              <p style={{ fontSize: 13, fontWeight: 500, color: BUDDY }}>Set a daily goal</p>
              <p style={{ fontSize: 11, color: 'var(--muted)' }}>Small commitments you actually keep</p>
            </div>
          </button>
        )}

        {/* ── Buddy card ── */}
        {!loading && (
          <div style={{ marginBottom: 20 }}>
            {buddyConn && buddyProfile ? (
              <div
                onClick={() => navigate(`/buddy/${buddyProfile.id}`)}
                style={{ background: BUDDY_P, border: `1px solid ${BUDDY_BORDER}`, borderRadius: 14, padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: BUDDY }}>🤝 {buddyProfile.display_name}</p>
                  <p style={{ fontSize: 11, color: BUDDY, opacity: 0.8, marginTop: 2 }}>
                    {(buddyProfile.deposit_streak ?? 0) >= 2
                      ? `${buddyProfile.deposit_streak}-day streak`
                      : 'Your buddy'}
                  </p>
                </div>
                <span style={{ fontSize: 14, color: BUDDY, opacity: 0.5 }}>›</span>
              </div>
            ) : (
              <button
                onClick={() => navigate('/buddy/invite')}
                style={{ width: '100%', padding: '13px 16px', borderRadius: 14, background: 'transparent', border: `1.5px dashed ${BUDDY_BORDER}`, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
              >
                <span style={{ fontSize: 18 }}>🤝</span>
                <div style={{ textAlign: 'left' }}>
                  <p style={{ fontSize: 13, fontWeight: 500, color: BUDDY }}>Invite a buddy</p>
                  <p style={{ fontSize: 11, color: 'var(--muted)' }}>Someone to keep you accountable</p>
                </div>
              </button>
            )}
          </div>
        )}

        {/* ── Self account ── */}
        <p style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
          Your self account
        </p>

        <div style={{ background: 'var(--white)', border: '0.5px solid var(--line)', borderRadius: 14, padding: '16px', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Invest in yourself</p>
              <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 14 }}>
                Journaling, therapy, self-care, setting boundaries — deposits for you.
              </p>
              <button
                onClick={() => navigate('/solo-deposit?category=self')}
                style={{ width: '100%', padding: '11px', borderRadius: 10, background: 'var(--ink)', color: 'var(--white)', border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
              >
                + Self deposit
              </button>
            </div>

            {/* Vault */}
            {!loading && (
              <DailyVault
                todayDeposits={todayDeposits}
                totalTypes={selfTotal}
                category="self"
              />
            )}
          </div>
        </div>

        {!loading && selfDeposits.length > 0 && (
          <div style={{ marginBottom: 4 }}>
            {selfDeposits.slice(0, 3).map(d => <SoloDepRow key={d.id} deposit={d} />)}
          </div>
        )}

        {/* ── Social account ── */}
        <p style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '20px 0 10px' }}>
          Your social account
        </p>

        <div style={{ background: 'var(--white)', border: '0.5px solid var(--line)', borderRadius: 14, padding: '16px', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Show up for others</p>
              <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 14 }}>
                Family, friends, coworkers, dates — how you invest in the people around you.
              </p>
              <button
                onClick={() => navigate('/solo-deposit?category=social')}
                style={{ width: '100%', padding: '11px', borderRadius: 10, background: 'var(--teal)', color: 'var(--white)', border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
              >
                + Social deposit
              </button>
            </div>

            {/* Vault */}
            {!loading && (
              <DailyVault
                todayDeposits={todayDeposits}
                totalTypes={socialTotal}
                category="social"
              />
            )}
          </div>
        </div>

        {!loading && socialDeposits.length > 0 && (
          <div style={{ marginBottom: 4 }}>
            {socialDeposits.slice(0, 3).map(d => <SoloDepRow key={d.id} deposit={d} />)}
          </div>
        )}

        {!loading && recentDeposits.length === 0 && (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.7 }}>
              No deposits yet. Start small — even a check-in with yourself counts.
            </p>
          </div>
        )}
      </div>

      {/* Bottom nav */}
      <nav
        aria-label="Main navigation"
        style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 430, background: 'rgba(250,246,239,0.96)', backdropFilter: 'blur(16px)', borderTop: '0.5px solid var(--line)', display: 'flex', padding: '10px 0 28px', zIndex: 50 }}
      >
        <NavBtn icon="home"     label="Home"     active onClick={() => {}} />
        <NavBtn icon="deposit"  label="Deposit"  onClick={() => navigate('/solo-deposit')} />
        <NavBtn icon="games"    label="Games"    onClick={() => navigate('/games')} />
        <NavBtn icon="history"  label="History"  onClick={() => navigate('/activity')} />
        <NavBtn icon="settings" label="Settings" onClick={() => navigate('/settings')} />
      </nav>
    </div>
  )
}

/* ─── Sub-components ─────────────────────────────────────────── */

function SoloDepRow({ deposit }) {
  const label  = SOLO_DEPOSIT_LABELS[deposit.deposit_type] ?? deposit.deposit_type.replace(/_/g, ' ')
  const isSelf = deposit.deposit_category === 'self'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '0.5px solid var(--line)' }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: isSelf ? 'var(--amber)' : 'var(--teal)' }} />
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: 13, fontWeight: 500 }}>{label}</p>
        <p style={{ fontSize: 11, color: 'var(--muted)' }}>
          {isSelf ? 'Self' : 'Social'} · {fmtDate(deposit.created_at)}
        </p>
      </div>
      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--teal)' }}>+{deposit.final_value}</p>
    </div>
  )
}

function timeOfDay() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
