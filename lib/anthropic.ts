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
