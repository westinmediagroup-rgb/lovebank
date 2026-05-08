import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { GOAL_CATEGORIES, todayKey, weekStart } from '../../lib/goals'

const BUDDY = '#7C6FAC'
const BUDDY_P = '#F0EEFF'
const BUDDY_BORDER = '#C4B8E8'

export default function GoalManager() {
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [goals, setGoals] = useState([])
  const [checkins, setCheckins] = useState([])   // today's / this week's
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('list')        // list | add | pick-category | pick-suggestion | custom
  const [selectedCat, setSelectedCat] = useState(null)
  const [customTitle, setCustomTitle] = useState('')
  const [customPeriod, setCustomPeriod] = useState('daily')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { if (profile?.id) fetchData() }, [profile?.id])

  async function fetchData() {
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0)
    const wStart = weekStart()

    const [{ data: g }, { data: c }] = await Promise.all([
      supabase.from('goals').select('*, suggested_by_profile:profiles!goals_suggested_by_fkey(display_name)').eq('user_id', profile.id).eq('active', true).order('created_at', { ascending: false }),
      supabase.from('goal_checkins').select('goal_id, checked_at').eq('user_id', profile.id).gte('checked_at', wStart),
    ])

    setGoals(g ?? [])
    setCheckins(c ?? [])
    setLoading(false)
  }

  function isDoneToday(goal) {
    const today = todayKey()
    if (goal.period === 'daily') {
      return checkins.some(c => c.goal_id === goal.id && c.checked_at.startsWith(today))
    }
    // weekly: done at least target_count times this week
    const count = checkins.filter(c => c.goal_id === goal.id).length
    return count >= goal.target_count
  }

  async function checkIn(goal) {
    if (isDoneToday(goal)) return
    const { data, error: err } = await supabase.from('goal_checkins').insert({
      goal_id: goal.id,
      user_id: profile.id,
    }).select().single()
    if (!err && data) {
      setCheckins(prev => [...prev, data])
    }
  }

  async function archiveGoal(goal) {
    await supabase.from('goals').update({ active: false }).eq('id', goal.id)
    setGoals(prev => prev.filter(g => g.id !== goal.id))
  }

  async function addGoal(title, period, category) {
    if (!title.trim()) return
    setSaving(true)
    setError('')
    const { data, error: err } = await supabase.from('goals').insert({
      user_id:  profile.id,
      title:    title.trim(),
      category: category ?? 'custom',
      period:   period ?? 'daily',
    }).select().single()
    if (err) { setError(err.message); setSaving(false); return }
    setGoals(prev => [data, ...prev])
    setView('list')
    setCustomTitle('')
    setCustomPeriod('daily')
    setSelectedCat(null)
    setSaving(false)
  }

  const activeCount = goals.length
  const doneToday = goals.filter(isDoneToday).length

  // ── Views ───────────────────────────────────────────────────────────────

  if (view === 'pick-category') {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--cream)', paddingBottom: 40 }}>
        <div className="page-header">
          <button className="btn-back" onClick={() => setView('add')}>←</button>
          <p className="page-title">Choose a category</p>
          <div style={{ width: 32 }} />
        </div>
        <div className="screen-body">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {GOAL_CATEGORIES.map(cat => (
              <button
                key={cat.id}
                onClick={() => { setSelectedCat(cat); setView('pick-suggestion') }}
                style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px', width: '100%', textAlign: 'left', borderRadius: 14, cursor: 'pointer', background: 'var(--white)', border: '1px solid var(--line)', transition: 'all 0.15s' }}
              >
                <span style={{ fontSize: 28, flexShrink: 0 }}>{cat.emoji}</span>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', marginBottom: 2 }}>{cat.label}</p>
                  <p style={{ fontSize: 12, color: 'var(--muted)' }}>{cat.suggestions.length} ideas</p>
                </div>
                <span style={{ fontSize: 16, color: 'var(--muted)', opacity: 0.5 }}>›</span>
              </button>
            ))}
            <button
              onClick={() => setView('custom')}
              style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px', width: '100%', textAlign: 'left', borderRadius: 14, cursor: 'pointer', background: 'var(--white)', border: `1.5px dashed ${BUDDY_BORDER}` }}
            >
              <span style={{ fontSize: 28, flexShrink: 0 }}>✏️</span>
              <div>
                <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', marginBottom: 2 }}>Write my own</p>
                <p style={{ fontSize: 12, color: 'var(--muted)' }}>Something specific to you</p>
              </div>
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (view === 'pick-suggestion' && selectedCat) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--cream)', paddingBottom: 40 }}>
        <div className="page-header">
          <button className="btn-back" onClick={() => setView('pick-category')}>←</button>
          <p className="page-title">{selectedCat.emoji} {selectedCat.label}</p>
          <div style={{ width: 32 }} />
        </div>
        <div className="screen-body">
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16, lineHeight: 1.6 }}>
            Pick one to start. You can always add more later.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            {selectedCat.suggestions.map(s => (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button
                  onClick={() => addGoal(s, 'daily', selectedCat.id)}
                  disabled={saving}
                  style={{ flex: 1, textAlign: 'left', padding: '13px 16px', borderRadius: 12, background: 'var(--white)', border: '1px solid var(--line)', cursor: 'pointer', fontSize: 14, color: 'var(--ink)', lineHeight: 1.5 }}
                >
                  {s}
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={() => setView('custom')}
            style={{ width: '100%', padding: '12px', borderRadius: 100, background: 'transparent', border: `1px solid ${BUDDY_BORDER}`, fontSize: 13, color: BUDDY, cursor: 'pointer' }}
          >
            Write my own instead →
          </button>
        </div>
      </div>
    )
  }

  if (view === 'custom') {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--cream)', paddingBottom: 40 }}>
        <div className="page-header">
          <button className="btn-back" onClick={() => setView('pick-category')}>←</button>
          <p className="page-title">Your goal</p>
          <div style={{ width: 32 }} />
        </div>
        <div className="screen-body">
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20, lineHeight: 1.6 }}>
            Keep it specific and honest. The best goals describe a real behavior, not a feeling.
          </p>
          <label style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
            What's the goal?
          </label>
          <textarea
            className="input"
            value={customTitle}
            onChange={e => setCustomTitle(e.target.value)}
            placeholder="e.g. Text a friend I've been meaning to check on"
            rows={3}
            style={{ resize: 'none', marginBottom: 20, fontSize: 14 }}
          />
          <label style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 10 }}>
            How often?
          </label>
          <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
            {['daily', 'weekly'].map(p => (
              <button
                key={p}
                onClick={() => setCustomPeriod(p)}
                style={{ flex: 1, padding: '12px', borderRadius: 12, cursor: 'pointer', fontSize: 14, fontWeight: 500, border: customPeriod === p ? `1.5px solid ${BUDDY}` : '1px solid var(--line)', background: customPeriod === p ? BUDDY_P : 'var(--white)', color: customPeriod === p ? BUDDY : 'var(--ink)', transition: 'all 0.15s' }}
              >
                {p === 'daily' ? 'Every day' : 'Once a week'}
              </button>
            ))}
          </div>
          {error && (
            <div style={{ background: 'var(--red-p)', border: '0.5px solid var(--red)', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
              <p style={{ fontSize: 13, color: 'var(--red)' }}>⚠️ {error}</p>
            </div>
          )}
          <button
            className="btn-primary"
            onClick={() => addGoal(customTitle, customPeriod, selectedCat?.id ?? 'custom')}
            disabled={saving || !customTitle.trim()}
          >
            {saving ? 'Adding…' : 'Add this goal →'}
          </button>
        </div>
      </div>
    )
  }

  // ── Main list view ───────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: 'var(--cream)', paddingBottom: 40 }}>
      <div className="page-header">
        <button className="btn-back" onClick={() => navigate('/')}>←</button>
        <p className="page-title">Goals</p>
        <button
          onClick={() => setView('pick-category')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, padding: 4 }}
          aria-label="Add goal"
        >+</button>
      </div>

      <div className="screen-body">
        {/* Progress summary */}
        {activeCount > 0 && (
          <div style={{ background: 'var(--white)', border: '0.5px solid var(--line)', borderRadius: 14, padding: '16px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>Today</p>
              <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                {doneToday} of {activeCount} {activeCount === 1 ? 'goal' : 'goals'} done
              </p>
            </div>
            {/* Mini progress bar */}
            <div style={{ width: 100, height: 8, borderRadius: 100, background: 'var(--line)', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 100, background: doneToday === activeCount ? 'var(--teal)' : BUDDY, width: `${(doneToday / activeCount) * 100}%`, transition: 'width 0.4s ease' }} />
            </div>
          </div>
        )}

        {loading && (
          <p style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: '40px 0' }}>Loading…</p>
        )}

        {!loading && goals.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 20px' }}>
            <p style={{ fontSize: 32, marginBottom: 12 }}>🎯</p>
            <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)', marginBottom: 8 }}>No goals yet</p>
            <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.7, marginBottom: 24 }}>
              Goals are small commitments you make to yourself. Your buddy can see them and cheer you on.
            </p>
            <button
              className="btn-primary"
              onClick={() => setView('pick-category')}
              style={{ maxWidth: 240 }}
            >
              Add your first goal →
            </button>
          </div>
        )}

        {!loading && goals.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {goals.map(goal => {
              const done = isDoneToday(goal)
              const todayCount = checkins.filter(c => c.goal_id === goal.id).length
              const isSuggested = !!goal.suggested_by

              return (
                <div
                  key={goal.id}
                  style={{ background: 'var(--white)', border: done ? `1.5px solid ${BUDDY}` : '1px solid var(--line)', borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 14, transition: 'all 0.2s' }}
                >
                  {/* Check button */}
                  <button
                    onClick={() => checkIn(goal)}
                    disabled={done}
                    style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, border: done ? 'none' : `2px solid ${BUDDY_BORDER}`, background: done ? BUDDY : 'transparent', cursor: done ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, marginTop: 2, transition: 'all 0.2s' }}
                    aria-label={done ? 'Done' : 'Mark complete'}
                  >
                    {done && <span style={{ color: 'white', fontSize: 13 }}>✓</span>}
                  </button>

                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 14, fontWeight: 500, color: done ? 'var(--muted)' : 'var(--ink)', textDecoration: done ? 'line-through' : 'none', lineHeight: 1.4 }}>
                      {goal.title}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                        {goal.period === 'daily' ? 'Daily' : 'Weekly'}
                        {goal.period === 'weekly' && ` · ${todayCount}/${goal.target_count}`}
                      </span>
                      {isSuggested && goal.suggested_by_profile && (
                        <span style={{ fontSize: 10, background: BUDDY_P, color: BUDDY, padding: '2px 7px', borderRadius: 100, fontWeight: 500 }}>
                          From buddy
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Archive */}
                  <button
                    onClick={() => archiveGoal(goal)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 16, padding: '2px 4px', opacity: 0.5, flexShrink: 0 }}
                    aria-label="Remove goal"
                  >×</button>
                </div>
              )
            })}
          </div>
        )}

        {!loading && goals.length > 0 && (
          <button
            onClick={() => setView('pick-category')}
            style={{ width: '100%', padding: '14px', marginTop: 16, borderRadius: 14, background: 'transparent', border: `1.5px dashed ${BUDDY_BORDER}`, fontSize: 13, color: BUDDY, cursor: 'pointer', fontWeight: 500 }}
          >
            + Add another goal
          </button>
        )}
      </div>
    </div>
  )
}
