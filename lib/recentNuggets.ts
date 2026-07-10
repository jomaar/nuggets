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
  /** Last reading scroll position (window.scrollY) within this nugget, so the
   *  recent list can return the user to exactly where they left off. */
  scrollY?: number
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
  const all = readAll()
  // Carry the saved scroll position over to the refreshed entry — re-opening a
  // nugget must not forget where the reader left off.
  const scrollY = all.find(entry => entry.id === id)?.scrollY
  const next: RecentNugget[] = [
    { id, title, openedAt: Date.now(), scrollY },
    ...all.filter(entry => entry.id !== id),
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

/**
 * Drop a nugget from the recent list. Called when the nugget is deleted on
 * this device, and self-healingly when opening it 404s (deleted elsewhere —
 * the server can't reach into a device's localStorage, so a stale entry would
 * otherwise keep leading to "Nugget nicht gefunden" forever).
 */
export function removeRecentNugget(id: string): void {
  if (typeof window === 'undefined' || !id) return
  const remaining = readAll().filter(entry => entry.id !== id)
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(remaining))
  } catch {
    /* best-effort */
  }
}

/**
 * Remember the reading scroll position for a nugget, updating its entry in place
 * (no reorder — recency is about opens, not scrolling). No-op if the nugget is
 * not in the list, which only happens before its open was recorded.
 */
export function updateRecentScroll(id: string, scrollY: number): void {
  if (typeof window === 'undefined' || !id) return
  const all = readAll()
  const entry = all.find(n => n.id === id)
  if (!entry) return
  entry.scrollY = Math.max(0, Math.round(scrollY))
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch {
    /* best-effort */
  }
}

/** The stored scroll position for a nugget, or undefined if none is known. */
export function getRecentScroll(id: string): number | undefined {
  return readAll().find(n => n.id === id)?.scrollY
}
