import NavIcon from './NavIcon'

/**
 * Shared bottom-nav button used across Dashboard, SoloDashboard, and ActivityHistory.
 * Pass dark=true when rendered on the dark couple dashboard.
 */
export default function NavBtn({ icon, label, active, onClick, dark = false }) {
  const activeColor   = dark ? 'var(--amber-l)' : 'var(--amber)'
  const inactiveColor = dark ? 'var(--dark-muted)' : 'var(--muted)'
  const color = active ? activeColor : inactiveColor

  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      style={{
        flex: 1,
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        padding: '4px 0',
        color,
        fontFamily: 'var(--font-sans)',
        minHeight: 44,
      }}
    >
      <NavIcon name={icon} size={22} />
      <span style={{ fontSize: 10, letterSpacing: '0.02em' }}>{label}</span>
    </button>
  )
}
