// Practice analysis: long-run detection, race pace, tyre degradation.
// Inputs are CLAMPED session data.

import type { ClampedSession, PreparedLap } from '../replay/clamp'
import { neutralizedWindows, lapInWindows, pitInLaps } from '../race/analysis'

export interface RunLap {
  lap: PreparedLap
  tyreAge: number
}

export interface LongRun {
  driver: number
  compound: string
  laps: RunLap[]
}

const MIN_RUN = 5
const RUN_TOLERANCE = 1.07 // laps within 107% of the stint median are "steady"

/** consecutive steady stretches of ≥5 clean laps inside one stint */
export function findLongRuns(clamped: ClampedSession): LongRun[] {
  const windows = neutralizedWindows(clamped.raceControl)
  const pitIn = pitInLaps(clamped.pits)
  const runs: LongRun[] = []

  for (const [driver, stints] of clamped.stintsByDriver) {
    const laps = clamped.lapsByDriver.get(driver) ?? []
    for (const st of stints) {
      const stintLaps = laps.filter(
        (l) =>
          l.lap_number >= st.lap_start &&
          l.lap_number <= st.lap_end &&
          l.lap_duration != null &&
          !l.is_pit_out_lap &&
          !pitIn.has(`${driver}:${l.lap_number}`) &&
          !lapInWindows(l, windows),
      )
      if (stintLaps.length < MIN_RUN) continue
      const sorted = stintLaps.map((l) => l.lap_duration!).sort((a, b) => a - b)
      const median = sorted[Math.floor(sorted.length / 2)]

      let current: PreparedLap[] = []
      const flush = () => {
        if (current.length >= MIN_RUN) {
          runs.push({
            driver,
            compound: st.compound ?? 'UNKNOWN',
            laps: current.map((l) => ({
              lap: l,
              tyreAge: (st.tyre_age_at_start ?? 0) + (l.lap_number - st.lap_start),
            })),
          })
        }
        current = []
      }
      for (const l of stintLaps) {
        const steady = l.lap_duration! <= median * RUN_TOLERANCE
        const consecutive =
          current.length === 0 || l.lap_number === current[current.length - 1].lap_number + 1
        if (steady && consecutive) current.push(l)
        else {
          flush()
          if (steady) current.push(l)
        }
      }
      flush()
    }
  }
  return runs
}

function median(xs: number[]): number | null {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

/** least-squares slope of duration vs tyre age, s/lap */
export function degradationSlope(laps: RunLap[]): number | null {
  if (laps.length < 8) return null
  let sx = 0
  let sy = 0
  let sxx = 0
  let sxy = 0
  const n = laps.length
  for (const { lap, tyreAge } of laps) {
    sx += tyreAge
    sy += lap.lap_duration!
    sxx += tyreAge * tyreAge
    sxy += tyreAge * lap.lap_duration!
  }
  const denom = n * sxx - sx * sx
  if (Math.abs(denom) < 1e-9) return null
  return (n * sxy - sx * sy) / denom
}

export interface DriverPracticeSummary {
  driver: number
  bestLap: number | null
  longRunPace: number | null
  longRunLaps: number
  compounds: string[]
  degSlope: number | null // s/lap across their long runs
}

export function practiceSummary(clamped: ClampedSession): DriverPracticeSummary[] {
  const runs = findLongRuns(clamped)
  const out: DriverPracticeSummary[] = []

  for (const d of clamped.drivers) {
    const laps = clamped.lapsByDriver.get(d.driver_number) ?? []
    const durations = laps
      .filter((l) => l.lap_duration != null && !l.is_pit_out_lap)
      .map((l) => l.lap_duration!)
    const myRuns = runs.filter((r) => r.driver === d.driver_number)
    const runLaps = myRuns.flatMap((r) => r.laps)
    out.push({
      driver: d.driver_number,
      bestLap: durations.length ? Math.min(...durations) : null,
      longRunPace: median(runLaps.map((rl) => rl.lap.lap_duration!)),
      longRunLaps: runLaps.length,
      compounds: [...new Set(myRuns.map((r) => r.compound))],
      degSlope: degradationSlope(runLaps),
    })
  }
  return out
}

/** two-point segment of the least-squares fit, for drawing */
export function fitSegment(laps: RunLap[]): { age: number; t: number }[] | null {
  const slope = degradationSlope(laps)
  if (slope == null) return null
  const ages = laps.map((l) => l.tyreAge)
  const n = laps.length
  const meanAge = ages.reduce((a, b) => a + b, 0) / n
  const meanT = laps.reduce((a, l) => a + l.lap.lap_duration!, 0) / n
  const a0 = Math.min(...ages)
  const a1 = Math.max(...ages)
  return [
    { age: a0, t: meanT + slope * (a0 - meanAge) },
    { age: a1, t: meanT + slope * (a1 - meanAge) },
  ]
}
