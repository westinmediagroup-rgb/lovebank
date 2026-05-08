export const DEPOSIT_BASE_VALUES = {
  quick_text:           8,
  voice_note:           10,
  written_note:         14,
  act_of_service:       16,
  surprise_gesture:     18,
  planned_experience:   18,
  hard_conversation:    20,
  public_affirmation:   22,
  milestone_written:    28,
}

export const WITHDRAWAL_COSTS = {
  going_quiet:               8,
  cancelled_plans:           10,
  phone_during_connection:   10,
  dismissal:                 14,
  avoidance:                 16,
  stonewalling:              18,
  false_agreement:           18,
  broken_promise:            20,
  chronic_criticism:         24,
  unilateral_decision:       28,
  no_repair_after_conflict:  30,
}

export const EFFORT_MULTIPLIERS = {
  quick:     1.0,
  planned:   1.2,
  brave:     1.5,
  milestone: 1.8,
}

export const STAGE_OPENING_BALANCE = {
  single:        200,
  casual_dating: 150,
  starting_over: 200,
  healing:       200,
  coparenting:   180,
  dating:        150,
  engaged:       200,
  newlyweds:     300,
  married:       350,
}

export const SOLO_SELF_DEPOSIT_TYPES = {
  morning_intention: 10,
  emotional_checkin: 12,
  boundary_set:      16,
  self_care_act:     14,
  personal_growth:   18,
  therapy_session:   24,
  mindfulness:       12,
}

export const SOLO_SOCIAL_DEPOSIT_TYPES = {
  family_quality_time: 16,
  friend_checkin:      12,
  coworker_kindness:   10,
  date_presence:       18,
  conflict_grace:      20,
  community_act:       14,
}

export const SOLO_DEPOSIT_LABELS = {
  morning_intention:   'Morning intention or journaling',
  emotional_checkin:   'Emotional check-in with yourself',
  boundary_set:        'Set or held a boundary',
  self_care_act:       'Act of self-care',
  personal_growth:     'Learning or personal growth',
  therapy_session:     'Therapy or counseling session',
  mindfulness:         'Mindfulness or meditation',
  family_quality_time: 'Quality time with family',
  friend_checkin:      'Checked in on a friend',
  coworker_kindness:   'Act of kindness at work',
  date_presence:       'Showed up fully on a date',
  conflict_grace:      'Handled conflict with grace',
  community_act:       'Community or social act',
}

export function getSoloHealthState(score) {
  if (score >= 500) return 'Thriving'
  if (score >= 350) return 'Balanced'
  if (score >= 200) return 'Growing'
  if (score >= 100) return 'Drifting'
  return 'Struggling'
}

export const LL_DEPOSIT_MAP = {
  words: ['quick_text', 'voice_note', 'written_note', 'public_affirmation', 'milestone_written'],
  time:  ['planned_experience', 'hard_conversation'],
  touch: ['surprise_gesture'],
  acts:  ['act_of_service'],
  gifts: ['surprise_gesture', 'milestone_written'],
}

export function getLLMultiplier(depositType, receiverLL) {
  const matches = LL_DEPOSIT_MAP[receiverLL] ?? []
  return matches.includes(depositType) ? 1.5 : 1.0
}

export function calcDepositValue(depositType, effortTier, receiverLL) {
  const base = DEPOSIT_BASE_VALUES[depositType] ?? 10
  const ll   = getLLMultiplier(depositType, receiverLL)
  const eff  = EFFORT_MULTIPLIERS[effortTier] ?? 1.0
  return { base, ll_multiplier: ll, effort_multiplier: eff, final: Math.round(base * ll * eff) }
}

export function getReciprocalMultiplier(ratio) {
  if (ratio < 0.33) return 0.7
  if (ratio < 0.5)  return 0.8
  if (ratio < 0.65) return 0.9
  if (ratio < 0.8)  return 1.0
  if (ratio < 0.9)  return 1.05
  return 1.2
}

export function calcCoupleScore(scoreA, scoreB, sharedEvents = 0, braveConvos = 0, unresolvedOld = 0) {
  const avg = (scoreA + scoreB) / 2
  const ratio = scoreA > 0 && scoreB > 0
    ? Math.min(scoreA, scoreB) / Math.max(scoreA, scoreB)
    : 0
  const mult = getReciprocalMultiplier(ratio)
  const score = Math.round(
    avg * mult
    + sharedEvents * 20
    + braveConvos * 15
    - unresolvedOld * 10
  )
  return { score, ratio: Math.round(ratio * 100), multiplier: mult }
}

export function getHealthState(coupleScore, reciprocityRatio, recovering = false) {
  if (coupleScore >= 500 && reciprocityRatio >= 0.8) return 'Thriving'
  if (recovering) return 'Recovering'
  if (coupleScore >= 350 && reciprocityRatio >= 0.6) return 'Growing'
  if (coupleScore >= 200 || reciprocityRatio < 0.5)  return 'Drifting'
  return 'Struggling'
}

export const DEPOSIT_LABELS = {
  quick_text:          'Kind text or compliment',
  voice_note:          'Voice note',
  written_note:        'Written note',
  act_of_service:      'Act of service',
  surprise_gesture:    'Surprise gesture',
  planned_experience:  'Planned experience',
  hard_conversation:   'Hard conversation',
  public_affirmation:  'Public affirmation',
  milestone_written:   'Milestone written message',
}

export const WITHDRAWAL_LABELS = {
  going_quiet:              'Going quiet / shutting down',
  cancelled_plans:          'Cancelled plans last minute',
  phone_during_connection:  'Phone during connection time',
  dismissal:                'Said something dismissive',
  avoidance:                'Avoided a real conversation',
  stonewalling:             'Stonewalled during conflict',
  false_agreement:          'Said yes but didn\'t mean it',
  broken_promise:           'Broke a repeated promise',
  chronic_criticism:        'Chronic criticism',
  unilateral_decision:      'Made a unilateral decision',
  no_repair_after_conflict: 'No repair after conflict',
}

export const LL_LABELS = {
  words: 'Words of affirmation',
  time:  'Quality time',
  touch: 'Physical touch',
  acts:  'Acts of service',
  gifts: 'Gift giving',
}
