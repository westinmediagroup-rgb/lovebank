/**
 * Returns pronouns for a given gender value stored in profiles.gender
 * gender: 'male' | 'female' | 'prefer_not_say' | null
 */
export function getPronouns(gender) {
  if (gender === 'male') {
    return { subject: 'He', object: 'him', possessive: 'his', subjLower: 'he' }
  }
  if (gender === 'female') {
    return { subject: 'She', object: 'her', possessive: 'her', subjLower: 'she' }
  }
  // prefer_not_say or null → gender-neutral
  return { subject: 'They', object: 'them', possessive: 'their', subjLower: 'they' }
}
