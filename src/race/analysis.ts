// Derived race data: SC/VSC windows, clean-lap detection, formatting.
// All inputs are CLAMPED data — these helpers never touch raw stores.

import type { PitStop, RaceControlMsg } from '../api/types'
import type { PreparedLap } from '../replay/clamp'

export interface NeutralizedWindow {
  startMs: number
  endMs: number // Infinity while ongoing
  kind: 'SC' | 'VSC' | 'RED'
}

const DEPLOY = /(SAFETY CAR|VSC) DEPLOYED/
const ENDING = /VSC ENDING|SAFETY CAR IN THIS LAP|SAFETY CAR ENDING/
const RED = /RED FLAG/
const GREEN = /GREEN LIGHT|TRACK CLEAR|RESTART/

/**
 * Derive slow-track windows from race-control messages. A window opens on
 * SC/VSC deploy (or red flag) and closes 45s after the ending message —
 * the field is still bunched/slow on the restart lap itself.
 */
export function neutralizedWindows(msgs: RaceControlMsg[]): NeutralizedWindow[] {
  const windows: NeutralizedWindow[] = []
  let open: NeutralizedWindow | null = null

  for (const m of msgs) {
    const t = new Date(m.date).getTime()
    const text = m.message ?? ''
    if (RED.test(text)) {
      if (open) open.endMs = t
      open = { startMs: t, endMs: Infinity, kind: 'RED' }
      windows.push(open)
    } else if (DEPLOY.test(text)) {
      if (open) open.endMs = t
      open = { startMs: t, endMs: Infinity, kind: /VSC/.test(text) ? 'VSC' : 'SC' }
      windows.push(open)
    } else if (open && (ENDING.test(text) || (open.kind === 'RED' && GREEN.test(text)))) {
      open.endMs = t + 45_000
      open = null
    }
  }
  return windows
}

export function lapInWindows(lap: PreparedLap, windows: NeutralizedWindow[]): boolean {
  if (lap.startMs == null) return false
  const end = lap.completionMs === Infinity ? lap.startMs : lap.completionMs
  return windows.some((w) => lap.startMs! < w.endMs && end > w.startMs)
}

/** laps on which each driver entered the pit (in-laps) */
export function pitInLaps(pits: PitStop[]): Set<string> {
  const set = new Set<string>()
  for (const p of pits) set.add(`${p.driver_number}:${p.lap_number}`)
  return set
}

export function isCleanLap(
  lap: PreparedLap,
  windows: NeutralizedWindow[],
  pitIn: Set<string>,
): boolean {
  if (lap.lap_duration == null) return false
  if (lap.is_pit_out_lap) return false
  if (pitIn.has(`${lap.driver_number}:${lap.lap_number}`)) return false
  if (lapInWindows(lap, windows)) return false
  return true
}

export function fmtLapTime(sec: number | null | undefined, decimals = 3): string {
  if (sec == null || !Number.isFinite(sec)) return '—'
  const m = Math.floor(sec / 60)
  const s = sec - m * 60
  const str = s.toFixed(decimals).padStart(decimals > 0 ? 3 + decimals : 2, '0')
  return `${m}:${str}`
}

export function fmtGap(sec: number | string | null | undefined): string {
  if (sec == null) return '—'
  if (typeof sec === 'string') return sec // "1 LAP" etc.
  if (!Number.isFinite(sec)) return '—'
  const sign = sec < 0 ? '−' : '+'
  return `${sign}${Math.abs(sec).toFixed(1)}`
}

export const COMPOUND_COLORS: Record<string, string> = {
  SOFT: 'var(--tyre-soft)',
  MEDIUM: 'var(--tyre-medium)',
  HARD: 'var(--tyre-hard)',
  INTERMEDIATE: 'var(--tyre-inter)',
  WET: 'var(--tyre-wet)',
}

export const COMPOUND_LETTER: Record<string, string> = {
  SOFT: 'S',
  MEDIUM: 'M',
  HARD: 'H',
  INTERMEDIATE: 'I',
  WET: 'W',
  UNKNOWN: '?',
}

/** percentile of a sorted-or-not numeric array (p in 0..1) */
export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b)
  const idx = Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))
  return s[idx]
}

export function driverColor(teamColour: string | null | undefined): string {
  return teamColour ? `#${teamColour}` : '#8b93a4'
}
