import Anthropic from '@anthropic-ai/sdk'

/** Singleton Anthropic client — only instantiated server-side. */
function createClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
}

const globalForAnthropic = globalThis as unknown as { anthropic: Anthropic | undefined }
export const anthropic = globalForAnthropic.anthropic ?? createClient()
if (process.env.NODE_ENV !== 'production') globalForAnthropic.anthropic = anthropic

/** Single source of truth for the model used by both AI call sites (lib/concepts.ts, app/api/rework). */
export const CLAUDE_MODEL = 'claude-opus-4-8'

/**
 * True if the SDK error is a 404 for the model itself (retired/unknown model ID),
 * as opposed to a 404 for some other resource. Anthropic never redirects a retired
 * model string to its replacement — a pinned ID keeps working until the retirement
 * date, then every call starts failing this way until the code is updated.
 */
export function isModelNotFoundError(error: unknown): boolean {
  return (
    error instanceof Anthropic.NotFoundError &&
    typeof error.message === 'string' &&
    error.message.includes(CLAUDE_MODEL)
  )
}

/**
 * User-facing (German) summary of an AI call failure. Anthropic disables the
 * API key itself when a workspace spend limit is hit — that surfaces as a
 * plain 401 "API key is invalid", indistinguishable from a truly bad key, so
 * both get the same actionable hint rather than a generic message.
 */
export function describeAiError(error: unknown): string {
  if (isModelNotFoundError(error)) {
    return 'KI-Modell nicht mehr verfügbar (evtl. von Anthropic zurückgezogen).'
  }
  if (error instanceof Anthropic.AuthenticationError) {
    return 'API-Key ungültig oder gesperrt — evtl. Spend-Limit in der Anthropic Console erreicht.'
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return 'Zugriff verweigert — API-Key ohne Berechtigung für dieses Modell.'
  }
  if (error instanceof Anthropic.RateLimitError) {
    return 'Rate-Limit erreicht — bitte in ein paar Minuten erneut versuchen.'
  }
  return 'KI-Anfrage fehlgeschlagen.'
}
