// The only sanctioned way for UI to read session data.
// Returns spoiler-clamped data in replay mode, full data in full mode.
//
// Performance notes:
// - The clock ticks every 500ms; clamping is quantized to 2s buckets so the
//   clamped object (and every memo/React.memo downstream) only changes
//   identity twice per second less often than the tick.
// - The page renders as soon as the CORE datasets are in; the heavyweight
//   intervals payload streams in afterwards and panels fill in when it lands
//   (prepareSession tolerates missing datasets).

import { useMemo } from 'react'
import type { DatasetName, Session } from '../api/types'
import { CORE_DATASETS, hasDatasets, pendingDatasets, useSessionEntry } from '../data/sessionStore'
import { useClock } from './ClockContext'
import { clampPrepared, prepareSession, type ClampedSession, type PreparedSession } from './clamp'

const CLAMP_QUANTUM_MS = 2000

export interface ClampedSessionState {
  /** null until the core datasets are loaded */
  clamped: ClampedSession | null
  /** UNSAFE: unclamped index — only for sync controls (lap lookup, race start) */
  UNSAFE_prep: PreparedSession | null
  /** datasets still on their way (e.g. intervals) — for panel placeholders */
  pending: DatasetName[]
  loading: boolean
}

export function useClampedSession(session: Session | null): ClampedSessionState {
  const entry = useSessionEntry(session?.session_key ?? null)
  const { t, mode } = useClock()

  const coreReady = hasDatasets(entry, CORE_DATASETS)

  const prep = useMemo(() => {
    if (!entry || !coreReady) return null
    return prepareSession(entry.data, entry.session)
  }, [entry, coreReady])

  const tq =
    mode === 'full' ? null : t == null ? -Infinity : Math.floor(t / CLAMP_QUANTUM_MS) * CLAMP_QUANTUM_MS

  const clamped = useMemo(() => {
    if (!prep) return null
    // replay + not-yet-synced clamps everything OUT (tq = -Infinity)
    return clampPrepared(prep, tq)
  }, [prep, tq])

  return {
    clamped,
    UNSAFE_prep: prep,
    pending: pendingDatasets(entry),
    loading: !prep,
  }
}
