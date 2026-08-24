import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PythonToolError, runPythonTool } from './pythonTools'

/**
 * PDF → structured Markdown, the first tool on the Werkzeuge page (app/tools).
 *
 * The extraction itself happens in Python (python/pdf_to_markdown.py, pymupdf4llm)
 * because nothing in the JS ecosystem reconstructs headings, lists and tables
 * from a PDF's glyph soup nearly as well. This module owns everything around
 * it: the temp file the subprocess reads, the guards, and the translation of
 * the helper's error codes into messages the UI can show as-is.
 */

/** Same cap the other importers use — see python/pdf_to_markdown.py. */
export const MAX_PDF_MARKDOWN_CHARS = 100_000

/** Upload cap. Well past any paper; a scanned book would only yield noise anyway. */
export const MAX_PDF_BYTES = 30 * 1024 * 1024

/** Generous: a 300-page PDF takes a few seconds, a pathological one must still end. */
const CONVERT_TIMEOUT_MS = 180_000

export interface PdfMarkdown {
  markdown: string
  pages: number
  chars: number
  /** True when the text was cut at MAX_PDF_MARKDOWN_CHARS. */
  truncated: boolean
  /** The PDF's metadata title — often empty, often junk ("Microsoft Word - …"). */
  title: string
}

/** The helper's JSON contract. */
type HelperResult =
  | { ok: true; markdown: string; pages: number; chars: number; truncated: boolean; title: string }
  | { ok: false; error: string; detail?: string }

/** User-facing text per handled helper error. */
const ERROR_MESSAGES: Record<string, string> = {
  not_a_pdf:          'Die Datei konnte nicht als PDF gelesen werden.',
  encrypted:          'Das PDF ist passwortgeschützt und lässt sich nicht auslesen.',
  conversion_failed:  'Das PDF konnte nicht umgewandelt werden.',
}

/** A PDF always starts with `%PDF-`; catch a mislabelled file before spawning. */
function looksLikePdf(bytes: Buffer): boolean {
  return bytes.subarray(0, 5).toString('latin1') === '%PDF-'
}

/**
 * Converts an uploaded PDF. Throws `PythonToolError` with a German message that
 * is safe to show the user; the `detail` stays for the server log.
 */
export async function pdfToMarkdown(bytes: Buffer): Promise<PdfMarkdown> {
  if (bytes.length === 0)         throw new PythonToolError('Die Datei ist leer.')
  if (bytes.length > MAX_PDF_BYTES) {
    throw new PythonToolError(
      `Die Datei ist größer als ${Math.round(MAX_PDF_BYTES / 1024 / 1024)} MB.`,
    )
  }
  if (!looksLikePdf(bytes)) throw new PythonToolError('Die Datei ist kein PDF.')

  // Own directory per run: the subprocess only ever sees this one file, and the
  // cleanup is a single recursive remove that cannot miss a stray sibling.
  const dir = await mkdtemp(path.join(os.tmpdir(), 'nuggets-pdf-'))
  const file = path.join(dir, 'upload.pdf')
  try {
    await writeFile(file, bytes)
    const result = await runPythonTool<HelperResult>(
      'pdf_to_markdown.py',
      [file, '--max-chars', String(MAX_PDF_MARKDOWN_CHARS)],
      { timeoutMs: CONVERT_TIMEOUT_MS },
    )

    if (!result.ok) {
      throw new PythonToolError(
        ERROR_MESSAGES[result.error] ?? 'Das PDF konnte nicht umgewandelt werden.',
        result.detail,
      )
    }

    return {
      markdown:  result.markdown,
      pages:     result.pages,
      chars:     result.chars,
      truncated: result.truncated,
      title:     result.title,
    }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}
