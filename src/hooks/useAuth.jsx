import { useState, useEffect, createContext, useContext } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [couple, setCouple] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else { setProfile(null); setCouple(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId) {
    const { data: prof } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    setProfile(prof)

    if (prof?.couple_id) {
      const { data: coup } = await supabase
        .from('couples')
        .select('*, partner_a:partner_a_id(id,display_name,love_language,current_score,deposit_streak), partner_b:partner_b_id(id,display_name,love_language,current_score,deposit_streak)')
        .eq('id', prof.couple_id)
        .single()

      if (coup) {
        // Explicitly fetch the partner's profile to avoid Supabase same-table join ambiguity
        const partnerId = coup.partner_a_id === userId ? coup.partner_b_id : coup.partner_a_id
        if (partnerId) {
          const { data: partnerProf } = await supabase
            .from('profiles')
            .select('id, display_name, love_language, current_score, deposit_streak')
            .eq('id', partnerId)
            .single()
          coup._partner = partnerProf ?? null
        }
      }

      setCouple(coup)
    }

    setLoading(false)
  }

  async function signUp(email, password, displayName) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    })
    return { data, error }
  }

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    return { data, error }
  }

  async function signOut() {
    await supabase.auth.signOut()
    setProfile(null)
    setCouple(null)
  }

  async function refreshProfile() {
    if (user) await fetchProfile(user.id)
  }

  return (
    <AuthContext.Provider value={{ user, profile, couple, loading, signUp, signIn, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
