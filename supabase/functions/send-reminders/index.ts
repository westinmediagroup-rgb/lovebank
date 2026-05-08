/**
 * Love Bank — send-reminders Edge Function
 *
 * Runs hourly via pg_cron. For each opted-in user it:
 *   1. Checks quiet hours in the user's timezone
 *   2. Gathers behavioral signals (days silent, streak risk, partner activity, Nibble)
 *   3. Picks the highest-priority reminder that isn't on cooldown
 *   4. Renders accountant-voiced copy
 *   5. Sends via Resend (email) and/or Twilio (SMS, high-priority only)
 *   6. Logs to reminders_sent
 *
 * Required Supabase secrets:
 *   RESEND_API_KEY
 *   TWILIO_ACCOUNT_SID
 *   TWILIO_AUTH_TOKEN
 *   TWILIO_PHONE_NUMBER
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/* ─── Supabase client (service role — bypasses RLS) ─────────── */

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const APP_URL    = 'https://love-bank-app-pied.vercel.app'
const FROM_EMAIL = 'Love Bank <reminders@luvbank.xyz>'

/* ─── Types ──────────────────────────────────────────────────── */

type ReminderType =
  | 'nibble_alert'
  | 'streak_warning'
  | 'critical_reengagement'
  | 'partner_deposited'
  | 'social_action'
  | 'daily_nudge'
  | 'reengagement'
  | 'weekly_summary'

type Priority = 'critical' | 'high' | 'medium' | 'low'

interface Reminder {
  type:     ReminderType
  priority: Priority
}

interface Signals {
  daysSilent:            number
  depositsToday:         number
  partnerDepositsToday:  number
  partnerName:           string | null
  partnerId:             string | null
  nibbleActive:          boolean
  isWeeklySummaryWindow: boolean
  weeklyDepositCount:    number
  weeklyPoints:          number
  lastWeekDepositCount:  number
  isSolo:                boolean
}

/* ─── Entry point ────────────────────────────────────────────── */

Deno.serve(async (_req) => {
  try {
    const result = await processReminders()
    return new Response(JSON.stringify({ ok: true, ...result }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('send-reminders error:', err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})

/* ─── Main loop ──────────────────────────────────────────────── */

async function processReminders() {
  const { data: users, error } = await supabase
    .from('profiles')
    .select('*')
    .or('reminders_email.eq.true,reminders_sms.eq.true')

  if (error) throw error
  if (!users?.length) return { processed: 0 }

  let sent = 0
  for (const user of users) {
    const didSend = await processUser(user)
    if (didSend) sent++
  }
  return { processed: users.length, sent }
}

/* ─── Per-user processing ────────────────────────────────────── */

async function processUser(user: Record<string, unknown>): Promise<boolean> {
  const timezone   = (user.reminder_timezone as string) ?? 'America/New_York'
  const quietStart = parseInt(((user.reminder_quiet_start as string) ?? '21:00').split(':')[0])
  const quietEnd   = parseInt(((user.reminder_quiet_end   as string) ?? '08:00').split(':')[0])

  // 1. Quiet hours check
  const localHour = getHourInTz(timezone)
  if (isQuietTime(localHour, quietStart, quietEnd)) return false

  // 2. Gather signals
  const signals = await gatherSignals(user)

  // 3. Determine reminder
  const reminder = pickReminder(user, signals)
  if (!reminder) return false

  // 4. Cooldown check
  const allowed = await checkCooldown(user.id as string, reminder)
  if (!allowed) return false

  // 5. Build content
  const ctx = {
    name:        (user.display_name as string) ?? 'there',
    streak:      (user.deposit_streak as number) ?? 0,
    score:       (user.current_score  as number) ?? 0,
    state:       getStateLabel(user),
    partnerName: signals.partnerName,
    daysSilent:  signals.daysSilent,
    isSolo:      signals.isSolo,
    weeklyDepositCount: signals.weeklyDepositCount,
    weeklyPoints:       signals.weeklyPoints,
    lastWeekDepositCount: signals.lastWeekDepositCount,
  }

  const accountantId = (user.accountant as string) ?? 'fox'

  // 6. Send
  let channelUsed = ''

  if (user.reminders_email && user.email) {
    await sendEmail(user, reminder, accountantId, ctx)
    channelUsed = 'email'
  }

  if (user.reminders_sms && user.phone_number &&
      (reminder.priority === 'critical' || reminder.priority === 'high')) {
    await sendSMS(user.phone_number as string, reminder, accountantId, ctx)
    channelUsed = channelUsed ? `${channelUsed}+sms` : 'sms'
  }

  if (!channelUsed) return false

  // 7. Log
  await supabase.from('reminders_sent').insert({
    user_id:       user.id,
    reminder_type: reminder.type,
    channel:       channelUsed,
    metadata: {
      score:         ctx.score,
      streak:        ctx.streak,
      state:         ctx.state,
      days_silent:   ctx.daysSilent,
    },
  })

  return true
}

/* ─── Signal gathering ───────────────────────────────────────── */

async function gatherSignals(user: Record<string, unknown>): Promise<Signals> {
  const userId  = user.id as string
  const isSolo  = user.relationship_mode === 'solo'
  const now     = new Date()
  const today   = new Date(now); today.setHours(0, 0, 0, 0)
  const weekAgo = new Date(now.getTime() - 7  * 86400000)
  const twoWeeksAgo = new Date(now.getTime() - 14 * 86400000)

  // Days since last deposit
  const { data: lastDep } = await supabase
    .from('deposits')
    .select('created_at')
    .eq('logger_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const daysSilent = lastDep
    ? Math.floor((now.getTime() - new Date(lastDep.created_at).getTime()) / 86400000)
    : 999

  // Deposits today
  const { count: depositsToday } = await supabase
    .from('deposits')
    .select('*', { count: 'exact', head: true })
    .eq('logger_id', userId)
    .gte('created_at', today.toISOString())

  // Partner info (coupled only)
  let partnerName: string | null = null
  let partnerId:   string | null = null
  let partnerDepositsToday = 0

  if (!isSolo) {
    const { data: couple } = await supabase
      .from('couples')
      .select('id, partner_a_id, partner_b_id, partner_a:profiles!partner_a_id(id,display_name), partner_b:profiles!partner_b_id(id,display_name)')
      .or(`partner_a_id.eq.${userId},partner_b_id.eq.${userId}`)
      .eq('status', 'active')
      .maybeSingle()

    if (couple) {
      const isA   = couple.partner_a_id === userId
      const pData = isA ? (couple as any).partner_b : (couple as any).partner_a
      partnerId   = pData?.id ?? null
      partnerName = pData?.display_name ?? null

      if (partnerId) {
        const { count } = await supabase
          .from('deposits')
          .select('*', { count: 'exact', head: true })
          .eq('couple_id', couple.id)
          .eq('logger_id', partnerId)
          .gte('created_at', today.toISOString())
        partnerDepositsToday = count ?? 0
      }
    }
  }

  // Nibble active: no deposit in 3+ days (same logic as score engine)
  const nibbleActive = daysSilent >= 3

  // Weekly summary window: Sunday, between 17:00-18:00 local time
  const localHour    = getHourInTz((user.reminder_timezone as string) ?? 'America/New_York')
  const localDay     = getDayOfWeekInTz((user.reminder_timezone as string) ?? 'America/New_York')
  const isWeeklySummaryWindow = localDay === 0 && localHour === 17 // Sunday 5pm

  // Weekly deposit stats
  const { data: weekDeposits } = await supabase
    .from('deposits')
    .select('final_value')
    .eq('logger_id', userId)
    .gte('created_at', weekAgo.toISOString())

  const weeklyDepositCount = weekDeposits?.length ?? 0
  const weeklyPoints       = weekDeposits?.reduce((s, d) => s + (d.final_value ?? 0), 0) ?? 0

  const { data: lastWeekDeposits } = await supabase
    .from('deposits')
    .select('id')
    .eq('logger_id', userId)
    .gte('created_at', twoWeeksAgo.toISOString())
    .lt('created_at', weekAgo.toISOString())

  const lastWeekDepositCount = lastWeekDeposits?.length ?? 0

  return {
    daysSilent,
    depositsToday:        depositsToday ?? 0,
    partnerDepositsToday,
    partnerName,
    partnerId,
    nibbleActive,
    isWeeklySummaryWindow,
    weeklyDepositCount,
    weeklyPoints,
    lastWeekDepositCount,
    isSolo,
  }
}

/* ─── Reminder selection ─────────────────────────────────────── */

function pickReminder(user: Record<string, unknown>, s: Signals): Reminder | null {
  const streak      = (user.deposit_streak as number) ?? 0
  const localHour   = getHourInTz((user.reminder_timezone as string) ?? 'America/New_York')
  const state       = getStateLabel(user)

  // CRITICAL: Nibble active
  if (s.nibbleActive && s.depositsToday === 0) {
    return { type: 'nibble_alert', priority: 'critical' }
  }

  // HIGH: Streak at risk (streak ≥ 3, no deposit today, evening)
  if (streak >= 3 && s.depositsToday === 0 && localHour >= 18) {
    return { type: 'streak_warning', priority: 'high' }
  }

  // HIGH: Critical re-engagement (Struggling state + 5+ days silent)
  if (state === 'Struggling' && s.daysSilent >= 5) {
    return { type: 'critical_reengagement', priority: 'high' }
  }

  // Weekly summary (runs once, Sunday 5pm)
  if (s.isWeeklySummaryWindow) {
    return { type: 'weekly_summary', priority: 'medium' }
  }

  // MEDIUM: Partner deposited today, user hasn't
  if (!s.isSolo && s.partnerDepositsToday > 0 && s.depositsToday === 0) {
    return { type: 'partner_deposited', priority: 'medium' }
  }

  // MEDIUM: Re-engagement (3+ days silent, no higher priority triggered)
  if (s.daysSilent >= 3 && s.depositsToday === 0) {
    return { type: 'reengagement', priority: 'medium' }
  }

  // LOW: Solo social action prompt (afternoon, no social deposit today)
  if (s.isSolo && s.depositsToday === 0 && localHour >= 14) {
    return { type: 'social_action', priority: 'low' }
  }

  // LOW: Daily nudge (afternoon, no deposit today, user was active recently)
  if (s.depositsToday === 0 && s.daysSilent < 3 && localHour >= 15) {
    return { type: 'daily_nudge', priority: 'low' }
  }

  return null
}

/* ─── Cooldown check ─────────────────────────────────────────── */

async function checkCooldown(userId: string, reminder: Reminder): Promise<boolean> {
  // Critical: can break daily limit — just check 12hr cooldown
  const windowHours = reminder.priority === 'critical' ? 12 : 22

  const { data } = await supabase
    .from('reminders_sent')
    .select('id')
    .eq('user_id', userId)
    .gte('sent_at', new Date(Date.now() - windowHours * 3600000).toISOString())
    .limit(1)
    .maybeSingle()

  // If already sent something in the window, only allow critical to override non-critical
  if (data && reminder.priority !== 'critical') return false

  // Weekly summary: only once per week
  if (reminder.type === 'weekly_summary') {
    const { data: existing } = await supabase
      .from('reminders_sent')
      .select('id')
      .eq('user_id', userId)
      .eq('reminder_type', 'weekly_summary')
      .gte('sent_at', new Date(Date.now() - 6 * 24 * 3600000).toISOString())
      .maybeSingle()
    if (existing) return false
  }

  return true
}

/* ─── Accountant-voiced copy ─────────────────────────────────── */

interface MsgCtx {
  name:        string
  streak:      number
  score:       number
  state:       string
  partnerName: string | null
  daysSilent:  number
  isSolo:      boolean
  weeklyDepositCount:   number
  weeklyPoints:         number
  lastWeekDepositCount: number
}

function getReminderCopy(type: ReminderType, accountant: string, ctx: MsgCtx): { subject: string; body: string; sms: string } {
  const { name, streak, score, state, partnerName, daysSilent, isSolo, weeklyDepositCount, weeklyPoints } = ctx
  const partner = partnerName ?? 'your partner'
  const A = accountant as keyof typeof COPY

  const COPY = {
    fox: {
      nibble_alert: {
        subject: `${name}, Nibble's awake. Fix it.`,
        body:    `Three days without a deposit. You let this happen. One deposit right now sends Nibble back. Make it.`,
        sms:     `Love Bank: Nibble's in your account. 3 days without a deposit. Fix it now → ${APP_URL}/deposit #LoveBank`,
      },
      streak_warning: {
        subject: `${streak}-day streak. Tonight's the test.`,
        body:    `You've built ${streak} straight days. Don't make tonight the exception. One deposit before you sleep.`,
        sms:     `Love Bank: ${streak}-day streak at risk. No deposit yet today. → ${APP_URL}/deposit #LoveBank`,
      },
      critical_reengagement: {
        subject: `${daysSilent} days. The account noticed.`,
        body:    `${daysSilent} days without a deposit. The account is ${state}. You know what to do — one deposit, now.`,
        sms:     `Love Bank: ${daysSilent} days silent. Account is ${state}. → ${APP_URL}/deposit #LoveBank`,
      },
      partner_deposited: {
        subject: `${partner} made a deposit. You haven't.`,
        body:    `${partner} showed up today. The account keeps score. Make your deposit.`,
        sms:     `Love Bank: ${partner} deposited today. Your turn. → ${APP_URL}/deposit #LoveBank`,
      },
      social_action: {
        subject: `${name}. Text someone today.`,
        body:    `A real message to a parent, a friend — that's a social deposit. Don't just think about it.`,
        sms:     `Love Bank: Text someone today. Log it as a social deposit. → ${APP_URL}/solo-deposit?category=social #LoveBank`,
      },
      reengagement: {
        subject: `${daysSilent} days. Don't let it become a habit.`,
        body:    `${daysSilent} days without a deposit. That's not a rough patch — that's a pattern forming. One deposit today breaks it.`,
        sms:     `Love Bank: ${daysSilent} days since your last deposit. → ${APP_URL}/deposit #LoveBank`,
      },
      daily_nudge: {
        subject: `${name}. One deposit today.`,
        body:    `The account doesn't care about your intentions. It cares about your actions. Make one deposit today.`,
        sms:     `Love Bank: No deposit yet today. Make one. → ${APP_URL}/deposit #LoveBank`,
      },
    },
    owl: {
      nibble_alert: {
        subject: `Nibble is here, ${name}. What went quiet?`,
        body:    `Nibble arrives when silence goes on too long. Three days have passed without a deposit. What has been left unattended between you?`,
        sms:     `Love Bank: Nibble's awake — 3 days without a deposit. One deposit sends it away. → ${APP_URL}/deposit #LoveBank`,
      },
      streak_warning: {
        subject: `${streak} days built. One deposit protects it.`,
        body:    `A ${streak}-day streak is evidence of a decision made, repeatedly. One deposit tonight continues that evidence.`,
        sms:     `Love Bank: Your ${streak}-day streak is at risk tonight. → ${APP_URL}/deposit #LoveBank`,
      },
      critical_reengagement: {
        subject: `${daysSilent} days of quiet, ${name}.`,
        body:    `Silence in an account is rarely neutral. ${daysSilent} days have passed. The account is ${state}. What will today's action be?`,
        sms:     `Love Bank: ${daysSilent} days silent. The account waits. → ${APP_URL}/deposit #LoveBank`,
      },
      partner_deposited: {
        subject: `${partner} made a deposit today.`,
        body:    `${partner} chose to show up today. Relationships compound when both people invest. What you put in now shapes what you have tomorrow.`,
        sms:     `Love Bank: ${partner} deposited today. Add yours. → ${APP_URL}/deposit #LoveBank`,
      },
      social_action: {
        subject: `Have you reached out to someone today?`,
        body:    `A check-in with a family member, a kind message to a friend — these are the small investments that compound into strong bonds. That's a social deposit.`,
        sms:     `Love Bank: A message to someone you care about is a social deposit. → ${APP_URL}/solo-deposit?category=social #LoveBank`,
      },
      reengagement: {
        subject: `${daysSilent} days. The pattern is forming.`,
        body:    `Patterns, once started, have a way of continuing. ${daysSilent} days without a deposit is a pattern worth interrupting. What will you do today?`,
        sms:     `Love Bank: ${daysSilent} days since your last deposit. → ${APP_URL}/deposit #LoveBank`,
      },
      daily_nudge: {
        subject: `A small deposit today, ${name}.`,
        body:    `What you put in today shapes what you have tomorrow. Even the smallest deposit carries weight over time.`,
        sms:     `Love Bank: A small deposit today compounds into something significant. → ${APP_URL}/deposit #LoveBank`,
      },
    },
    bear: {
      nibble_alert: {
        subject: `Oh no — Nibble's awake 😬`,
        body:    `Hey ${name} 🐻 Nibble showed up because we haven't seen a deposit in three days. One warm deposit and you'll send it right back to sleep. You've got this!`,
        sms:     `Love Bank: Nibble's awake 😬 One deposit sends it back to sleep! → ${APP_URL}/deposit #LoveBank`,
      },
      streak_warning: {
        subject: `${name}, your ${streak}-day streak needs you tonight 💛`,
        body:    `Look at that streak — ${streak} days! Let's not let tonight be the one that breaks it. One quick deposit and you're safe 🐻`,
        sms:     `Love Bank: ${streak}-day streak at risk tonight! One deposit saves it 💛 → ${APP_URL}/deposit #LoveBank`,
      },
      critical_reengagement: {
        subject: `We miss you in here, ${name} 🐻`,
        body:    `Hey — it's been ${daysSilent} days, and your account is feeling it. But that's okay! Every single deposit counts, no matter how small. Come back 💛`,
        sms:     `Love Bank: ${daysSilent} days is a long quiet. Come back — even one deposit helps 💛 → ${APP_URL}/deposit #LoveBank`,
      },
      partner_deposited: {
        subject: `${partner} made a deposit today 💛`,
        body:    `${partner} showed up for the account today — that's so sweet 🐻 Want to add yours? Even something small keeps the love growing.`,
        sms:     `Love Bank: ${partner} deposited today 💛 Add yours! → ${APP_URL}/deposit #LoveBank`,
      },
      social_action: {
        subject: `Have you reached out to someone today? 💛`,
        body:    `Hey ${name}! A text to a parent, a check-in with a friend — that counts as a social deposit. Spreading love to the people around you matters 🐻`,
        sms:     `Love Bank: A quick text to someone you love = a social deposit 💛 → ${APP_URL}/solo-deposit?category=social #LoveBank`,
      },
      reengagement: {
        subject: `${name}, we've missed you 🐻`,
        body:    `${daysSilent} days since your last deposit. That's okay — you're here now! Even one small deposit today gets things moving again 💛`,
        sms:     `Love Bank: ${daysSilent} days of quiet. Come back — one deposit is all it takes 💛 → ${APP_URL}/deposit #LoveBank`,
      },
      daily_nudge: {
        subject: `Just a little nudge, ${name} 🐻`,
        body:    `No deposit yet today — and that's okay! Just a gentle reminder that even the smallest deposit is a choice to show up. And that matters more than you know 💛`,
        sms:     `Love Bank: A little nudge — one deposit today keeps the account warm 💛 → ${APP_URL}/deposit #LoveBank`,
      },
    },
    wolf: {
      nibble_alert: {
        subject: `Nibble is here because you slipped, ${name}.`,
        body:    `Three days without a deposit. Unacceptable. Nibble doesn't leave on its own — you have to earn it out. One deposit, now.`,
        sms:     `Love Bank: Nibble's here. 3 days without a deposit. Handle it. → ${APP_URL}/deposit #LoveBank`,
      },
      streak_warning: {
        subject: `${streak} days. Don't let tonight end it.`,
        body:    `You've built a ${streak}-day streak. Most people don't have that. Make the deposit tonight. Protect what you've built.`,
        sms:     `Love Bank: ${streak}-day streak on the line tonight. → ${APP_URL}/deposit #LoveBank`,
      },
      critical_reengagement: {
        subject: `${daysSilent} days, ${name}. Wake up.`,
        body:    `${daysSilent} days of silence. Every day without a deposit is a day your account drifts and your partner wonders if you're still in it. Get back to work.`,
        sms:     `Love Bank: ${daysSilent} days silent. The account is ${state}. Get in here. → ${APP_URL}/deposit #LoveBank`,
      },
      partner_deposited: {
        subject: `${partner} deposited. You haven't.`,
        body:    `${partner} showed up. You didn't. That gap matters — close it today.`,
        sms:     `Love Bank: ${partner} deposited. You haven't. Close the gap. → ${APP_URL}/deposit #LoveBank`,
      },
      social_action: {
        subject: `Social deposits require action, not intention.`,
        body:    `Thinking about texting your parent or a friend doesn't count. Doing it does. A real message to someone today is a social deposit. Make it happen.`,
        sms:     `Love Bank: Text someone real today. Log it. → ${APP_URL}/solo-deposit?category=social #LoveBank`,
      },
      reengagement: {
        subject: `${daysSilent} days. Complacency kills accounts.`,
        body:    `${daysSilent} days without a deposit. That's how accounts go from Thriving to Struggling. Don't be the person who let this slip.`,
        sms:     `Love Bank: ${daysSilent} days out. Don't let it become a habit. → ${APP_URL}/deposit #LoveBank`,
      },
      daily_nudge: {
        subject: `${name}. No deposit yet today.`,
        body:    `The bar is a daily deposit. Not weekly. Not when you feel like it. Daily. No exceptions.`,
        sms:     `Love Bank: No deposit today yet. Daily. No exceptions. → ${APP_URL}/deposit #LoveBank`,
      },
    },
    lion: {
      nibble_alert: {
        subject: `Nibble doesn't belong in your account, ${name}.`,
        body:    `Nibble has taken up residence. A lion doesn't negotiate with goblins — one deposit reclaims the account. Reign accordingly.`,
        sms:     `Love Bank: Nibble's in your account. Reclaim it with one deposit. → ${APP_URL}/deposit #LoveBank`,
      },
      streak_warning: {
        subject: `${streak} days of strength. Protect it tonight.`,
        body:    `${streak} days of showing up. Lions don't let tonight be the exception. One deposit — then rest.`,
        sms:     `Love Bank: ${streak}-day streak. Lions don't quit tonight. → ${APP_URL}/deposit #LoveBank`,
      },
      critical_reengagement: {
        subject: `${daysSilent} days, ${name}. This isn't you.`,
        body:    `${daysSilent} days of silence. The account is ${state}. Every empire has setbacks — the measure is how you rebuild. Start today.`,
        sms:     `Love Bank: ${daysSilent} days silent. Rebuild today. → ${APP_URL}/deposit #LoveBank`,
      },
      partner_deposited: {
        subject: `${partner} showed up. Match that.`,
        body:    `${partner} made a deposit today. Strength in a partnership is built by both. Match that energy — the account is watching.`,
        sms:     `Love Bank: ${partner} deposited today. Match that strength. → ${APP_URL}/deposit #LoveBank`,
      },
      social_action: {
        subject: `The people around you deserve your presence today.`,
        body:    `A call to a parent, a real message to a friend — these are the deposits that build your social strength. Don't let another day pass without one.`,
        sms:     `Love Bank: Reach out to someone today. That's a social deposit. → ${APP_URL}/solo-deposit?category=social #LoveBank`,
      },
      reengagement: {
        subject: `${daysSilent} days. Beneath you.`,
        body:    `Drifting is beneath you. ${daysSilent} days without a deposit — you built something worth fighting for. Fight for it.`,
        sms:     `Love Bank: ${daysSilent} days silent. Fight for the account. → ${APP_URL}/deposit #LoveBank`,
      },
      daily_nudge: {
        subject: `${name}. A deposit today.`,
        body:    `Strength is built through daily discipline. Not grand gestures — the daily ones. Make your deposit today.`,
        sms:     `Love Bank: Daily discipline. One deposit today. → ${APP_URL}/deposit #LoveBank`,
      },
    },
  }

  const accountantCopy = COPY[A] ?? COPY.fox
  const typeCopy = (accountantCopy as any)[type] as { subject: string; body: string; sms: string }
  return typeCopy ?? (accountantCopy as any).daily_nudge
}

/* ─── Weekly summary copy ────────────────────────────────────── */

function getWeeklySummaryCopy(accountant: string, ctx: MsgCtx) {
  const { name, score, state, streak, weeklyDepositCount, weeklyPoints, lastWeekDepositCount } = ctx
  const trend = weeklyDepositCount > lastWeekDepositCount
    ? `↑ ${weeklyDepositCount - lastWeekDepositCount} more than last week`
    : weeklyDepositCount < lastWeekDepositCount
      ? `↓ ${lastWeekDepositCount - weeklyDepositCount} fewer than last week`
      : 'Same as last week'

  const closings: Record<string, string> = {
    fox:  `The numbers are what they are. Show up next week.`,
    owl:  `What you put in this week echoes into next. Make next week count.`,
    bear: `Look at you — ${weeklyDepositCount} deposits this week! Keep going 🐻💛`,
    wolf: `${weeklyDepositCount} deposits. The bar is higher next week. Meet it.`,
    lion: `${weeklyDepositCount} deposits this week. Build on it. Reign accordingly.`,
  }

  return {
    subject: `Your Love Bank week — ${weeklyDepositCount} deposits, ${weeklyPoints} pts`,
    closing: closings[accountant] ?? closings.fox,
    trend,
  }
}

/* ─── Email sending (Resend) ─────────────────────────────────── */

async function sendEmail(
  user: Record<string, unknown>,
  reminder: Reminder,
  accountant: string,
  ctx: MsgCtx,
) {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) { console.warn('RESEND_API_KEY not set'); return }

  let subject: string
  let bodyHtml: string

  if (reminder.type === 'weekly_summary') {
    const { subject: s, closing, trend } = getWeeklySummaryCopy(accountant, ctx)
    subject = s
    bodyHtml = buildWeeklySummaryEmail(ctx, closing, trend, accountant)
  } else {
    const copy = getReminderCopy(reminder.type, accountant, ctx)
    subject  = copy.subject
    bodyHtml = buildStandardEmail(copy.body, ctx, reminder.type)
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from:    FROM_EMAIL,
      to:      [user.email],
      subject,
      html:    bodyHtml,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error('Resend error:', err)
  }
}

/* ─── SMS sending (Twilio) ───────────────────────────────────── */

async function sendSMS(
  phone: string,
  reminder: Reminder,
  accountant: string,
  ctx: MsgCtx,
) {
  const sid   = Deno.env.get('TWILIO_ACCOUNT_SID')
  const token = Deno.env.get('TWILIO_AUTH_TOKEN')
  const from  = Deno.env.get('TWILIO_PHONE_NUMBER')
  if (!sid || !token || !from) { console.warn('Twilio credentials not set'); return }

  const copy = getReminderCopy(reminder.type, accountant, ctx)

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type':  'application/x-www-form-urlencoded',
        'Authorization': `Basic ${btoa(`${sid}:${token}`)}`,
      },
      body: new URLSearchParams({ From: from, To: phone, Body: copy.sms }),
    },
  )

  if (!res.ok) {
    const err = await res.text()
    console.error('Twilio error:', err)
  }
}

/* ─── Email HTML templates ───────────────────────────────────── */

function stateColor(state: string): string {
  const map: Record<string, string> = {
    Thriving: '#1a7a60', Balanced: '#1a7a60', Growing: '#1a7a60',
    Drifting: '#d4821e', Recovering: '#d4821e',
    Struggling: '#d94f4f',
  }
  return map[state] ?? '#6e6660'
}

function buildStandardEmail(body: string, ctx: MsgCtx, type: ReminderType): string {
  const ctaLabel = type === 'nibble_alert' ? 'Send Nibble away →'
    : type === 'social_action' ? 'Log a social deposit →'
    : ctx.isSolo ? 'Log a deposit →'
    : 'Log a deposit →'

  const ctaHref = type === 'social_action'
    ? `${APP_URL}/solo-deposit?category=social`
    : ctx.isSolo ? `${APP_URL}/solo-deposit` : `${APP_URL}/deposit`

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#faf6ef;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<div style="max-width:480px;margin:0 auto;padding:36px 24px;">
  <p style="font-size:19px;color:#d4821e;margin:0 0 32px;font-style:italic;font-weight:500;">Love Bank</p>
  <p style="font-size:16px;color:#1c1a17;line-height:1.75;margin:0 0 28px;">${body}</p>
  <div style="background:#fff;border:0.5px solid #e8e2d8;border-radius:14px;padding:18px 20px;margin:0 0 28px;display:flex;justify-content:space-between;gap:8px;">
    <div style="text-align:center;flex:1;">
      <p style="font-size:10px;color:#6e6660;margin:0 0 4px;text-transform:uppercase;letter-spacing:0.07em;">Balance</p>
      <p style="font-size:24px;font-weight:700;color:#1c1a17;margin:0;">${ctx.score}</p>
    </div>
    <div style="text-align:center;flex:1;">
      <p style="font-size:10px;color:#6e6660;margin:0 0 4px;text-transform:uppercase;letter-spacing:0.07em;">Streak</p>
      <p style="font-size:24px;font-weight:700;color:#1c1a17;margin:0;">${ctx.streak}</p>
      <p style="font-size:10px;color:#6e6660;margin:2px 0 0;">days</p>
    </div>
    <div style="text-align:center;flex:1;">
      <p style="font-size:10px;color:#6e6660;margin:0 0 4px;text-transform:uppercase;letter-spacing:0.07em;">State</p>
      <p style="font-size:14px;font-weight:600;color:${stateColor(ctx.state)};margin:0;">${ctx.state}</p>
    </div>
  </div>
  <a href="${ctaHref}" style="display:block;background:#1c1a17;color:#ffffff;text-decoration:none;text-align:center;padding:15px 24px;border-radius:100px;font-size:14px;font-weight:600;letter-spacing:0.02em;">${ctaLabel}</a>
  <p style="font-size:11px;color:#6e6660;margin:28px 0 0;text-align:center;line-height:1.7;">
    You're getting this because you opted into Love Bank reminders.<br>
    <a href="${APP_URL}/settings" style="color:#6e6660;text-decoration:underline;">Manage notifications</a>
  </p>
</div>
</body></html>`
}

function buildWeeklySummaryEmail(ctx: MsgCtx, closing: string, trend: string, accountant: string): string {
  const accountantEmojis: Record<string, string> = {
    fox: '🦊', owl: '🦉', bear: '🐻', wolf: '🐺', lion: '🦁',
  }
  const emoji = accountantEmojis[accountant] ?? '🦊'
  const ctaHref = ctx.isSolo ? `${APP_URL}/solo-deposit` : `${APP_URL}/deposit`

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#faf6ef;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<div style="max-width:480px;margin:0 auto;padding:36px 24px;">
  <p style="font-size:19px;color:#d4821e;margin:0 0 8px;font-style:italic;font-weight:500;">Love Bank</p>
  <p style="font-size:12px;color:#6e6660;margin:0 0 32px;letter-spacing:0.06em;text-transform:uppercase;">Weekly review</p>

  <!-- Score card -->
  <div style="background:#1c1a17;border-radius:16px;padding:24px;margin:0 0 16px;text-align:center;">
    <p style="font-size:11px;color:#888780;margin:0 0 8px;letter-spacing:0.07em;text-transform:uppercase;">Your balance</p>
    <p style="font-size:52px;font-weight:700;color:#fff;margin:0 0 6px;line-height:1;">${ctx.score}</p>
    <p style="font-size:14px;font-weight:600;color:${stateColor(ctx.state)};margin:0;">${ctx.state}</p>
  </div>

  <!-- Stats row -->
  <div style="display:flex;gap:10px;margin:0 0 24px;">
    <div style="flex:1;background:#fff;border:0.5px solid #e8e2d8;border-radius:12px;padding:14px;text-align:center;">
      <p style="font-size:10px;color:#6e6660;margin:0 0 4px;text-transform:uppercase;letter-spacing:0.07em;">Deposits</p>
      <p style="font-size:24px;font-weight:700;color:#1c1a17;margin:0;">${ctx.weeklyDepositCount}</p>
      <p style="font-size:10px;color:#6e6660;margin:3px 0 0;">${trend}</p>
    </div>
    <div style="flex:1;background:#fff;border:0.5px solid #e8e2d8;border-radius:12px;padding:14px;text-align:center;">
      <p style="font-size:10px;color:#6e6660;margin:0 0 4px;text-transform:uppercase;letter-spacing:0.07em;">Points</p>
      <p style="font-size:24px;font-weight:700;color:#1c1a17;margin:0;">+${ctx.weeklyPoints}</p>
    </div>
    <div style="flex:1;background:#fff;border:0.5px solid #e8e2d8;border-radius:12px;padding:14px;text-align:center;">
      <p style="font-size:10px;color:#6e6660;margin:0 0 4px;text-transform:uppercase;letter-spacing:0.07em;">Streak</p>
      <p style="font-size:24px;font-weight:700;color:#1c1a17;margin:0;">${ctx.streak}</p>
      <p style="font-size:10px;color:#6e6660;margin:3px 0 0;">days</p>
    </div>
  </div>

  <!-- Accountant closing -->
  <div style="background:#fff;border:0.5px solid #e8e2d8;border-left:3px solid #d4821e;border-radius:12px;padding:16px 18px;margin:0 0 24px;">
    <p style="font-size:11px;color:#6e6660;margin:0 0 6px;">${emoji} Your accountant</p>
    <p style="font-size:14px;color:#1c1a17;line-height:1.7;margin:0;font-style:italic;">"${closing}"</p>
  </div>

  <a href="${ctaHref}" style="display:block;background:#1c1a17;color:#ffffff;text-decoration:none;text-align:center;padding:15px 24px;border-radius:100px;font-size:14px;font-weight:600;">Start the week strong →</a>
  <p style="font-size:11px;color:#6e6660;margin:28px 0 0;text-align:center;line-height:1.7;">
    <a href="${APP_URL}/settings" style="color:#6e6660;text-decoration:underline;">Manage notifications</a>
  </p>
</div>
</body></html>`
}

/* ─── Time helpers ───────────────────────────────────────────── */

function getHourInTz(timezone: string): number {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', hour12: false })
    return parseInt(fmt.format(new Date()))
  } catch { return new Date().getUTCHours() }
}

function getDayOfWeekInTz(timezone: string): number {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' })
    const day = fmt.format(new Date())
    return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(day)
  } catch { return new Date().getUTCDay() }
}

function isQuietTime(hour: number, quietStart: number, quietEnd: number): boolean {
  // Handles overnight windows e.g. 21 → 8 (9pm to 8am)
  if (quietStart > quietEnd) return hour >= quietStart || hour < quietEnd
  return hour >= quietStart && hour < quietEnd
}

/* ─── Health state label ─────────────────────────────────────── */

function getStateLabel(user: Record<string, unknown>): string {
  const score = (user.current_score as number) ?? 0
  const isSolo = user.relationship_mode === 'solo'

  if (isSolo) {
    if (score >= 500) return 'Thriving'
    if (score >= 350) return 'Balanced'
    if (score >= 200) return 'Growing'
    if (score >= 100) return 'Drifting'
    return 'Struggling'
  } else {
    if (score >= 500) return 'Thriving'
    if (score >= 350) return 'Growing'
    if (score >= 200) return 'Drifting'
    return 'Struggling'
  }
}
