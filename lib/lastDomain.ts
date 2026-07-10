// Shared "last used domain" preference (per device, localStorage). Read by
// app/all (restores the filter on load) and app/add (defaults the domain
// picker), so working in one domain for a while doesn't require re-selecting
// it in both places. '' represents "Alle" / no domain.

const STORAGE_KEY = 'nugget-last-domain'

export function getLastDomainSlug(): string {
  if (typeof window === 'undefined') return ''
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

export function setLastDomainSlug(slug: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, slug)
  } catch {
    // Ignore (e.g. private browsing storage quota).
  }
}
