// Nibble cron — runs every hour via Supabase cron
// Activates after 72h no deposit from either partner, drains 10 pts/day, floor 10
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const NIBBLE_THRESHOLD_HOURS = 72
const NIBBLE_DRAIN_PER_DAY   = 10
const NIBBLE_FLOOR           = 10

Deno.serve(async (req) => {
  try {
    // Get all active couples
    const { data: couples, error } = await supabase
      .from('couples')
      .select('*, partner_a:partner_a_id(id, current_score, last_deposit_at), partner_b:partner_b_id(id, current_score, last_deposit_at)')
      .eq('status', 'active')

    if (error) throw error

    const now = new Date()
    const results = []

    for (const couple of couples ?? []) {
      const a = couple.partner_a
      const b = couple.partner_b
      if (!a || !b) continue

      // Find the most recent deposit from either partner
      const aLast = a.last_deposit_at ? new Date(a.last_deposit_at) : null
      const bLast = b.last_deposit_at ? new Date(b.last_deposit_at) : null
      const lastDeposit = aLast && bLast
        ? (aLast > bLast ? aLast : bLast)
        : (aLast ?? bLast)

      const hoursSince = lastDeposit
        ? (now.getTime() - lastDeposit.getTime()) / (1000 * 60 * 60)
        : NIBBLE_THRESHOLD_HOURS + 1

      if (hoursSince >= NIBBLE_THRESHOLD_HOURS) {
        // Activate Nibble if not already
        if (!couple.nibble_active) {
          await supabase.from('couples').update({
            nibble_active: true,
            nibble_since:  now.toISOString(),
          }).eq('id', couple.id)

          // Warn both partners
          await supabase.from('notification_queue').insert([
            { recipient_id: a.id, type: 'nibble_warning', payload: { couple_id: couple.id } },
            { recipient_id: b.id, type: 'nibble_warning', payload: { couple_id: couple.id } },
          ])
        }

        // Drain proportional to time (once per 24h = 10 pts)
        // We run hourly so drain = 10/24 per hour
        const drainAmount = Math.round(NIBBLE_DRAIN_PER_DAY / 24)
        if (drainAmount < 1) continue // skip sub-1 drain

        const newA = Math.max((a.current_score ?? 0) - drainAmount, NIBBLE_FLOOR)
        const newB = Math.max((b.current_score ?? 0) - drainAmount, NIBBLE_FLOOR)

        await Promise.all([
          supabase.from('profiles').update({ current_score: newA }).eq('id', a.id),
          supabase.from('profiles').update({ current_score: newB }).eq('id', b.id),
          supabase.from('nibble_events').insert({
            couple_id:    couple.id,
            event_type:   'drain',
            tokens_taken: drainAmount * 2,
          }),
          supabase.from('activity_log').insert({
            couple_id:   couple.id,
            actor_id:    a.id,
            event_type:  'nibble_drain',
            token_delta: -drainAmount,
            description: `Nibble drained ${drainAmount} tokens from each partner`,
          }),
        ])

        // Recalc couple score
        await recalcCoupleScore(couple.id, newA, newB)
        results.push({ couple_id: couple.id, action: 'drain', amount: drainAmount })
      } else if (couple.nibble_active) {
        // Nibble was active but a deposit has been made — repel him
        await supabase.from('couples').update({
          nibble_active: false,
          nibble_since:  null,
        }).eq('id', couple.id)

        await supabase.from('nibble_events').insert({
          couple_id:  couple.id,
          event_type: 'repelled',
        })

        await supabase.from('notification_queue').insert([
          { recipient_id: a.id, type: 'nibble_repelled', payload: { couple_id: couple.id } },
          { recipient_id: b.id, type: 'nibble_repelled', payload: { couple_id: couple.id } },
        ])

        results.push({ couple_id: couple.id, action: 'repelled' })
      }
    }

    return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})

async function recalcCoupleScore(coupleId: string, scoreA: number, scoreB: number) {
  const avg   = (scoreA + scoreB) / 2
  const ratio = scoreA > 0 && scoreB > 0
    ? Math.min(scoreA, scoreB) / Math.max(scoreA, scoreB)
    : 0
  const mult  = getReciprocalMultiplier(ratio)
  const score = Math.round(avg * mult)
  const state = getHealthState(score, ratio)
  await supabase.from('couples').update({ couple_score: score, health_state: state }).eq('id', coupleId)
}

function getReciprocalMultiplier(ratio: number): number {
  if (ratio < 0.33) return 0.7
  if (ratio < 0.5)  return 0.8
  if (ratio < 0.65) return 0.9
  if (ratio < 0.8)  return 1.0
  if (ratio < 0.9)  return 1.05
  return 1.2
}

function getHealthState(score: number, ratio: number): string {
  if (score >= 500 && ratio >= 0.8) return 'Thriving'
  if (score >= 350 && ratio >= 0.6) return 'Growing'
  if (score >= 200 || ratio < 0.5)  return 'Drifting'
  return 'Struggling'
}
