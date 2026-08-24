import { NextRequest, NextResponse } from 'next/server'
import { pythonBin, pythonToolsInstalled, runPythonTool } from '@/lib/pythonTools'

export const runtime = 'nodejs'

/** Returns true if the request carries a valid owner session cookie. */
function isOwner(req: NextRequest): boolean {
  const secret = process.env.SESSION_SECRET
  return !!secret && req.cookies.get('session')?.value === secret
}

interface Health {
  ok: boolean
  python?: string
  packages?: Record<string, string>
  missing?: string[]
}

/**
 * GET /api/tools/status — is the Python toolchain behind app/tools usable?
 * Owner-only, like every route under /api/tools (they spawn processes).
 * Mirrors /api/ai/health: the Werkzeuge page asks once on mount so a server
 * that was never set up says so up front instead of on the first upload.
 */
export async function GET(req: NextRequest) {
  if (!isOwner(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!pythonToolsInstalled()) {
    return NextResponse.json({
      ok: false,
      error: `Kein Python-Interpreter unter ${pythonBin()} — venv anlegen (siehe python/requirements.txt).`,
    })
  }

  try {
    const health = await runPythonTool<Health>('health.py', [], { timeoutMs: 30_000 })
    if (!health.ok) {
      return NextResponse.json({
        ok: false,
        error: `Python-Pakete fehlen: ${(health.missing ?? []).join(', ')}`,
      })
    }
    return NextResponse.json({ ok: true, python: health.python, packages: health.packages })
  } catch (error) {
    console.error('[tools/status] failed:', error)
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : 'Python-Werkzeuge nicht erreichbar.',
    })
  }
}
