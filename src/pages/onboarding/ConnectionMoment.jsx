import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { LL_LABELS } from '../../lib/scoring'
import { ACCOUNTANTS, PARTNER_JOINED_MESSAGES } from '../../lib/accountants'

const LL_ICONS = { words:'💬', time:'⏱', touch:'🤝', acts:'🛠', gifts:'🎁' }

export default function ConnectionMoment() {
  const { profile, couple, refreshProfile } = useAuth()
  const navigate = useNavigate()

  if (!couple) return null

  const partner = couple._partner ?? (couple.partner_a?.id === profile.id ? couple.partner_b : couple.partner_a)
  const accountantId = profile?.accountant ?? 'fox'
  const accountant = ACCOUNTANTS.find(a => a.id === accountantId) ?? ACCOUNTANTS[0]
  const accountantMsg = PARTNER_JOINED_MESSAGES[accountantId] ?? PARTNER_JOINED_MESSAGES.fox
  const myLL = profile.love_language
  const partnerLL = partner?.love_language
  const llGap = myLL !== partnerLL

  async function handleContinue() {
    await refreshProfile()
    navigate('/')
  }

  return (
    <div style={{ minHeight:'100vh', background:'var(--dark-bg)', color:'var(--dark-text)', display:'flex', flexDirection:'column' }}>
      {/* Header */}
      <div style={{ padding:'40px 24px 24px', textAlign:'center' }}>
        <p style={{ fontFamily:'var(--font-serif)', fontSize:28, color:'var(--white)', lineHeight:1.3 }}>
          You're connected.
        </p>
        <p style={{ fontSize:14, color:'var(--dark-muted)', marginTop:8, lineHeight:1.6 }}>
          Your Love Bank account is live. Here's what you know about each other.
        </p>
      </div>

      {/* Score reveal */}
      <div style={{ margin:'0 20px', background:'var(--dark-card)', border:'0.5px solid var(--dark-border)', borderRadius:16, padding:20, marginBottom:16 }}>
        <p style={{ fontSize:10, color:'var(--dark-muted)', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:16 }}>Opening balances</p>
        <div style={{ display:'flex', gap:12 }}>
          <ScoreCard name={profile.display_name} score={couple.opening_balance} ll={myLL} color="var(--amber-l)" />
          <ScoreCard name={partner?.display_name || '—'} score={couple.opening_balance} ll={partnerLL} color="#AFA9EC" />
        </div>
        <div style={{ textAlign:'center', marginTop:16 }}>
          <p style={{ fontSize:11, color:'var(--dark-muted)' }}>Couple score</p>
          <p style={{ fontFamily:'var(--font-serif)', fontSize:48, color:'var(--white)', lineHeight:1 }}>{couple.opening_balance}</p>
          <p style={{ fontSize:12, color:'var(--teal-p)', marginTop:4 }}>Growing</p>
        </div>
      </div>

      {/* Profile reveal */}
      <div style={{ margin:'0 20px 16px', background:'var(--dark-card)', border:'0.5px solid var(--dark-border)', borderRadius:16, padding:20 }}>
        <p style={{ fontSize:10, color:'var(--dark-muted)', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:16 }}>What you know about each other</p>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <ProfileCard name={profile.display_name} ll={myLL} color="var(--amber-l)" />
          <ProfileCard name={partner?.display_name || '—'} ll={partnerLL} color="#AFA9EC" />
        </div>
        {llGap && (
          <div style={{ marginTop:16, padding:'12px 14px', background:'#111110', borderRadius:10 }}>
            <p style={{ fontSize:12, color:'var(--amber-l)', marginBottom:4 }}>Love language gap</p>
            <p style={{ fontSize:12, color:'var(--dark-muted)', lineHeight:1.6 }}>
              You give love through <strong style={{ color:'var(--dark-text)' }}>{LL_LABELS[myLL]}</strong>.
              {' '}{partner?.display_name} feels it most through <strong style={{ color:'var(--dark-text)' }}>{LL_LABELS[partnerLL]}</strong>.
              {' '}That gap isn't a problem — it's the first thing to work on.
            </p>
          </div>
        )}
      </div>

      {/* Accountant message */}
      <div style={{ margin:'0 20px 32px', background:'var(--dark-card)', border:'0.5px solid var(--dark-border)', borderRadius:16, padding:20 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
          <div style={{ width:32, height:32, borderRadius:10, background:'var(--amber-p)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16 }}>{accountant.emoji}</div>
          <div>
            <p style={{ fontSize:13, fontWeight:500, color:'var(--white)' }}>{accountant.name}</p>
            <p style={{ fontSize:11, color:'var(--dark-muted)' }}>To you, privately</p>
          </div>
        </div>
        <p style={{ fontSize:13, color:'var(--dark-muted)', lineHeight:1.7, fontStyle:'italic' }}>
          "{accountantMsg}"
        </p>
      </div>

      <div style={{ padding:'0 20px 40px', marginTop:'auto' }}>
        <button className="btn-amber" onClick={handleContinue}>
          Open your dashboard →
        </button>
      </div>
    </div>
  )
}

function ScoreCard({ name, score, ll, color }) {
  return (
    <div style={{ flex:1, background:'#111110', borderRadius:12, padding:'12px', textAlign:'center' }}>
      <p style={{ fontSize:24, fontFamily:'var(--font-serif)', color, lineHeight:1 }}>{score}</p>
      <p style={{ fontSize:12, fontWeight:500, color:'var(--dark-text)', marginTop:4 }}>{name}</p>
      {ll && <p style={{ fontSize:10, color:'var(--dark-muted)', marginTop:2 }}>{LL_ICONS[ll]} {ll}</p>}
    </div>
  )
}

function ProfileCard({ name, ll, color }) {
  return (
    <div style={{ background:'#111110', borderRadius:12, padding:'12px' }}>
      <p style={{ fontSize:13, fontWeight:500, color, marginBottom:4 }}>{name}</p>
      {ll ? (
        <p style={{ fontSize:11, color:'var(--dark-muted)' }}>{LL_ICONS[ll]} {LL_LABELS[ll]}</p>
      ) : (
        <p style={{ fontSize:11, color:'var(--dark-muted)' }}>Quiz pending</p>
      )}
    </div>
  )
}
