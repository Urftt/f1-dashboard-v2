// Q1/Q2/Q3 segmentation and best-lap classification from CLAMPED data.
// Phase windows come from race_control messages (qualifying_phase: 1|2|3,
// verified populated on 2026 sessions); during replay only phases seen so
// far exist — exactly what a spoiler-safe view needs.

import type { RaceControlMsg } from '../api/types'
import type { ClampedSession, PreparedLap } from '../replay/clamp'

export interface PhaseWindow {
  phase: 1 | 2 | 3
  startMs: number
  endMs: number // last message seen in this phase (grows during replay)
}

export function phaseWindows(msgs: RaceControlMsg[]): PhaseWindow[] {
  const byPhase = new Map<number, { start: number; end: number }>()
  for (const m of msgs) {
    const p = Number(m.qualifying_phase)
    if (p !== 1 && p !== 2 && p !== 3) continue
    const t = new Date(m.date).getTime()
    const cur = byPhase.get(p)
    if (!cur) byPhase.set(p, { start: t, end: t })
    else {
      cur.start = Math.min(cur.start, t)
      cur.end = Math.max(cur.end, t)
    }
  }
  return [...byPhase.entries()]
    .map(([phase, w]) => ({ phase: phase as 1 | 2 | 3, startMs: w.start, endMs: w.end }))
    .sort((a, b) => a.phase - b.phase)
}

/** assign a lap to the phase whose window contains its completion (+grace) */
export function lapPhase(lap: PreparedLap, windows: PhaseWindow[]): 1 | 2 | 3 | null {
  if (lap.completionMs === Infinity) return null
  for (const w of windows) {
    const nextStart = windows.find((x) => x.phase === w.phase + 1)?.startMs ?? Infinity
    if (lap.completionMs >= w.startMs && lap.completionMs <= Math.min(w.endMs + 120_000, nextStart)) {
      return w.phase
    }
  }
  return null
}

export interface QualiRow {
  driver: number
  best: Partial<Record<1 | 2 | 3, number>>
  /** best of the latest phase the driver has a time in */
  sortKey: number
  latestPhase: 1 | 2 | 3 | null
}

export function qualiClassification(clamped: ClampedSession): {
  rows: QualiRow[]
  windows: PhaseWindow[]
  currentPhase: 1 | 2 | 3
  /** how many advance out of Q1 / Q2 given field size */
  advance: { q1: number; q2: number }
} {
  const windows = phaseWindows(clamped.raceControl)
  const currentPhase = (windows.length ? windows[windows.length - 1].phase : 1) as 1 | 2 | 3

  const rows: QualiRow[] = []
  for (const d of clamped.drivers) {
    const laps = clamped.lapsByDriver.get(d.driver_number) ?? []
    const best: Partial<Record<1 | 2 | 3, number>> = {}
    for (const lap of laps) {
      if (lap.lap_duration == null || lap.is_pit_out_lap) continue
      const p = lapPhase(lap, windows)
      if (!p) continue
      if (best[p] == null || lap.lap_duration < best[p]!) best[p] = lap.lap_duration
    }
    let latestPhase: 1 | 2 | 3 | null = null
    for (const p of [3, 2, 1] as const) {
      if (best[p] != null) {
        latestPhase = p
        break
      }
    }
    rows.push({
      driver: d.driver_number,
      best,
      latestPhase,
      sortKey: latestPhase ? best[latestPhase]! : Infinity,
    })
  }

  // classification order: drivers in a later phase rank above earlier-phase-
  // only drivers; within a phase, by best time
  rows.sort((a, b) => {
    const pa = a.latestPhase ?? 0
    const pb = b.latestPhase ?? 0
    if (pa !== pb) return pb - pa
    return a.sortKey - b.sortKey
  })

  const n = clamped.drivers.length
  const eliminated = Math.max(0, Math.ceil((n - 10) / 2)) // 20→5, 22→6
  return { rows, windows, currentPhase, advance: { q1: n - eliminated, q2: n - eliminated * 2 } }
}
