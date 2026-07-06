import { get as idbGet, set as idbSet } from 'idb-keyval'
import { apiGet } from './queue'
import type {
  Driver,
  IntervalRow,
  Lap,
  Meeting,
  PitStop,
  PositionRow,
  RaceControlMsg,
  Session,
  SessionResultRow,
  Stint,
} from './types'

// Completed sessions are immutable -> cache forever. Lists (meetings,
// sessions) can still grow during a season -> short TTL.
const LIST_TTL_MS = 60 * 60 * 1000
const FOREVER = Number.POSITIVE_INFINITY

interface Envelope<T> {
  t: number
  v: T
}

async function cached<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
  try {
    const hit = (await idbGet(key)) as Envelope<T> | undefined
    if (hit && Date.now() - hit.t < ttlMs) return hit.v
  } catch {
    // IDB unavailable — fall through to network
  }
  const v = await fetcher()
  if (ttlMs > 0) {
    try {
      await idbSet(key, { t: Date.now(), v })
    } catch {
      // cache is an optimization, never a dependency
    }
  }
  return v
}

/** Sessions whose end time has passed are immutable. */
export function isSessionFinished(s: Session): boolean {
  return new Date(s.date_end).getTime() < Date.now() - 15 * 60 * 1000
}

export function getMeetings(year: number): Promise<Meeting[]> {
  const now = new Date()
  const ttl = year < now.getFullYear() ? FOREVER : LIST_TTL_MS
  return cached(`meetings:${year}`, ttl, () => apiGet<Meeting[]>(`meetings?year=${year}`))
}

export function getSessionsOfMeeting(meetingKey: number): Promise<Session[]> {
  return cached(`sessions:${meetingKey}`, LIST_TTL_MS, () =>
    apiGet<Session[]>(`sessions?meeting_key=${meetingKey}`),
  )
}

export function getSessionsOfYear(year: number): Promise<Session[]> {
  const now = new Date()
  const ttl = year < now.getFullYear() ? FOREVER : LIST_TTL_MS
  return cached(`sessions-year:${year}`, ttl, () => apiGet<Session[]>(`sessions?year=${year}`))
}

function dataset<T>(endpoint: string, session: Session, live = false): Promise<T[]> {
  const ttl = !live && isSessionFinished(session) ? FOREVER : 0
  return cached(`${endpoint}:${session.session_key}`, ttl, () =>
    apiGet<T[]>(`${endpoint}?session_key=${session.session_key}`),
  )
}

export const getDrivers = (s: Session) => dataset<Driver>('drivers', s)
export const getLaps = (s: Session, live = false) => dataset<Lap>('laps', s, live)
export const getStints = (s: Session, live = false) => dataset<Stint>('stints', s, live)
export const getPits = (s: Session, live = false) => dataset<PitStop>('pit', s, live)
export const getIntervals = (s: Session, live = false) => dataset<IntervalRow>('intervals', s, live)
export const getRaceControl = (s: Session, live = false) =>
  dataset<RaceControlMsg>('race_control', s, live)
export const getPositions = (s: Session, live = false) => dataset<PositionRow>('position', s, live)

/**
 * SPOILER endpoint — final classification. Must only be called from
 * full-session (non-replay) code paths. Never during replay.
 */
export const UNSAFE_getSessionResult = (s: Session) =>
  dataset<SessionResultRow>('session_result', s)
