import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { WITHDRAWAL_COSTS, WITHDRAWAL_LABELS } from '../../lib/scoring'

const WITHDRAWAL_TYPES = [
  { id:'going_quiet',              icon:'🔇', hint:'Shutting down, going silent' },
  { id:'cancelled_plans',          icon:'📵', hint:'Cancellations chip away at trust' },
  { id:'phone_during_connection',  icon:'📱', hint:'What you give attention to is what you value' },
  { id:'dismissal',                icon:'🙄', hint:'Dismissal lands hardest when they were being vulnerable' },
  { id:'avoidance',                icon:'🚪', hint:'Avoiding something real that needs to be said' },
  { id:'stonewalling',             icon:'🧱', hint:'Different from needing space — this is disappearing' },
  { id:'false_agreement',          icon:'😶', hint:'Said yes but didn\'t mean it' },
  { id:'broken_promise',           icon:'💔', hint:'Something you said you\'d do that happened again' },
  { id:'chronic_criticism',        icon:'⚡', hint:'Criticism as a pattern, not a one-off' },
  { id:'unilateral_decision',      icon:'🎭', hint:'Made a decision that affects both of you alone' },
  { id:'no_repair_after_conflict', icon:'🌊', hint:'The conflict passed but the rupture didn\'t' },
]

// Warm clay instead of harsh red — acknowledges gravity without amplifying distress
const CLAY = 'var(--clay)'
const CLAY_P = 'var(--clay-p)'
const CLAY_BORDER = 'var(--clay-border)'

export default function LogWithdrawal() {
  const { profile, couple, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [wType, setWType]     = useState('')
  const [note, setNote]       = useState('')
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')

  const isSolo  = profile?.relationship_mode === 'solo'
  const partner = couple?.partner_a_id === profile?.id ? couple?.partner_b : couple?.partner_a

  // Solo users don't have withdrawals — redirect to dashboard
  useEffect(() => {
    if (isSolo) navigate('/', { replace: true })
  }, [isSolo])
  const cost    = wType ? (WITHDRAWAL_COSTS[wType] ?? 10) : null

  async function handleSubmit() {
    if (!wType) return
    setSaving(true)
    setError('')

    try {
      const repairWindowEnds = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

      const { data: withdrawal, error: wErr } = await supabase.from('withdrawals').insert({
        couple_id:             couple.id,
        logger_id:             profile.id,
        withdrawal_type:       wType,
        cost:                  WITHDRAWAL_COSTS[wType],
        note:                  note || null,
        repair_window_ends_at: repairWindowEnds,
      }).select().single()

      if (wErr) throw new Error(wErr.message)

      const newScore = Math.max((profile.current_score ?? 0) - WITHDRAWAL_COSTS[wType], 10)
      await supabase.from('profiles').update({ current_score: newScore }).eq('id', profile.id)

      await supabase.from('activity_log').insert({
        couple_id:   couple.id,
        actor_id:    profile.id,
        event_type:  'withdrawal_logged',
        ref_id:      withdrawal.id,
        token_delta: -WITHDRAWAL_COSTS[wType],
        description: `${WITHDRAWAL_LABELS[wType]} · repair window open`,
      })

      await refreshProfile()
      navigate(`/repair/${withdrawal.id}?new=1`)
    } catch (err) {
      setError(err.message ?? 'Something went wrong. Please try again.')
      setSaving(false)
    }
  }

  return (
    <div style={{ minHeight:'100vh', background:'var(--cream)', paddingBottom:40 }}>
      <div className="page-header">
        <button className="btn-back" onClick={() => navigate('/')}>←</button>
        <p className="page-title">Log a withdrawal</p>
        <div style={{ width:32 }} />
      </div>

      <div className="screen-body">
        {/* Framing — non-punitive */}
        <div style={{ background:'var(--white)', border:'0.5px solid var(--line)', borderRadius:12, padding:'14px 16px', marginBottom:20 }}>
          <p style={{ fontSize:13, color:'var(--ink2)', lineHeight:1.7 }}>
            Honest logging builds a real picture of your account.
            You have <strong>24 hours</strong> to repair and recover half the tokens back.
          </p>
        </div>

        <span className="section-label">What happened?</span>
        <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:24 }}>
          {WITHDRAWAL_TYPES.map(wt => (
            <button
              type="button"
              key={wt.id}
              onClick={() => setWType(wt.id)}
              style={{
                display:'flex', alignItems:'center', gap:12, padding:'12px 14px',
                borderRadius:12, cursor:'pointer', width:'100%', textAlign:'left',
                border: wType === wt.id ? `1.5px solid ${CLAY}` : '1px solid var(--line)',
                background: wType === wt.id ? CLAY_P : 'var(--white)',
                transition:'all 0.15s',
              }}
            >
              <span style={{ fontSize:18, flexShrink:0 }}>{wt.icon}</span>
              <div style={{ flex:1 }}>
                <p style={{ fontSize:13, fontWeight:500, color:'var(--ink)' }}>{WITHDRAWAL_LABELS[wt.id]}</p>
                <p style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>{wt.hint}</p>
              </div>
              <p style={{ fontSize:13, fontWeight:600, color: wType === wt.id ? CLAY : 'var(--muted)', flexShrink:0 }}>
                −{WITHDRAWAL_COSTS[wt.id]}
              </p>
            </button>
          ))}
        </div>

        {cost && (
          <div style={{ background:CLAY_P, border:`0.5px solid ${CLAY_BORDER}`, borderRadius:12, padding:'14px 16px', marginBottom:20 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <p style={{ fontSize:12, color:CLAY, fontWeight:500 }}>Token cost</p>
                <p style={{ fontSize:11, color:CLAY, marginTop:2, opacity:0.85 }}>
                  Repair within 24h → {Math.round(cost * 0.5)} tokens returned
                </p>
              </div>
              <p style={{ fontFamily:'var(--font-serif)', fontSize:34, color:CLAY }}>−{cost}</p>
            </div>
          </div>
        )}

        <span className="section-label">Note (optional)</span>
        <textarea
          className="input"
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="What actually happened? This helps the repair flow…"
          rows={3}
          style={{ resize:'none', marginBottom:20 }}
        />

        {error && (
          <div style={{ background:'var(--red-p)', border:'0.5px solid var(--red)', borderRadius:10, padding:'10px 14px', marginBottom:16 }}>
            <p style={{ fontSize:13, color:'var(--red)' }}>⚠️ {error}</p>
          </div>
        )}

        <button
          className="btn-primary"
          onClick={handleSubmit}
          disabled={!wType || saving}
          style={{ background: wType ? CLAY : undefined, marginBottom:10 }}
        >
          {saving ? 'Logging…' : 'Log withdrawal → repair now'}
        </button>
        <button className="btn-outline" onClick={() => navigate('/')}>Cancel</button>
      </div>
    </div>
  )
}
