// Spoiler clamp — THE only door between raw session data and the UI.
//
// prepareSession() indexes a fully-loaded session once (parses timestamps,
// sorts, computes lap completion times). clampPrepared() then cuts every
// dataset to virtual time T with binary searches, cheap enough to run on
// every clock tick.
//
// Spoiler rules encoded here (see wargames/10-automation.md D5):
// - a lap is visible only once COMPLETED (its own duration elapsed, or the
//   driver's next lap has started) — clamping by lap start would leak the
//   in-progress lap's time;
// - stints are truncated to the driver's current lap: a stint's true lap_end
//   reveals the next pit stop;
// - everything else (intervals, positions, pits, race control) is visible
//   once its timestamp has passed.

import type {
  Driver,
  IntervalRow,
  Lap,
  PitStop,
  PositionRow,
  RaceControlMsg,
  RawSessionData,
  Session,
  Stint,
} from '../api/types'

export interface PreparedLap extends Lap {
  startMs: number | null
  /** ms epoch at which this lap becomes visible; Infinity if unknowable */
  completionMs: number
}

interface Timed<T> {
  rows: T[]
  times: number[] // parsed ms epoch, ascending
}

export interface PreparedSession {
  session: Session
  drivers: Driver[]
  lapsByDriver: Map<number, PreparedLap[]>
  /** all laps sorted by completionMs */
  laps: Timed<PreparedLap>
  stintsByDriver: Map<number, Stint[]>
  pits: Timed<PitStop>
  intervals: Timed<IntervalRow>
  raceControl: Timed<RaceControlMsg>
  positions: Timed<PositionRow>
  /** median lap-1 start across drivers = lights out; null for non-races */
  raceStartMs: number | null
  /** first and last data timestamps (for sanity/UI) */
  firstDataMs: number | null
}

export interface ClampedSession {
  session: Session
  drivers: Driver[]
  laps: PreparedLap[]
  lapsByDriver: Map<number, PreparedLap[]>
  stintsByDriver: Map<number, Stint[]>
  pits: PitStop[]
  intervals: IntervalRow[]
  raceControl: RaceControlMsg[]
  positions: PositionRow[]
  /** last completed lap per driver at T */
  lastLapByDriver: Map<number, number>
  /** current race lap = max over drivers of lastCompleted+1 */
  currentLap: number
  raceStartMs: number | null
  /** true when nothing is clamped (full mode) */
  full: boolean
}

const ms = (iso: string | null): number => (iso ? new Date(iso).getTime() : NaN)

function timed<T>(rows: T[], getDate: (r: T) => string | null): Timed<T> {
  const withTimes = rows
    .map((r) => ({ r, t: ms(getDate(r)) }))
    .filter((x) => !Number.isNaN(x.t))
    .sort((a, b) => a.t - b.t)
  return { rows: withTimes.map((x) => x.r), times: withTimes.map((x) => x.t) }
}

/** rows whose time <= t (times ascending) — returns slice end index */
function cut(times: number[], t: number): number {
  let lo = 0
  let hi = times.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (times[mid] <= t) lo = mid + 1
    else hi = mid
  }
  return lo
}

function median(nums: number[]): number | null {
  if (!nums.length) return null
  const s = [...nums].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

export function prepareSession(data: Partial<RawSessionData>, session: Session): PreparedSession {
  const rawLaps = data.laps ?? []
  const lapsByDriver = new Map<number, PreparedLap[]>()

  for (const lap of rawLaps) {
    let arr = lapsByDriver.get(lap.driver_number)
    if (!arr) {
      arr = []
      lapsByDriver.set(lap.driver_number, arr)
    }
    arr.push({ ...lap, startMs: lap.date_start ? ms(lap.date_start) : null, completionMs: Infinity })
  }

  for (const arr of lapsByDriver.values()) {
    arr.sort((a, b) => a.lap_number - b.lap_number)
    for (let i = 0; i < arr.length; i++) {
      const lap = arr[i]
      const nextStart = arr[i + 1]?.startMs ?? null
      const byDuration =
        lap.startMs != null && lap.lap_duration != null
          ? lap.startMs + lap.lap_duration * 1000
          : null
      lap.completionMs = nextStart ?? byDuration ?? Infinity
    }
  }

  const allLaps = [...lapsByDriver.values()].flat().filter((l) => l.completionMs !== Infinity)
  allLaps.sort((a, b) => a.completionMs - b.completionMs)

  const stintsByDriver = new Map<number, Stint[]>()
  for (const st of data.stints ?? []) {
    let arr = stintsByDriver.get(st.driver_number)
    if (!arr) {
      arr = []
      stintsByDriver.set(st.driver_number, arr)
    }
    arr.push(st)
  }
  for (const arr of stintsByDriver.values()) arr.sort((a, b) => a.stint_number - b.stint_number)

  const lap1Starts = [...lapsByDriver.values()]
    .map((arr) => arr.find((l) => l.lap_number === 1)?.startMs)
    .filter((x): x is number => x != null)
  // guard against a pit-lane starter with an odd timestamp: median, not min
  const raceStartMs = session.session_type === 'Race' ? median(lap1Starts) : null

  const intervals = timed(data.intervals ?? [], (r) => r.date)
  const positions = timed(data.positions ?? [], (r) => r.date)

  const firstCandidates = [intervals.times[0], positions.times[0], lap1Starts.length ? Math.min(...lap1Starts) : NaN].filter(
    (x) => x != null && !Number.isNaN(x),
  )

  return {
    session,
    drivers: data.drivers ?? [],
    lapsByDriver,
    laps: { rows: allLaps, times: allLaps.map((l) => l.completionMs) },
    stintsByDriver,
    pits: timed(data.pits ?? [], (r) => r.date),
    intervals,
    raceControl: timed(data.raceControl ?? [], (r) => r.date),
    positions,
    raceStartMs,
    firstDataMs: firstCandidates.length ? Math.min(...firstCandidates) : null,
  }
}

export function clampPrepared(prep: PreparedSession, t: number | null): ClampedSession {
  const full = t == null

  const laps = full ? prep.laps.rows : prep.laps.rows.slice(0, cut(prep.laps.times, t))

  const lastLapByDriver = new Map<number, number>()
  const lapsByDriver = new Map<number, PreparedLap[]>()
  for (const [driver, arr] of prep.lapsByDriver) {
    const visible = full ? arr : arr.filter((l) => l.completionMs <= t)
    lapsByDriver.set(driver, visible)
    lastLapByDriver.set(driver, visible.length ? visible[visible.length - 1].lap_number : 0)
  }

  let currentLap = 0
  for (const last of lastLapByDriver.values()) currentLap = Math.max(currentLap, last + 1)
  if (full) {
    currentLap = 0
    for (const last of lastLapByDriver.values()) currentLap = Math.max(currentLap, last)
  }

  const stintsByDriver = new Map<number, Stint[]>()
  for (const [driver, arr] of prep.stintsByDriver) {
    if (full) {
      stintsByDriver.set(driver, arr)
      continue
    }
    const maxLap = (lastLapByDriver.get(driver) ?? 0) + 1
    const visible: Stint[] = []
    for (const st of arr) {
      if (st.lap_start > maxLap) continue
      // truncate: the stint's true end would reveal the next pit stop
      visible.push(st.lap_end > maxLap ? { ...st, lap_end: maxLap } : st)
    }
    stintsByDriver.set(driver, visible)
  }

  return {
    session: prep.session,
    drivers: prep.drivers,
    laps,
    lapsByDriver,
    stintsByDriver,
    pits: full ? prep.pits.rows : prep.pits.rows.slice(0, cut(prep.pits.times, t)),
    intervals: full ? prep.intervals.rows : prep.intervals.rows.slice(0, cut(prep.intervals.times, t)),
    raceControl: full
      ? prep.raceControl.rows
      : prep.raceControl.rows.slice(0, cut(prep.raceControl.times, t)),
    positions: full ? prep.positions.rows : prep.positions.rows.slice(0, cut(prep.positions.times, t)),
    lastLapByDriver,
    currentLap,
    raceStartMs: prep.raceStartMs,
    full,
  }
}

/** ms epoch at which `driver` started `lapNumber`, for mid-race sync */
export function lapStartTime(
  prep: PreparedSession,
  driver: number,
  lapNumber: number,
): number | null {
  const lap = prep.lapsByDriver.get(driver)?.find((l) => l.lap_number === lapNumber)
  return lap?.startMs ?? null
}
