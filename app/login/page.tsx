'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const from = searchParams.get('from') || '/'

  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    setLoading(false)
    if (res.ok) {
      router.push(from)
      router.refresh()
    } else {
      setError('Falsches Passwort.')
      setPassword('')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-sm px-6">
        <h1 className="text-3xl mb-8" style={{ fontFamily: 'Playfair Display, serif' }}>
          Anmelden
        </h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Passwort"
            autoFocus
            className="w-full rounded-xl px-4 py-3 text-base"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              color: 'var(--ink)',
              fontFamily: 'DM Sans, sans-serif',
              outline: 'none',
            }}
          />
          {error && (
            <p className="text-sm" style={{ color: '#c0392b' }}>{error}</p>
          )}
          <button
            type="submit"
            disabled={loading || !password}
            className="w-full py-4 rounded-2xl text-base font-medium transition-all active:scale-95"
            style={{
              background: password ? 'var(--accent)' : 'var(--border)',
              color:      password ? 'white'         : 'var(--muted)',
            }}
          >
            {loading ? 'Prüfe…' : 'Anmelden'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
