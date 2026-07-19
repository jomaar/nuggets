import { NextRequest, NextResponse } from 'next/server'
import { anthropic, CLAUDE_MODEL, describeAiError } from '@/lib/anthropic'

/** Returns true if the request carries a valid owner session cookie. */
function isOwner(req: NextRequest): boolean {
  const secret = process.env.SESSION_SECRET
  return !!secret && req.cookies.get('session')?.value === secret
}

/** Hard cap on the reworked passage; a selection is never a whole document. */
const MAX_TOKENS = 4096

/**
 * The transformation contract. The model receives ONE passage plus a free-text
 * instruction and must return ONLY the revised passage — no preamble, no quotes,
 * no markdown fences — so the editor can drop the result straight into the
 * selection it replaces. Thinking is left off (this is a direct transformation),
 * and the "only the revised passage" rule doubles as the final-answer-only guard.
 */
const SYSTEM_PROMPT = `Du bist ein präziser Text-Editor. Du erhältst einen markierten Textabschnitt aus der Notiz des Nutzers und eine Anweisung, wie er überarbeitet werden soll.

Wende die Anweisung auf den Abschnitt an und gib AUSSCHLIESSLICH den überarbeiteten Abschnitt zurück:
- in derselben Sprache wie der Eingabetext,
- ohne Einleitung, ohne Erklärung, ohne Meta-Kommentar,
- ohne umschließende Anführungszeichen und ohne Markdown-Code-Zäune.
Behalte die ursprüngliche Bedeutung bei, sofern die Anweisung nichts anderes verlangt. Ist keine Anweisung angegeben, verbessere Klarheit und Lesefluss, ohne die Aussage zu verändern.`

/**
 * POST /api/rework — rework a selected passage with a free-text instruction.
 * Owner-only (it spends AI budget). Body: { text, prompt }. Returns { result }.
 * Used by the edit view's selection popup; the result replaces the selection.
 */
export async function POST(req: NextRequest) {
  if (!isOwner(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'KI nicht konfiguriert' }, { status: 503 })
  }

  let body: { text?: unknown; prompt?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Ungültige Anfrage' }, { status: 400 })
  }

  const text = typeof body.text === 'string' ? body.text.trim() : ''
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
  if (!text) return NextResponse.json({ error: 'Kein Text markiert' }, { status: 400 })

  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Anweisung: ${prompt || '(keine — verbessere Klarheit und Lesefluss)'}\n\nAbschnitt:\n${text}`,
        },
      ],
    })

    // Concatenate the text blocks; the contract forbids any non-text output.
    const result = response.content
      .map(block => (block.type === 'text' ? block.text : ''))
      .join('')
      .trim()

    if (!result) return NextResponse.json({ error: 'Leeres Ergebnis' }, { status: 502 })
    return NextResponse.json({ result })
  } catch (error) {
    console.error('[rework] failed:', error)
    return NextResponse.json({ error: describeAiError(error) }, { status: 502 })
  }
}
