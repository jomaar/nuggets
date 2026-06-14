'use client'

import { createContext, useContext, useState } from 'react'

interface OwnerContextValue {
  isOwner: boolean
  /** Lets the logout button reflect the change without a reload. */
  setIsOwner: (value: boolean) => void
}

const OwnerContext = createContext<OwnerContextValue>({
  isOwner: false,
  setIsOwner: () => {},
})

/**
 * Provides the owner flag, seeded once from the session cookie read server-side
 * in the root layout. Pages read it via useOwner() instead of each fetching
 * /api/auth/me on mount (saves a roundtrip per navigation).
 */
export function OwnerProvider({
  initialIsOwner,
  children,
}: {
  initialIsOwner: boolean
  children: React.ReactNode
}) {
  const [isOwner, setIsOwner] = useState(initialIsOwner)
  return (
    <OwnerContext.Provider value={{ isOwner, setIsOwner }}>
      {children}
    </OwnerContext.Provider>
  )
}

/** Returns the current owner state and a setter (used by the logout button). */
export function useOwner(): OwnerContextValue {
  return useContext(OwnerContext)
}
