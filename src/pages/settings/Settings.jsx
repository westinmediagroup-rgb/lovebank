import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { LL_LABELS } from '../../lib/scoring'
import { isPushSupported, getPushSubscription, subscribeToPush, unsubscribeFromPush } from '../../lib/push'

const LL_OPTIONS = [
  { id:'words', label:'Words of affirmation' },
  { id:'time',  label:'Quality time' },
  { id:'touch', label:'Physical touch' },
  { id:'acts',  label:'Acts of service' },
  { id:'gifts', label:'Gift giving' },
]

const TIMEZONES = [
  { value: 'America/New_York',    label: 'Eastern (ET)' },
  { value: 'America/Chicago',     label: 'Central (CT)' },
  { value: 'America/Denver',      label: 'Mountain (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific (PT)' },
  { value: 'America/Phoenix',     label: 'Arizona (no DST)' },
  { value: 'America/Anchorage',   label: 'Alaska (AKT)' },
  { value: 'Pacific/Honolulu',    label: 'Hawaii (HT)' },
  { value: 'Europe/London',       label: 'London (GMT/BST)' },
  { value: 'Europe/Paris',        label: 'Paris (CET)' },
  { value: 'Asia/Dubai',          label: 'Dubai (GST)' },
  { value: 'Asia/Kolkata',        label: 'India (IST)' },
  { value: 'Asia/Tokyo',          label: 'Tokyo (JST)' },
  { value: 'Australia/Sydney',    label: 'Sydney (AEST)' },
]

export default function Settings() {
  const { profile, couple, signOut, refreshProfile } = useAuth()
  const navigate = useNavigate()

  // Love language
  const [saving, setSaving]       = useState(false)
  const [myLL, setMyLL]           = useState(profile?.love_language ?? '')
  const [partnerLL, setPartnerLL] = useState(profile?.partner_ll_guess ?? '')

  // Notifications
  const [emailOn, setEmailOn]       = useState(profile?.reminders_email ?? false)
  const [smsOn, setSmsOn]           = useState(profile?.reminders_sms ?? false)
  const [phone, setPhone]           = useState(profile?.phone_number ?? '')
  const [quietStart, setQuietStart] = useState(profile?.reminder_quiet_start ?? '21:00')
  const [quietEnd, setQuietEnd]     = useState(profile?.reminder_quiet_end ?? '08:00')
  const [timezone, setTimezone]     = useState(
    profile?.reminder_timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'America/New_York'
  )
  const [notifSaved, setNotifSaved] = useState(false)
  const [notifSaving, setNotifSaving] = useState(false)

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Push notifications
  const [pushOn, setPushOn]         = useState(false)
  const [pushSaving, setPushSaving] = useState(false)
  const pushSupported = isPushSupported()

  useEffect(() => {
    getPushSubscription().then(sub => setPushOn(!!sub))
  }, [])

  const partner = couple?.partner_a_id === profile?.id ? couple?.partner_b : couple?.partner_a
  const isSolo  = profile?.relationship_mode === 'solo'

  /* ── Save love language ── */
  async function saveLL() {
    setSaving(true)
    await supabase.from('profiles').update({
      love_language:    myLL,
      partner_ll_guess: partnerLL,
    }).eq('id', profile.id)
    await refreshProfile()
    setSaving(false)
  }

  /* ── Save notification preferences ── */
  async function saveNotifications() {
    setNotifSaving(true)
    await supabase.from('profiles').update({
      reminders_email:      emailOn,
      reminders_sms:        smsOn,
      phone_number:         smsOn ? phone.trim() : null,
      reminder_quiet_start: quietStart,
      reminder_quiet_end:   quietEnd,
      reminder_timezone:    timezone,
    }).eq('id', profile.id)
    await refreshProfile()
    setNotifSaved(true)
    setNotifSaving(false)
    setTimeout(() => setNotifSaved(false), 2500)
  }

  /* ── Push notification toggle ── */
  async function handlePushToggle(enable) {
    if (pushSaving) return
    setPushSaving(true)
    if (enable) {
      const ok = await subscribeToPush(profile.id)
      setPushOn(ok)
    } else {
      await unsubscribeFromPush(profile.id)
      setPushOn(false)
    }
    setPushSaving(false)
  }

  /* ── Export / sign out / delete ── */
  async function exportData() {
    const [{ data: deps }, { data: wds }] = await Promise.all([
      supabase.from('deposits').select('*').eq(isSolo ? 'logger_id' : 'couple_id', isSolo ? profile?.id : couple?.id),
      supabase.from('withdrawals').select('*').eq('couple_id', couple?.id ?? ''),
    ])
    const blob = new Blob([JSON.stringify({ deposits: deps, withdrawals: wds }, null, 2)], { type:'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a'); a.href = url; a.download = 'love-bank-export.json'; a.click()
    URL.revokeObjectURL(url)
  }

  async function handleSignOut() {
    await signOut()
    navigate('/welcome')
  }

  async function deleteAccount() {
    await supabase.auth.signOut()
    navigate('/welcome')
  }

  return (
    <div style={{ minHeight:'100vh', background:'var(--cream)', paddingBottom:40 }}>
      <div className="page-header">
        <button className="btn-back" onClick={() => navigate('/')} aria-label="Back">←</button>
        <p className="page-title">Settings</p>
        <div style={{ width:32 }} />
      </div>

      <div className="screen-body">

        {/* ── Profile ── */}
        <p className="section-label">Your profile</p>
        <div className="card" style={{ marginBottom:20 }}>
          <SettingRow label="Name"    value={profile?.display_name} />
          {!isSolo && (
            <SettingRow label="Partner" value={partner?.display_name ?? (couple?.status === 'pending' ? 'Invite pending' : 'Not connected')} />
          )}
          <SettingRow label="Stage"        value={profile?.relationship_stage?.replace('_', ' ')} />
          <SettingRow label="Account mode" value={profile?.relationship_mode === 'solo' ? 'Solo' : 'Coupled'} />
          {!isSolo && <SettingRow label="Couple score" value={couple?.couple_score ?? '—'} />}
        </div>

        {/* ── Love languages (coupled only) ── */}
        {!isSolo && (
          <>
            <p className="section-label">Love languages</p>
            <div className="card" style={{ marginBottom:20 }}>
              <div style={{ marginBottom:16 }}>
                <label className="input-label" htmlFor="my-ll">Your love language</label>
                <select id="my-ll" className="input" value={myLL} onChange={e => setMyLL(e.target.value)}>
                  <option value="">Select…</option>
                  {LL_OPTIONS.map(ll => <option key={ll.id} value={ll.id}>{ll.label}</option>)}
                </select>
              </div>
              <div style={{ marginBottom:16 }}>
                <label className="input-label" htmlFor="partner-ll">Your guess for {partner?.display_name ?? 'partner'}</label>
                <select id="partner-ll" className="input" value={partnerLL} onChange={e => setPartnerLL(e.target.value)}>
                  <option value="">Select…</option>
                  {LL_OPTIONS.map(ll => <option key={ll.id} value={ll.id}>{ll.label}</option>)}
                </select>
              </div>
              <button className="btn-outline" onClick={saveLL} disabled={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </>
        )}

        {/* ── Partner connection ── */}
        {!isSolo && (!couple || couple.status !== 'active') && (
          <>
            <p className="section-label">Partner connection</p>
            <div className="card" style={{ marginBottom:20 }}>
              <p style={{ fontSize:13, color:'var(--muted)', marginBottom:12 }}>No partner connected yet.</p>
              <button className="btn-primary" onClick={() => navigate('/onboarding/invite')}>
                Send invite link →
              </button>
            </div>
          </>
        )}

        {/* ── Notifications ── */}
        <p className="section-label">Reminders</p>
        <div className="card" style={{ marginBottom:20 }}>

          <p style={{ fontSize:12, color:'var(--muted)', marginBottom:16, lineHeight:1.6 }}>
            Your accountant checks in when it matters — streak warnings, partner activity, and a weekly summary. Always in their voice, never generic.
          </p>

          {/* Push toggle */}
          {pushSupported && (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 0', borderBottom:'0.5px solid var(--line)' }}>
              <div>
                <p style={{ fontSize:14, fontWeight:500 }}>Push notifications</p>
                <p style={{ fontSize:12, color:'var(--muted)', marginTop:2 }}>Instant alerts when your partner acts — no app open needed</p>
              </div>
              <Toggle on={pushOn} onChange={handlePushToggle} disabled={pushSaving} />
            </div>
          )}

          {/* Email toggle */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 0', borderBottom:'0.5px solid var(--line)' }}>
            <div>
              <p style={{ fontSize:14, fontWeight:500 }}>Email reminders</p>
              <p style={{ fontSize:12, color:'var(--muted)', marginTop:2 }}>Daily nudges, weekly summary, milestones</p>
            </div>
            <Toggle on={emailOn} onChange={v => setEmailOn(v)} />
          </div>

          {/* SMS toggle */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 0', borderBottom: smsOn ? '0.5px solid var(--line)' : 'none' }}>
            <div>
              <p style={{ fontSize:14, fontWeight:500 }}>SMS reminders</p>
              <p style={{ fontSize:12, color:'var(--muted)', marginTop:2 }}>High-priority only: Nibble alerts + streak breaks</p>
            </div>
            <Toggle on={smsOn} onChange={v => setSmsOn(v)} />
          </div>

          {/* Phone number (only if SMS on) */}
          {smsOn && (
            <div style={{ padding:'12px 0', borderBottom:'0.5px solid var(--line)' }}>
              <label className="input-label" htmlFor="phone-number">Mobile number</label>
              <input
                id="phone-number"
                className="input"
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="+1 555 000 0000"
                autoComplete="tel"
              />
              <p style={{ fontSize:11, color:'var(--muted)', marginTop:6 }}>
                Include country code (e.g. +1 for US). Standard SMS rates apply.
              </p>
            </div>
          )}

          {/* Quiet hours — only show if either reminder is on */}
          {(emailOn || smsOn) && (
            <>
              <div style={{ padding:'12px 0 0' }}>
                <p style={{ fontSize:12, fontWeight:500, color:'var(--muted)', marginBottom:12, letterSpacing:'0.04em', textTransform:'uppercase' }}>
                  Quiet hours — no reminders sent during this window
                </p>
                <div style={{ display:'flex', gap:12, marginBottom:14 }}>
                  <div style={{ flex:1 }}>
                    <label className="input-label" htmlFor="quiet-start">From</label>
                    <input
                      id="quiet-start"
                      className="input"
                      type="time"
                      value={quietStart}
                      onChange={e => setQuietStart(e.target.value)}
                    />
                  </div>
                  <div style={{ flex:1 }}>
                    <label className="input-label" htmlFor="quiet-end">Until</label>
                    <input
                      id="quiet-end"
                      className="input"
                      type="time"
                      value={quietEnd}
                      onChange={e => setQuietEnd(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label className="input-label" htmlFor="timezone">Your timezone</label>
                  <select
                    id="timezone"
                    className="input"
                    value={timezone}
                    onChange={e => setTimezone(e.target.value)}
                  >
                    {TIMEZONES.map(tz => (
                      <option key={tz.value} value={tz.value}>{tz.label}</option>
                    ))}
                    {/* Show current if not in list */}
                    {!TIMEZONES.find(tz => tz.value === timezone) && (
                      <option value={timezone}>{timezone}</option>
                    )}
                  </select>
                </div>
              </div>
            </>
          )}

          <button
            className="btn-primary"
            onClick={saveNotifications}
            disabled={notifSaving || (smsOn && !phone.trim())}
            style={{ marginTop: 20 }}
          >
            {notifSaving ? 'Saving…' : notifSaved ? '✓ Saved!' : 'Save notification settings'}
          </button>

          {smsOn && !phone.trim() && (
            <p style={{ fontSize:12, color:'var(--amber)', marginTop:8, textAlign:'center' }}>
              Enter a mobile number to enable SMS reminders.
            </p>
          )}
        </div>

        {/* ── Account ── */}
        <p className="section-label">Account</p>
        <div className="card" style={{ marginBottom:20 }}>
          <button
            onClick={exportData}
            style={{ width:'100%', textAlign:'left', background:'none', border:'none', padding:'10px 0', fontSize:14, color:'var(--ink)', cursor:'pointer', borderBottom:'0.5px solid var(--line)', display:'flex', justifyContent:'space-between' }}
          >
            <span>Export my data</span><span style={{ color:'var(--muted)' }}>›</span>
          </button>
          <button
            onClick={handleSignOut}
            style={{ width:'100%', textAlign:'left', background:'none', border:'none', padding:'10px 0', fontSize:14, color:'var(--ink)', cursor:'pointer', display:'flex', justifyContent:'space-between' }}
          >
            <span>Sign out</span><span style={{ color:'var(--muted)' }}>›</span>
          </button>
        </div>

        {!showDeleteConfirm ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            style={{ width:'100%', background:'none', border:'1.5px solid var(--red)', borderRadius:100, padding:'13px', fontSize:14, color:'var(--red)', cursor:'pointer', fontWeight:500 }}
          >
            Delete account
          </button>
        ) : (
          <div style={{ background:'var(--red-p)', borderRadius:12, padding:'16px' }}>
            <p style={{ fontSize:13, fontWeight:500, color:'var(--red)', marginBottom:8 }}>Are you sure?</p>
            <p style={{ fontSize:13, color:'var(--ink2)', marginBottom:16, lineHeight:1.6 }}>
              This will sign you out. Account deletion requires email confirmation.
            </p>
            <div style={{ display:'flex', gap:10 }}>
              <button className="btn-outline" onClick={() => setShowDeleteConfirm(false)} style={{ flex:1 }}>Cancel</button>
              <button onClick={deleteAccount} style={{ flex:1, background:'var(--red)', color:'var(--white)', border:'none', borderRadius:100, padding:'13px', fontSize:14, fontWeight:500, cursor:'pointer' }}>
                Confirm
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

/* ─── Sub-components ─────────────────────────────────────────── */

function SettingRow({ label, value }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', padding:'10px 0', borderBottom:'0.5px solid var(--line)' }}>
      <p style={{ fontSize:13, color:'var(--muted)' }}>{label}</p>
      <p style={{ fontSize:13, fontWeight:500, textTransform:'capitalize' }}>{value ?? '—'}</p>
    </div>
  )
}

function Toggle({ on, onChange, disabled }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={() => !disabled && onChange(!on)}
      style={{
        width: 44, height: 26, borderRadius: 13, border: 'none',
        cursor: disabled ? 'default' : 'pointer',
        background: on ? 'var(--teal)' : 'var(--line)',
        position: 'relative', transition: 'background 0.2s', flexShrink: 0,
        minHeight: 26, opacity: disabled ? 0.6 : 1,
      }}
    >
      <span style={{
        position: 'absolute', top: 3, left: on ? 21 : 3,
        width: 20, height: 20, borderRadius: '50%',
        background: 'white', transition: 'left 0.2s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }} />
    </button>
  )
}
