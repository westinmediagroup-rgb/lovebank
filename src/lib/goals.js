// ─── Goal categories and curated suggestions ──────────────────────────────

export const GOAL_CATEGORIES = [
  {
    id:    'self-care',
    label: 'Self-care',
    emoji: '🌿',
    suggestions: [
      'Get 7+ hours of sleep',
      'Move your body for 20 minutes',
      'Eat a real meal — no rushing',
      'Drink 8 glasses of water',
      'Take a 10-minute walk outside',
      'Spend 10 minutes doing nothing',
      'Put the phone down by 9pm',
    ],
  },
  {
    id:    'growth',
    label: 'Personal growth',
    emoji: '📚',
    suggestions: [
      'Read for 15 minutes',
      'Write in a journal',
      'Learn something new — even one thing',
      'Listen to a podcast or lesson',
      'Reflect on something you did well',
      'Set an intention for tomorrow',
    ],
  },
  {
    id:    'social',
    label: 'Relationships',
    emoji: '💛',
    suggestions: [
      'Send a genuine message to someone you care about',
      'Check in with a friend or family member',
      'Say something kind — and mean it',
      'Show up for a plan you made',
      'Have one real conversation today',
      'Tell someone you appreciate them',
    ],
  },
  {
    id:    'habit',
    label: 'Daily habits',
    emoji: '🔁',
    suggestions: [
      'Make your bed in the morning',
      'Meditate or breathe intentionally for 5 min',
      'No social media before 9am',
      'Start the day without your phone for 30 min',
      'Plan tomorrow the night before',
      'Clear one space in your environment',
    ],
  },
  {
    id:    'courage',
    label: 'Courage & honesty',
    emoji: '💪',
    suggestions: [
      "Say something you've been holding back",
      'Ask for what you actually need',
      'Set one boundary and hold it',
      "Apologize for something you've been avoiding",
      'Have the conversation you keep putting off',
      'Admit a mistake — to yourself or someone else',
    ],
  },
]

/** Returns today's ISO date string (YYYY-MM-DD) in local time */
export function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Returns the start of the current week (Monday) as ISO string */
export function weekStart() {
  const d = new Date()
  const day = d.getDay() // 0 = Sunday
  const diff = (day === 0 ? -6 : 1) - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}
