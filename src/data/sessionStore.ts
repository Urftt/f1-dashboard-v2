// Per-session dataset loading with per-dataset status, shared app-wide.
//
// The returned data is RAW and UNCLAMPED — it contains the whole session
// including the outcome. UI components must never consume it directly;
// they go through useClampedSession (src/replay). The UNSAFE_ prefix on the
// accessor exists so any leak is one grep away.

import { useSyncExternalStore } from 'react'
import {
  getDrivers,
  getIntervals,
  getLaps,
  getPits,
  getPositions,
  getRaceControl,
  getStints,
  getWeather,
} from '../api/openf1'
import type { DatasetName, RawSessionData, Session } from '../api/types'

export type DatasetStatus = 'loading' | 'ready' | 'error'

export interface SessionEntry {
  session: Session
  /** raw, spoiler-bearing */
  data: Partial<RawSessionData>
  status: Record<DatasetName, DatasetStatus>
}

const DATASETS: { name: DatasetName; fetch: (s: Session, live?: boolean) => Promise<unknown[]> }[] = [
  { name: 'drivers', fetch: getDrivers },
  { name: 'laps', fetch: getLaps },
  { name: 'stints', fetch: getStints },
  { name: 'pits', fetch: getPits },
  { name: 'raceControl', fetch: getRaceControl },
  { name: 'positions', fetch: getPositions },
  { name: 'weather', fetch: getWeather },
  { name: 'intervals', fetch: getIntervals },
]

const entries = new Map<number, SessionEntry>()
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

function patch(key: number, fn: (e: SessionEntry) => SessionEntry) {
  const cur = entries.get(key)
  if (!cur) return
  entries.set(key, fn(cur))
  emit()
}

function loadDataset(session: Session, name: DatasetName, live = false) {
  const key = session.session_key
  patch(key, (e) => ({ ...e, status: { ...e.status, [name]: 'loading' } }))
  DATASETS.find((d) => d.name === name)!
    .fetch(session, live)
    .then((rows) => {
      patch(key, (e) => ({
        ...e,
        data: { ...e.data, [name]: rows },
        status: { ...e.status, [name]: 'ready' },
      }))
    })
    .catch(() => {
      patch(key, (e) => ({ ...e, status: { ...e.status, [name]: 'error' } }))
    })
}

export function ensureSessionLoaded(session: Session) {
  if (entries.has(session.session_key)) return
  const status = {} as Record<DatasetName, DatasetStatus>
  for (const d of DATASETS) status[d.name] = 'loading'
  entries.set(session.session_key, { session, data: { session }, status })
  emit()
  for (const d of DATASETS) loadDataset(session, d.name)
}

export function retryDataset(session: Session, name: DatasetName) {
  loadDataset(session, name)
}

/** Re-poll mutable datasets during a live session (bypasses cache). */
export function refreshLiveDatasets(session: Session, names: DatasetName[]) {
  for (const name of names) loadDataset(session, name, true)
}

const NONE: SessionEntry | null = null

export function useSessionEntry(sessionKey: number | null): SessionEntry | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => (sessionKey != null ? (entries.get(sessionKey) ?? NONE) : NONE),
  )
}

export function isEntryComplete(e: SessionEntry | null): boolean {
  return !!e && Object.values(e.status).every((s) => s === 'ready')
}
