import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { STAGE_OPENING_BALANCE } from '../../lib/scoring'

export default function InviteAccept() {
  const { token } = useParams()
  const { user, profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [state, setState] = useState('loading') // loading | valid | expired | already_linked | error
  const [invite, setInvite] = useState(null)
  const [inviter, setInviter] = useState(null)
  const [accepting, setAccepting] = useState(false)

  useEffect(() => {
    checkInvite()
  }, [token])

  async function checkInvite() {
    const { data, error } = await supabase
      .from('invites')
      .select('*, inviter:inviter_id(id, display_name, love_language, relationship_stage)')
      .eq('token', token)
      .single()

    if (error || !data) { setState('error'); return }
    if (data.status !== 'pending' || new Date(data.expires_at) < new Date()) {
      setState('expired'); return
    }
    if (profile?.couple_id) { setState('already_linked'); return }

    setInvite(data)
    setInviter(data.inviter)
    setState('valid')
  }

  async function acceptInvite() {
    if (!user) { navigate(`/signup?redirect=/invite/${token}`); return }
    const isOnboarded = profile?.onboarding_complete || profile?.relationship_mode
    if (!isOnboarded) { navigate('/onboarding'); return }

    setAccepting(true)

    // Get the couple created by the inviter
    const { data: couple } = await supabase
      .from('couples')
      .select('*')
      .eq('partner_a_id', invite.inviter_id)
      .eq('status', 'pending')
      .single()

    if (!couple) { setState('error'); setAccepting(false); return }

    const opening = couple.opening_balance ?? STAGE_OPENING_BALANCE[couple.relationship_stage] ?? 150

    // Link partner B
    await supabase.from('couples').update({
      partner_b_id: user.id,
      status: 'active',
    }).eq('id', couple.id)

    // Update both profiles
    await supabase.from('profiles').update({ couple_id: couple.id, current_score: opening }).eq('id', user.id)

    // Mark invite accepted
    await supabase.from('invites').update({ status: 'accepted' }).eq('id', invite.id)

    // Queue connection moment notification for inviter
    await supabase.from('notification_queue').insert({
      recipient_id: invite.inviter_id,
      type: 'partner_joined',
      payload: { partner_name: profile.display_name },
    })

    await refreshProfile()
    navigate('/connection')
  }

  if (state === 'loading') return <Center>Checking invite…</Center>

  if (state === 'expired') return (
    <Center>
      <p style={{ fontFamily:'var(--font-serif)', fontSize:24, marginBottom:12 }}>This invite has expired.</p>
      <p style={{ fontSize:14, color:'var(--muted)', marginBottom:24 }}>Invite links are valid for 72 hours. Ask your partner to send a new one.</p>
    </Center>
  )

  if (state === 'already_linked') return (
    <Center>
      <p style={{ fontFamily:'var(--font-serif)', fontSize:24, marginBottom:12 }}>You're already connected.</p>
      <p style={{ fontSize:14, color:'var(--muted)', marginBottom:24 }}>Your account is already linked to a partner.</p>
      <button className="btn-primary" onClick={() => navigate('/')}>Go to dashboard</button>
    </Center>
  )

  if (state === 'error') return (
    <Center>
      <p style={{ fontFamily:'var(--font-serif)', fontSize:24, marginBottom:12 }}>Something went wrong.</p>
      <p style={{ fontSize:14, color:'var(--muted)' }}>This invite link may be invalid. Ask your partner for a new one.</p>
    </Center>
  )

  return (
    <div style={{ minHeight:'100vh', background:'var(--cream)', display:'flex', flexDirection:'column', justifyContent:'center', padding:'0 24px' }}>
      <div style={{ textAlign:'center', marginBottom:32 }}>
        <p style={{ fontFamily:'var(--font-serif)', fontSize:32, fontWeight:600, lineHeight:1.3 }}>
          {inviter?.display_name} invited<br />you to Love Bank.
        </p>
        <p style={{ fontSize:14, color:'var(--muted)', marginTop:12, lineHeight:1.7 }}>
          You'll each complete your own profile — love language, communication style, and what you need most.
          Once you're both done, your couple score unlocks.
        </p>
      </div>

      {!user ? (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <button className="btn-primary" onClick={() => navigate(`/signup?redirect=/invite/${token}`)}>
            Create account & accept →
          </button>
          <button className="btn-outline" onClick={() => navigate(`/signin?redirect=/invite/${token}`)}>
            Sign in & accept
          </button>
        </div>
      ) : !(profile?.onboarding_complete || profile?.relationship_mode) ? (
        <button className="btn-primary" onClick={() => navigate('/onboarding')}>
          Complete your profile first →
        </button>
      ) : (
        <button className="btn-amber" onClick={acceptInvite} disabled={accepting}>
          {accepting ? 'Connecting…' : `Accept & connect with ${inviter?.display_name} →`}
        </button>
      )}
    </div>
  )
}

function Center({ children }) {
  return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'0 24px', textAlign:'center', background:'var(--cream)' }}>
      {children}
    </div>
  )
}
