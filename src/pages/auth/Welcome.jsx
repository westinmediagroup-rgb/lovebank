import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const SLIDES = [
  {
    emoji:  '🏦',
    title:  'Your relationship\nhas a balance.',
    body:   'Every act of care, honesty, and presence is an investment. Love Bank helps you track it — so you can see clearly and show up better.',
    accent: 'var(--amber)',
  },
  {
    emoji:  '💛',
    title:  'Small things\nadd up.',
    body:   'A kind text. A hard conversation. A gesture you didn\'t have to make. Deposits grow your balance. Withdrawals drain it. The pattern tells the story.',
    accent: 'var(--teal)',
  },
  {
    emoji:  '🌱',
    title:  'Built for wherever\nyou are.',
    body:   'In a relationship, starting fresh, healing, figuring things out — Love Bank works for every stage. No judgement. Just clarity.',
    accent: '#7C6FAC',
  },
]

export default function Welcome() {
  const navigate = useNavigate()
  const [slide, setSlide] = useState(0)

  const current = SLIDES[slide]
  const isLast  = slide === SLIDES.length - 1

  function next() {
    if (isLast) navigate('/signup')
    else setSlide(s => s + 1)
  }

  return (
    <div
      style={{ minHeight: '100vh', background: 'var(--cream)', display: 'flex', flexDirection: 'column', maxWidth: 430, margin: '0 auto' }}
      onClick={isLast ? undefined : next}
    >
      {/* Main slide area — takes up most of the screen */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 32px 0', userSelect: 'none' }}>
        {/* Wordmark */}
        <p style={{ fontFamily: 'var(--font-serif)', fontSize: 14, color: 'var(--amber)', letterSpacing: '-0.01em', marginBottom: 56, alignSelf: 'flex-start' }}>
          Love Bank
        </p>

        {/* Emoji */}
        <p style={{ fontSize: 72, marginBottom: 28, lineHeight: 1 }}>{current.emoji}</p>

        {/* Title */}
        <p style={{ fontFamily: 'var(--font-serif)', fontSize: 32, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.15, textAlign: 'center', marginBottom: 20, whiteSpace: 'pre-line' }}>
          {current.title}
        </p>

        {/* Body */}
        <p style={{ fontSize: 15, color: 'var(--muted)', lineHeight: 1.75, textAlign: 'center', maxWidth: 300 }}>
          {current.body}
        </p>
      </div>

      {/* Bottom section */}
      <div style={{ padding: '32px 28px 52px' }}>
        {/* Dot indicators */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 28 }}>
          {SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={e => { e.stopPropagation(); setSlide(i) }}
              style={{ width: i === slide ? 20 : 8, height: 8, borderRadius: 100, background: i === slide ? 'var(--amber)' : 'var(--line)', border: 'none', cursor: 'pointer', transition: 'all 0.3s ease', padding: 0 }}
              aria-label={`Slide ${i + 1}`}
            />
          ))}
        </div>

        {/* Primary CTA */}
        <button
          onClick={e => { e.stopPropagation(); next() }}
          className="btn-primary"
          style={{ marginBottom: 14 }}
        >
          {isLast ? 'Create a free account →' : 'Next →'}
        </button>

        {/* Secondary — sign in */}
        {isLast && (
          <button
            onClick={e => { e.stopPropagation(); navigate('/signin') }}
            style={{ width: '100%', padding: '14px', borderRadius: 100, background: 'transparent', border: 'none', fontSize: 14, color: 'var(--muted)', cursor: 'pointer' }}
          >
            Already have an account? Sign in
          </button>
        )}

        {!isLast && (
          <button
            onClick={e => { e.stopPropagation(); navigate('/signup') }}
            style={{ width: '100%', padding: '14px', borderRadius: 100, background: 'transparent', border: 'none', fontSize: 13, color: 'var(--muted)', cursor: 'pointer' }}
          >
            Skip intro →
          </button>
        )}
      </div>
    </div>
  )
}
