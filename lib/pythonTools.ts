import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

/**
 * Runs the small Python helpers behind the Werkzeuge page (app/tools).
 *
 * Deliberately a SUBPROCESS, not a service: these tools are rare, one-shot and
 * owner-only, so a FastAPI sidecar would be one more thing to keep alive, proxy
 * and restart after a reboot for no gain. Interpreter start-up is ~1 s, which is
 * nothing next to the conversion itself.
 *
 * The interpreter lives in a venv OUTSIDE any checkout (`/opt/nuggets-python/venv`)
 * so a deploy's `git reset --hard` cannot touch it, and both the prod checkout
 * and the dev clone share one install. See python/requirements.txt for setup.
 *
 * ⚠️ This module makes the build print ONE warning — "Encountered unexpected file
 * in NFT list", traced here. Spawning a process at a path resolved at runtime is
 * exactly the pattern Turbopack's file tracer cannot follow, so it conservatively
 * traces the whole project. Verified: it fires for the `process.cwd()` paths AND
 * independently for the `existsSync` calls, and `turbopackIgnore` does not apply
 * to either — there is no version of this module that both works and stays quiet.
 * Harmless here: the trace only feeds `output: 'standalone'`, which this app does
 * not use (deploy runs `next start` inside the checkout). Do not re-chase it.
 */

/** Where the venv lives when nothing overrides it. */
const DEFAULT_VENV_PYTHON = '/opt/nuggets-python/venv/bin/python3'

/** Anything the tools print beyond this is a runaway, not a result. */
const MAX_STDOUT_BYTES = 16 * 1024 * 1024

export class PythonToolError extends Error {
  constructor(message: string, readonly detail?: string) {
    super(message)
    this.name = 'PythonToolError'
  }
}

/**
 * Resolves the interpreter: `PYTHON_BIN` wins (useful on a machine that keeps
 * its venv elsewhere), then a checkout-local `.venv`, then the shared venv.
 * A bare `python3` from PATH is NOT a fallback — it would run without the
 * dependencies and fail with a confusing ImportError instead of a clear
 * "toolchain missing".
 */
export function pythonBin(): string {
  const explicit = process.env.PYTHON_BIN?.trim()
  if (explicit) return explicit
  const local = path.join(process.cwd(), '.venv', 'bin', 'python3')
  if (existsSync(local)) return local
  return DEFAULT_VENV_PYTHON
}

/** Absolute path of a helper script in python/. */
export function pythonScript(name: string): string {
  return path.join(process.cwd(), 'python', name)
}

/** True when the interpreter exists at all — the cheap half of the health check. */
export function pythonToolsInstalled(): boolean {
  return existsSync(pythonBin())
}

/**
 * Runs a helper and parses its single JSON line of stdout.
 *
 * Every helper follows the same contract (see python/pdf_to_markdown.py):
 * exactly one JSON object on stdout, free-form diagnostics on stderr, exit 0
 * whenever the JSON is meaningful — including handled errors, which arrive as
 * `{ ok: false, error }` so the caller can turn them into a real message.
 */
export async function runPythonTool<T>(
  script: string,
  args: string[],
  { timeoutMs = 120_000 }: { timeoutMs?: number } = {},
): Promise<T> {
  const bin = pythonBin()
  if (!existsSync(bin)) {
    throw new PythonToolError(
      'Python-Werkzeuge sind auf diesem Server nicht eingerichtet.',
      `interpreter not found: ${bin}`,
    )
  }

  const scriptPath = pythonScript(script)
  if (!existsSync(scriptPath)) {
    throw new PythonToolError('Werkzeug nicht gefunden.', `script not found: ${scriptPath}`)
  }

  const { stdout, stderr, code, timedOut } = await new Promise<{
    stdout: string; stderr: string; code: number | null; timedOut: boolean
  }>((resolve, reject) => {
    const child = spawn(bin, [scriptPath, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      // No shell: every argument reaches Python verbatim, so a filename can
      // never be read as shell syntax.
      shell: false,
    })

    let out = ''
    let err = ''
    let over = false
    let timedOut = false

    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
      // MuPDF can sit in a C loop that ignores SIGTERM; make sure we let go.
      setTimeout(() => child.kill('SIGKILL'), 2_000).unref()
    }, timeoutMs)

    child.stdout.on('data', chunk => {
      if (over) return
      out += chunk
      if (out.length > MAX_STDOUT_BYTES) { over = true; child.kill('SIGKILL') }
    })
    // Bounded: stderr is only ever logged, and MuPDF can be chatty.
    child.stderr.on('data', chunk => { if (err.length < 64_000) err += chunk })

    child.on('error', error => { clearTimeout(timer); reject(error) })
    child.on('close', exitCode => {
      clearTimeout(timer)
      resolve({ stdout: out, stderr: err, code: exitCode, timedOut })
    })
  }).catch((error: unknown) => {
    throw new PythonToolError(
      'Python-Werkzeug konnte nicht gestartet werden.',
      error instanceof Error ? error.message : String(error),
    )
  })

  if (timedOut) {
    throw new PythonToolError('Zeitlimit überschritten — die Datei ist zu groß oder zu komplex.')
  }
  if (code !== 0) {
    throw new PythonToolError('Python-Werkzeug ist fehlgeschlagen.', stderr.trim() || `exit ${code}`)
  }

  try {
    return JSON.parse(stdout) as T
  } catch {
    throw new PythonToolError(
      'Unerwartete Antwort des Python-Werkzeugs.',
      `stdout: ${stdout.slice(0, 500)} | stderr: ${stderr.slice(0, 500)}`,
    )
  }
}
