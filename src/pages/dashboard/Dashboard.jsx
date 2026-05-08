import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { LL_LABELS, DEPOSIT_LABELS, WITHDRAWAL_LABELS, STAGE_OPENING_BALANCE } from '../../lib/scoring'
import { getPronouns } from '../../lib/pronouns'
import { ACCOUNTANTS, getAccountantMessage } from '../../lib/accountants'
import MessagePrompt from '../../components/MessagePrompt'
import NavBtn from '../../components/NavBtn'

const STATE_STYLES = {
  Thriving:   { bg:'var(--teal-p)',  color:'var(--teal)' },
  Growing:    { bg:'var(--teal-p)',  color:'var(--teal)' },
  Recovering: { bg:'var(--amber-p)', color:'var(--amber)' },
  Drifting:   { bg:'var(--amber-p)', color:'#854f0b' },
  Struggling: { bg:'var(--red-p)',   color:'var(--red)' },
}

export default function Dashboard() {
  const { profile, couple, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [activity, setActivity] = useState([])
  const [pending, setPending] = useState([])
  const [loadingActivity, setLoadingActivity] = useState(true)
  const [buddyConn, setBuddyConn] = useState(null)
  const [buddyProfile, setBuddyProfile] = useState(null)

  // Use the directly-fetched partner profile (_partner) to avoid Supabase same-table join ambiguity
  const partner = couple?._partner
    ?? (couple?.partner_a?.id === profile?.id ? couple?.partner_b : couple?.partner_a)
  const myScore = profile?.current_score ?? 0
  const partnerScore = partner?.current_score ?? 0
  const coupleScore = couple?.couple_score ?? 0
  const state = couple?.health_state ?? 'Growing'
  const stateStyle = STATE_STYLES[state] ?? STATE_STYLES.Growing

  useEffect(() => {
    if (!profile?.id) fetchBuddy()
  }, [profile?.id])

  async function fetchBuddy() {
    if (!profile?.id) return
    const { data: conn } = await supabase
      .from('buddy_connections')
      .select('*')
      .or(`user_a_id.eq.${profile.id},user_b_id.eq.${profile.id}`)
      .eq('status', 'active')
      .limit(1)
      .single()
    if (conn) {
      setBuddyConn(conn)
      const buddyId = conn.user_a_id === profile.id ? conn.user_b_id : conn.user_a_id
      const { data: bp } = await supabase.from('profiles').select('id, display_name, deposit_streak').eq('id', buddyId).single()
      setBuddyProfile(bp)
    }
  }

  useEffect(() => {
    if (!couple?.id) return
    fetchActivity()
    fetchPending()

    // Real-time couple score updates
    const channel = supabase
      .channel(`couple:${couple.id}`)
      .on('postgres_changes', { event:'UPDATE', schema:'public', table:'couples', filter:`id=eq.${couple.id}` }, () => {
        refreshProfile()
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [couple?.id])

  async function fetchActivity() {
    setLoadingActivity(true)
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data } = await supabase
      .from('activity_log')
      .select('*')
      .eq('couple_id', couple.id)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(20)
    setActivity(data ?? [])
    setLoadingActivity(false)
  }

  async function fetchPending() {
    const { data } = await supabase
      .from('deposits')
      .select('*')
      .eq('couple_id', couple.id)
      .eq('receiver_id', profile.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    setPending(data ?? [])
  }

  const [nibbleInfo, setNibbleInfo] = useState(false)
  const nibbleActive = couple?.nibble_active
  const streak = profile?.deposit_streak ?? 0
  const partnerPronouns = getPronouns(partner?.gender)
  const accountantId = profile?.accountant ?? 'fox'
  const accountant = ACCOUNTANTS.find(a => a.id === accountantId) ?? ACCOUNTANTS[0]
  const accountantMsg = getAccountantMessage(accountantId, {
    state,
    nibbleActive,
    streak,
    hasActivity: activity.length > 0,
    partnerPronouns,
  })

  // No couple or pending — show invite/waiting screen
  if (!couple || couple.status !== 'active') {
    return <NoPartnerScreen profile={profile} couple={couple} navigate={navigate} refreshProfile={refreshProfile} />
  }

  return (
    <div style={{ background:'var(--dark-bg)', minHeight:'100vh', color:'var(--dark-text)', paddingBottom:100 }}>
      {/* Hero */}
      <div style={{ padding:'56px 24px 24px', textAlign:'center' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:24 }}>
          <div style={{ textAlign:'left' }}>
            <p style={{ fontSize:10, color:'var(--dark-muted)', letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:4 }}>You</p>
            <p style={{ fontFamily:'var(--font-serif)', fontSize:34, color:'var(--amber-l)', lineHeight:1 }}>{myScore}</p>
            <p style={{ fontSize:11, color:'var(--dark-muted)', marginTop:4 }}>{profile?.display_name}</p>
          </div>

          <div style={{ textAlign:'center' }}>
            <p style={{ fontSize:10, color:'var(--dark-muted)', letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:4 }}>Couple score</p>
            <p style={{ fontFamily:'var(--font-serif)', fontSize:'clamp(40px,12vw,60px)', color:'var(--white)', lineHeight:1 }}>{coupleScore}</p>
            <span style={{ display:'inline-block', padding:'4px 12px', borderRadius:100, fontSize:11, fontWeight:500, background:stateStyle.bg, color:stateStyle.color, marginTop:6 }}>
              {state}
            </span>
          </div>

          <div style={{ textAlign:'right' }}>
            <p style={{ fontSize:10, color:'var(--dark-muted)', letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:4 }}>Partner</p>
            <p style={{ fontFamily:'var(--font-serif)', fontSize:34, color:'#AFA9EC', lineHeight:1 }}>{partnerScore}</p>
            <p style={{ fontSize:11, color:'var(--dark-muted)', marginTop:4 }}>{partner?.display_name}</p>
          </div>
        </div>

        {streak > 0 && (
          <p style={{ fontSize:12, color:'var(--amber-l)' }}>🔥 {streak}-day streak</p>
        )}
      </div>

      <div style={{ padding:'0 16px' }}>
        {/* Nibble — always visible, two states */}
        {nibbleActive ? (
          <div style={{ background:'#1f150a', border:'1px solid #6b3a10', borderRadius:14, padding:'14px 16px', marginBottom:12, display:'flex', alignItems:'center', gap:12 }}>
            <span style={{ fontSize:28 }}>😈</span>
            <div style={{ flex:1 }}>
              <p style={{ fontSize:13, fontWeight:600, color:'var(--amber-l)' }}>Nibble is here.</p>
              <p style={{ fontSize:12, color:'#c4843a', lineHeight:1.5 }}>
                {partnerPronouns.subject}'s draining your account daily. One deposit sends {partnerPronouns.object} packing.
              </p>
            </div>
            <button onClick={() => setNibbleInfo(true)} style={{ background:'rgba(255,255,255,0.08)', border:'none', borderRadius:100, width:24, height:24, cursor:'pointer', color:'#c4843a', fontSize:13, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' }}>?</button>
          </div>
        ) : (
          <div style={{ background:'#0d1a12', border:'0.5px solid #1e4a2a', borderRadius:14, padding:'14px 16px', marginBottom:12, display:'flex', alignItems:'center', gap:12 }}>
            <span style={{ fontSize:28 }}>😴</span>
            <div style={{ flex:1 }}>
              <p style={{ fontSize:13, fontWeight:600, color:'#6fcf97' }}>Nibble is sleeping.</p>
              <p style={{ fontSize:12, color:'#4a9a63', lineHeight:1.5 }}>
                Keep depositing and Nibble stays away. Miss 3 days and Nibble wakes up.
              </p>
            </div>
            <button onClick={() => setNibbleInfo(true)} style={{ background:'rgba(255,255,255,0.06)', border:'none', borderRadius:100, width:24, height:24, cursor:'pointer', color:'#4a9a63', fontSize:13, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' }}>?</button>
          </div>
        )}

        {/* Nibble info modal */}
        {nibbleInfo && (
          <div style={{ position:'fixed', inset:0, zIndex:200, display:'flex', alignItems:'flex-end', background:'rgba(0,0,0,0.6)' }} onClick={() => setNibbleInfo(false)}>
            <div style={{ background:'var(--dark-card)', borderRadius:'20px 20px 0 0', padding:'28px 24px 44px', width:'100%', maxWidth:430, margin:'0 auto' }} onClick={e => e.stopPropagation()}>
              <p style={{ fontSize:32, textAlign:'center', marginBottom:12 }}>😈</p>
              <p style={{ fontFamily:'var(--font-serif)', fontSize:22, color:'var(--white)', textAlign:'center', marginBottom:16 }}>Who is Nibble?</p>
              <div style={{ display:'flex', flexDirection:'column', gap:12, marginBottom:24 }}>
                <InfoRow emoji="⏰" text="Nibble wakes up when neither partner makes a deposit for 3 consecutive days." />
                <InfoRow emoji="📉" text="While active, Nibble drains a small amount of tokens from your couple score each day." />
                <InfoRow emoji="💰" text="One deposit from either partner sends Nibble back to sleep immediately." />
                <InfoRow emoji="💡" text="Nibble is a nudge — not a punishment. Consistent deposits keep your account healthy." />
              </div>
              <button className="btn-amber" onClick={() => setNibbleInfo(false)}>Got it</button>
            </div>
          </div>
        )}

        {/* Pending confirmations — left border signals action required */}
        {pending.length > 0 && (
          <div style={{ background:'#1a1a18', border:'0.5px solid var(--dark-border)', borderLeft:'3px solid var(--amber-l)', borderRadius:14, padding:'14px 16px', marginBottom:12 }}>
            <p style={{ fontSize:10, color:'var(--dark-muted)', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:10 }}>
              Needs your response ({pending.length})
            </p>
            {pending.map(d => (
              <PendingDeposit key={d.id} deposit={d} partnerName={partner?.display_name} onRespond={fetchPending} coupleId={couple.id} myId={profile.id} />
            ))}
          </div>
        )}

        {/* Quick actions */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
          <ActionBtn
            label="Make a deposit"
            icon={<DepositIcon />}
            onClick={() => navigate('/deposit')}
            accent="var(--teal)"
          />
          <ActionBtn
            label="Log a withdrawal"
            icon={<WithdrawIcon />}
            onClick={() => navigate('/withdrawal')}
            accent="var(--red)"
          />
        </div>

        {/* Message prompt */}
        <MessagePrompt
          partnerId={partner?.id ?? null}
          partnerName={partner?.display_name ?? 'your partner'}
          coupleId={couple?.id ?? null}
          dark
        />

        {/* Buddy card */}
        {buddyConn && buddyProfile ? (
          <div
            onClick={() => navigate(`/buddy/${buddyProfile.id}`)}
            style={{ background:'rgba(124,111,172,0.12)', border:`1px solid rgba(124,111,172,0.3)`, borderRadius:14, padding:'12px 16px', marginBottom:12, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'space-between' }}
          >
            <div>
              <p style={{ fontSize:13, fontWeight:600, color:'#AFA9EC' }}>🤝 {buddyProfile.display_name}</p>
              <p style={{ fontSize:11, color:'rgba(175,169,236,0.7)', marginTop:2 }}>
                {(buddyProfile.deposit_streak ?? 0) >= 2 ? `${buddyProfile.deposit_streak}-day streak` : 'Your buddy'}
              </p>
            </div>
            <span style={{ fontSize:14, color:'rgba(175,169,236,0.5)' }}>›</span>
          </div>
        ) : (
          <button
            onClick={() => navigate('/buddy/invite')}
            style={{ width:'100%', padding:'12px 16px', borderRadius:14, background:'transparent', border:`1.5px dashed rgba(124,111,172,0.4)`, marginBottom:12, cursor:'pointer', display:'flex', alignItems:'center', gap:10 }}
          >
            <span style={{ fontSize:18 }}>🤝</span>
            <div style={{ textAlign:'left' }}>
              <p style={{ fontSize:13, fontWeight:500, color:'#AFA9EC' }}>Invite a buddy</p>
              <p style={{ fontSize:11, color:'var(--dark-muted)' }}>Someone outside the relationship who keeps you accountable</p>
            </div>
          </button>
        )}

        {/* Activity feed */}
        <div style={{ background:'var(--dark-card)', border:'0.5px solid var(--dark-border)', borderRadius:14, padding:'14px 16px', marginBottom:12 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
            <p style={{ fontSize:10, color:'var(--dark-muted)', letterSpacing:'0.1em', textTransform:'uppercase' }}>This week</p>
            <button onClick={() => navigate('/activity')} style={{ background:'none', border:'none', fontSize:12, color:'var(--amber-l)', cursor:'pointer' }}>
              View all →
            </button>
          </div>

          {loadingActivity ? (
            <ActivitySkeleton />
          ) : activity.length === 0 ? (
            <p style={{ fontSize:13, color:'var(--dark-muted)', textAlign:'center', padding:'20px 0', lineHeight:1.6, fontStyle:'italic' }}>
              "{getAccountantMessage(accountantId, { state, nibbleActive, streak, hasActivity: false, partnerPronouns })}"
            </p>
          ) : (
            activity.slice(0, 6).map(item => (
              <ActivityRow key={item.id} item={item} myId={profile.id} partnerName={partner?.display_name} />
            ))
          )}
        </div>

        {/* Love language tip */}
        <div style={{ background:'var(--dark-card)', border:'0.5px solid var(--dark-border)', borderRadius:14, padding:'14px 16px', marginBottom:12 }}>
          <p style={{ fontSize:10, color:'var(--dark-muted)', letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:10 }}>
            For you
          </p>
          <p style={{ fontSize:13, color:'var(--dark-text)', lineHeight:1.7 }}>
            {partner?.display_name} feels most loved through{' '}
            <strong style={{ color:'var(--amber-l)' }}>{LL_LABELS[partner?.love_language] ?? '—'}</strong>.{' '}
            {partnerPronouns.subject} earns you <strong style={{ color:'var(--amber-l)' }}>1.5×</strong> tokens when your deposit matches {partnerPronouns.possessive} language.
          </p>
        </div>

        {/* Personal Accountant */}
        <div style={{ background:'var(--dark-card)', border:'0.5px solid var(--dark-border)', borderRadius:14, padding:'16px', marginBottom:12 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
            <div style={{ width:34, height:34, borderRadius:10, background:'var(--amber-p)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>{accountant.emoji}</div>
            <div>
              <p style={{ fontSize:13, fontWeight:600, color:'var(--white)' }}>{accountant.name}</p>
              <p style={{ fontSize:11, color:'var(--dark-muted)' }}>To you, privately</p>
            </div>
          </div>
          <p style={{ fontSize:13, color:'var(--dark-muted)', lineHeight:1.7, fontStyle:'italic' }}>
            "{accountantMsg}"
          </p>
        </div>
      </div>

      {/* Bottom nav */}
      <nav aria-label="Main navigation" style={{ position:'fixed', bottom:0, left:'50%', transform:'translateX(-50%)', width:'100%', maxWidth:430, background:'rgba(15,15,13,0.96)', backdropFilter:'blur(16px)', borderTop:'0.5px solid var(--dark-border)', display:'flex', padding:'10px 0 28px', zIndex:50 }}>
        <NavBtn icon="home"     label="Home"     active dark onClick={() => {}} />
        <NavBtn icon="deposit"  label="Deposit"  dark onClick={() => navigate('/deposit')} />
        <NavBtn icon="games"    label="Games"    dark onClick={() => navigate('/games')} />
        <NavBtn icon="history"  label="History"  dark onClick={() => navigate('/activity')} />
        <NavBtn icon="settings" label="Settings" dark onClick={() => navigate('/settings')} />
      </nav>
    </div>
  )
}

function NoPartnerScreen({ profile, couple, navigate, refreshProfile }) {
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteLink, setInviteLink] = useState(couple?.invite_link ?? '')
  const [sending, setSending] = useState(false)
  const [copied, setCopied] = useState(false)

  // Listen for partner joining (couple status → active)
  useEffect(() => {
    if (!couple?.id) return
    const channel = supabase
      .channel(`couple-pending:${couple.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'couples', filter: `id=eq.${couple.id}`
      }, () => refreshProfile())
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [couple?.id])

  async function generateInvite() {
    setSending(true)
    let coupleId = profile.couple_id
    if (!coupleId) {
      const opening = STAGE_OPENING_BALANCE[profile.relationship_stage] ?? 150
      const { data: c } = await supabase.from('couples').insert({
        partner_a_id:       profile.id,
        relationship_stage: profile.relationship_stage,
        opening_balance:    opening,
        couple_score:       opening,
      }).select().single()
      if (c) {
        coupleId = c.id
        await supabase.from('profiles').update({ couple_id: coupleId, current_score: opening }).eq('id', profile.id)
      }
    }
    const { data: invite } = await supabase.from('invites').insert({
      inviter_id:    profile.id,
      invitee_email: inviteEmail || null,
    }).select().single()
    if (invite) setInviteLink(`${window.location.origin}/invite/${invite.token}`)
    setSending(false)
  }

  function copyLink() {
    navigator.clipboard.writeText(inviteLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const isPending = couple?.status === 'pending'

  return (
    <div style={{ background:'var(--cream)', minHeight:'100vh', display:'flex', flexDirection:'column' }}>
      {/* Header */}
      <div style={{ padding:'56px 24px 32px', textAlign:'center' }}>
        <p style={{ fontFamily:'var(--font-serif)', fontSize:28, fontWeight:600, lineHeight:1.3 }}>
          Love <span style={{ color:'var(--amber)' }}>Bank</span>
        </p>
        <p style={{ fontSize:13, color:'var(--muted)', marginTop:6 }}>
          Welcome, {profile?.display_name}
        </p>
      </div>

      <div style={{ padding:'0 20px', flex:1 }}>
        {isPending && inviteLink === '' ? (
          // Couple exists but we don't have the link cached — let them generate a new one
          <div style={{ background:'var(--white)', borderRadius:16, border:'1px solid var(--line)', padding:20, marginBottom:16, textAlign:'center' }}>
            <p style={{ fontSize:32, marginBottom:12 }}>⏳</p>
            <p style={{ fontFamily:'var(--font-serif)', fontSize:20, marginBottom:8 }}>Waiting for your partner</p>
            <p style={{ fontSize:13, color:'var(--muted)', lineHeight:1.6, marginBottom:16 }}>
              Your invite is out there. Once your partner signs up and accepts, your couple score unlocks.
            </p>
            <button className="btn-outline" onClick={generateInvite} disabled={sending}>
              {sending ? 'Generating…' : 'Resend invite link'}
            </button>
          </div>
        ) : inviteLink ? (
          // Invite link ready to share
          <div style={{ background:'var(--white)', borderRadius:16, border:'1px solid var(--line)', padding:20, marginBottom:16 }}>
            <p style={{ fontSize:32, textAlign:'center', marginBottom:12 }}>🔗</p>
            <p style={{ fontFamily:'var(--font-serif)', fontSize:20, marginBottom:6, textAlign:'center' }}>Your invite link is ready</p>
            <p style={{ fontSize:13, color:'var(--muted)', lineHeight:1.6, marginBottom:16, textAlign:'center' }}>
              Share this with your partner. Once they join, your couple score unlocks automatically.
            </p>
            <div style={{ background:'var(--amber-p)', borderRadius:10, padding:'12px 14px', marginBottom:12 }}>
              <p style={{ fontSize:12, color:'var(--amber)', fontWeight:500, marginBottom:4 }}>Invite link (valid 72 hours)</p>
              <p style={{ fontSize:12, wordBreak:'break-all', color:'var(--ink2)', fontFamily:'var(--font-mono, monospace)' }}>{inviteLink}</p>
            </div>
            <button className="btn-primary" onClick={copyLink}>
              {copied ? '✓ Copied!' : 'Copy link'}
            </button>
          </div>
        ) : (
          // No couple yet — generate an invite
          <div style={{ background:'var(--white)', borderRadius:16, border:'1px solid var(--line)', padding:20, marginBottom:16 }}>
            <p style={{ fontSize:32, textAlign:'center', marginBottom:12 }}>💑</p>
            <p style={{ fontFamily:'var(--font-serif)', fontSize:22, marginBottom:6, textAlign:'center' }}>Invite your partner</p>
            <p style={{ fontSize:13, color:'var(--muted)', lineHeight:1.6, marginBottom:20, textAlign:'center' }}>
              Your couple score unlocks once you're both connected. Generate a link to share with them.
            </p>
            <label className="input-label">Partner's email (optional)</label>
            <input
              className="input"
              type="email"
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              placeholder="partner@example.com"
              style={{ marginBottom:16 }}
            />
            <button className="btn-amber" onClick={generateInvite} disabled={sending}>
              {sending ? 'Generating link…' : 'Generate invite link →'}
            </button>
          </div>
        )}

        {/* Profile summary */}
        <div style={{ background:'var(--white)', borderRadius:16, border:'1px solid var(--line)', padding:20, marginBottom:16 }}>
          <p style={{ fontSize:10, color:'var(--muted)', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:12 }}>Your profile</p>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            <ReviewRow label="Stage"         value={profile?.relationship_stage} />
            <ReviewRow label="Love language" value={LL_LABELS[profile?.love_language] ?? '—'} />
          </div>
        </div>
      </div>

      {/* Bottom nav */}
      <nav style={{ position:'fixed', bottom:0, left:'50%', transform:'translateX(-50%)', width:'100%', maxWidth:430, background:'rgba(250,246,239,0.95)', backdropFilter:'blur(12px)', borderTop:'0.5px solid var(--line)', display:'flex', padding:'10px 0 24px', zIndex:50 }}>
        <NavBtn icon="home"     label="Home"     active onClick={() => {}} />
        <NavBtn icon="settings" label="Settings" onClick={() => navigate('/settings')} />
      </nav>
    </div>
  )
}

function ReviewRow({ label, value }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 0', borderBottom:'0.5px solid var(--line)' }}>
      <p style={{ fontSize:12, color:'var(--muted)' }}>{label}</p>
      <p style={{ fontSize:13, fontWeight:500, color:'var(--ink)' }}>{value ?? '—'}</p>
    </div>
  )
}

function autoConfirmLabel(autoConfirmAt) {
  if (!autoConfirmAt) return 'Needs your confirmation'
  const ms = new Date(autoConfirmAt) - Date.now()
  if (ms <= 0) return 'Auto-confirming soon…'
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  if (h > 0) return `Auto-confirms in ${h}h ${m}m`
  return `Auto-confirms in ${m}m`
}

function PendingDeposit({ deposit, partnerName, onRespond, coupleId, myId }) {
  const [responding, setResponding] = useState(false)

  async function respond(action) {
    setResponding(true)
    if (action === 'confirm') {
      await supabase.from('deposits').update({
        status: 'confirmed',
        confirmed_at: new Date().toISOString(),
        tokens_applied: true,
      }).eq('id', deposit.id)

      // Update logger's score
      await supabase.rpc('apply_deposit_tokens', { deposit_id: deposit.id }).catch(() => {
        // Fallback: direct score update
        supabase.from('profiles').update({ current_score: deposit.final_value }).eq('id', deposit.logger_id)
      })

      await supabase.from('activity_log').insert({
        couple_id: coupleId,
        actor_id: myId,
        event_type: 'deposit_confirmed',
        ref_id: deposit.id,
        token_delta: deposit.final_value,
        description: `Confirmed: ${DEPOSIT_LABELS[deposit.deposit_type] ?? deposit.deposit_type}`,
      })

      // Notify the deposit logger that their deposit was confirmed
      const { data: confirmerProfile } = await supabase
        .from('profiles').select('display_name').eq('id', myId).single()
      supabase.functions.invoke('notify-partner', {
        body: {
          recipient_id:      deposit.logger_id,
          sender_name:       confirmerProfile?.display_name ?? 'Your partner',
          notification_type: 'deposit_confirmed',
          extra:             { deposit_id: deposit.id },
        },
      }).catch(() => {})
    } else if (action === 'flag') {
      await supabase.from('deposits').update({ status: 'flagged' }).eq('id', deposit.id)
      await supabase.from('activity_log').insert({
        couple_id: coupleId,
        actor_id: myId,
        event_type: 'deposit_flagged',
        ref_id: deposit.id,
        token_delta: 0,
        description: `Flagged for review`,
      })
    }
    setResponding(false)
    onRespond()
  }

  return (
    <div style={{ padding:'10px 0', borderBottom:'0.5px solid var(--dark-border)' }}>
      <p style={{ fontSize:13, fontWeight:500, color:'var(--dark-text)', marginBottom:2 }}>
        {DEPOSIT_LABELS[deposit.deposit_type] ?? deposit.deposit_type}
      </p>
      <p style={{ fontSize:11, color:'var(--dark-muted)', marginBottom:4 }}>
        {partnerName} logged +{deposit.final_value} tokens
      </p>
      <p style={{ fontSize:11, color:'var(--amber-l)', marginBottom:8, opacity:0.75 }}>
        ⏱ {autoConfirmLabel(deposit.auto_confirm_at)}
      </p>
      <div style={{ display:'flex', gap:8 }}>
        <button
          onClick={() => respond('confirm')}
          disabled={responding}
          style={{ padding:'6px 14px', borderRadius:100, fontSize:12, background:'var(--teal-p)', color:'var(--teal)', border:'none', cursor:'pointer', fontWeight:500 }}
        >
          Confirm ✓
        </button>
        <button
          onClick={() => respond('flag')}
          disabled={responding}
          style={{ padding:'6px 14px', borderRadius:100, fontSize:12, background:'var(--dark-bg)', color:'var(--dark-muted)', border:'0.5px solid var(--dark-border)', cursor:'pointer' }}
        >
          Flag
        </button>
      </div>
    </div>
  )
}

function ActivityRow({ item, myId, partnerName }) {
  const isMe = item.actor_id === myId
  const positive = item.token_delta > 0
  const negative = item.token_delta < 0

  return (
    <div style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:'0.5px solid var(--dark-border)' }}>
      <div style={{ width:6, height:6, borderRadius:'50%', flexShrink:0, background: negative ? 'var(--red)' : positive ? '#5dcaa5' : 'var(--dark-muted)' }} />
      <div style={{ flex:1 }}>
        <p style={{ fontSize:13, color:'var(--dark-text)' }}>{item.description}</p>
        <p style={{ fontSize:11, color:'var(--dark-muted)' }}>{isMe ? 'You' : partnerName} · {formatDate(item.created_at)}</p>
      </div>
      {item.token_delta !== 0 && (
        <p style={{ fontSize:13, fontWeight:500, color: negative ? 'var(--red)' : 'var(--amber-l)', flexShrink:0 }}>
          {positive ? '+' : ''}{item.token_delta}
        </p>
      )}
    </div>
  )
}

function ActionBtn({ label, icon, accent, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{ background:'var(--dark-card)', border:'0.5px solid var(--dark-border)', borderRadius:16, padding:'18px 16px', display:'flex', flexDirection:'column', gap:10, cursor:'pointer', textAlign:'left', width:'100%' }}
    >
      <span style={{ color: accent, display:'flex' }}>{icon}</span>
      <p style={{ fontSize:13, fontWeight:500, color:'var(--dark-text)', lineHeight:1.3 }}>{label}</p>
    </button>
  )
}

// SVG icons for quick action buttons
function DepositIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z"/>
      <line x1="12" y1="8" x2="12" y2="16"/>
      <line x1="8" y1="12" x2="16" y2="12"/>
    </svg>
  )
}

function WithdrawIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 8 14 12"/>
      <line x1="18" y1="8" x2="18" y2="16"/>
      <path d="M2 12h10"/>
      <path d="M2 6h20M2 18h20" strokeOpacity="0.3"/>
    </svg>
  )
}

function ActivitySkeleton() {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12, padding:'8px 0' }}>
      {[1,2,3].map(i => (
        <div key={i} style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:6, height:6, borderRadius:'50%', background:'var(--dark-border)', flexShrink:0 }} />
          <div style={{ flex:1, height:12, borderRadius:6, background:'var(--dark-border)', opacity: 1 - i * 0.2 }} />
          <div style={{ width:32, height:12, borderRadius:6, background:'var(--dark-border)' }} />
        </div>
      ))}
    </div>
  )
}

function InfoRow({ emoji, text }) {
  return (
    <div style={{ display:'flex', gap:12, alignItems:'flex-start' }}>
      <span style={{ fontSize:18, flexShrink:0 }}>{emoji}</span>
      <p style={{ fontSize:13, color:'var(--dark-muted)', lineHeight:1.6 }}>{text}</p>
    </div>
  )
}

function formatDate(iso) {
  const d = new Date(iso)
  const now = new Date()
  const diff = now - d
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return d.toLocaleDateString('en-US', { month:'short', day:'numeric' })
}
