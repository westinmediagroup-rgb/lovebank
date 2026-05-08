import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'

export default function SignIn() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await signIn(email, password)
    setLoading(false)
    if (error) { setError(error.message); return }
    const redirect = searchParams.get('redirect')
    navigate(redirect ?? '/')
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 28px', background: 'var(--cream)', maxWidth: 430, margin: '0 auto' }}>

      {/* Brand */}
      <p style={{ fontFamily: 'var(--font-serif)', fontSize: 22, color: 'var(--amber)', marginBottom: 36, letterSpacing: '-0.01em' }}>
        Love Bank
      </p>

      {/* Heading */}
      <div style={{ marginBottom: 32 }}>
        <p style={{ fontFamily: 'var(--font-serif)', fontSize: 36, fontWeight: 600, lineHeight: 1.15, marginBottom: 8 }}>
          Welcome back.
        </p>
        <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6 }}>
          Sign in to your account to continue.
        </p>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Email */}
        <div>
          <label className="input-label" htmlFor="signin-email">Email</label>
          <input
            id="signin-email"
            className="input"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoComplete="email"
          />
        </div>

        {/* Password — "Forgot?" sits right-aligned beside the label */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <label
              htmlFor="signin-password"
              className="input-label"
              style={{ margin: 0 }}
            >
              Password
            </label>
            <Link
              to="/forgot-password"
              style={{ fontSize: 12, color: 'var(--amber)', textDecoration: 'underline', textUnderlineOffset: 2 }}
            >
              Forgot password?
            </Link>
          </div>
          <input
            id="signin-password"
            className="input"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            autoComplete="current-password"
          />
        </div>

        {error && (
          <p style={{ fontSize: 13, color: 'var(--red)', background: 'var(--red-p)', padding: '10px 14px', borderRadius: 8, lineHeight: 1.5 }}>
            {error}
          </p>
        )}

        <button className="btn-primary" type="submit" disabled={loading} style={{ marginTop: 4 }}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      {/* Divider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '28px 0' }}>
        <div style={{ flex: 1, height: '0.5px', background: 'var(--line)' }} />
        <p style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '0.06em' }}>OR</p>
        <div style={{ flex: 1, height: '0.5px', background: 'var(--line)' }} />
      </div>

      <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>
        No account yet?{' '}
        <Link to="/signup" style={{ color: 'var(--amber)', fontWeight: 500, textDecoration: 'underline', textUnderlineOffset: 2 }}>
          Create one →
        </Link>
      </p>

      <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--muted)', marginTop: 40, lineHeight: 1.7, opacity: 0.8 }}>
        Your relationship data is encrypted and never shared.
      </p>
    </div>
  )
}
