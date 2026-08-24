/**
 * Hands a conversion result from the Werkzeuge page (app/tools) over to the
 * new-nugget form (app/add).
 *
 * Via sessionStorage, not a query param: the payload is a whole document (up to
 * MAX_PDF_MARKDOWN_CHARS) and would blow past any URL length limit. Same idea as
 * the `nugget-bookmark-jump` key the single view uses for a pending jump — the
 * page that hands over writes, the page that receives reads exactly once.
 */

const KEY = 'tools-import'

export interface ToolsHandoff {
  /** Markdown for the content field. */
  markdown: string
  /** Suggested title — empty when the source had nothing usable. */
  title: string
  /** Suggested source label, e.g. the PDF's filename. */
  sourceLabel: string
  /** True when the tool had to cut the text; app/add says so. */
  truncated: boolean
  /** How it was produced, for the notice in app/add ("PDF" for now). */
  kind: string
}

/** Stores a result for app/add to pick up on its next mount. */
export function stashToolsHandoff(handoff: ToolsHandoff): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(handoff))
  } catch {
    // Private mode / quota — the caller keeps its own copy on screen.
  }
}

/**
 * Reads and REMOVES a pending handoff. Read-once so a later reload of app/add
 * does not resurrect a document the user already dealt with.
 */
export function takeToolsHandoff(): ToolsHandoff | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    sessionStorage.removeItem(KEY)
    const parsed = JSON.parse(raw) as Partial<ToolsHandoff>
    if (typeof parsed?.markdown !== 'string' || !parsed.markdown) return null
    return {
      markdown:    parsed.markdown,
      title:       typeof parsed.title === 'string' ? parsed.title : '',
      sourceLabel: typeof parsed.sourceLabel === 'string' ? parsed.sourceLabel : '',
      truncated:   parsed.truncated === true,
      kind:        typeof parsed.kind === 'string' ? parsed.kind : 'Import',
    }
  } catch {
    return null
  }
}
