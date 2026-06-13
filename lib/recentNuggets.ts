/**
 * Per-device list of recently opened nuggets, kept in localStorage so the
 * bookmarks home tab can surface "what I was just reading" without the user
 * having to set a bookmark first. Newest first, deduped by id, capped.
 *
 * Deliberately client-only and backend-free: this is about the current device's
 * working context, not shared state. Every function degrades gracefully when
 * there is no window (SSR / pre-hydration) or localStorage is blocked.
 */

export interface RecentNugget {
  id: string
  title: string
  /** Epoch ms of the most recent open — used only to order newest first. */
  openedAt: number
}

/** localStorage key holding the JSON-encoded RecentNugget[] (newest first). */
const STORAGE_KEY = 'nugget-recent-opened'
/** Hard cap on stored entries; the UI shows only the first few of these. */
const MAX_ENTRIES = 10

/** Safely read and parse the stored list; returns [] on any problem. */
function readAll(): RecentNugget[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * Record that a nugget was just opened: move it to the front (deduped by id),
 * refresh its stored title, and trim to the cap. Best-effort — a write that
 * fails (storage full / blocked) is silently ignored.
 */
export function recordRecentNugget(id: string, title: string): void {
  if (typeof window === 'undefined' || !id) return
  const next: RecentNugget[] = [
    { id, title, openedAt: Date.now() },
    ...readAll().filter(entry => entry.id !== id),
  ].slice(0, MAX_ENTRIES)
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* storage full / blocked — recency is a convenience, so just skip it */
  }
}

/** The most recently opened nuggets, newest first, limited to `limit`. */
export function getRecentNuggets(limit = 3): RecentNugget[] {
  return readAll().slice(0, limit)
}
