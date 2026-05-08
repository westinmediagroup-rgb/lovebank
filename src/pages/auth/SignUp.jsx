import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'

export default function SignUp() {
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    setLoading(true)
    const { error } = await signUp(email, password, displayName)
    setLoading(false)
    if (error) { setError(error.message); return }
    const redirect = searchParams.get('redirect')
    if (redirect) localStorage.setItem('lb_invite_redirect', redirect)
    navigate('/onboarding')
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 28px', background: 'var(--cream)', maxWidth: 430, margin: '0 auto' }}>

      {/* Brand */}
      <p style={{ fontFamily: 'var(--font-serif)', fontSize: 22, color: 'var(--amber)', marginBottom: 36, letterSpacing: '-0.01em' }}>
        Love Bank
      </p>

      {/* Heading — 30px so it stays on one line at 375px */}
      <div style={{ marginBottom: 32 }}>
        <p style={{ fontFamily: 'var(--font-serif)', fontSize: 30, fontWeight: 600, lineHeight: 1.15, marginBottom: 8 }}>
          Create your account.
        </p>
        <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6 }}>
          Takes about 3 minutes. Your data is encrypted and never sold.
        </p>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        <div>
          <label className="input-label" htmlFor="signup-name">Your first name</label>
          <input
            id="signup-name"
            className="input"
            type="text"
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            placeholder="Jordan"
            required
            autoComplete="given-name"
          />
        </div>

        <div>
          <label className="input-label" htmlFor="signup-email">Email</label>
          <input
            id="signup-email"
            className="input"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoComplete="email"
          />
        </div>

        <div>
          <label className="input-label" htmlFor="signup-password">Password</label>
          <input
            id="signup-password"
            className="input"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            required
            autoComplete="new-password"
          />
        </div>

        {error && (
          <p style={{ fontSize: 13, color: 'var(--red)', background: 'var(--red-p)', padding: '10px 14px', borderRadius: 8, lineHeight: 1.5 }}>
            {error}
          </p>
        )}

        <button className="btn-primary" type="submit" disabled={loading} style={{ marginTop: 4 }}>
          {loading ? 'Creating account…' : 'Create account →'}
        </button>
      </form>

      <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--muted)', marginTop: 20, lineHeight: 1.7, opacity: 0.8 }}>
        By continuing you agree to our Terms of Service and Privacy Policy.
      </p>

      {/* Divider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0' }}>
        <div style={{ flex: 1, height: '0.5px', background: 'var(--line)' }} />
        <p style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '0.06em' }}>OR</p>
        <div style={{ flex: 1, height: '0.5px', background: 'var(--line)' }} />
      </div>

      <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>
        Already have an account?{' '}
        <Link to="/signin" style={{ color: 'var(--amber)', fontWeight: 500, textDecoration: 'underline', textUnderlineOffset: 2 }}>
          Sign in →
        </Link>
      </p>
    </div>
  )
}
