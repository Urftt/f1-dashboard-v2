// Live timing board at virtual time T: position order, current tyre, last
// lap, interval / gap-to-leader toggle, pit count. Rows go grey when a
// driver has produced no data for a while (crashed/retired — but we never
// SAY that; "no data" is spoiler-neutral).

import { useMemo, useState } from 'react'
import type { IntervalRow } from '../api/types'
import type { ClampedSession } from '../replay/clamp'
import {
  COMPOUND_COLORS,
  COMPOUND_LETTER,
  driverColor,
  fmtGap,
  fmtLapTime,
} from '../race/analysis'
import type { SelectedUpdater } from './DriverSelect'

const STALE_MS = 3 * 60_000

interface Props {
  clamped: ClampedSession
  t: number | null // virtual time (null in full mode)
  selected: number[]
  onSelect: (u: SelectedUpdater) => void
}

interface BoardRow {
  driver: number
  position: number | null
  compound: string | null
  tyreAge: number | null
  lastLap: number | null
  interval: number | string | null
  gapToLeader: number | string | null
  pitCount: number
  stale: boolean
}

export default function TimingBoard({ clamped, t, selected, onSelect }: Props) {
  const [gapMode, setGapMode] = useState<'interval' | 'leader'>('interval')

  const rows = useMemo(() => {
    // latest position + interval row per driver (arrays are date-sorted)
    const lastPos = new Map<number, number>()
    for (const p of clamped.positions) lastPos.set(p.driver_number, p.position)
    const lastInt = new Map<number, IntervalRow>()
    for (const r of clamped.intervals) lastInt.set(r.driver_number, r)

    const out: BoardRow[] = clamped.drivers.map((d) => {
      const n = d.driver_number
      const laps = clamped.lapsByDriver.get(n) ?? []
      const lastLap = laps.length ? laps[laps.length - 1] : null
      const stints = clamped.stintsByDriver.get(n) ?? []
      const stint = stints.length ? stints[stints.length - 1] : null
      const int = lastInt.get(n)

      let stale = false
      if (t != null) {
        const lastSeen = Math.max(
          int ? new Date(int.date).getTime() : 0,
          lastLap && lastLap.completionMs !== Infinity ? lastLap.completionMs : 0,
        )
        stale = lastSeen > 0 && t - lastSeen > STALE_MS
      }

      const currentLapNum = lastLap ? lastLap.lap_number + 1 : 1
      return {
        driver: n,
        position: lastPos.get(n) ?? null,
        compound: stint?.compound ?? null,
        tyreAge: stint ? (stint.tyre_age_at_start ?? 0) + (currentLapNum - stint.lap_start) : null,
        lastLap: lastLap?.lap_duration ?? null,
        interval: int?.interval ?? null,
        gapToLeader: int?.gap_to_leader ?? null,
        pitCount: clamped.pits.filter((p) => p.driver_number === n).length,
        stale,
      }
    })

    out.sort((a, b) => {
      if (a.position != null && b.position != null) return a.position - b.position
      if (a.position != null) return -1
      if (b.position != null) return 1
      return a.driver - b.driver
    })
    return out
  }, [clamped, t])

  const anyData = rows.some((r) => r.position != null)

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Timing</h3>
        <span className="spacer" />
        <div className="seg">
          <button
            className={gapMode === 'interval' ? 'toggled' : ''}
            onClick={() => setGapMode('interval')}
            title="Gap to car ahead"
          >
            Int
          </button>
          <button
            className={gapMode === 'leader' ? 'toggled' : ''}
            onClick={() => setGapMode('leader')}
            title="Gap to leader"
          >
            Lead
          </button>
        </div>
      </div>
      {!anyData ? (
        <div className="placeholder">No timing data yet.</div>
      ) : (
        <table className="timing num">
          <thead>
            <tr>
              <th className="r">P</th>
              <th>Driver</th>
              <th>Tyre</th>
              <th className="r">Last</th>
              <th className="r">{gapMode === 'interval' ? 'Int' : 'Gap'}</th>
              <th className="r">Pit</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const d = clamped.drivers.find((x) => x.driver_number === r.driver)!
              const isLeader = r.position === 1
              const gap = gapMode === 'interval' ? r.interval : r.gapToLeader
              const on = selected.includes(r.driver)
              return (
                <tr
                  key={r.driver}
                  className={`${r.stale ? 'stale' : ''}${on ? ' sel' : ''}`}
                  onClick={() =>
                    onSelect((cur) =>
                      cur.includes(r.driver)
                        ? cur.filter((x) => x !== r.driver)
                        : [...cur, r.driver],
                    )
                  }
                  title={`${d.full_name} — click to plot`}
                >
                  <td className="r pos">{r.position ?? '·'}</td>
                  <td>
                    <span className="teambar" style={{ background: driverColor(d.team_colour) }} />
                    {d.name_acronym}
                  </td>
                  <td>
                    {r.compound ? (
                      <>
                        <span
                          className="compound"
                          style={{ color: COMPOUND_COLORS[r.compound] ?? 'var(--text-muted)' }}
                        >
                          {COMPOUND_LETTER[r.compound] ?? '?'}
                        </span>
                        <span className="age">{r.tyreAge != null ? ` ${r.tyreAge}` : ''}</span>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="r">{r.stale ? 'no data' : fmtLapTime(r.lastLap)}</td>
                  <td className="r">{r.stale ? '' : isLeader ? '—' : fmtGap(gap)}</td>
                  <td className="r">{r.pitCount || ''}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
