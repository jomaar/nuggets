/**
 * SM-2 Spaced Repetition Algorithm
 * q = quality of response (0-5)
 *   5 = perfect recall
 *   3 = correct with difficulty  
 *   0 = complete blackout
 */
export interface SM2State {
  intervalDays: number
  easeFactor: number
  repetitions: number
  nextReview: Date
}

export function sm2(state: SM2State, q: number): SM2State {
  // q must be 0-5
  q = Math.max(0, Math.min(5, q))

  let { intervalDays, easeFactor, repetitions } = state

  if (q >= 3) {
    // Correct response
    if (repetitions === 0) intervalDays = 1
    else if (repetitions === 1) intervalDays = 6
    else intervalDays = Math.round(intervalDays * easeFactor)

    repetitions += 1
  } else {
    // Incorrect – reset
    repetitions = 0
    intervalDays = 1
  }

  // Update ease factor (min 1.3)
  easeFactor = Math.max(1.3, easeFactor + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))

  const nextReview = new Date()
  nextReview.setDate(nextReview.getDate() + intervalDays)

  return { intervalDays, easeFactor, repetitions, nextReview }
}

// Map simple 3-button UI to SM-2 quality scores
export const REVIEW_RATINGS = {
  again: 1,   // "Nochmal" – vergessen
  hard:  3,   // "Schwer"  – erinnert mit Mühe
  easy:  5,   // "Leicht"  – sofort erinnert
} as const

export type ReviewRating = keyof typeof REVIEW_RATINGS
