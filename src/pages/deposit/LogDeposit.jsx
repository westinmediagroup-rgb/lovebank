import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { DEPOSIT_BASE_VALUES, DEPOSIT_LABELS, EFFORT_MULTIPLIERS, calcDepositValue } from '../../lib/scoring'

const DEPOSIT_TYPES = [
  { id:'quick_text',         icon:'💬', ll:'words', desc:'Text, DM, or kind words' },
  { id:'voice_note',         icon:'🎤', ll:'words', desc:'A voice message or call' },
  { id:'written_note',       icon:'✉️', ll:'words', desc:'Letter, card, or journal entry' },
  { id:'act_of_service',     icon:'🛠', ll:'acts',  desc:'Did something without being asked' },
  { id:'surprise_gesture',   icon:'🎁', ll:'gifts', desc:'Gift, treat, or thoughtful surprise' },
  { id:'planned_experience', icon:'🗓', ll:'time',  desc:'Date, outing, or quality time' },
  { id:'hard_conversation',  icon:'💪', ll:'time',  desc:'Brought up something difficult' },
  { id:'public_affirmation', icon:'📣', ll:'words', desc:'Praised them publicly or to others' },
  { id:'milestone_written',  icon:'📝', ll:'words', desc:'Marked a significant moment in writing' },
]

const EFFORT_TIERS = [
  { id:'quick',     label:'Quick',     hint:'5 min or less',       mult:1.0,  emoji:'⚡' },
  { id:'planned',   label:'Planned',   hint:'You thought about it', mult:1.2,  emoji:'🗓' },
  { id:'brave',     label:'Brave',     hint:'Cost you something',   mult:1.5,  emoji:'💪' },
  { id:'milestone', label:'Milestone', hint:'Defining moment',      mult:1.8,  emoji:'🏆' },
]

const LL_NAMES = { words:'words of affirmation', time:'quality time', touch:'physical touch', acts:'acts of service', gifts:'gift giving' }

export default function LogDeposit() {
  const { profile, couple, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [depositType, setDepositType]   = useState('')
  const [effortTier, setEffortTier]     = useState('quick')
  const [note, setNote]                 = useState('')
  const [saving, setSaving]             = useState(false)
  const [error, setError]               = useState('')
  const [sheetOpen, setSheetOpen]       = useState(false)

  const partner    = couple?.partner_a_id === profile?.id ? couple?.partner_b : couple?.partner_a
  const partnerLL  = partner?.love_language
  const preview    = depositType ? calcDepositValue(depositType, effortTier, partnerLL) : null
  const selectedDT = DEPOSIT_TYPES.find(d => d.id === depositType)

  function openSheet(id) {
    setDepositType(id)
    setEffortTier('quick')
    setError('')
    setSheetOpen(true)
  }

  function closeSheet() {
    setSheetOpen(false)
  }

  async function handleSubmit() {
    if (!depositType) return
    setSaving(true)
    setError('')

    try {
      const { base, ll_multiplier, effort_multiplier, final } = calcDepositValue(depositType, effortTier, partnerLL)
      const llMatch        = ll_multiplier > 1.0
      const isT3           = effortTier === 'brave' || effortTier === 'milestone'
      const autoConfirmAt  = isT3 ? null : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

      const { data: deposit, error: dErr } = await supabase.from('deposits').insert({
        couple_id:         couple.id,
        logger_id:         profile.id,
        receiver_id:       partner.id,
        deposit_type:      depositType,
        love_language_tag: selectedDT?.ll ?? null,
        effort_tier:       effortTier,
        ll_match:          llMatch,
        base_value:        base,
        ll_multiplier,
        effort_multiplier,
        final_value:       final,
        note:              note || null,
        auto_confirm_at:   autoConfirmAt,
      }).select().single()

      if (dErr) throw new Error(dErr.message)

      await supabase.from('activity_log').insert({
        couple_id:   couple.id,
        actor_id:    profile.id,
        event_type:  'deposit_logged',
        ref_id:      deposit.id,
        token_delta: final,
        description: `${DEPOSIT_LABELS[depositType]} · pending confirmation`,
      })

      await supabase.from('notification_queue').insert({
        recipient_id: partner.id,
        type:         'confirmation_request',
        payload: { deposit_id: deposit.id, logger_name: profile.display_name, deposit_type: depositType, final_value: final },
      })

      // Push + email to partner requesting confirmation
      supabase.functions.invoke('notify-partner', {
        body: {
          recipient_id:      partner.id,
          sender_name:       profile.display_name,
          notification_type: 'deposit_confirmation',
          extra:             { deposit_id: deposit.id },
        },
      }).catch(() => {})

      await supabase.from('profiles').update({
        last_deposit_at: new Date().toISOString(),
        deposit_streak:  (profile.deposit_streak ?? 0) + 1,
      }).eq('id', profile.id)

      await refreshProfile()
      navigate('/')
    } catch (err) {
      setError(err.message ?? 'Something went wrong. Please try again.')
      setSaving(false)
    }
  }

  return (
    <div style={{ minHeight:'100vh', background:'var(--cream)', paddingBottom:40 }}>
      <div className="page-header">
        <button className="btn-back" onClick={() => navigate('/')}>←</button>
        <p className="page-title">Log a deposit</p>
        <div style={{ width:32 }} />
      </div>

      <div className="screen-body">
        <p style={{ fontSize:13, color:'var(--muted)', marginBottom:6, lineHeight:1.6 }}>
          What did you do for {partner?.display_name}?
        </p>
        {partnerLL && (
          <div style={{ display:'inline-flex', alignItems:'center', gap:6, background:'var(--teal-p)', borderRadius:100, padding:'4px 12px', marginBottom:20 }}>
            <span style={{ fontSize:11, color:'var(--teal)', fontWeight:500 }}>
              💡 {LL_NAMES[partnerLL] ?? partnerLL} = 1.5× tokens
            </span>
          </div>
        )}

        <span className="section-label">What did you do?</span>
        <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:24 }}>
          {DEPOSIT_TYPES.map(dt => {
            const isLLMatch  = dt.ll === partnerLL
            const isSelected = depositType === dt.id
            return (
              <button
                type="button"
                key={dt.id}
                onClick={() => openSheet(dt.id)}
                style={{
                  display:'flex', alignItems:'center', gap:12, padding:'12px 14px',
                  borderRadius:12, cursor:'pointer', width:'100%', textAlign:'left',
                  border: isSelected ? '1.5px solid var(--amber)' : '1px solid var(--line)',
                  background: isSelected ? 'var(--amber-p)' : 'var(--white)',
                  transition:'all 0.15s',
                }}
              >
                <span style={{ fontSize:22, flexShrink:0 }}>{dt.icon}</span>
                <div style={{ flex:1 }}>
                  <p style={{ fontSize:13, fontWeight:500, color:'var(--ink)' }}>{DEPOSIT_LABELS[dt.id]}</p>
                  <p style={{ fontSize:11, color:'var(--muted)', marginTop:1 }}>{dt.desc}</p>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
                  {isLLMatch && (
                    <span style={{ fontSize:10, background:'var(--teal-p)', color:'var(--teal)', padding:'2px 7px', borderRadius:100, fontWeight:600 }}>
                      LL ×1.5
                    </span>
                  )}
                  <span style={{ fontSize:11, color:'var(--muted)' }}>{DEPOSIT_BASE_VALUES[dt.id]} pts</span>
                  <span style={{ fontSize:14, color:'var(--muted)', opacity:0.4 }}>›</span>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Effort + Submit Bottom Sheet ── */}
      {sheetOpen && (
        <div style={{ position:'fixed', inset:0, zIndex:200, display:'flex', flexDirection:'column', justifyContent:'flex-end' }}>
          {/* Backdrop */}
          <div
            onClick={closeSheet}
            style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.45)', backdropFilter:'blur(2px)' }}
          />

          {/* Sheet */}
          <div style={{
            position:'relative', zIndex:1, background:'var(--white)',
            borderRadius:'22px 22px 0 0', padding:'8px 0 40px',
            maxWidth:430, width:'100%', margin:'0 auto',
            boxShadow:'0 -4px 40px rgba(0,0,0,0.18)',
          }}>
            {/* Drag handle */}
            <div style={{ width:36, height:4, borderRadius:2, background:'var(--line)', margin:'12px auto 0' }} />

            <div style={{ padding:'16px 20px 0' }}>
              {/* Selected type header */}
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20, padding:'12px 14px', background:'var(--cream)', borderRadius:12 }}>
                <span style={{ fontSize:24 }}>{selectedDT?.icon}</span>
                <div>
                  <p style={{ fontSize:14, fontWeight:600, color:'var(--ink)' }}>{DEPOSIT_LABELS[depositType]}</p>
                  <p style={{ fontSize:11, color:'var(--muted)' }}>{selectedDT?.desc}</p>
                </div>
              </div>

              {/* Effort tiers */}
              <p style={{ fontSize:11, color:'var(--muted)', letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:10 }}>How much effort?</p>
              <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:18 }}>
                {EFFORT_TIERS.map(et => {
                  const pts = preview ? calcDepositValue(depositType, et.id, partnerLL).final : null
                  return (
                    <button
                      type="button"
                      key={et.id}
                      onClick={() => setEffortTier(et.id)}
                      style={{
                        display:'flex', alignItems:'center', gap:12, padding:'11px 14px',
                        borderRadius:12, cursor:'pointer', width:'100%', textAlign:'left',
                        border: effortTier === et.id ? '1.5px solid var(--amber)' : '1px solid var(--line)',
                        background: effortTier === et.id ? 'var(--amber-p)' : 'var(--cream)',
                        transition:'all 0.15s',
                      }}
                    >
                      <span style={{ fontSize:18, flexShrink:0 }}>{et.emoji}</span>
                      <div style={{ flex:1 }}>
                        <p style={{ fontSize:13, fontWeight:500, color:'var(--ink)' }}>{et.label}</p>
                        <p style={{ fontSize:11, color:'var(--muted)', marginTop:1 }}>{et.hint}</p>
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:4, flexShrink:0 }}>
                        {pts && (
                          <span style={{ fontSize:13, fontWeight:700, color: effortTier === et.id ? 'var(--teal)' : 'var(--muted)' }}>
                            +{pts}
                          </span>
                        )}
                        <span style={{ fontSize:10, color:'var(--muted)', opacity:0.6 }}>×{et.mult}</span>
                      </div>
                    </button>
                  )
                })}
              </div>

              {/* Token preview */}
              {preview && (
                <div style={{ background:'var(--teal-p)', borderRadius:12, padding:'12px 14px', marginBottom:16, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div>
                    <p style={{ fontSize:12, color:'var(--teal)', fontWeight:500 }}>Token value</p>
                    <p style={{ fontSize:11, color:'var(--teal)', opacity:0.8, marginTop:2 }}>
                      {preview.base} base × {preview.ll_multiplier}× LL × {preview.effort_multiplier}× effort
                    </p>
                    <p style={{ fontSize:11, color:'var(--teal)', opacity:0.7, marginTop:2 }}>
                      Confirmed by {partner?.display_name} or auto in 24h
                    </p>
                  </div>
                  <p style={{ fontFamily:'var(--font-serif)', fontSize:34, color:'var(--teal)', marginLeft:12 }}>+{preview.final}</p>
                </div>
              )}

              {/* Note */}
              <textarea
                className="input"
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Add context (optional) — what actually happened?"
                rows={2}
                style={{ resize:'none', marginBottom:14, fontSize:13 }}
              />

              {error && (
                <div style={{ background:'var(--red-p)', border:'0.5px solid var(--red)', borderRadius:10, padding:'10px 14px', marginBottom:14 }}>
                  <p style={{ fontSize:13, color:'var(--red)' }}>⚠️ {error}</p>
                </div>
              )}

              <button className="btn-primary" onClick={handleSubmit} disabled={saving} style={{ marginBottom:10 }}>
                {saving ? 'Logging…' : `Log deposit · +${preview?.final ?? '—'} pts →`}
              </button>
              <button
                onClick={closeSheet}
                style={{ width:'100%', padding:'12px', borderRadius:100, background:'transparent', border:'none', fontSize:13, color:'var(--muted)', cursor:'pointer' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
