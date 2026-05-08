import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { STAGE_OPENING_BALANCE, LL_LABELS } from '../../lib/scoring'
import { ACCOUNTANTS } from '../../lib/accountants'

/* ─── Constants ──────────────────────────────────────────────── */

const SOLO_STAGE_IDS = ['single', 'casual_dating', 'starting_over', 'healing', 'coparenting']

const STAGES_SOLO = [
  { id: 'single',        label: 'On my own',          hint: 'Investing in myself and building healthy patterns' },
  { id: 'casual_dating', label: 'Exploring connections', hint: 'Meeting people and figuring out what I want' },
]

const STAGES_REBUILDING = [
  { id: 'starting_over', label: 'Starting fresh',     hint: "Finding my footing again after a major change" },
  { id: 'healing',       label: 'Healing and growing', hint: 'Processing the past and moving forward at my own pace' },
  { id: 'coparenting',   label: 'Co-parenting',        hint: 'Navigating parenthood alongside someone I used to be with' },
]

const STAGES_COUPLED = [
  { id: 'dating',    label: 'In a relationship', hint: 'Committed and building something real together' },
  { id: 'engaged',   label: 'Engaged',           hint: 'The ring is on, the planning has begun' },
  { id: 'newlyweds', label: 'Newlyweds',          hint: 'Married within the last 2 years' },
  { id: 'married',   label: 'Married',            hint: 'Established partnership, growing together' },
]

const GENDERS = [
  { id: 'male',           label: 'Male',            hint: 'He / Him / His' },
  { id: 'female',         label: 'Female',          hint: 'She / Her / Hers' },
  { id: 'prefer_not_say', label: 'Rather not say',  hint: 'They / Them / Their' },
]

const FOCUS_AREAS_SOLO = [
  { id: 'self_awareness', label: 'Self-awareness',    hint: 'Understanding my emotional patterns and triggers' },
  { id: 'dating_habits',  label: 'Dating habits',     hint: 'How I show up in early or casual relationships' },
  { id: 'communication',  label: 'Communication',     hint: 'Expressing myself clearly and listening better' },
  { id: 'consistency',    label: 'Daily consistency', hint: 'Building habits that reflect my values' },
  { id: 'healing',        label: 'Healing',           hint: 'Processing a past relationship and moving forward' },
]

const FOCUS_AREAS_COUPLED = [
  { id: 'emotional_connection', label: 'Emotional connection', hint: 'Feeling truly close and understood by each other' },
  { id: 'conflict',             label: 'Conflict resolution',  hint: 'Handling disagreements without lasting damage' },
  { id: 'communication',        label: 'Communication',        hint: 'Talking more openly and listening better' },
  { id: 'consistency',          label: 'Daily consistency',    hint: 'Showing up for each other every day' },
  { id: 'intimacy',             label: 'Intimacy',             hint: 'Physical and emotional closeness' },
]

const LOVE_LANGUAGES = [
  { id: 'words', icon: '💬', label: 'Words of affirmation', desc: 'Verbal compliments, encouragement, appreciation said out loud' },
  { id: 'time',  icon: '⏱', label: 'Quality time',         desc: 'Undivided attention, being fully present, shared experiences' },
  { id: 'touch', icon: '🤝', label: 'Physical touch',       desc: 'Hugs, hand-holding — physical presence as comfort' },
  { id: 'acts',  icon: '🛠', label: 'Acts of service',      desc: 'Actions that say "I\'ve got you" — handling things, showing up' },
  { id: 'gifts', icon: '🎁', label: 'Gift giving',          desc: 'Thoughtful tokens that show you were thinking of them' },
]

const DATE_TYPES = [
  { id: 'dating',    label: 'When we started dating', hint: 'The day the relationship became official' },
  { id: 'engaged',   label: 'When we got engaged',    hint: 'The day of the proposal' },
  { id: 'wedding',   label: 'Our wedding date',        hint: 'The day we got married' },
  { id: 'milestone', label: 'Another milestone',       hint: 'A moment that mattered to both of you' },
]

const LL_QUIZ = [
  {
    q: 'After a really tough week, what would mean the most from someone who cares about you?',
    options: [
      { label: 'A heartfelt message or compliment', ll: 'words' },
      { label: 'Uninterrupted time together, no phones', ll: 'time' },
      { label: 'A long hug or them staying physically close', ll: 'touch' },
      { label: 'Them handling something you were stressed about', ll: 'acts' },
      { label: 'A small thoughtful gift that shows they were thinking of you', ll: 'gifts' },
    ],
  },
  {
    q: 'How do you most feel cared for day-to-day?',
    options: [
      { label: 'When someone says something specific they appreciate about me', ll: 'words' },
      { label: 'When we do things together, even just sitting in the same room', ll: 'time' },
      { label: 'When someone reaches for my hand or gives me a random hug', ll: 'touch' },
      { label: 'When someone does something helpful without me asking', ll: 'acts' },
      { label: 'When someone brings me something — even something tiny', ll: 'gifts' },
    ],
  },
  {
    q: 'Which would hurt most in a relationship?',
    options: [
      { label: 'Rarely hearing that I\'m appreciated or valued', ll: 'words' },
      { label: 'Always being too busy to spend real time with me', ll: 'time' },
      { label: 'Not being affectionate or physically close anymore', ll: 'touch' },
      { label: 'Never helping out or following through', ll: 'acts' },
      { label: 'Forgetting important occasions or never putting thought into surprises', ll: 'gifts' },
    ],
  },
  {
    q: 'After a disagreement, what helps you feel reconnected?',
    options: [
      { label: 'Hearing that we\'re okay and that I\'m loved', ll: 'words' },
      { label: 'Spending quality time together to reset', ll: 'time' },
      { label: 'A hug or physical closeness', ll: 'touch' },
      { label: 'Them doing something kind without being asked', ll: 'acts' },
      { label: 'A small peace offering — a note, a treat, something symbolic', ll: 'gifts' },
    ],
  },
  {
    q: 'Which scenario would make you feel most seen?',
    options: [
      { label: 'A heartfelt message about what I mean to someone', ll: 'words' },
      { label: 'A whole day planned just for the two of us', ll: 'time' },
      { label: 'Being held, danced with, or physically celebrated', ll: 'touch' },
      { label: 'Someone taking care of everything so I can just enjoy the day', ll: 'acts' },
      { label: 'A meaningful gift they put real thought into', ll: 'gifts' },
    ],
  },
]

const COMM_STYLES = [
  { id: 'process_first', label: 'Process first, then talk',    hint: 'I need to understand my feelings before explaining them' },
  { id: 'say_it_direct', label: 'Say it directly, right away', hint: 'I\'m comfortable with discomfort in the moment' },
  { id: 'need_space',    label: 'I need space first',          hint: 'I withdraw to regulate, then come back to talk' },
  { id: 'write_it_out',  label: 'Write it out',                hint: 'I communicate better in writing than speaking' },
]

const NEEDS_OPTIONS = [
  'Feeling heard', 'Consistency', 'Emotional safety', 'Adventure together',
  'Space & independence', 'Physical closeness', 'Being prioritised',
  'Honest communication', 'Shared goals', 'Playfulness',
]

const FEARS_OPTIONS = [
  'Being abandoned', 'Losing myself', 'Not being enough',
  'Being taken for granted', 'Conflict escalating', 'Not being chosen',
]

/* ─── Component ──────────────────────────────────────────────── */

export default function Onboarding({ startAtInvite }) {
  const { profile, refreshProfile } = useAuth()
  const navigate = useNavigate()

  const [step, setStep]           = useState(startAtInvite ? 9 : 0)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteSent, setInviteSent]   = useState(false)
  const [inviteLink, setInviteLink]   = useState('')

  // LL quiz
  const [showLLQuiz, setShowLLQuiz]       = useState(false)
  const [llQuizAnswers, setLLQuizAnswers] = useState([])
  const [llQuizStep, setLLQuizStep]       = useState(0)

  const [form, setForm] = useState({
    stage:      '',
    gender:     '',
    accountant: '',
    focus_area: '',
    start_date: '',
    date_type:  '',
    my_ll:      '',
    partner_ll: '',
    comm_style: '',
    needs:      [],
    fears:      [],
  })

  const isSolo = SOLO_STAGE_IDS.includes(form.stage)

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }
  function goNext() { setStep(s => s + 1) }
  function goBack() { setStep(s => Math.max(s - 1, 0)) }

  /* ── LL quiz helpers ── */
  function deriveLLFromQuiz(answers) {
    const counts = { words: 0, time: 0, touch: 0, acts: 0, gifts: 0 }
    answers.forEach(ll => { if (counts[ll] !== undefined) counts[ll]++ })
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
  }

  function handleLLQuizAnswer(ll) {
    const next = [...llQuizAnswers, ll]
    setLLQuizAnswers(next)
    if (llQuizStep < LL_QUIZ.length - 1) {
      setLLQuizStep(s => s + 1)
    } else {
      set('my_ll', deriveLLFromQuiz(next))
      setShowLLQuiz(false)
      setLLQuizAnswers([])
      setLLQuizStep(0)
    }
  }

  function toggleArr(key, val, max) {
    setForm(f => {
      const arr = f[key]
      if (arr.includes(val)) return { ...f, [key]: arr.filter(x => x !== val) }
      if (arr.length >= max) return f
      return { ...f, [key]: [...arr, val] }
    })
  }

  /* ── Save ── */
  async function saveProfile() {
    setSaving(true)
    setError('')

    const updateData = {
      relationship_stage:  form.stage,
      relationship_mode:   isSolo ? 'solo' : 'coupled',
      gender:              form.gender || null,
      accountant:          form.accountant || 'fox',
      focus_area:          form.focus_area || null,
      love_language:       form.my_ll,
      partner_ll_guess:    form.partner_ll || null,
      communication_style: form.comm_style,
      needs:               form.needs,
      fears:               form.fears,
      onboarding_complete: true,
    }

    if (!isSolo && form.start_date) {
      updateData.relationship_start = form.start_date
    }

    // Solo users get their opening balance set immediately
    if (isSolo) {
      updateData.current_score = STAGE_OPENING_BALANCE[form.stage] ?? 200
    }

    const { error } = await supabase.from('profiles').update(updateData).eq('id', profile.id)
    setSaving(false)
    if (error) { setError(error.message); return false }
    await refreshProfile()
    return true
  }

  async function handleSaveAndFinish() {
    const ok = await saveProfile()
    if (!ok) return

    if (isSolo) {
      navigate('/')
      return
    }

    // Coupled — check if this user was invited
    const pendingRedirect = localStorage.getItem('lb_invite_redirect')
    if (pendingRedirect) {
      localStorage.removeItem('lb_invite_redirect')
      navigate(pendingRedirect)
    } else {
      goNext() // advance to invite step
    }
  }

  async function sendInvite() {
    setSaving(true)
    setError('')

    let coupleId = profile.couple_id
    if (!coupleId) {
      const opening = STAGE_OPENING_BALANCE[form.stage] ?? 150
      const { data: couple, error: cErr } = await supabase.from('couples').insert({
        partner_a_id:       profile.id,
        relationship_stage: form.stage,
        relationship_start: form.start_date || null,
        opening_balance:    opening,
        couple_score:       opening,
      }).select().single()
      if (cErr) { setError(cErr.message); setSaving(false); return }
      coupleId = couple.id
      await supabase.from('profiles').update({ couple_id: coupleId, current_score: opening }).eq('id', profile.id)
    }

    const { data: invite, error: iErr } = await supabase.from('invites').insert({
      inviter_id:    profile.id,
      invitee_email: inviteEmail || null,
    }).select().single()
    if (iErr) { setError(iErr.message); setSaving(false); return }

    setInviteLink(`${window.location.origin}/invite/${invite.token}`)
    setInviteSent(true)
    setSaving(false)
  }

  /* ─── Step definitions ───────────────────────────────────────── */

  const focusAreas = isSolo ? FOCUS_AREAS_SOLO : FOCUS_AREAS_COUPLED

  // LL picker (shared content, used in both paths)
  const llPicker = (
    showLLQuiz ? (
      <div>
        <p style={{ fontSize: 11, color: 'var(--amber)', fontWeight: 500, marginBottom: 12, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          Question {llQuizStep + 1} of {LL_QUIZ.length}
        </p>
        <p style={{ fontFamily: 'var(--font-serif)', fontSize: 20, marginBottom: 16, lineHeight: 1.4 }}>
          {LL_QUIZ[llQuizStep].q}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {LL_QUIZ[llQuizStep].options.map((opt, i) => (
            <button
              key={i}
              onClick={() => handleLLQuizAnswer(opt.ll)}
              style={{ padding: '12px 14px', borderRadius: 12, border: '1px solid var(--line)', background: 'var(--white)', cursor: 'pointer', fontSize: 13, lineHeight: 1.5, textAlign: 'left' }}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => { setShowLLQuiz(false); setLLQuizAnswers([]); setLLQuizStep(0) }}
          style={{ background: 'none', border: 'none', fontSize: 12, color: 'var(--muted)', marginTop: 16, cursor: 'pointer' }}
        >
          ← Back to pick manually
        </button>
      </div>
    ) : (
      <>
        {form.my_ll && (
          <div style={{ background: 'var(--amber-p)', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: 'var(--amber)' }}>
            ✓ Quiz result: <strong>{LL_LABELS[form.my_ll]}</strong> — you can change this below.
          </div>
        )}
        {LOVE_LANGUAGES.map(ll => (
          <LLOption key={ll.id} ll={ll} selected={form.my_ll === ll.id} onClick={() => set('my_ll', ll.id)} />
        ))}
        <button
          onClick={() => { setShowLLQuiz(true); setLLQuizAnswers([]); setLLQuizStep(0) }}
          style={{ width: '100%', marginTop: 8, padding: '12px', borderRadius: 12, border: '1px dashed var(--line)', background: 'transparent', fontSize: 13, color: 'var(--muted)', cursor: 'pointer' }}
        >
          🤔 I'm not sure — take the quiz
        </button>
      </>
    )
  )

  const sharedSteps = [
    /* ── 0: Stage + Gender ── */
    <StepCard key="stage" title="Which of these best describes you?" sub="This shapes how the app works for you. No labels — just pick what fits.">
      <p style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>On my own</p>
      {STAGES_SOLO.map(s => (
        <OptionRow key={s.id} selected={form.stage === s.id} onClick={() => set('stage', s.id)} label={s.label} hint={s.hint} />
      ))}
      <p style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '16px 0 8px' }}>Rebuilding</p>
      {STAGES_REBUILDING.map(s => (
        <OptionRow key={s.id} selected={form.stage === s.id} onClick={() => set('stage', s.id)} label={s.label} hint={s.hint} />
      ))}
      <p style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '16px 0 8px' }}>With a partner</p>
      {STAGES_COUPLED.map(s => (
        <OptionRow key={s.id} selected={form.stage === s.id} onClick={() => set('stage', s.id)} label={s.label} hint={s.hint} />
      ))}
      <p style={{ fontSize: 13, fontWeight: 600, margin: '20px 0 8px', color: 'var(--ink)' }}>Your gender</p>
      <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12, lineHeight: 1.5 }}>
        We use this to address you correctly throughout the app.
      </p>
      {GENDERS.map(g => (
        <OptionRow key={g.id} selected={form.gender === g.id} onClick={() => set('gender', g.id)} label={g.label} hint={g.hint} />
      ))}
      <NavRow onNext={goNext} disabled={!form.stage || !form.gender} />
    </StepCard>,

    /* ── 1: Accountant ── */
    <StepCard key="accountant" title="Choose your accountant." sub="They'll advise you privately on the dashboard. Each one has a completely different voice.">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {ACCOUNTANTS.map(a => (
          <button
            key={a.id}
            onClick={() => set('accountant', a.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 14, width: '100%', textAlign: 'left',
              padding: '14px 16px', borderRadius: 14, cursor: 'pointer',
              border: form.accountant === a.id ? '1.5px solid var(--amber)' : '1px solid var(--line)',
              background: form.accountant === a.id ? 'var(--amber-p)' : 'var(--white)',
              transition: 'all 0.15s',
            }}
          >
            <span style={{ fontSize: 30, lineHeight: 1 }}>{a.emoji}</span>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{a.name}</p>
              <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, lineHeight: 1.4 }}>{a.tagline}</p>
            </div>
            {form.accountant === a.id && <span style={{ color: 'var(--amber)', fontSize: 16, flexShrink: 0 }}>✓</span>}
          </button>
        ))}
      </div>

      {form.accountant && (() => {
        const chosen = ACCOUNTANTS.find(a => a.id === form.accountant)
        return chosen ? (
          <div style={{ marginTop: 16, background: 'var(--white)', border: '1px solid var(--line)', borderRadius: 14, padding: '14px 16px' }}>
            <p style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
              {chosen.emoji} How {chosen.name} talks to you
            </p>
            <p style={{ fontSize: 13, color: 'var(--ink2)', lineHeight: 1.7, fontStyle: 'italic' }}>
              "{chosen.sample}"
            </p>
          </div>
        ) : null
      })()}

      <NavRow onBack={goBack} onNext={goNext} disabled={!form.accountant} />
    </StepCard>,

    /* ── 2: Focus area ── */
    <StepCard
      key="focus"
      title="What do you most want to work on?"
      sub={isSolo
        ? 'This shapes how we guide you on your journey. You can update it anytime.'
        : 'This shapes how we support your relationship. You can update it anytime.'}
    >
      {focusAreas.map(f => (
        <OptionRow key={f.id} selected={form.focus_area === f.id} onClick={() => set('focus_area', f.id)} label={f.label} hint={f.hint} />
      ))}
      <NavRow onBack={goBack} onNext={goNext} disabled={!form.focus_area} />
    </StepCard>,
  ]

  const soloSteps = [
    /* ── 3: My love language (solo) ── */
    <StepCard key="my-ll-solo" title="How do you best receive care?" sub="This helps us suggest the right deposits for you.">
      {llPicker}
      {!showLLQuiz && <NavRow onBack={goBack} onNext={goNext} disabled={!form.my_ll} />}
    </StepCard>,

    /* ── 4: Needs & fears (solo) ── */
    <StepCard key="needs-solo" title="What do you need most from your relationships?" sub="Pick up to 3. These shape your personal goals.">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
        {NEEDS_OPTIONS.map(n => (
          <Chip key={n} label={n} selected={form.needs.includes(n)} onClick={() => toggleArr('needs', n, 3)} />
        ))}
      </div>
      <p style={{ fontSize: 15, fontWeight: 500, marginBottom: 6 }}>What are you most afraid of in relationships?</p>
      <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>Pick up to 2. This stays private.</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
        {FEARS_OPTIONS.map(f => (
          <Chip key={f} label={f} selected={form.fears.includes(f)} onClick={() => toggleArr('fears', f, 2)} danger />
        ))}
      </div>
      <NavRow onBack={goBack} onNext={goNext} disabled={form.needs.length === 0} />
    </StepCard>,

    /* ── 5: Communication style (solo) ── */
    <StepCard key="comm-solo" title="How do you communicate when something's wrong?" sub="Honest answers help the app support you better.">
      {COMM_STYLES.map(s => (
        <OptionRow key={s.id} selected={form.comm_style === s.id} onClick={() => set('comm_style', s.id)} label={s.label} hint={s.hint} />
      ))}
      <NavRow onBack={goBack} onNext={goNext} disabled={!form.comm_style} />
    </StepCard>,

    /* ── 6: Review (solo) ── */
    <StepCard key="review-solo" title="You're almost there." sub="Here's what we've got — you can update any of this later.">
      <ToneAnchor solo />
      {(() => {
        const acct = ACCOUNTANTS.find(a => a.id === form.accountant)
        return acct ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--amber-p)', borderRadius: 12, padding: '12px 14px', marginBottom: 16 }}>
            <span style={{ fontSize: 24 }}>{acct.emoji}</span>
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--amber)' }}>{acct.name} is your accountant</p>
              <p style={{ fontSize: 12, color: 'var(--muted)' }}>{acct.tagline}</p>
            </div>
          </div>
        ) : null
      })()}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
        <ReviewRow label="Situation"        value={[...STAGES_SOLO, ...STAGES_COUPLED].find(s => s.id === form.stage)?.label} />
        <ReviewRow label="Focus area"       value={focusAreas.find(f => f.id === form.focus_area)?.label} />
        <ReviewRow label="Love language"    value={LL_LABELS[form.my_ll]} />
        <ReviewRow label="Your needs"       value={form.needs.join(', ')} />
        <ReviewRow label="Communication"    value={COMM_STYLES.find(s => s.id === form.comm_style)?.label} />
      </div>
      {error && <ErrorBox msg={error} />}
      <NavRow onBack={goBack} onNext={handleSaveAndFinish} nextLabel={saving ? 'Saving…' : 'Go to my dashboard →'} disabled={saving} />
    </StepCard>,
  ]

  const coupledSteps = [
    /* ── 3: Relationship date ── */
    <StepCard key="date" title="Is there a key date for your relationship?" sub="This is used for anniversary milestones. Tell us what it means to you.">
      <span className="section-label">What does this date represent?</span>
      {DATE_TYPES.map(dt => (
        <OptionRow key={dt.id} selected={form.date_type === dt.id} onClick={() => set('date_type', dt.id)} label={dt.label} hint={dt.hint} />
      ))}
      {form.date_type && (
        <div style={{ marginTop: 16 }}>
          <label className="input-label" htmlFor="start-date">The date</label>
          <input id="start-date" className="input" type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} />
          <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>Approximate is fine — we just use it for anniversary milestones.</p>
        </div>
      )}
      <NavRow onBack={goBack} onNext={goNext} nextLabel="Continue" />
    </StepCard>,

    /* ── 4: My love language (coupled) ── */
    <StepCard key="my-ll" title="How do you feel most loved?" sub="Pick the one that resonates most — or take a quick quiz if you're not sure.">
      {llPicker}
      {!showLLQuiz && <NavRow onBack={goBack} onNext={goNext} disabled={!form.my_ll} />}
    </StepCard>,

    /* ── 5: Partner love language ── */
    <StepCard key="partner-ll" title="How does your partner feel most loved?" sub="Your best guess is fine — they'll complete their own profile.">
      {LOVE_LANGUAGES.map(ll => (
        <LLOption key={ll.id} ll={ll} selected={form.partner_ll === ll.id} onClick={() => set('partner_ll', ll.id)} />
      ))}
      <NavRow onBack={goBack} onNext={goNext} disabled={!form.partner_ll} />
    </StepCard>,

    /* ── 6: Needs & fears (coupled) ── */
    <StepCard key="needs" title="What do you need most?" sub="Pick up to 3. These shape your personal goals on the balance sheet.">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
        {NEEDS_OPTIONS.map(n => (
          <Chip key={n} label={n} selected={form.needs.includes(n)} onClick={() => toggleArr('needs', n, 3)} />
        ))}
      </div>
      <p style={{ fontSize: 15, fontWeight: 500, marginBottom: 6 }}>What are you most afraid of?</p>
      <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>Pick up to 2. This stays private — never shown to your partner.</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
        {FEARS_OPTIONS.map(f => (
          <Chip key={f} label={f} selected={form.fears.includes(f)} onClick={() => toggleArr('fears', f, 2)} danger />
        ))}
      </div>
      <NavRow onBack={goBack} onNext={goNext} disabled={form.needs.length === 0} />
    </StepCard>,

    /* ── 7: Communication style (coupled) ── */
    <StepCard key="comm" title="How do you communicate when something's wrong?" sub="Honest answers help the app support you better.">
      {COMM_STYLES.map(s => (
        <OptionRow key={s.id} selected={form.comm_style === s.id} onClick={() => set('comm_style', s.id)} label={s.label} hint={s.hint} />
      ))}
      <NavRow onBack={goBack} onNext={goNext} disabled={!form.comm_style} />
    </StepCard>,

    /* ── 8: Review (coupled) ── */
    <StepCard key="review" title="You're almost there." sub="Here's what we know about you so far.">
      <ToneAnchor />
      {(() => {
        const acct = ACCOUNTANTS.find(a => a.id === form.accountant)
        return acct ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--amber-p)', borderRadius: 12, padding: '12px 14px', marginBottom: 16 }}>
            <span style={{ fontSize: 24 }}>{acct.emoji}</span>
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--amber)' }}>{acct.name} is your accountant</p>
              <p style={{ fontSize: 12, color: 'var(--muted)' }}>{acct.tagline}</p>
            </div>
          </div>
        ) : null
      })()}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
        <ReviewRow label="Stage"              value={STAGES_COUPLED.find(s => s.id === form.stage)?.label} />
        <ReviewRow label="Focus area"         value={focusAreas.find(f => f.id === form.focus_area)?.label} />
        <ReviewRow label="Key date"           value={form.start_date ? `${DATE_TYPES.find(d => d.id === form.date_type)?.label ?? ''} · ${form.start_date}` : 'Skipped'} />
        <ReviewRow label="Your love language" value={LL_LABELS[form.my_ll]} />
        <ReviewRow label="Partner's language" value={LL_LABELS[form.partner_ll]} />
        <ReviewRow label="Your needs"         value={form.needs.join(', ')} />
        <ReviewRow label="Communication"      value={COMM_STYLES.find(s => s.id === form.comm_style)?.label} />
      </div>
      {error && <ErrorBox msg={error} />}
      <NavRow onBack={goBack} onNext={handleSaveAndFinish} nextLabel={saving ? 'Saving…' : 'Save & invite partner →'} disabled={saving} />
    </StepCard>,

    /* ── 9: Invite (coupled) ── */
    <StepCard key="invite" title="Invite your partner." sub="They'll set up their own profile. Once you're both done, your couple score unlocks.">
      {!inviteSent ? (
        <>
          <label className="input-label" htmlFor="invite-email">Partner's email (optional)</label>
          <input
            id="invite-email"
            className="input"
            type="email"
            value={inviteEmail}
            onChange={e => setInviteEmail(e.target.value)}
            placeholder="partner@example.com"
            style={{ marginBottom: 16 }}
          />
          {error && <ErrorBox msg={error} />}
          <button className="btn-primary" onClick={sendInvite} disabled={saving}>
            {saving ? 'Generating invite…' : 'Generate invite link'}
          </button>
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: 'var(--amber-p)', borderRadius: 12, padding: 16 }}>
            <p style={{ fontSize: 12, color: 'var(--amber)', fontWeight: 500, marginBottom: 8 }}>Your invite link (valid 72 hours)</p>
            <p style={{ fontSize: 13, wordBreak: 'break-all', color: 'var(--ink2)', fontFamily: 'var(--font-mono)' }}>{inviteLink}</p>
          </div>
          <button className="btn-outline" onClick={() => navigator.clipboard.writeText(inviteLink)}>
            Copy link
          </button>
          <p style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', lineHeight: 1.6 }}>
            Share this link with your partner. Once they join, your couple score unlocks.
          </p>
          <button className="btn-amber" onClick={() => navigate('/')}>
            Go to your dashboard →
          </button>
        </div>
      )}
    </StepCard>,
  ]

  const steps      = [...sharedSteps, ...(isSolo ? soloSteps : coupledSteps)]
  const totalSteps = steps.length
  const progress   = ((step + 1) / totalSteps) * 100
  const current    = steps[Math.min(step, steps.length - 1)]

  /* ─── Render ── */
  return (
    <div style={{ minHeight: '100vh', background: 'var(--cream)', padding: '72px 20px 60px', maxWidth: 430, margin: '0 auto' }}>

      {/* Progress bar */}
      <div
        role="progressbar"
        aria-valuenow={step + 1}
        aria-valuemin={1}
        aria-valuemax={totalSteps}
        aria-label="Onboarding progress"
        style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 3, background: 'var(--line)', zIndex: 100 }}
      >
        <div style={{ height: '100%', background: 'var(--amber)', width: `${progress}%`, transition: 'width 0.35s ease' }} />
      </div>

      {/* Brand */}
      <div style={{ marginBottom: 28 }}>
        <p style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--amber)', letterSpacing: '-0.01em' }}>
          Love Bank
        </p>
      </div>

      {current}
    </div>
  )
}

/* ─── Sub-components ─────────────────────────────────────────── */

function ToneAnchor({ solo }) {
  return (
    <div style={{ background: '#eef8f5', border: '1px solid #b2dfdb', borderRadius: 12, padding: '14px 16px', marginBottom: 20 }}>
      <p style={{ fontSize: 11, color: '#4a9880', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>
        Before you begin
      </p>
      <p style={{ fontSize: 13, color: 'var(--ink2)', lineHeight: 1.7 }}>
        {solo
          ? 'Love Bank tracks your investment in yourself and the people around you. Your score reflects consistency and awareness — not your worth, and not a verdict on any relationship.'
          : "Love Bank tracks the investment you both make in each other. Your score reflects patterns — not a verdict on your relationship. Use it to see clearly, not to judge."}
      </p>
    </div>
  )
}

function StepCard({ title, sub, children }) {
  return (
    <div>
      <p style={{ fontFamily: 'var(--font-serif)', fontSize: 26, fontWeight: 600, lineHeight: 1.3, marginBottom: 6 }}>{title}</p>
      <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 20, lineHeight: 1.6 }}>{sub}</p>
      {children}
    </div>
  )
}

function OptionRow({ selected, onClick, label, hint }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
        padding: '14px 16px', borderRadius: 12, marginBottom: 8, cursor: 'pointer',
        border: selected ? '1.5px solid var(--amber)' : '1px solid var(--line)',
        background: selected ? 'var(--amber-p)' : 'var(--white)',
        transition: 'all 0.15s',
      }}
    >
      <div style={{ width: 16, height: 16, borderRadius: '50%', flexShrink: 0, border: selected ? '5px solid var(--amber)' : '1.5px solid var(--line)', transition: 'all 0.15s' }} />
      <div>
        <p style={{ fontSize: 14, fontWeight: 500 }}>{label}</p>
        {hint && <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{hint}</p>}
      </div>
    </button>
  )
}

function LLOption({ ll, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 12, width: '100%', textAlign: 'left',
        padding: '14px 16px', borderRadius: 12, marginBottom: 8, cursor: 'pointer',
        border: selected ? '1.5px solid var(--amber)' : '1px solid var(--line)',
        background: selected ? 'var(--amber-p)' : 'var(--white)',
        transition: 'all 0.15s',
      }}
    >
      <span style={{ fontSize: 20, lineHeight: 1, marginTop: 1 }}>{ll.icon}</span>
      <div>
        <p style={{ fontSize: 14, fontWeight: 500 }}>{ll.label}</p>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, lineHeight: 1.5 }}>{ll.desc}</p>
      </div>
    </button>
  )
}

function Chip({ label, selected, onClick, danger }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '7px 14px', borderRadius: 100, cursor: 'pointer', fontSize: 13,
        border: selected ? (danger ? '1.5px solid var(--red)' : '1.5px solid var(--amber)') : '1px solid var(--line)',
        background: selected ? (danger ? 'var(--red-p)' : 'var(--amber-p)') : 'var(--white)',
        color: selected ? (danger ? 'var(--red)' : 'var(--amber)') : 'var(--ink)',
        transition: 'all 0.15s',
      }}
    >
      {label}
    </button>
  )
}

function NavRow({ onBack, onNext, disabled, nextLabel = 'Continue' }) {
  return (
    <div style={{ marginTop: 24, display: 'flex', gap: 10 }}>
      {onBack && (
        <button className="btn-outline" onClick={onBack} style={{ width: 'auto', padding: '13px 20px' }} aria-label="Go back">
          ←
        </button>
      )}
      <button className="btn-primary" onClick={onNext} disabled={disabled} style={{ flex: 1 }}>
        {nextLabel}
      </button>
    </div>
  )
}

function ReviewRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '0.5px solid var(--line)' }}>
      <p style={{ fontSize: 12, color: 'var(--muted)' }}>{label}</p>
      <p style={{ fontSize: 13, fontWeight: 500, textAlign: 'right', maxWidth: '60%' }}>{value || '—'}</p>
    </div>
  )
}

function ErrorBox({ msg }) {
  return (
    <p style={{ fontSize: 13, color: 'var(--red)', background: 'var(--red-p)', padding: '10px 14px', borderRadius: 8, marginBottom: 12 }}>
      {msg}
    </p>
  )
}
