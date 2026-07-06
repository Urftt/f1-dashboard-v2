// The only sanctioned way for UI to read session data.
// Returns spoiler-clamped data in replay mode, full data in full mode.

import { useMemo } from 'react'
import type { Session } from '../api/types'
import { isEntryComplete, useSessionEntry } from '../data/sessionStore'
import { useClock } from './ClockContext'
import { clampPrepared, prepareSession, type ClampedSession, type PreparedSession } from './clamp'

export interface ClampedSessionState {
  /** null until all datasets are loaded */
  clamped: ClampedSession | null
  /** UNSAFE: unclamped index — only for sync controls (lap lookup, race start) */
  UNSAFE_prep: PreparedSession | null
  loading: boolean
}

export function useClampedSession(session: Session | null): ClampedSessionState {
  const entry = useSessionEntry(session?.session_key ?? null)
  const { t, mode } = useClock()

  const prep = useMemo(() => {
    if (!entry || !isEntryComplete(entry)) return null
    return prepareSession(entry.data, entry.session)
  }, [entry])

  const clamped = useMemo(() => {
    if (!prep) return null
    // replay + not-yet-synced must clamp everything OUT, not show everything
    return clampPrepared(prep, mode === 'full' ? null : (t ?? -Infinity))
  }, [prep, t, mode])

  return { clamped, UNSAFE_prep: prep, loading: !prep }
}
