/**
 * Shared types for the kiosk check-in flow.
 *
 * Co-located with the route so they don't leak into the global app
 * surface. If anything here gets reused outside `/kiosk`, lift it to
 * `src/lib/`.
 */

export type Service = {
  id: string
  name: string
  duration_minutes: number
}

/**
 * Referral source — closed list. Must stay in sync with the CHECK
 * constraint on `clients.referral_source` (see migration 032).
 */
export const REFERRAL_SOURCES = [
  'walk-by',
  'google',
  'instagram',
  'tiktok',
  'friend',
  'other',
] as const

export type ReferralSource = (typeof REFERRAL_SOURCES)[number]

export type Shop = {
  id: string
  name: string
  is_open: boolean
  max_queue_size: number
  logo_url: string | null
}
