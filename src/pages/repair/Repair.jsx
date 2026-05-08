import { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { WITHDRAWAL_LABELS } from '../../lib/scoring'

const REPAIR_TYPES = [
  { id:'apology_action',    icon:'🤝', label:'Apology + action',      hint:'Said sorry and did something about it' },
  { id:'hard_conversation', icon:'💬', label:'Had the hard conversation', hint:'You both talked it through' },
  { id:'written_note',      icon:'✉️', label:'Written note or message', hint:'Put it in words they could read' },
]

export default function Repair() {
  const { withdrawalId } = useParams()
  const [searchParams] = useSearchParams()
  const isNew = searchParams.get('new') === '1'
  const { profile, couple, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [withdrawal, setWithdrawal] = useState(null)
  const [repairType, setRepairType] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => { fetchWithdrawal() }, [withdrawalId])

  async function fetchWithdrawal() {
    const { data } = await supabase
      .from('withdrawals')
      .select('*')
      .eq('id', withdrawalId)
      .single()
    setWithdrawal(data)
  }

  const withinWindow = withdrawal
    ? new Date(withdrawal.repair_window_ends_at) > new Date()
    : false

  const tokensBack = withdrawal ? Math.round(withdrawal.cost * 0.5) : 0

  async function handleRepair() {
    if (!repairType || !withdrawal) return
    setSaving(true)

    const { data: repair, error } = await supabase.from('repairs').insert({
      withdrawal_id:  withdrawalId,
      couple_id:      couple.id,
      logger_id:      profile.id,
      repair_type:    repairType,
      tokens_returned: withinWindow ? tokensBack : 0,
      note:           note || null,
      within_window:  withinWindow,
    }).select().single()

    if (error) { setSaving(false); return }

    // Mark withdrawal as repaired
    await supabase.from('withdrawals').update({
      repaired:  true,
      repair_id: repair.id,
    }).eq('id', withdrawalId)

    // Return tokens if within window
    if (withinWindow) {
      const newScore = (profile.current_score ?? 0) + tokensBack
      await supabase.from('profiles').update({ current_score: newScore }).eq('id', profile.id)

      await supabase.from('activity_log').insert({
        couple_id:   couple.id,
        actor_id:    profile.id,
        event_type:  'repair_logged',
        ref_id:      repair.id,
        token_delta: tokensBack,
        description: `Repair: ${REPAIR_TYPES.find(r => r.id === repairType)?.label} · +${tokensBack} tokens returned`,
      })
    }

    await refreshProfile()
    setDone(true)
    setSaving(false)
  }

  if (done) return (
    <div style={{ minHeight:'100vh', background:'var(--cream)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'0 24px', textAlign:'center' }}>
      <p style={{ fontSize:40, marginBottom:16 }}>🌱</p>
      <p style={{ fontFamily:'var(--font-serif)', fontSize:28, marginBottom:12 }}>Repair logged.</p>
      {withinWindow ? (
        <p style={{ fontSize:14, color:'var(--muted)', lineHeight:1.7, marginBottom:24 }}>
          +{tokensBack} tokens returned to your account. Repairs within 24 hours recover half the cost.
        </p>
      ) : (
        <p style={{ fontSize:14, color:'var(--muted)', lineHeight:1.7, marginBottom:24 }}>
          The 24-hour window passed, so tokens won't come back this time. But logging it still counts — it shows you're paying attention. That's what repair actually is.
        </p>
      )}
      <button className="btn-primary" onClick={() => navigate('/')}>Back to dashboard</button>
    </div>
  )

  return (
    <div style={{ minHeight:'100vh', background:'var(--cream)', paddingBottom:40 }}>
      <div className="page-header">
        <button className="btn-back" onClick={() => navigate('/')}>←</button>
        <p className="page-title">Repair</p>
        <div style={{ width:32 }} />
      </div>

      <div className="screen-body">
        {isNew && (
          <div style={{ background:'var(--amber-p)', borderRadius:12, padding:'14px 16px', marginBottom:20 }}>
            <p style={{ fontSize:13, fontWeight:500, color:'var(--amber)', marginBottom:4 }}>Withdrawal logged.</p>
            <p style={{ fontSize:13, color:'var(--ink2)', lineHeight:1.6 }}>
              You have 24 hours to repair and recover {tokensBack} tokens.
              {withdrawal && ` Window closes ${formatTime(withdrawal?.repair_window_ends_at)}.`}
            </p>
          </div>
        )}

        {withdrawal && (
          <div style={{ background:'var(--red-p)', borderRadius:12, padding:'14px 16px', marginBottom:20 }}>
            <p style={{ fontSize:12, color:'var(--red)', fontWeight:500 }}>
              {WITHDRAWAL_LABELS[withdrawal.withdrawal_type]} · −{withdrawal.cost} tokens
            </p>
            {!withinWindow && (
              <p style={{ fontSize:12, color:'var(--red)', marginTop:4, opacity:0.8 }}>
                Repair window closed — tokens won't be returned, but logging still matters.
              </p>
            )}
          </div>
        )}

        <p style={{ fontFamily:'var(--font-serif)', fontSize:22, marginBottom:6 }}>How did you repair?</p>
        <p style={{ fontSize:13, color:'var(--muted)', marginBottom:20, lineHeight:1.6 }}>
          Half of the withdrawal cost comes back when a genuine repair is logged within 24 hours.
        </p>

        <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:24 }}>
          {REPAIR_TYPES.map(rt => (
            <button
              type="button"
              key={rt.id}
              onClick={() => setRepairType(rt.id)}
              style={{
                display:'flex', alignItems:'center', gap:14, padding:'14px 16px',
                borderRadius:12, cursor:'pointer', width:'100%', textAlign:'left',
                border: repairType === rt.id ? '1.5px solid var(--teal)' : '1px solid var(--line)',
                background: repairType === rt.id ? 'var(--teal-p)' : 'var(--white)',
                transition:'all 0.15s',
              }}
            >
              <span style={{ fontSize:24, flexShrink:0 }}>{rt.icon}</span>
              <div>
                <p style={{ fontSize:14, fontWeight:500 }}>{rt.label}</p>
                <p style={{ fontSize:12, color:'var(--muted)', marginTop:2 }}>{rt.hint}</p>
              </div>
            </button>
          ))}
        </div>

        <span className="section-label">Note (optional)</span>
        <textarea
          className="input"
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="What did you do? What changed?"
          rows={3}
          style={{ resize:'none', marginBottom:20 }}
        />

        <button
          className="btn-primary"
          onClick={handleRepair}
          disabled={!repairType || saving}
          style={{ background:'var(--teal)' }}
        >
          {saving ? 'Logging repair…' : `Log repair${withinWindow ? ` · +${tokensBack} tokens` : ''}`}
        </button>

        <button
          className="btn-outline"
          onClick={() => navigate('/')}
          style={{ marginTop:10 }}
        >
          I'll come back to this
        </button>
      </div>
    </div>
  )
}

function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString('en-US', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' })
}
