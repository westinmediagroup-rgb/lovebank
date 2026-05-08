// Auto-confirm deposits — runs every hour
// T1/T2 deposits auto-confirm after 24h if no partner response
// T3 deposits held at 70% after 72h
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

Deno.serve(async () => {
  try {
    const now = new Date().toISOString()

    // Find T1/T2 deposits past auto_confirm_at
    const { data: toConfirm } = await supabase
      .from('deposits')
      .select('*, logger:logger_id(id, current_score, deposit_streak)')
      .eq('status', 'pending')
      .eq('tokens_applied', false)
      .not('auto_confirm_at', 'is', null)
      .lte('auto_confirm_at', now)

    const confirmed = []

    for (const deposit of toConfirm ?? []) {
      // Apply tokens to logger's score
      const newScore = (deposit.logger?.current_score ?? 0) + deposit.final_value
      await supabase.from('profiles').update({ current_score: newScore }).eq('id', deposit.logger_id)

      await supabase.from('deposits').update({
        status:          'confirmed',
        confirmed_at:    now,
        tokens_applied:  true,
      }).eq('id', deposit.id)

      await supabase.from('activity_log').insert({
        couple_id:   deposit.couple_id,
        actor_id:    deposit.logger_id,
        event_type:  'deposit_confirmed',
        ref_id:      deposit.id,
        token_delta: deposit.final_value,
        description: `Auto-confirmed: ${deposit.deposit_type.replace(/_/g, ' ')} · +${deposit.final_value} tokens`,
      })

      await supabase.from('notification_queue').insert({
        recipient_id: deposit.logger_id,
        type:         'deposit_auto_confirmed',
        payload: { deposit_id: deposit.id, final_value: deposit.final_value },
      })

      // Recalc couple score
      await recalcCouple(deposit.couple_id)
      confirmed.push(deposit.id)
    }

    // Find T3 deposits past 72h with no response — apply 70%
    const cutoff72h = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString()
    const { data: t3Stale } = await supabase
      .from('deposits')
      .select('*, logger:logger_id(id, current_score)')
      .eq('status', 'pending')
      .eq('tokens_applied', false)
      .is('auto_confirm_at', null)
      .lte('created_at', cutoff72h)

    for (const deposit of t3Stale ?? []) {
      const reducedValue = Math.round(deposit.final_value * 0.7)
      const newScore = (deposit.logger?.current_score ?? 0) + reducedValue

      await supabase.from('profiles').update({ current_score: newScore }).eq('id', deposit.logger_id)
      await supabase.from('deposits').update({
        status:         'confirmed',
        confirmed_at:   now,
        tokens_applied: true,
        final_value:    reducedValue,
      }).eq('id', deposit.id)

      await supabase.from('activity_log').insert({
        couple_id:   deposit.couple_id,
        actor_id:    deposit.logger_id,
        event_type:  'deposit_confirmed',
        ref_id:      deposit.id,
        token_delta: reducedValue,
        description: `T3 deposit applied at 70% (no response) · +${reducedValue} tokens`,
      })

      await recalcCouple(deposit.couple_id)
      confirmed.push(deposit.id)
    }

    // Apply 7-day unrepaired withdrawal penalty
    const cutoff7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data: staleWithdrawals } = await supabase
      .from('withdrawals')
      .select('*, logger:logger_id(id, current_score)')
      .eq('repaired', false)
      .eq('penalty_applied', false)
      .lte('created_at', cutoff7d)

    for (const w of staleWithdrawals ?? []) {
      const penalty = 10
      const newScore = Math.max((w.logger?.current_score ?? 0) - penalty, 10)

      await supabase.from('profiles').update({ current_score: newScore }).eq('id', w.logger_id)
      await supabase.from('withdrawals').update({ penalty_applied: true }).eq('id', w.id)
      await supabase.from('activity_log').insert({
        couple_id:   w.couple_id,
        actor_id:    w.logger_id,
        event_type:  'withdrawal_logged',
        ref_id:      w.id,
        token_delta: -penalty,
        description: `7-day unrepaired penalty · −${penalty} tokens`,
      })

      await recalcCouple(w.couple_id)
    }

    return new Response(JSON.stringify({ ok: true, confirmed: confirmed.length }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})

async function recalcCouple(coupleId: string) {
  const { data: couple } = await supabase
    .from('couples')
    .select('partner_a:partner_a_id(current_score), partner_b:partner_b_id(current_score)')
    .eq('id', coupleId)
    .single()

  if (!couple?.partner_a || !couple?.partner_b) return

  const scoreA = couple.partner_a.current_score ?? 0
  const scoreB = couple.partner_b.current_score ?? 0
  const avg    = (scoreA + scoreB) / 2
  const ratio  = scoreA > 0 && scoreB > 0
    ? Math.min(scoreA, scoreB) / Math.max(scoreA, scoreB)
    : 0
  const mult   = ratio < 0.33 ? 0.7 : ratio < 0.5 ? 0.8 : ratio < 0.65 ? 0.9 : ratio < 0.8 ? 1.0 : ratio < 0.9 ? 1.05 : 1.2
  const score  = Math.round(avg * mult)
  const state  = score >= 500 && ratio >= 0.8 ? 'Thriving'
               : score >= 350 && ratio >= 0.6 ? 'Growing'
               : score >= 200 || ratio < 0.5  ? 'Drifting'
               : 'Struggling'

  await supabase.from('couples').update({ couple_score: score, health_state: state }).eq('id', coupleId)
}
