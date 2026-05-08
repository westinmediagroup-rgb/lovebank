export const ACCOUNTANTS = [
  {
    id:      'fox',
    emoji:   '🦊',
    name:    'The Fox',
    tagline: 'Sharp and direct. No sugar-coating, no fluff — just the truth.',
    sample:  'The account doesn\'t care about your intentions. It cares about your actions. Make a deposit.',
  },
  {
    id:      'owl',
    emoji:   '🦉',
    name:    'The Owl',
    tagline: 'Wise and measured. Puts everything in perspective.',
    sample:  'Relationships, like all valuable things, compound over time. What you put in today shapes what you have tomorrow.',
  },
  {
    id:      'bear',
    emoji:   '🐻',
    name:    'The Bear',
    tagline: 'Warm and steady. Believes in you, even when the numbers don\'t.',
    sample:  'Every deposit, no matter how small, is a choice to show up. And that matters more than you know.',
  },
  {
    id:      'wolf',
    emoji:   '🐺',
    name:    'The Wolf',
    tagline: 'Intense and demanding. Sets the bar high and holds you to it.',
    sample:  'The bar is a daily deposit. Not weekly. Not "when I feel like it." Daily. No exceptions.',
  },
  {
    id:      'lion',
    emoji:   '🦁',
    name:    'The Lion',
    tagline: 'Bold and regal. Built for people who don\'t settle.',
    sample:  'Strength in a relationship, like strength in the wild, is built through daily discipline. Reign accordingly.',
  },
]

/**
 * Per-accountant messages shown on the ConnectionMoment screen when both partners have joined.
 */
export const PARTNER_JOINED_MESSAGES = {
  fox:  'Both accounts open. The work starts now. One deposit today.',
  owl:  'The account is live. Consistency from day one compounds faster than you think.',
  bear: "You're both here. That already means something. Start with something small and heartfelt — today.",
  wolf: 'Connected. No celebration — get to work. First deposit within 24 hours.',
  lion: 'Your account is open. Rule it with intention. Daily deposits, starting now.',
}

/**
 * Returns a message for the given accountant based on current account state.
 * @param {string} accountantId - fox | owl | bear | wolf | lion
 * @param {object} ctx - { state, nibbleActive, streak, hasActivity, partnerPronouns }
 */
export function getAccountantMessage(accountantId, ctx) {
  const { state, nibbleActive, streak, hasActivity, partnerPronouns } = ctx
  const p = partnerPronouns ?? { subject: 'They', object: 'them', possessive: 'their', subjLower: 'they' }

  const messages = {
    fox: {
      nibble:      `Nibble's here because you went 3 days without a deposit. You let this happen. Fix it — one deposit, now.`,
      low:         `The numbers are bad. Not catastrophic, but bad. You know what to do.`,
      struggling:  `This account is on life support. Both of you need to show up or it's over.`,
      drifting:    `Drifting. That's the polite word for it. Make a deposit before I use the other one.`,
      longStreak:  `${streak} days straight. Good. Don't pat yourself on the back yet — consistency is the baseline, not the achievement.`,
      shortStreak: `${streak}-day streak. Keep going. Most people quit before it becomes a habit.`,
      noActivity:  `Nothing this week. Nibble noticed. I noticed. Make the first move.`,
      thriving:    `Thriving. Don't get comfortable. The gap between this and drifting is smaller than you think.`,
      default:     `Steady. The best accounts aren't built on grand gestures — they're built on the small, daily ones.`,
    },
    owl: {
      nibble:      `Nibble arrives when silence has gone on too long. What has been left unsaid between you?`,
      low:         `A depleted account reflects a gap in attention. The remedy is always simpler than it seems.`,
      struggling:  `Even the strongest accounts go through seasons of struggle. What matters is who shows up first.`,
      drifting:    `Drifting is what happens when you assume the account runs itself. It doesn't.`,
      longStreak:  `${streak} days. A long streak is not merely a number — it is evidence of a decision made, repeatedly.`,
      shortStreak: `Three days. A small pattern forming. Patterns, once started, have a way of continuing.`,
      noActivity:  `Silence in an account is rarely neutral. It is either rest, or neglect. Only you know which.`,
      thriving:    `A thriving account is a living thing. It requires attention to stay that way.`,
      default:     `Relationships, like all valuable things, compound over time. What you put in today shapes what you have tomorrow.`,
    },
    bear: {
      nibble:      `Oh, Nibble's here. Don't worry — one warm deposit and you'll send ${p.object} right back to sleep. You've got this.`,
      low:         `The balance is low, but that's okay. You know how to turn this around. One deposit at a time.`,
      struggling:  `Hey. Struggling accounts don't mean struggling relationships. Show up for each other this week.`,
      drifting:    `You've drifted a little — that happens. What matters is that you noticed and you're here.`,
      longStreak:  `Look at you — ${streak} days straight! That's real love showing up every single day.`,
      shortStreak: `${streak} days in a row! You're building something beautiful together. Keep going.`,
      noActivity:  `A quiet week. Your partner feels it too. One little deposit goes a long way.`,
      thriving:    `You're thriving! This is what consistent love looks like. So proud of this account.`,
      default:     `Every deposit, no matter how small, is a choice to show up. And that matters more than you know.`,
    },
    wolf: {
      nibble:      `Nibble is here because you slipped. Three days without a deposit is unacceptable. Handle it.`,
      low:         `Low balance. This didn't happen overnight and it won't fix itself overnight. Get to work.`,
      struggling:  `Struggling accounts don't wait. Every day without a deposit is a day your partner wonders if you're still in it.`,
      drifting:    `Drifting means you got complacent. Complacency is how accounts die. Wake up.`,
      longStreak:  `${streak} days. Good streak. But streaks end. Have you made this a non-negotiable yet?`,
      shortStreak: `${streak} days. That's a start. Don't let it be the end.`,
      noActivity:  `Nothing this week. Zero. Your partner is keeping score even when you're not.`,
      thriving:    `Thriving. Maintain it. Most couples let a good streak make them lazy. Don't be most couples.`,
      default:     `The bar is a daily deposit. Not weekly. Not "when I feel like it." Daily. No exceptions.`,
    },
    lion: {
      nibble:      `Nibble has taken up residence in your account. A lion doesn't negotiate with goblins — deposit.`,
      low:         `The account is lean. Lions don't apologize for their circumstances. They change them.`,
      struggling:  `Every empire has its setbacks. The measure of a partnership is how you rebuild.`,
      drifting:    `Drifting is beneath you. You built something worth fighting for — fight for it.`,
      longStreak:  `${streak} days of strength. This is who you are when you're at your best.`,
      shortStreak: `${streak} days running. The pride grows with every deposit.`,
      noActivity:  `A quiet week. Even lions need reminding: the account doesn't feed itself.`,
      thriving:    `Thriving. This is the standard — not the exception.`,
      default:     `Strength in a relationship, like strength in the wild, is built through daily discipline. Reign accordingly.`,
    },
  }

  const set = messages[accountantId] ?? messages.fox

  if (nibbleActive)           return set.nibble
  if (state === 'Struggling') return set.struggling
  if (state === 'Drifting')   return set.drifting
  if (!hasActivity)           return set.noActivity
  if (streak >= 7)            return set.longStreak
  if (streak >= 3)            return set.shortStreak
  if (state === 'Thriving')   return set.thriving
  if (state === 'Recovering') return set.low
  return set.default
}
