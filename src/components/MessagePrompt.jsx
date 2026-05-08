import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { DEPOSIT_BASE_VALUES, DEPOSIT_LABELS } from '../lib/scoring'

/* ─── Affirmation templates ──────────────────────────────────── */

const coupledTemplates = (name) => [
  `Grateful for another day building something real with ${name}. 💛 #LoveBank`,
  `Choosing to show up for ${name} today and every day. 🏦 #LoveBank`,
  `Small deposits, real love. Consistency is the point. ❤️ #LoveBank`,
  `Love isn't a feeling you wait for — it's a choice you make daily. Making mine. 💪 #LoveBank`,
]

const soloTemplates = [
  `Investing in myself today. The most important account I have. 💛 #LoveBank`,
  `Showing up for the people who matter — starting with me. 🏦 #LoveBank`,
  `Small deposits, big returns. Every single day. 💪 #LoveBank`,
  `Self-awareness is the first investment. Making mine today. ✨ #LoveBank`,
]

/* ─── Deposit options per message type ───────────────────────── */

const BANKING_OPTIONS = {
  text: [
    { type: 'quick_text',       label: 'Kind text or compliment',  points: DEPOSIT_BASE_VALUES.quick_text },
    { type: 'written_note',     label: 'Heartfelt written note',   points: DEPOSIT_BASE_VALUES.written_note },
    { type: 'hard_conversation', label: 'Hard / brave conversation', points: DEPOSIT_BASE_VALUES.hard_conversation },
  ],
  voice: [
    { type: 'voice_note',        label: 'Voice note',                points: DEPOSIT_BASE_VALUES.voice_note },
    { type: 'hard_conversation', label: 'Hard / brave conversation',  points: DEPOSIT_BASE_VALUES.hard_conversation },
  ],
  affirmation: [
    { type: 'public_affirmation', label: 'Public affirmation',        points: DEPOSIT_BASE_VALUES.public_affirmation },
  ],
}

/* ─── Accountant banking confirmation messages ───────────────── */

const BANK_CONFIRM = {
  fox: {
    quick_text:         'A text that means something. That\'s a real deposit.',
    written_note:       'Written notes hit differently. Good deposit.',
    hard_conversation:  'Hard conversations are the highest-value deposits you can make.',
    voice_note:         'Voice notes are underrated. Keep using them.',
    public_affirmation: 'You said it out loud. That takes something.',
    _default:           'Banked. Keep going.',
  },
  owl: {
    quick_text:         'Small words, compounding effect. Filed.',
    written_note:       'A written note is a deposit that lasts longer than you think.',
    hard_conversation:  'Hard conversations are where trust is built. Significant deposit.',
    voice_note:         'The voice carries what text cannot. Recorded.',
    public_affirmation: 'Declaring it publicly is its own kind of courage. Logged.',
    _default:           'Every deposit shapes what comes next.',
  },
  bear: {
    quick_text:         'Such a sweet thing to do — that counts! 💛',
    written_note:       'A written note is such a warm gesture. So proud of you! 🐻',
    hard_conversation:  'That took real courage. So proud of you for doing that! 💛',
    voice_note:         'A voice note? That\'s so personal and thoughtful! 🐻',
    public_affirmation: 'You shared your love with the world! That definitely counts! ✨',
    _default:           'Every deposit matters — and this one does too! 💛',
  },
  wolf: {
    quick_text:         'Quick text. Small deposit. But it\'s in. Move.',
    written_note:       'Written notes count. That\'s in the ledger now.',
    hard_conversation:  'That\'s the highest-value deposit you can make. Logged.',
    voice_note:         'Voice note sent. Banked. Don\'t stop here.',
    public_affirmation: 'You said it publicly. Own it. Banked.',
    _default:           'In the bank. Keep the pace.',
  },
  lion: {
    quick_text:         'Even a quick message is a choice to show up. Banked.',
    written_note:       'Written words carry weight in the ledger.',
    hard_conversation:  'The bravest deposits are the ones that cost something. Noted.',
    voice_note:         'Your voice in their ear. A powerful deposit.',
    public_affirmation: 'You declared it to the world. That\'s strength. Banked.',
    _default:           'Logged. Reign accordingly.',
  },
}

/* ─── Notify partner via SMS (fire-and-forget) ───────────────── */

async function notifyPartner({ recipientId, senderName, messageType }) {
  try {
    await supabase.functions.invoke('notify-partner', {
      body: { recipient_id: recipientId, sender_name: senderName, message_type: messageType },
    })
  } catch {
    // Non-critical — notification failure shouldn't block the send flow
  }
}

/* ─── Helpers ────────────────────────────────────────────────── */

function fmtTime(sec) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function fmtMsgTime(iso) {
  const d = new Date(iso)
  const diff = Date.now() - d
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

async function logDeposit({ depositType, profileId, partnerId, coupleId, currentScore }) {
  const points = DEPOSIT_BASE_VALUES[depositType] ?? 8
  const { error } = await supabase.from('deposits').insert({
    logger_id:         profileId,
    receiver_id:       partnerId ?? profileId,
    couple_id:         coupleId ?? null,
    deposit_type:      depositType,
    deposit_category:  coupleId ? 'couple' : 'social',
    effort_tier:       'quick',
    base_value:        points,
    ll_multiplier:     1.0,
    effort_multiplier: 1.0,
    final_value:       points,
    tokens_applied:    true,
    status:            'confirmed',
  })
  if (!error) {
    await supabase
      .from('profiles')
      .update({ current_score: (currentScore ?? 0) + points })
      .eq('id', profileId)
  }
  return { points, error }
}

/* ═══════════════════════════════════════════════════════════════
   Main component
═══════════════════════════════════════════════════════════════ */

export default function MessagePrompt({ partnerId, partnerName, coupleId, dark = false }) {
  const { profile } = useAuth()
  const [expanded, setExpanded]   = useState(false)
  const [mode, setMode]           = useState(partnerId ? 'text' : 'affirmation')
  const [text, setText]           = useState('')
  const [sending, setSending]     = useState(false)
  const [error, setError]         = useState('')
  const [messages, setMessages]   = useState([])
  const [copied, setCopied]       = useState(false)
  const threadRef                 = useRef(null)

  // Banking modal state
  const [bankModal, setBankModal]       = useState(null)   // null | 'text' | 'voice' | 'affirmation'
  const [bankSelected, setBankSelected] = useState('')
  const [banking, setBanking]           = useState(false)
  const [bankResult, setBankResult]     = useState(null)   // null | { points, msg }

  // Voice
  const [recording, setRecording]         = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [audioBlob, setAudioBlob]         = useState(null)
  const [audioUrl, setAudioUrl]           = useState('')
  const mediaRecorderRef = useRef(null)
  const chunksRef        = useRef([])
  const timerRef         = useRef(null)

  // Affirmation
  const templates = partnerId ? coupledTemplates(partnerName ?? 'them') : soloTemplates
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [customText, setCustomText]             = useState('')
  const [writingCustom, setWritingCustom]       = useState(false)
  const affirmationText = writingCustom ? customText : (selectedTemplate !== null ? templates[selectedTemplate] : '')

  /* ── Fetch full conversation thread ── */
  useEffect(() => {
    if (!profile?.id || !partnerId) return
    fetchMessages()
    const channel = supabase
      .channel(`messages:${profile.id}:${partnerId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => fetchMessages())
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [profile?.id, partnerId])

  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight
  }, [messages.length])

  async function fetchMessages() {
    if (!partnerId || !profile?.id) return
    const [{ data: sent }, { data: received }] = await Promise.all([
      supabase.from('messages').select('*').eq('sender_id', profile.id).eq('recipient_id', partnerId)
        .order('created_at', { ascending: false }).limit(30),
      supabase.from('messages').select('*').eq('sender_id', partnerId).eq('recipient_id', profile.id)
        .order('created_at', { ascending: false }).limit(30),
    ])
    const all = [...(sent ?? []), ...(received ?? [])].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    setMessages(all.slice(-30))
  }

  /* ── Theme tokens ── */
  const T = {
    bg:          dark ? 'var(--dark-card)'   : 'var(--white)',
    border:      dark ? 'var(--dark-border)' : 'var(--line)',
    text:        dark ? 'var(--dark-text)'   : 'var(--ink)',
    muted:       dark ? 'var(--dark-muted)'  : 'var(--muted)',
    input:       dark ? '#2a2a28'            : 'var(--cream)',
    inputBorder: dark ? 'var(--dark-border)' : 'var(--line)',
    accent:      dark ? 'var(--amber-l)'     : 'var(--amber)',
    sentBubble:  dark ? 'var(--amber-l)'     : 'var(--amber)',
    recvBubble:  dark ? '#2c2c2a'            : 'var(--white)',
    sentText:    dark ? 'var(--dark-bg)'     : '#fff',
    recvText:    dark ? 'var(--dark-text)'   : 'var(--ink)',
  }

  /* ── Open banking modal after send ── */
  function openBankModal(type) {
    setBankModal(type)
    setBankSelected(
      // Pre-select the single option if there's only one choice
      BANKING_OPTIONS[type].length === 1 ? BANKING_OPTIONS[type][0].type : ''
    )
    setBankResult(null)
  }

  function closeBankModal() {
    setBankModal(null)
    setBankSelected('')
    setBankResult(null)
    setBanking(false)
    setExpanded(false)
  }

  async function handleBank() {
    if (!bankSelected || banking) return
    setBanking(true)
    const { points } = await logDeposit({
      depositType:  bankSelected,
      profileId:    profile.id,
      partnerId:    partnerId ?? null,
      coupleId:     coupleId ?? null,
      currentScore: profile.current_score,
    })
    const accountant = profile?.accountant ?? 'fox'
    const confirms = BANK_CONFIRM[accountant] ?? BANK_CONFIRM.fox
    const msg = confirms[bankSelected] ?? confirms._default
    setBankResult({ points, msg })
    setBanking(false)
    setTimeout(closeBankModal, 2600)
  }

  /* ── Text send ── */
  async function sendText() {
    if (!text.trim()) return
    setSending(true); setError('')
    // Auto-append #LoveBank so the tag follows the message everywhere
    const tagged = text.trim() + '\n\n#LoveBank'
    const { error: e } = await supabase.from('messages').insert({
      sender_id: profile.id, recipient_id: partnerId,
      couple_id: coupleId, message_type: 'text', content: tagged,
    })
    if (e) { setError(e.message); setSending(false); return }
    setText('')
    setSending(false)
    await fetchMessages()
    notifyPartner({ recipientId: partnerId, senderName: profile.display_name, messageType: 'text' })
    openBankModal('text')
  }

  /* ── Voice recording ── */
  async function startRecording() {
    setError(''); setAudioBlob(null); setAudioUrl('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      chunksRef.current = []
      const recorder = new MediaRecorder(stream)
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        setAudioBlob(blob); setAudioUrl(URL.createObjectURL(blob))
      }
      mediaRecorderRef.current = recorder
      recorder.start(); setRecording(true); setRecordingTime(0)
      timerRef.current = setInterval(() => {
        setRecordingTime(t => { if (t >= 119) { stopRecording(); return t } return t + 1 })
      }, 1000)
    } catch { setError('Microphone access denied.') }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop()
    clearInterval(timerRef.current)
    setRecording(false)
  }

  async function sendVoiceNote() {
    if (!audioBlob) return
    setSending(true); setError('')
    const fileName = `${profile.id}/${Date.now()}.webm`
    const { error: uploadErr } = await supabase.storage
      .from('voice-notes').upload(fileName, audioBlob, { contentType: 'audio/webm', upsert: false })
    if (uploadErr) { setError('Upload failed — make sure the "voice-notes" bucket exists.'); setSending(false); return }
    const { data: { publicUrl } } = supabase.storage.from('voice-notes').getPublicUrl(fileName)
    const { error: e } = await supabase.from('messages').insert({
      sender_id: profile.id, recipient_id: partnerId,
      couple_id: coupleId, message_type: 'voice_note', audio_url: publicUrl,
    })
    if (e) { setError(e.message); setSending(false); return }
    setAudioBlob(null); setAudioUrl('')
    setSending(false)
    await fetchMessages()
    notifyPartner({ recipientId: partnerId, senderName: profile.display_name, messageType: 'voice_note' })
    openBankModal('voice')
  }

  /* ── Affirmation share ── */
  async function shareAffirmation() {
    if (!affirmationText) return
    setSending(true)
    // Ensure #LoveBank tag is present (templates already have it; custom text may not)
    const taggedAffirmation = affirmationText.includes('#LoveBank')
      ? affirmationText
      : affirmationText + ' #LoveBank'
    if (partnerId) {
      await supabase.from('messages').insert({
        sender_id: profile.id, recipient_id: partnerId, couple_id: coupleId,
        message_type: 'affirmation', content: taggedAffirmation, shared_publicly: true,
      })
    } else {
      await supabase.from('messages').insert({
        sender_id: profile.id, message_type: 'affirmation',
        content: taggedAffirmation, shared_publicly: true,
      })
    }
    if (navigator.share) {
      try { await navigator.share({ text: taggedAffirmation }) } catch { /* dismissed */ }
    } else {
      await navigator.clipboard.writeText(taggedAffirmation)
      setCopied(true); setTimeout(() => setCopied(false), 2500)
    }
    setSending(false)
    setSelectedTemplate(null); setCustomText(''); setWritingCustom(false)
    if (partnerId) {
      await fetchMessages()
      notifyPartner({ recipientId: partnerId, senderName: profile.display_name, messageType: 'affirmation' })
    }
    openBankModal('affirmation')
  }

  /* ══════════════════════════════════════════════════════════════
     BANKING MODAL (renders as portal-style overlay)
  ══════════════════════════════════════════════════════════════ */

  const bankingOptions = bankModal ? BANKING_OPTIONS[bankModal] ?? [] : []
  const accountantId   = profile?.accountant ?? 'fox'
  const ACCOUNTANT_EMOJIS = { fox: '🦊', owl: '🦉', bear: '🐻', wolf: '🐺', lion: '🦁' }
  const acctEmoji = ACCOUNTANT_EMOJIS[accountantId] ?? '🦊'

  const BankingModal = bankModal ? (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
      }}
    >
      {/* Backdrop */}
      <div
        onClick={!bankResult ? closeBankModal : undefined}
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)' }}
      />

      {/* Sheet */}
      <div style={{
        position: 'relative', zIndex: 1,
        background: 'var(--white)',
        borderRadius: '22px 22px 0 0',
        padding: '8px 0 40px',
        maxWidth: 430, width: '100%',
        margin: '0 auto',
        boxShadow: '0 -4px 40px rgba(0,0,0,0.18)',
      }}>
        {/* Drag handle */}
        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--line)', margin: '12px auto 20px' }} />

        {/* ── Confirmation state ── */}
        {bankResult ? (
          <div style={{ padding: '4px 24px 16px', textAlign: 'center' }}>
            <p style={{ fontSize: 40, marginBottom: 14 }}>{acctEmoji}</p>
            <p style={{ fontFamily: 'var(--font-serif)', fontSize: 28, fontWeight: 700, color: 'var(--teal)', marginBottom: 6 }}>
              +{bankResult.points} pts banked
            </p>
            <div style={{
              background: 'var(--amber-p)', border: '0.5px solid var(--line)',
              borderLeft: '3px solid var(--amber)',
              borderRadius: 12, padding: '14px 18px', margin: '16px 0 0',
            }}>
              <p style={{ fontSize: 14, color: 'var(--ink2)', lineHeight: 1.7, fontStyle: 'italic' }}>
                "{bankResult.msg}"
              </p>
            </div>
          </div>
        ) : (
          /* ── Selection state ── */
          <div style={{ padding: '0 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
              <span style={{ fontSize: 22 }}>
                {bankModal === 'text' ? '💬' : bankModal === 'voice' ? '🎤' : '✨'}
              </span>
              <div>
                <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>
                  Bank this {bankModal === 'voice' ? 'voice note' : bankModal === 'affirmation' ? 'affirmation' : 'message'}
                </p>
                <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                  What best describes what you sent?
                </p>
              </div>
            </div>

            {/* Options */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
              {bankingOptions.map(opt => (
                <button
                  key={opt.type}
                  onClick={() => setBankSelected(opt.type)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '14px 16px', borderRadius: 14, cursor: 'pointer', textAlign: 'left',
                    border: bankSelected === opt.type ? '2px solid var(--amber)' : '1.5px solid var(--line)',
                    background: bankSelected === opt.type ? 'var(--amber-p)' : 'var(--cream)',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {/* Radio dot */}
                    <div style={{
                      width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                      border: bankSelected === opt.type ? '5px solid var(--amber)' : '1.5px solid var(--line)',
                      transition: 'all 0.15s',
                    }} />
                    <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)' }}>
                      {opt.label}
                    </p>
                  </div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--teal)', flexShrink: 0, marginLeft: 10 }}>
                    +{opt.points}
                  </p>
                </button>
              ))}
            </div>

            {/* Actions */}
            <button
              onClick={handleBank}
              disabled={!bankSelected || banking}
              style={{
                width: '100%', padding: '15px', borderRadius: 100,
                background: bankSelected ? 'var(--ink)' : 'var(--line)',
                color: bankSelected ? 'var(--white)' : 'var(--muted)',
                border: 'none', fontSize: 15, fontWeight: 600, cursor: bankSelected ? 'pointer' : 'default',
                transition: 'all 0.2s',
              }}
            >
              {banking ? 'Banking…' : '🏦 Bank it →'}
            </button>

            <button
              onClick={closeBankModal}
              style={{
                width: '100%', marginTop: 10, padding: '12px', borderRadius: 100,
                background: 'transparent', border: 'none',
                fontSize: 13, color: 'var(--muted)', cursor: 'pointer',
              }}
            >
              Skip — don't bank this one
            </button>
          </div>
        )}
      </div>
    </div>
  ) : null

  /* ══════════════════════════════════════════════════════════════
     Collapsed bar
  ══════════════════════════════════════════════════════════════ */

  if (!expanded) {
    return (
      <>
        {BankingModal}
        <div style={{ marginBottom: 12 }}>
          <button
            onClick={() => setExpanded(true)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 12,
              padding: '13px 16px',
              borderRadius: messages.length > 0 ? '14px 14px 0 0' : 14,
              cursor: 'pointer', textAlign: 'left',
              background: T.bg, border: `0.5px solid ${T.border}`,
              borderBottom: messages.length > 0 ? 'none' : undefined,
            }}
          >
            <span style={{ fontSize: 16 }}>{partnerId ? '💬' : '✨'}</span>
            <p style={{ flex: 1, fontSize: 13, color: T.muted }}>
              {partnerId ? `Message ${partnerName}…` : 'Create an affirmation…'}
            </p>
            {partnerId && (
              <div style={{ display: 'flex', gap: 12 }}>
                <span style={{ fontSize: 15, opacity: 0.55 }}>🎤</span>
                <span style={{ fontSize: 15, opacity: 0.55 }}>✨</span>
              </div>
            )}
          </button>

          {/* iMessage thread */}
          {partnerId && messages.length > 0 && (
            <div
              ref={threadRef}
              style={{
                background: T.bg, border: `0.5px solid ${T.border}`,
                borderTop: 'none', borderRadius: '0 0 14px 14px',
                padding: '8px 12px 12px', maxHeight: 220, overflowY: 'auto',
                display: 'flex', flexDirection: 'column', gap: 6,
              }}
            >
              {messages.map(m => (
                <ChatBubble key={m.id} message={m} isMine={m.sender_id === profile.id} partnerName={partnerName} T={T} />
              ))}
            </div>
          )}
        </div>
      </>
    )
  }

  /* ══════════════════════════════════════════════════════════════
     Expanded compose
  ══════════════════════════════════════════════════════════════ */

  return (
    <>
      {BankingModal}
      <div style={{ background: T.bg, border: `0.5px solid ${T.border}`, borderRadius: 14, marginBottom: 12, overflow: 'hidden' }}>

        {/* Thread preview */}
        {partnerId && messages.length > 0 && (
          <div ref={threadRef} style={{
            padding: '10px 12px 8px', maxHeight: 180, overflowY: 'auto',
            borderBottom: `0.5px solid ${T.border}`,
            display: 'flex', flexDirection: 'column', gap: 6,
          }}>
            {messages.map(m => (
              <ChatBubble key={m.id} message={m} isMine={m.sender_id === profile.id} partnerName={partnerName} T={T} />
            ))}
          </div>
        )}

        <div style={{ padding: 16 }}>

          {/* Mode tabs */}
          {partnerId ? (
            <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
              {[['text', '💬 Text'], ['voice', '🎤 Voice'], ['affirmation', '✨ Post']].map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => { setMode(id); setError('') }}
                  style={{
                    flex: 1, padding: '7px 4px', borderRadius: 8, fontSize: 11, fontWeight: 500, cursor: 'pointer',
                    border: mode === id ? 'none' : `1px solid ${T.border}`,
                    background: mode === id ? T.accent : 'transparent',
                    color: mode === id ? (dark ? 'var(--dark-bg)' : '#fff') : T.muted,
                    transition: 'all 0.15s', minHeight: 36,
                  }}
                >{label}</button>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: 11, color: T.muted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14 }}>
              ✨ Create an affirmation
            </p>
          )}

          {/* ── Text ── */}
          {mode === 'text' && (
            <>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <textarea
                  autoFocus
                  value={text}
                  onChange={e => setText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText() } }}
                  placeholder={`Write something for ${partnerName}…`}
                  rows={2}
                  style={{
                    flex: 1, padding: '10px 12px', borderRadius: 20, fontSize: 13, lineHeight: 1.5,
                    border: `1px solid ${T.inputBorder}`, background: T.input, color: T.text,
                    resize: 'none', fontFamily: 'var(--font-sans)', outline: 'none',
                  }}
                />
                <button
                  onClick={sendText}
                  disabled={!text.trim() || sending}
                  aria-label="Send"
                  style={{
                    width: 40, height: 40, minHeight: 40, borderRadius: '50%',
                    background: text.trim() ? T.accent : T.border,
                    border: 'none', cursor: text.trim() ? 'pointer' : 'default',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 16, transition: 'background 0.2s', flexShrink: 0,
                  }}
                >↑</button>
              </div>
              {error && <p style={{ fontSize: 12, color: 'var(--red)', marginTop: 6 }}>{error}</p>}
              <button onClick={() => setExpanded(false)} style={{ width: '100%', marginTop: 10, padding: '8px', borderRadius: 8, fontSize: 12, background: 'transparent', border: 'none', color: T.muted, cursor: 'pointer', minHeight: 36 }}>
                Cancel
              </button>
            </>
          )}

          {/* ── Voice ── */}
          {mode === 'voice' && (
            <>
              {!recording && !audioUrl && (
                <div style={{ textAlign: 'center', padding: '12px 0' }}>
                  <p style={{ fontSize: 13, color: T.muted, marginBottom: 14, lineHeight: 1.6 }}>
                    Record a voice note for {partnerName}. Up to 2 minutes.
                  </p>
                  <button
                    onClick={startRecording}
                    style={{ width: 64, height: 64, minHeight: 64, borderRadius: '50%', background: 'var(--red)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', fontSize: 24 }}
                  >🎤</button>
                  <p style={{ fontSize: 11, color: T.muted, marginTop: 8 }}>Tap to record</p>
                </div>
              )}
              {recording && (
                <div style={{ textAlign: 'center', padding: '12px 0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 12 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--red)', animation: 'pulse 1s infinite' }} />
                    <p style={{ fontSize: 22, fontWeight: 700, color: T.text, fontFamily: 'var(--font-mono, monospace)' }}>{fmtTime(recordingTime)}</p>
                  </div>
                  <p style={{ fontSize: 12, color: T.muted, marginBottom: 14 }}>Recording…</p>
                  <button onClick={stopRecording} style={{ padding: '10px 24px', borderRadius: 8, background: 'var(--red)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>⏹ Stop</button>
                </div>
              )}
              {audioUrl && !recording && (
                <>
                  <p style={{ fontSize: 12, color: T.muted, marginBottom: 8 }}>Preview:</p>
                  <audio controls src={audioUrl} style={{ width: '100%', borderRadius: 8, marginBottom: 12 }} />
                  {error && <p style={{ fontSize: 12, color: 'var(--red)', marginBottom: 8 }}>{error}</p>}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => { setAudioBlob(null); setAudioUrl('') }} style={{ padding: '10px 14px', borderRadius: 8, fontSize: 13, background: 'transparent', border: `1px solid ${T.border}`, color: T.muted, cursor: 'pointer' }}>Re-record</button>
                    <button onClick={sendVoiceNote} disabled={sending} style={{ flex: 1, padding: '10px', borderRadius: 8, fontSize: 13, fontWeight: 500, background: T.accent, color: dark ? 'var(--dark-bg)' : '#fff', border: 'none', cursor: 'pointer', opacity: sending ? 0.6 : 1 }}>
                      {sending ? 'Sending…' : `Send to ${partnerName} →`}
                    </button>
                  </div>
                </>
              )}
              {!recording && !audioUrl && (
                <button onClick={() => setExpanded(false)} style={{ width: '100%', marginTop: 8, padding: '10px', borderRadius: 8, fontSize: 13, background: 'transparent', border: `1px solid ${T.border}`, color: T.muted, cursor: 'pointer' }}>Cancel</button>
              )}
            </>
          )}

          {/* ── Affirmation ── */}
          {mode === 'affirmation' && (
            <>
              <p style={{ fontSize: 12, color: T.muted, marginBottom: 10, lineHeight: 1.5 }}>
                {partnerId
                  ? 'Pick a template or write your own — it\'ll be sent to your partner, then you can bank it.'
                  : 'Share it to social, then bank it as a deposit.'}
              </p>
              {templates.map((t, i) => (
                <button
                  key={i}
                  onClick={() => { setSelectedTemplate(i); setWritingCustom(false) }}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%', textAlign: 'left',
                    padding: '10px 12px', borderRadius: 10, marginBottom: 6, cursor: 'pointer',
                    border: selectedTemplate === i && !writingCustom ? `1.5px solid ${T.accent}` : `1px solid ${T.border}`,
                    background: selectedTemplate === i && !writingCustom ? (dark ? '#2a2218' : 'var(--amber-p)') : T.input,
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ width: 14, height: 14, borderRadius: '50%', flexShrink: 0, marginTop: 2, border: selectedTemplate === i && !writingCustom ? `4px solid ${T.accent}` : `1.5px solid ${T.border}`, transition: 'all 0.15s' }} />
                  <p style={{ fontSize: 12, color: T.text, lineHeight: 1.6 }}>{t}</p>
                </button>
              ))}
              <button
                onClick={() => { setWritingCustom(true); setSelectedTemplate(null) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                  padding: '10px 12px', borderRadius: 10, marginBottom: 10, cursor: 'pointer',
                  border: writingCustom ? `1.5px solid ${T.accent}` : `1px solid ${T.border}`,
                  background: writingCustom ? (dark ? '#2a2218' : 'var(--amber-p)') : T.input,
                }}
              >
                <div style={{ width: 14, height: 14, borderRadius: '50%', flexShrink: 0, border: writingCustom ? `4px solid ${T.accent}` : `1.5px solid ${T.border}` }} />
                <p style={{ fontSize: 12, color: T.muted }}>Write your own…</p>
              </button>
              {writingCustom && (
                <textarea
                  autoFocus value={customText} onChange={e => setCustomText(e.target.value)}
                  placeholder="Type your affirmation here… #LoveBank" rows={3}
                  style={{ width: '100%', padding: '12px', borderRadius: 10, fontSize: 13, lineHeight: 1.6, border: `1px solid ${T.inputBorder}`, background: T.input, color: T.text, resize: 'none', fontFamily: 'var(--font-sans)', outline: 'none', marginBottom: 10 }}
                />
              )}
              {affirmationText && (
                <div style={{ background: dark ? '#1a1a18' : 'var(--cream)', border: `0.5px solid ${T.border}`, borderRadius: 10, padding: '12px', marginBottom: 12 }}>
                  <p style={{ fontSize: 10, color: T.muted, marginBottom: 4, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Preview</p>
                  <p style={{ fontSize: 13, color: T.text, lineHeight: 1.7 }}>{affirmationText}</p>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setExpanded(false)} style={{ padding: '10px 14px', borderRadius: 8, fontSize: 13, background: 'transparent', border: `1px solid ${T.border}`, color: T.muted, cursor: 'pointer' }}>Cancel</button>
                <button
                  onClick={shareAffirmation}
                  disabled={!affirmationText || sending}
                  style={{ flex: 1, padding: '10px', borderRadius: 8, fontSize: 13, fontWeight: 500, background: T.accent, color: dark ? 'var(--dark-bg)' : '#fff', border: 'none', cursor: 'pointer', opacity: !affirmationText || sending ? 0.5 : 1 }}
                >
                  {sending ? 'Sharing…' : copied ? '✓ Copied!' : '✨ Share →'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}

/* ─── iMessage-style chat bubble ────────────────────────────── */

/**
 * Splits message content into [body, hashtagLine].
 * If the last line is "#LoveBank", it's separated for styled rendering.
 */
function splitTag(content = '') {
  const lines = content.split('\n')
  const last  = lines[lines.length - 1].trim()
  if (last === '#LoveBank') {
    return { body: lines.slice(0, -1).join('\n').trim(), tag: '#LoveBank' }
  }
  return { body: content, tag: null }
}

function ChatBubble({ message, isMine, partnerName, T }) {
  const isVoice       = message.message_type === 'voice_note'
  const isAffirmation = message.message_type === 'affirmation'
  const { body, tag } = isVoice ? { body: null, tag: null } : splitTag(message.content)

  return (
    <div style={{ display: 'flex', flexDirection: isMine ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 6 }}>

      {/* Partner avatar */}
      {!isMine && (
        <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--amber)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff' }}>
          {partnerName?.[0]?.toUpperCase() ?? '?'}
        </div>
      )}

      <div style={{ maxWidth: '76%', display: 'flex', flexDirection: 'column', alignItems: isMine ? 'flex-end' : 'flex-start', gap: 3 }}>

        {/* Bubble */}
        <div style={{
          padding: isVoice ? '8px 10px' : '9px 13px',
          borderRadius: isMine ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
          background: isMine ? T.sentBubble : T.recvBubble,
          border: isMine ? 'none' : `0.5px solid ${T.border}`,
          boxShadow: isMine ? 'none' : '0 1px 2px rgba(0,0,0,0.06)',
        }}>
          {isVoice ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14, flexShrink: 0 }}>🎤</span>
              <audio controls src={message.audio_url} style={{ width: 160, height: 28, borderRadius: 4 }} />
            </div>
          ) : isAffirmation ? (
            <p style={{ fontSize: 12, color: isMine ? T.sentText : T.recvText, lineHeight: 1.5, fontStyle: 'italic' }}>
              ✨ {body || message.content}
            </p>
          ) : (
            <p style={{ fontSize: 13, color: isMine ? T.sentText : T.recvText, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
              {body || message.content}
            </p>
          )}
        </div>

        {/* #LoveBank tag + timestamp row */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          flexDirection: isMine ? 'row-reverse' : 'row',
          paddingInline: 4,
        }}>
          {/* 🏦 #LoveBank badge — shown on all messages (tag from content, or always on voice/affirmation) */}
          {(tag || isVoice || isAffirmation) && (
            <span style={{
              fontSize: 10, fontWeight: 600,
              color: isMine ? 'var(--amber)' : 'var(--amber)',
              letterSpacing: '0.01em',
            }}>
              🏦 #LoveBank
            </span>
          )}
          <p style={{ fontSize: 10, color: T.muted }}>
            {fmtMsgTime(message.created_at)}
          </p>
        </div>

      </div>
    </div>
  )
}
