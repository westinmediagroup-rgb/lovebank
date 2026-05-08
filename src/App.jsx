import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import SignIn from './pages/auth/SignIn'
import SignUp from './pages/auth/SignUp'
import Welcome from './pages/auth/Welcome'
import Onboarding from './pages/onboarding/Onboarding'
import InviteAccept from './pages/onboarding/InviteAccept'
import ConnectionMoment from './pages/onboarding/ConnectionMoment'
import Dashboard from './pages/dashboard/Dashboard'
import SoloDashboard from './pages/dashboard/SoloDashboard'
import LogDeposit from './pages/deposit/LogDeposit'
import SoloDeposit from './pages/deposit/SoloDeposit'
import LogWithdrawal from './pages/withdrawal/LogWithdrawal'
import Repair from './pages/repair/Repair'
import ActivityHistory from './pages/activity/ActivityHistory'
import Settings from './pages/settings/Settings'
import Games from './pages/games/Games'
import GoalManager from './pages/goals/GoalManager'
import BuddyInvite from './pages/buddy/BuddyInvite'
import BuddyAccept from './pages/buddy/BuddyAccept'
import BuddyView from './pages/buddy/BuddyView'

function RequireAuth({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <Splash />
  if (!user) return <Navigate to="/welcome" replace />
  return children
}

function RequireOnboarding({ children }) {
  const { profile, loading } = useAuth()
  if (loading) return <Splash />
  // Consider onboarding complete if the flag is set OR relationship_mode exists
  // (relationship_mode is always saved at the end of onboarding for both solo and coupled users)
  const isOnboarded = profile?.onboarding_complete || profile?.relationship_mode
  if (!isOnboarded) return <Navigate to="/onboarding" replace />
  return children
}

/** Routes to the right dashboard based on relationship_mode */
function SmartDashboard() {
  const { profile } = useAuth()
  if (!profile) return <Splash />
  if (profile.relationship_mode === 'solo') return <SoloDashboard />
  return <Dashboard />
}

function Splash() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--cream)' }}>
      <p style={{ fontFamily: 'var(--font-serif)', fontSize: 28, color: 'var(--amber)' }}>Love Bank</p>
    </div>
  )
}

export default function App() {
  return (
    <div className="app-shell">
      <Routes>
        {/* Auth */}
        <Route path="/welcome" element={<Welcome />} />
        <Route path="/signin" element={<SignIn />} />
        <Route path="/signup" element={<SignUp />} />

        {/* Invite & onboarding */}
        <Route path="/invite/:token"     element={<InviteAccept />} />
        <Route path="/onboarding"        element={<RequireAuth><Onboarding /></RequireAuth>} />
        <Route path="/onboarding/invite" element={<RequireAuth><Onboarding startAtInvite /></RequireAuth>} />
        <Route path="/connection"        element={<RequireAuth><ConnectionMoment /></RequireAuth>} />

        {/* Protected app */}
        <Route path="/"              element={<RequireAuth><RequireOnboarding><SmartDashboard /></RequireOnboarding></RequireAuth>} />
        <Route path="/deposit"       element={<RequireAuth><RequireOnboarding><LogDeposit /></RequireOnboarding></RequireAuth>} />
        <Route path="/solo-deposit"  element={<RequireAuth><RequireOnboarding><SoloDeposit /></RequireOnboarding></RequireAuth>} />
        <Route path="/withdrawal"    element={<RequireAuth><RequireOnboarding><LogWithdrawal /></RequireOnboarding></RequireAuth>} />
        <Route path="/repair/:withdrawalId" element={<RequireAuth><RequireOnboarding><Repair /></RequireOnboarding></RequireAuth>} />
        <Route path="/activity"      element={<RequireAuth><RequireOnboarding><ActivityHistory /></RequireOnboarding></RequireAuth>} />
        <Route path="/games"         element={<RequireAuth><RequireOnboarding><Games /></RequireOnboarding></RequireAuth>} />
        <Route path="/settings"      element={<RequireAuth><Settings /></RequireAuth>} />
        <Route path="/goals"         element={<RequireAuth><RequireOnboarding><GoalManager /></RequireOnboarding></RequireAuth>} />
        <Route path="/buddy/invite"  element={<RequireAuth><RequireOnboarding><BuddyInvite /></RequireOnboarding></RequireAuth>} />
        <Route path="/buddy/accept/:token" element={<RequireAuth><BuddyAccept /></RequireAuth>} />
        <Route path="/buddy/:buddyId" element={<RequireAuth><RequireOnboarding><BuddyView /></RequireOnboarding></RequireAuth>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}
