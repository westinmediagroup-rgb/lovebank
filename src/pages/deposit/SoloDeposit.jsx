import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import {
  SOLO_SELF_DEPOSIT_TYPES,
  SOLO_SOCIAL_DEPOSIT_TYPES,
  SOLO_DEPOSIT_LABELS,
} from '../../lib/scoring'

/* ── Cooldown: 24 hrs per deposit type ────────────────────────── */

function isCoolingDown(lastUsedIso) {
  if (!lastUsedIso) return false
  return (Date.now() - new Date(lastUsedIso)) < 24 * 60 * 60 * 1000
}

function lastUsedLabel(lastUsedIso) {
  if (!lastUsedIso) return null
  const d = new Date(lastUsedIso)
  const diff = Date.now() - d
  if (diff < 60000)    return 'Used just now'
  if (diff < 3600000)  return `Used ${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return 'Used today'
  if (diff < 172800000) return 'Used yesterday'
  return `Last: ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
}

/* ── Component ────────────────────────────────────────────────── */

export default function SoloDeposit() {
  const { profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [category, setCategory]         = useState(searchParams.get('category') || 'self')
  const [selectedType, setSelectedType] = useState('')
  const [saving, setSaving]             = useState(false)
  const [done, setDone]                 = useState(false)
  const [earned, setEarned]             = useState(0)
  const [error, setError]               = useState('')

  // Map: deposit_type → ISO string of last use (or undefined)
  const [lastUsedMap, setLastUsedMap]   = useState({})
  const [loadingCooldowns, setLoadingCooldowns] = useState(true)

  const depositMap = category === 'self' ? SOLO_SELF_DEPOSIT_TYPES : SOLO_SOCIAL_DEPOSIT_TYPES

  /* ── Fetch last-used dates for all types ── */
  useEffect(() => {
    if (!profile?.id) return
    async function fetchLastUsed() {
      setLoadingCooldowns(true)
      // Get all solo deposits, one per type (most recent)
      const { data } = await supabase
        .from('deposits')
        .select('deposit_type, created_at')
        .eq('logger_id', profile.id)
        .is('couple_id', null)
        .order('created_at', { ascending: false })

      const map = {}
      for (const d of (data ?? [])) {
        if (!map[d.deposit_type]) map[d.deposit_type] = d.created_at
      }
      setLastUsedMap(map)
      setLoadingCooldowns(false)
    }
    fetchLastUsed()
  }, [profile?.id])

  function switchCategory(cat) {
    setCategory(cat)
    setSelectedType('')
    setError('')
  }

  async function handleSubmit() {
    if (!selectedType) return
    if (isCoolingDown(lastUsedMap[selectedType])) return
    setSaving(true)
    setError('')

    const points = depositMap[selectedType]

    const { error: depErr } = await supabase.from('deposits').insert({
      logger_id:         profile.id,
      receiver_id:       profile.id,
      couple_id:         null,
      deposit_type:      selectedType,
      deposit_category:  category,
      effort_tier:       'quick',
      base_value:        points,
      ll_multiplier:     1.0,
      effort_multiplier: 1.0,
      final_value:       points,
      tokens_applied:    true,
      status:            'confirmed',
    })

    if (depErr) {
      setError(depErr.message)
      setSaving(false)
      return
    }

    await supabase
      .from('profiles')
      .update({ current_score: (profile.current_score ?? 0) + points })
      .eq('id', profile.id)

    await refreshProfile()
    setEarned(points)
    setDone(true)
    setSaving(false)
  }

  /* ── Done state ── */
  if (done) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--cream)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 28px', maxWidth: 430, margin: '0 auto' }}>
        <p style={{ fontSize: 48, marginBottom: 16 }}>{category === 'self' ? '✨' : '💛'}</p>
        <p style={{ fontFamily: 'var(--font-serif)', fontSize: 32, fontWeight: 700, marginBottom: 8, textAlign: 'center' }}>
          +{earned} points
        </p>
        <p style={{ fontSize: 14, color: 'var(--muted)', textAlign: 'center', lineHeight: 1.7, marginBottom: 32 }}>
          {SOLO_DEPOSIT_LABELS[selectedType]} logged.{' '}
          {category === 'self'
            ? 'Taking care of yourself is the foundation of everything else.'
            : "The people in your life feel this, even when they don't say it."}
        </p>
        <button className="btn-primary" onClick={() => navigate('/')}>
          Back to dashboard
        </button>
        <button
          onClick={() => { setDone(false); setSelectedType('') }}
          style={{ marginTop: 14, background: 'none', border: 'none', fontSize: 13, color: 'var(--muted)', cursor: 'pointer' }}
        >
          Log another
        </button>
      </div>
    )
  }

  /* ── Main form ── */
  return (
    <div style={{ minHeight: '100vh', background: 'var(--cream)', paddingBottom: 80 }}>

      {/* Header */}
      <div className="page-header">
        <button className="btn-back" onClick={() => navigate('/')} aria-label="Back">←</button>
        <p className="page-title">Log a deposit</p>
        <div style={{ width: 32 }} />
      </div>

      <div style={{ padding: '16px 20px' }}>

        {/* Category tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
          {[['self', '✨ Self'], ['social', '💛 Social']].map(([id, label]) => (
            <button
              key={id}
              onClick={() => switchCategory(id)}
              style={{
                flex: 1, padding: '11px', borderRadius: 12, fontSize: 13, fontWeight: 500, cursor: 'pointer',
                border: category === id ? 'none' : '1px solid var(--line)',
                background: category === id ? 'var(--ink)' : 'var(--white)',
                color: category === id ? 'var(--white)' : 'var(--muted)',
                transition: 'all 0.15s',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Context copy */}
        <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, color: 'var(--ink)' }}>
          {category === 'self' ? 'What did you do for yourself?' : 'How did you show up for others?'}
        </p>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20, lineHeight: 1.6 }}>
          {category === 'self'
            ? 'Investments in your wellbeing, self-awareness, and growth.'
            : 'Deposits into family, friends, coworkers, or the people you\'re dating.'}
        </p>

        {/* Cooldown note */}
        <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12, lineHeight: 1.5 }}>
          Each deposit type can be logged once every 24 hours.
        </p>

        {/* Deposit type options */}
        {Object.entries(depositMap).map(([id, points]) => {
          const cooldown  = isCoolingDown(lastUsedMap[id])
          const usedLabel = lastUsedLabel(lastUsedMap[id])
          const isSelected = selectedType === id && !cooldown

          return (
            <button
              key={id}
              onClick={() => !cooldown && setSelectedType(id)}
              disabled={cooldown || loadingCooldowns}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                width: '100%', textAlign: 'left',
                padding: '13px 16px', borderRadius: 12, marginBottom: 8,
                cursor: cooldown ? 'not-allowed' : 'pointer',
                border: isSelected
                  ? '1.5px solid var(--amber)'
                  : '1px solid var(--line)',
                background: isSelected
                  ? 'var(--amber-p)'
                  : cooldown
                    ? 'var(--cream)'
                    : 'var(--white)',
                opacity: cooldown ? 0.6 : 1,
                transition: 'all 0.15s',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 500, color: cooldown ? 'var(--muted)' : 'var(--ink)' }}>
                  {SOLO_DEPOSIT_LABELS[id]}
                </p>
                {usedLabel && (
                  <p style={{ fontSize: 11, color: cooldown ? 'var(--amber)' : 'var(--muted)', marginTop: 2 }}>
                    {cooldown ? '🕐 Available tomorrow' : usedLabel}
                  </p>
                )}
              </div>
              <p style={{
                fontSize: 13, fontWeight: 600,
                color: cooldown ? 'var(--muted)' : 'var(--teal)',
                flexShrink: 0, marginLeft: 12,
              }}>
                +{points}
              </p>
            </button>
          )
        })}

        {error && (
          <p style={{ fontSize: 13, color: 'var(--red)', background: 'var(--red-p)', padding: '10px 14px', borderRadius: 8, marginTop: 8 }}>
            {error}
          </p>
        )}

        <button
          className="btn-primary"
          onClick={handleSubmit}
          disabled={!selectedType || saving || isCoolingDown(lastUsedMap[selectedType])}
          style={{ marginTop: 24 }}
        >
          {saving ? 'Logging…' : 'Log deposit →'}
        </button>
      </div>
    </div>
  )
}
