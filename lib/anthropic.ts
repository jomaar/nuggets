import Anthropic from '@anthropic-ai/sdk'

/** Singleton Anthropic client — only instantiated server-side. */
function createClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
}

const globalForAnthropic = globalThis as unknown as { anthropic: Anthropic | undefined }
export const anthropic = globalForAnthropic.anthropic ?? createClient()
if (process.env.NODE_ENV !== 'production') globalForAnthropic.anthropic = anthropic
