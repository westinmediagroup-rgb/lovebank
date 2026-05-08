import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import NavBtn from '../../components/NavBtn'

// ─────────────────────────────────────────────────────────────
// DATA ARCHITECTURE NOTE
// Q&A questions and WYR prompts are currently seeded here in code.
// For production, move to Supabase tables:
//   game_questions (id, game_type, category, question, options jsonb)
//   game_wyr       (id, option_a, option_b, insight)
// This allows adding content without code deploys.
// ─────────────────────────────────────────────────────────────

// ── Q&A DATA ─────────────────────────────────────────────────
const QA_CATEGORIES = [
  {
    id: 'values', label: 'Values', emoji: '🧭',
    questions: [
      {
        q: 'What does financial security mean to you?',
        options: [
          { emoji:'💰', label:'Savings first',          desc:'Emergency fund, then everything else' },
          { emoji:'✈️', label:'Experiences over things', desc:'Spend on memories, not stuff' },
          { emoji:'🏡', label:'Own where we live',       desc:'Property is the priority' },
          { emoji:'🌊', label:'Take it as it comes',     desc:'Money flows — I don\'t stress it' },
        ],
        insight: 'Financial values are one of the top predictors of relationship friction. This doesn\'t need agreement — just understanding.',
      },
      {
        q: 'How important is your career to your identity?',
        options: [
          { emoji:'🚀', label:'Central',                 desc:'What I do is a big part of who I am' },
          { emoji:'⚖️', label:'Important but balanced',  desc:'I care about work but it\'s not everything' },
          { emoji:'🌿', label:'A means to an end',       desc:'Work funds the life I actually want' },
          { emoji:'🔄', label:'Still figuring it out',   desc:'My relationship with work is evolving' },
        ],
        insight: 'Career ambition alignment matters more in the long run than people expect.',
      },
      {
        q: 'How do you define success for yourself — right now?',
        options: [
          { emoji:'📈', label:'Career growth',           desc:'Title, impact, momentum' },
          { emoji:'🧘', label:'Inner peace',             desc:'Contentment and low stress' },
          { emoji:'💛', label:'Strong relationships',    desc:'The people around me' },
          { emoji:'🏗️', label:'Building something',      desc:'Creating legacy or financial freedom' },
        ],
        insight: 'How you define success privately shapes nearly every major decision you make.',
      },
    ],
  },
  {
    id: 'intimacy', label: 'Intimacy', emoji: '❤️',
    questions: [
      {
        q: 'How do you recharge after a hard day?',
        options: [
          { emoji:'🤫', label:'Quiet alone time',        desc:'I need space before I can connect' },
          { emoji:'🤝', label:'Talk it through',         desc:'I process by sharing' },
          { emoji:'🛋️', label:'Just being together',     desc:'Side by side, no need to talk' },
          { emoji:'🏃', label:'Physical reset',          desc:'A walk, gym, or movement first' },
        ],
        insight: 'How people recharge is deeply personal — and often the source of "you don\'t want to spend time with me" misreads.',
      },
      {
        q: 'How do you best receive an apology?',
        options: [
          { emoji:'🗣️', label:'Say it out loud',         desc:'I need to hear the words' },
          { emoji:'🛠️', label:'Show me through action',  desc:'Do something that shows you mean it' },
          { emoji:'⏳', label:'Give me time first',      desc:'I need space before I can receive it' },
          { emoji:'🤗', label:'Physical reassurance',    desc:'Hold me and then we can talk' },
        ],
        insight: 'How people receive apologies is different from how they give them — and both matter during repair moments.',
      },
      {
        q: 'What makes you feel most seen in a relationship?',
        options: [
          { emoji:'👂', label:'Being listened to',       desc:'Full attention, no distractions' },
          { emoji:'🧠', label:'Being understood',        desc:'They get why I think what I think' },
          { emoji:'🙏', label:'Being appreciated',       desc:'Noticed for what I do' },
          { emoji:'🫂', label:'Being chosen',            desc:'Prioritized even when it\'s not easy' },
        ],
        insight: 'Feeling seen is the foundation of intimacy. Most arguments are really about this.',
      },
    ],
  },
  {
    id: 'future', label: 'Future', emoji: '🔭',
    questions: [
      {
        q: 'In 5 years, what do you want your life to look like?',
        options: [
          { emoji:'🌱', label:'Settled & rooted',        desc:'Stable, community, home' },
          { emoji:'📈', label:'Growing fast',            desc:'Career, building, momentum' },
          { emoji:'🌍', label:'Somewhere new',           desc:'Different city or country' },
          { emoji:'🤷', label:'Honestly unclear',        desc:'Still figuring it out' },
        ],
        insight: 'Five-year visions don\'t need to be identical — but they need to be compatible.',
      },
      {
        q: 'How do you want to handle big decisions together?',
        options: [
          { emoji:'🤝', label:'Full consensus',          desc:'We both have to agree' },
          { emoji:'👥', label:'Lead by domain',          desc:'Each leads in their area' },
          { emoji:'💬', label:'Discuss then decide',     desc:'Talk first, one decides' },
          { emoji:'🌊', label:'Go with the flow',        desc:'Cross that bridge later' },
        ],
        insight: 'Decision-making style is one of the least-discussed but most important compatibility factors.',
      },
      {
        q: 'How do you feel about having children?',
        options: [
          { emoji:'👶', label:'Yes, definitely',         desc:'It\'s part of how I see my future' },
          { emoji:'🤔', label:'Open to it',              desc:'I could see it going either way' },
          { emoji:'🚫', label:'Not for me',              desc:'That\'s not the life I want' },
          { emoji:'⏳', label:'Too soon to know',        desc:'I haven\'t made up my mind' },
        ],
        insight: 'This is a dealbreaker conversation most couples avoid until it\'s too late. It doesn\'t need to be.',
      },
    ],
  },
  {
    id: 'conflict', label: 'Conflict', emoji: '⚡',
    questions: [
      {
        q: 'When you\'re upset, what do you need most?',
        options: [
          { emoji:'🤐', label:'Space first',             desc:'I need to calm down alone' },
          { emoji:'🗣️', label:'Talk immediately',        desc:'I need to process out loud' },
          { emoji:'🫂', label:'Physical comfort',        desc:'Hold me first, talk later' },
          { emoji:'✅', label:'A solution',              desc:'Tell me how we fix it' },
        ],
        insight: 'Most conflict escalation happens because partners meet upset with the wrong response. Knowing this prevents it.',
      },
      {
        q: 'How do you typically handle disagreement?',
        options: [
          { emoji:'🔥', label:'I speak up right away',   desc:'I don\'t hold back what I\'m feeling' },
          { emoji:'🧊', label:'I go quiet',              desc:'I shut down and need time' },
          { emoji:'🔄', label:'I look for compromise',   desc:'I try to find middle ground fast' },
          { emoji:'🪞', label:'I turn inward',           desc:'I question myself first' },
        ],
        insight: 'Neither style is wrong. The problem is when partners don\'t understand each other\'s default.',
      },
    ],
  },
  {
    id: 'communication', label: 'Connection', emoji: '💬',
    questions: [
      {
        q: 'How much quality time do you need each week?',
        options: [
          { emoji:'🌊', label:'All the time',            desc:'I want us deeply woven together' },
          { emoji:'🗓️', label:'A few intentional hours', desc:'Quality over quantity' },
          { emoji:'☀️', label:'Daily check-ins',         desc:'I just need to touch base regularly' },
          { emoji:'🌙', label:'Flexible — I adapt',      desc:'I don\'t have a fixed need' },
        ],
        insight: 'Time needs mismatch is one of the most common — and fixable — relationship strains.',
      },
      {
        q: 'What do you wish your partner understood better about you?',
        options: [
          { emoji:'🧠', label:'How I think',             desc:'My reasoning, not just my feelings' },
          { emoji:'💔', label:'What hurts me',           desc:'The things I rarely say out loud' },
          { emoji:'🌟', label:'What I\'m proud of',      desc:'What I\'ve worked hard to become' },
          { emoji:'😮‍💨', label:'What drains me',          desc:'The things that quietly cost me energy' },
        ],
        insight: 'This question often opens conversations couples never knew they needed.',
      },
    ],
  },
]

// ── WOULD YOU RATHER DATA ─────────────────────────────────────
const WYR_PROMPTS = [
  {
    a: 'Always know what your partner is thinking',
    b: 'Have your partner always understand what you\'re feeling',
    insight: 'Thoughts and feelings aren\'t the same thing. Which would actually build more closeness for you?',
  },
  {
    a: 'Never fight but never fully resolve things',
    b: 'Fight more often but always fully repair',
    insight: 'Conflict avoidance can feel peaceful but often leaves tension unaddressed. Repair matters more than prevention.',
  },
  {
    a: 'Be deeply financially comfortable but work long hours',
    b: 'Have less money but total freedom over your time',
    insight: 'Money vs. time is one of the defining tradeoffs couples rarely discuss explicitly.',
  },
  {
    a: 'Live in the same city as family',
    b: 'Live far away but travel back often',
    insight: 'Proximity to family is a bigger relationship factor than most people predict before it becomes real.',
  },
  {
    a: 'Your partner is your best friend',
    b: 'You each have deep friendships outside the relationship',
    insight: 'Neither is wrong — but expecting your partner to be everything can create unrealistic pressure.',
  },
  {
    a: 'Know exactly how your relationship ends',
    b: 'Never know but always have uncertainty',
    insight: 'This is really a question about whether you\'d choose love if you knew the cost.',
  },
  {
    a: 'Have a relationship with no secrets but constant tension',
    b: 'Have a peaceful relationship but some things left unsaid',
    insight: 'Full transparency vs. selective vulnerability — both have real costs.',
  },
  {
    a: 'Always be the one who loves more',
    b: 'Always be the one who is loved more',
    insight: 'Vulnerability and security exist in tension. This reveals which one you need more.',
  },
]

// ── MATCH CARD DATA ───────────────────────────────────────────
const CARD_PAIRS = [
  { id:'ring',   emoji:'💍', label:'Commitment', title:'Marriage & commitment',
    insight:'Understanding where each of you sees this relationship going is one of the most important — and avoided — conversations.' },
  { id:'baby',   emoji:'👶', label:'Family',     title:'Children & family',
    insight:'Dealbreaker territory for many couples — but also deeply personal. Knowing where each other stands early prevents heartbreak later.' },
  { id:'house',  emoji:'🏡', label:'Home',       title:'Where we live & how',
    insight:'City vs suburb, own vs rent, near family vs far — these feel like logistics but they\'re actually values conversations.' },
  { id:'money',  emoji:'💰', label:'Money',      title:'Financial values',
    insight:'Couples fight about money more than any other topic. It\'s rarely about the money itself.' },
  { id:'heart',  emoji:'❤️', label:'Intimacy',   title:'Emotional intimacy',
    insight:'Emotional intimacy looks different to everyone. This card starts that conversation.' },
  { id:'future', emoji:'🔭', label:'Future',     title:'Where we\'re going',
    insight:'The couples who talk about the future explicitly — even when it\'s hard — do better. This is one of those conversations.' },
]

// ── COMPONENT ─────────────────────────────────────────────────
export default function Games() {
  const { profile, couple } = useAuth()
  const navigate = useNavigate()
  const [screen, setScreen] = useState('select') // select | qa-pick | qa | match | wyr
  const [qaState, setQAState] = useState({ category: 0, question: 0, phase: 'answer' })
  const [myAnswer, setMyAnswer] = useState(null)
  const [partnerAnswer, setPartnerAnswer] = useState(null)
  const [matchCards, setMatchCards] = useState([])
  const [flipped, setFlipped] = useState([])
  const [matched, setMatched] = useState([])
  const [revealCard, setRevealCard] = useState(null)
  const [completedCards, setCompletedCards] = useState([])
  const [saving, setSaving] = useState(false)

  // WYR state
  const [wyrIndex, setWyrIndex] = useState(0)
  const [wyrMyPick, setWyrMyPick] = useState(null)
  const [wyrPartnerPick, setWyrPartnerPick] = useState(null)
  const [wyrPhase, setWyrPhase] = useState('answer') // answer | waiting | reveal

  const partner = couple?.partner_a_id === profile?.id ? couple?.partner_b : couple?.partner_a

  useEffect(() => {
    if (couple?.id) fetchMatchCompletions()
  }, [couple?.id])

  async function fetchMatchCompletions() {
    const { data } = await supabase.from('match_completions').select('card_id').eq('couple_id', couple.id)
    setCompletedCards((data ?? []).map(d => d.card_id))
  }

  function startQACategory(catIndex) {
    setQAState({ category: catIndex, question: 0, phase: 'answer' })
    setMyAnswer(null); setPartnerAnswer(null)
    setScreen('qa')
  }

  // ── Q&A ──────────────────────────────────────────────────────
  const currentCat = QA_CATEGORIES[qaState.category]
  const currentQ   = currentCat?.questions[qaState.question]

  async function submitQAAnswer(optionLabel) {
    if (saving) return
    setSaving(true)
    setMyAnswer(optionLabel)

    await supabase.from('game_responses').upsert({
      couple_id: couple.id, player_id: profile.id, game_type: 'qa',
      category: currentCat.id, question_idx: qaState.question, answer: optionLabel,
    }, { onConflict: 'couple_id,player_id,game_type,category,question_idx' })

    const { data } = await supabase
      .from('game_responses').select('answer')
      .eq('couple_id', couple.id).eq('player_id', partner?.id)
      .eq('game_type', 'qa').eq('category', currentCat.id).eq('question_idx', qaState.question)
      .single()

    setSaving(false)
    if (data?.answer) {
      setPartnerAnswer(data.answer)
      setQAState(s => ({ ...s, phase: 'reveal' }))
    } else {
      setQAState(s => ({ ...s, phase: 'waiting' }))
      pollForAnswer('qa', setPartnerAnswer, () => setQAState(s => ({ ...s, phase: 'reveal' })))
    }
  }

  function pollForAnswer(gameType, setAnswer, onReveal) {
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from('game_responses').select('answer')
        .eq('couple_id', couple.id).eq('player_id', partner?.id)
        .eq('game_type', gameType)
        .eq('category', gameType === 'qa' ? currentCat.id : 'wyr')
        .eq('question_idx', gameType === 'qa' ? qaState.question : wyrIndex)
        .single()
      if (data?.answer) { clearInterval(interval); setAnswer(data.answer); onReveal() }
    }, 3000)
    setTimeout(() => clearInterval(interval), 300000)
  }

  function nextQAQuestion() {
    const nextQ = qaState.question + 1
    if (nextQ < currentCat.questions.length) {
      setQAState({ category: qaState.category, question: nextQ, phase: 'answer' })
    } else {
      const nextCat = qaState.category + 1
      if (nextCat < QA_CATEGORIES.length) {
        setQAState({ category: nextCat, question: 0, phase: 'answer' })
      } else {
        setScreen('select')
      }
    }
    setMyAnswer(null); setPartnerAnswer(null)
  }

  // ── MATCH ─────────────────────────────────────────────────────
  function startMatch() {
    const deck = [...CARD_PAIRS, ...CARD_PAIRS]
      .map((c, i) => ({ ...c, uid: `${c.id}-${i}` }))
      .sort(() => Math.random() - 0.5)
    setMatchCards(deck); setFlipped([]); setMatched([]); setRevealCard(null)
    setScreen('match')
  }

  function flipMatchCard(uid) {
    if (flipped.length === 2) return
    if (flipped.includes(uid) || matched.includes(uid)) return
    const next = [...flipped, uid]
    setFlipped(next)
    if (next.length === 2) {
      const [a, b] = next.map(u => matchCards.find(c => c.uid === u))
      if (a.id === b.id) {
        setTimeout(async () => {
          setMatched(m => [...m, ...next]); setFlipped([]); setRevealCard(a)
          if (!completedCards.includes(a.id)) {
            await supabase.from('match_completions').insert({ couple_id: couple.id, card_id: a.id })
            await supabase.from('profiles').update({ current_score: (profile.current_score ?? 0) + 8 }).eq('id', profile.id)
            await supabase.from('activity_log').insert({
              couple_id: couple.id, actor_id: profile.id,
              event_type: 'deposit_logged', token_delta: 8,
              description: `Match game: ${a.title} · +8 tokens`,
            })
            setCompletedCards(c => [...c, a.id])
          }
        }, 600)
      } else {
        setTimeout(() => setFlipped([]), 900)
      }
    }
  }

  // ── WOULD YOU RATHER ─────────────────────────────────────────
  async function submitWYR(pick) {
    if (saving) return
    setSaving(true)
    setWyrMyPick(pick)

    await supabase.from('game_responses').upsert({
      couple_id: couple.id, player_id: profile.id, game_type: 'wyr',
      category: 'wyr', question_idx: wyrIndex, answer: pick,
    }, { onConflict: 'couple_id,player_id,game_type,category,question_idx' })

    const { data } = await supabase
      .from('game_responses').select('answer')
      .eq('couple_id', couple.id).eq('player_id', partner?.id)
      .eq('game_type', 'wyr').eq('category', 'wyr').eq('question_idx', wyrIndex)
      .single()

    setSaving(false)
    if (data?.answer) {
      setWyrPartnerPick(data.answer)
      setWyrPhase('reveal')
    } else {
      setWyrPhase('waiting')
      const interval = setInterval(async () => {
        const { data: d } = await supabase
          .from('game_responses').select('answer')
          .eq('couple_id', couple.id).eq('player_id', partner?.id)
          .eq('game_type', 'wyr').eq('category', 'wyr').eq('question_idx', wyrIndex)
          .single()
        if (d?.answer) { clearInterval(interval); setWyrPartnerPick(d.answer); setWyrPhase('reveal') }
      }, 3000)
      setTimeout(() => clearInterval(interval), 300000)
    }
  }

  function nextWYR() {
    const next = (wyrIndex + 1) % WYR_PROMPTS.length
    setWyrIndex(next); setWyrMyPick(null); setWyrPartnerPick(null); setWyrPhase('answer')
  }

  // ── RENDER ────────────────────────────────────────────────────
  if (screen === 'qa-pick') return (
    <QACategoryPick
      categories={QA_CATEGORIES}
      onPick={startQACategory}
      onBack={() => setScreen('select')}
    />
  )

  if (screen === 'qa') return (
    <QAScreen
      cat={currentCat} question={currentQ} phase={qaState.phase}
      myAnswer={myAnswer} partnerAnswer={partnerAnswer}
      partnerName={partner?.display_name}
      onAnswer={submitQAAnswer} onNext={nextQAQuestion}
      onBack={() => setScreen('qa-pick')} saving={saving}
      totalCategories={QA_CATEGORIES.length} catIndex={qaState.category}
      totalQ={currentCat?.questions.length} qIndex={qaState.question}
    />
  )

  if (screen === 'match') return (
    <MatchScreen
      cards={matchCards} flipped={flipped} matched={matched}
      revealCard={revealCard} completedCards={completedCards}
      onFlip={flipMatchCard} onCloseReveal={() => setRevealCard(null)}
      onBack={() => setScreen('select')} onShuffle={startMatch}
    />
  )

  if (screen === 'wyr') return (
    <WYRScreen
      prompt={WYR_PROMPTS[wyrIndex]} phase={wyrPhase} index={wyrIndex}
      total={WYR_PROMPTS.length} myPick={wyrMyPick} partnerPick={wyrPartnerPick}
      partnerName={partner?.display_name}
      onPick={submitWYR} onNext={nextWYR}
      onBack={() => { setScreen('select'); setWyrPhase('answer'); setWyrMyPick(null); setWyrPartnerPick(null) }}
      saving={saving}
    />
  )

  // ── Select screen ─────────────────────────────────────────────
  return (
    <div style={{ minHeight:'100vh', background:'var(--cream)', paddingBottom:100 }}>
      <div className="page-header">
        <button className="btn-back" onClick={() => navigate('/')}>←</button>
        <p className="page-title">Play together</p>
        <div style={{ width:32 }} />
      </div>

      <div className="screen-body">
        <p style={{ fontSize:13, color:'var(--muted)', marginBottom:24, lineHeight:1.6 }}>
          Games that start real conversations. Answers lock until both of you respond.
        </p>

        {/* Q&A */}
        <div
          onClick={() => setScreen('qa-pick')}
          style={{ background:'var(--ink)', borderRadius:16, padding:'20px', marginBottom:12, cursor:'pointer' }}
        >
          <p style={{ fontSize:22, marginBottom:8 }}>💬</p>
          <p style={{ fontFamily:'var(--font-serif)', fontSize:20, color:'var(--white)', marginBottom:6 }}>Question & Answer</p>
          <p style={{ fontSize:13, color:'var(--dark-muted)', lineHeight:1.6, marginBottom:12 }}>
            Both partners answer independently. Answers reveal only when you've both responded.
          </p>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            {QA_CATEGORIES.map(cat => (
              <span key={cat.id} style={{ fontSize:11, padding:'4px 10px', borderRadius:100, background:'rgba(255,255,255,0.1)', color:'var(--dark-muted)' }}>
                {cat.emoji} {cat.label}
              </span>
            ))}
          </div>
          <p style={{ fontSize:11, color:'var(--dark-muted)', marginTop:10, opacity:0.6 }}>
            {QA_CATEGORIES.reduce((t, c) => t + c.questions.length, 0)} questions across {QA_CATEGORIES.length} categories
          </p>
        </div>

        {/* Would You Rather */}
        <div
          onClick={() => { setWyrIndex(Math.floor(Math.random() * WYR_PROMPTS.length)); setWyrPhase('answer'); setScreen('wyr') }}
          style={{ background:'#2a1a3a', border:'0.5px solid #4a2a6a', borderRadius:16, padding:'20px', marginBottom:12, cursor:'pointer' }}
        >
          <p style={{ fontSize:22, marginBottom:8 }}>🤔</p>
          <p style={{ fontFamily:'var(--font-serif)', fontSize:20, color:'#d4b3f0', marginBottom:6 }}>Would You Rather</p>
          <p style={{ fontSize:13, color:'#9a7ab0', lineHeight:1.6, marginBottom:10 }}>
            Two options, no right answer. Pick one — then see what your partner chose.
          </p>
          <p style={{ fontSize:11, color:'#9a7ab0', opacity:0.7 }}>{WYR_PROMPTS.length} prompts · new one every round</p>
        </div>

        {/* Topic Match */}
        <div
          onClick={startMatch}
          style={{ background:'var(--white)', border:'0.5px solid var(--line)', borderRadius:16, padding:'20px', cursor:'pointer' }}
        >
          <p style={{ fontSize:22, marginBottom:8 }}>🃏</p>
          <p style={{ fontFamily:'var(--font-serif)', fontSize:20, color:'var(--ink)', marginBottom:6 }}>Topic Match</p>
          <p style={{ fontSize:13, color:'var(--muted)', lineHeight:1.6, marginBottom:12 }}>
            Flip cards to find matching pairs. Each match unlocks a conversation topic and earns +8 tokens.
          </p>
          {completedCards.length > 0 && (
            <p style={{ fontSize:12, color:'var(--teal)' }}>✓ {completedCards.length} of {CARD_PAIRS.length} topics unlocked</p>
          )}
        </div>
      </div>

      <nav aria-label="Main navigation" style={{ position:'fixed', bottom:0, left:'50%', transform:'translateX(-50%)', width:'100%', maxWidth:430, background:'rgba(250,246,239,0.95)', backdropFilter:'blur(12px)', borderTop:'0.5px solid var(--line)', display:'flex', padding:'10px 0 24px', zIndex:50 }}>
        <NavBtn icon="home"     label="Home"     onClick={() => navigate('/')} />
        <NavBtn icon="deposit"  label="Deposit"  onClick={() => navigate('/deposit')} />
        <NavBtn icon="games"    label="Games"    active />
        <NavBtn icon="history"  label="History"  onClick={() => navigate('/activity')} />
        <NavBtn icon="settings" label="Settings" onClick={() => navigate('/settings')} />
      </nav>
    </div>
  )
}

// ── Q&A CATEGORY PICKER ───────────────────────────────────────
function QACategoryPick({ categories, onPick, onBack }) {
  return (
    <div style={{ minHeight:'100vh', background:'var(--cream)', paddingBottom:40 }}>
      <div className="page-header">
        <button className="btn-back" onClick={onBack}>←</button>
        <p className="page-title">Pick a topic</p>
        <div style={{ width:32 }} />
      </div>
      <div className="screen-body">
        <p style={{ fontSize:13, color:'var(--muted)', marginBottom:20, lineHeight:1.6 }}>
          Choose a category to start with. You can come back and explore the others anytime.
        </p>
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {categories.map((cat, i) => (
            <button
              key={cat.id}
              onClick={() => onPick(i)}
              style={{
                display:'flex', alignItems:'center', gap:14, padding:'16px', width:'100%', textAlign:'left',
                borderRadius:14, cursor:'pointer',
                background:'var(--white)', border:'1px solid var(--line)',
                transition:'all 0.15s',
              }}
            >
              <span style={{ fontSize:28, flexShrink:0 }}>{cat.emoji}</span>
              <div style={{ flex:1 }}>
                <p style={{ fontSize:15, fontWeight:600, color:'var(--ink)', marginBottom:2 }}>{cat.label}</p>
                <p style={{ fontSize:12, color:'var(--muted)' }}>{cat.questions.length} questions</p>
              </div>
              <span style={{ fontSize:16, color:'var(--muted)', opacity:0.5 }}>›</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Q&A SCREEN ────────────────────────────────────────────────
function QAScreen({ cat, question, phase, myAnswer, partnerAnswer, partnerName, onAnswer, onNext, onBack, saving, totalCategories, catIndex, totalQ, qIndex }) {
  const isMatch = myAnswer === partnerAnswer
  const progress = ((catIndex * 10 + qIndex + 1) / QA_CATEGORIES.reduce((t, c) => t + c.questions.length, 0)) * 100

  return (
    <div style={{ minHeight:'100vh', background:'var(--cream)', paddingBottom:40 }}>
      <div className="page-header">
        <button className="btn-back" onClick={onBack}>←</button>
        <p className="page-title">{cat?.emoji} {cat?.label}</p>
        <p style={{ fontSize:12, color:'var(--muted)', minWidth:32, textAlign:'right' }}>{catIndex + 1}/{totalCategories}</p>
      </div>

      {/* Progress bar */}
      <div style={{ height:3, background:'var(--line)', margin:'0 0 0' }}>
        <div style={{ height:'100%', background:'var(--amber)', width:`${progress}%`, transition:'width 0.4s' }} />
      </div>

      <div className="screen-body" style={{ paddingTop:20 }}>
        {phase === 'answer' && (
          <>
            <p style={{ fontFamily:'var(--font-serif)', fontSize:22, lineHeight:1.4, marginBottom:12 }}>{question?.q}</p>
            <p style={{ fontSize:12, color:'var(--muted)', marginBottom:20 }}>
              Locked until {partnerName ?? 'your partner'} also responds.
            </p>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {question?.options.map((opt, i) => (
                <div
                  key={i}
                  onClick={() => !saving && onAnswer(opt.label)}
                  style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 16px', borderRadius:12, border:'1px solid var(--line)', background:'var(--white)', cursor:'pointer', transition:'all 0.15s', opacity:saving ? 0.6 : 1 }}
                >
                  <span style={{ fontSize:24, flexShrink:0 }}>{opt.emoji}</span>
                  <div>
                    <p style={{ fontSize:14, fontWeight:500 }}>{opt.label}</p>
                    <p style={{ fontSize:12, color:'var(--muted)', marginTop:2 }}>{opt.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {phase === 'waiting' && (
          <div style={{ textAlign:'center', paddingTop:40 }}>
            <p style={{ fontSize:40, marginBottom:16 }}>⏳</p>
            <p style={{ fontFamily:'var(--font-serif)', fontSize:22, marginBottom:12 }}>Waiting for {partnerName}…</p>
            <div style={{ background:'var(--amber-p)', borderRadius:12, padding:'14px 16px', textAlign:'left', marginTop:24 }}>
              <p style={{ fontSize:12, color:'var(--amber)', fontWeight:500, marginBottom:4 }}>Your answer</p>
              <p style={{ fontSize:14, color:'var(--ink)' }}>{myAnswer}</p>
            </div>
            <p style={{ fontSize:13, color:'var(--muted)', marginTop:16, lineHeight:1.6 }}>
              As soon as {partnerName} answers, both answers reveal here automatically.
            </p>
          </div>
        )}

        {phase === 'reveal' && (
          <>
            {isMatch ? (
              <div style={{ background:'var(--teal-p)', borderRadius:12, padding:'12px 16px', marginBottom:16, textAlign:'center' }}>
                <p style={{ fontSize:20, marginBottom:4 }}>🎉</p>
                <p style={{ fontSize:14, fontWeight:500, color:'var(--teal)' }}>You matched!</p>
              </div>
            ) : (
              <div style={{ background:'var(--amber-p)', borderRadius:12, padding:'12px 16px', marginBottom:16, textAlign:'center' }}>
                <p style={{ fontSize:20, marginBottom:4 }}>🤔</p>
                <p style={{ fontSize:14, fontWeight:500, color:'var(--amber)' }}>Different answers. That's the whole point — now you know.</p>
              </div>
            )}

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:20 }}>
              <AnswerCard label="You" answer={myAnswer} color="var(--amber)" />
              <AnswerCard label={partnerName ?? 'Partner'} answer={partnerAnswer} color="#AFA9EC" />
            </div>

            {question?.insight && (
              <div style={{ background:'var(--white)', border:'0.5px solid var(--line)', borderRadius:12, padding:'14px 16px', marginBottom:20 }}>
                <p style={{ fontSize:11, color:'var(--muted)', fontWeight:500, marginBottom:6, letterSpacing:'0.06em', textTransform:'uppercase' }}>Why this matters</p>
                <p style={{ fontSize:13, color:'var(--ink2)', lineHeight:1.7 }}>{question.insight}</p>
              </div>
            )}

            <button className="btn-primary" onClick={onNext}>Next question →</button>
          </>
        )}
      </div>
    </div>
  )
}

// ── WOULD YOU RATHER SCREEN ───────────────────────────────────
function WYRScreen({ prompt, phase, index, total, myPick, partnerPick, partnerName, onPick, onNext, onBack, saving }) {
  const isMatch = myPick === partnerPick

  return (
    <div style={{ minHeight:'100vh', background:'#120a1f', paddingBottom:40 }}>
      <div style={{ padding:'16px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'0.5px solid #2a1a3a' }}>
        <button className="btn-back" onClick={onBack} style={{ color:'#d4b3f0' }}>←</button>
        <p style={{ fontFamily:'var(--font-serif)', fontSize:16, color:'#d4b3f0' }}>Would You Rather</p>
        <p style={{ fontSize:12, color:'#9a7ab0' }}>{index + 1}/{total}</p>
      </div>

      <div style={{ padding:'32px 20px 0' }}>
        {phase === 'answer' && (
          <>
            <p style={{ fontSize:13, color:'#9a7ab0', textAlign:'center', marginBottom:28 }}>
              Pick one. No right answer — just yours.
            </p>
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <WYROption label={prompt.a} pick="a" onPick={onPick} saving={saving} color="#d4b3f0" />
              <div style={{ textAlign:'center', fontSize:13, color:'#9a7ab0', fontWeight:500 }}>OR</div>
              <WYROption label={prompt.b} pick="b" onPick={onPick} saving={saving} color="#d4b3f0" />
            </div>
            <button
              onClick={onNext}
              style={{ display:'block', margin:'28px auto 0', background:'none', border:'none', fontSize:13, color:'#9a7ab0', cursor:'pointer', opacity:0.7 }}
            >
              Skip this one →
            </button>
          </>
        )}

        {phase === 'waiting' && (
          <div style={{ textAlign:'center', paddingTop:20 }}>
            <p style={{ fontSize:40, marginBottom:16 }}>⏳</p>
            <p style={{ fontFamily:'var(--font-serif)', fontSize:22, color:'#d4b3f0', marginBottom:12 }}>
              Waiting for {partnerName}…
            </p>
            <div style={{ background:'#2a1a3a', borderRadius:12, padding:'14px 16px', textAlign:'left', margin:'24px 0 0' }}>
              <p style={{ fontSize:12, color:'#9a7ab0', marginBottom:4 }}>Your pick</p>
              <p style={{ fontSize:14, color:'#d4b3f0', lineHeight:1.5 }}>{myPick === 'a' ? prompt.a : prompt.b}</p>
            </div>
          </div>
        )}

        {phase === 'reveal' && (
          <>
            {isMatch ? (
              <div style={{ background:'#1a2b1a', border:'0.5px solid #2a4a2a', borderRadius:12, padding:'12px 16px', marginBottom:20, textAlign:'center' }}>
                <p style={{ fontSize:20, marginBottom:4 }}>🎉</p>
                <p style={{ fontSize:14, fontWeight:500, color:'#5dcaa5' }}>You both picked the same!</p>
              </div>
            ) : (
              <div style={{ background:'#2a1a3a', borderRadius:12, padding:'12px 16px', marginBottom:20, textAlign:'center' }}>
                <p style={{ fontSize:20, marginBottom:4 }}>🤔</p>
                <p style={{ fontSize:14, fontWeight:500, color:'#d4b3f0' }}>Different picks. That's why you're talking about it.</p>
              </div>
            )}

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:20 }}>
              <AnswerCard label="You" answer={myPick === 'a' ? `A: ${prompt.a}` : `B: ${prompt.b}`} color="#d4b3f0" dark />
              <AnswerCard label={partnerName ?? 'Partner'} answer={partnerPick === 'a' ? `A: ${prompt.a}` : `B: ${prompt.b}`} color="#AFA9EC" dark />
            </div>

            {prompt.insight && (
              <div style={{ background:'#1a1028', border:'0.5px solid #2a1a3a', borderRadius:12, padding:'14px 16px', marginBottom:20 }}>
                <p style={{ fontSize:11, color:'#9a7ab0', fontWeight:500, marginBottom:6, letterSpacing:'0.06em', textTransform:'uppercase' }}>Why this one matters</p>
                <p style={{ fontSize:13, color:'#c4a8e0', lineHeight:1.7 }}>{prompt.insight}</p>
              </div>
            )}

            <button
              onClick={onNext}
              style={{ width:'100%', padding:'15px', borderRadius:100, background:'#4a2a6a', color:'#d4b3f0', border:'none', fontSize:15, fontWeight:600, cursor:'pointer', marginBottom:10 }}
            >
              Next prompt →
            </button>
            <button
              onClick={onBack}
              style={{ width:'100%', padding:'12px', borderRadius:100, background:'transparent', border:'none', fontSize:13, color:'#9a7ab0', cursor:'pointer' }}
            >
              Back to games
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function WYROption({ label, pick, onPick, saving, color }) {
  return (
    <button
      onClick={() => !saving && onPick(pick)}
      disabled={saving}
      style={{
        width:'100%', textAlign:'left',
        padding:'20px', borderRadius:16, cursor:saving ? 'default' : 'pointer',
        background:'#1a0a2a', border:`1px solid #3a2a4a`,
        transition:'all 0.15s', opacity:saving ? 0.6 : 1,
      }}
    >
      <p style={{ fontSize:11, color:'#9a7ab0', fontWeight:600, letterSpacing:'0.1em', marginBottom:8 }}>
        {pick.toUpperCase()}
      </p>
      <p style={{ fontSize:15, color:'#e8d8f8', lineHeight:1.5 }}>{label}</p>
    </button>
  )
}

// ── MATCH SCREEN ──────────────────────────────────────────────
function MatchScreen({ cards, flipped, matched, revealCard, completedCards, onFlip, onCloseReveal, onBack, onShuffle }) {
  const matchedPairs = matched.length / 2
  return (
    <div style={{ minHeight:'100vh', background:'var(--dark-bg)', color:'var(--dark-text)', paddingBottom:80 }}>
      <div style={{ padding:'16px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'0.5px solid var(--dark-border)' }}>
        <button className="btn-back" onClick={onBack}>←</button>
        <div style={{ flex:1, margin:'0 16px' }}>
          <div style={{ background:'var(--dark-border)', borderRadius:100, height:4, overflow:'hidden' }}>
            <div style={{ background:'var(--amber-l)', height:'100%', width:`${matchedPairs / CARD_PAIRS.length * 100}%`, transition:'width 0.4s' }} />
          </div>
          <p style={{ fontSize:11, color:'var(--dark-muted)', textAlign:'center', marginTop:4 }}>{matchedPairs} of {CARD_PAIRS.length} matched</p>
        </div>
        <button onClick={onShuffle} style={{ background:'none', border:'0.5px solid var(--dark-border)', borderRadius:8, padding:'6px 12px', color:'var(--dark-muted)', fontSize:12, cursor:'pointer' }}>Shuffle</button>
      </div>

      <p style={{ fontSize:12, color:'var(--dark-muted)', textAlign:'center', padding:'12px 20px' }}>
        Tap two cards to flip them. Match a pair to unlock the topic.
      </p>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:8, padding:'0 16px' }}>
        {cards.map(card => {
          const isFlipped   = flipped.includes(card.uid)
          const isMatched   = matched.includes(card.uid)
          const alreadyDone = completedCards.includes(card.id)
          return (
            <button
              key={card.uid}
              onClick={() => !isMatched && onFlip(card.uid)}
              aria-label={isFlipped || isMatched ? card.label : 'Face-down card'}
              disabled={isMatched}
              style={{
                aspectRatio:'1', borderRadius:12, cursor:isMatched ? 'default' : 'pointer',
                background:isMatched ? '#1a2b1a' : isFlipped ? 'var(--dark-card)' : '#111110',
                border:isMatched ? '0.5px solid #2a4a2a' : '0.5px solid var(--dark-border)',
                display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
                transition:'all 0.2s', position:'relative',
              }}
            >
              {(isFlipped || isMatched) ? (
                <>
                  <span style={{ fontSize:24 }}>{card.emoji}</span>
                  <p style={{ fontSize:10, color:isMatched ? '#5dcaa5' : 'var(--dark-text)', marginTop:4, textAlign:'center', padding:'0 4px' }}>{card.label}</p>
                  {isMatched && alreadyDone && <span style={{ fontSize:8, color:'#5dcaa5', position:'absolute', top:6, right:6 }}>✓</span>}
                </>
              ) : (
                <span style={{ fontSize:20, opacity:0.3 }}>♥</span>
              )}
            </button>
          )
        })}
      </div>

      {revealCard && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', display:'flex', alignItems:'flex-end', zIndex:100 }}>
          <div style={{ background:'var(--dark-card)', borderRadius:'20px 20px 0 0', padding:'28px 24px 40px', width:'100%', maxWidth:430, margin:'0 auto' }}>
            <p style={{ fontSize:36, textAlign:'center', marginBottom:8 }}>{revealCard.emoji}</p>
            <p style={{ fontFamily:'var(--font-serif)', fontSize:22, textAlign:'center', color:'var(--white)', marginBottom:4 }}>{revealCard.title}</p>
            <p style={{ fontSize:13, color:'var(--dark-muted)', textAlign:'center', lineHeight:1.7, marginBottom:16 }}>{revealCard.insight}</p>
            {!completedCards.includes(revealCard.id) && (
              <div style={{ background:'#1a2b1a', borderRadius:10, padding:'10px 14px', textAlign:'center', marginBottom:16 }}>
                <p style={{ fontSize:13, color:'#5dcaa5', fontWeight:500 }}>+8 tokens earned</p>
              </div>
            )}
            <button className="btn-amber" onClick={onCloseReveal}>Keep going →</button>
          </div>
        </div>
      )}
    </div>
  )
}

function AnswerCard({ label, answer, color, dark }) {
  return (
    <div style={{ background:dark ? '#1a1028' : 'var(--white)', border:`0.5px solid ${dark ? '#2a1a3a' : 'var(--line)'}`, borderRadius:12, padding:'12px', overflow:'hidden' }}>
      <p style={{ fontSize:11, color, fontWeight:500, marginBottom:6 }}>{label}</p>
      <p style={{ fontSize:12, color:dark ? '#c4a8e0' : 'var(--ink2)', lineHeight:1.5, wordBreak:'break-word', overflowWrap:'break-word' }}>{answer ?? '—'}</p>
    </div>
  )
}

