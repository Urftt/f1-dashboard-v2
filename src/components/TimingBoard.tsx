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
  gridDelta: number | null
  trend: -1 | 0 | 1
  isPersonalBest: boolean
  personalBest: number | null
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
    // latest position + interval row per driver (arrays are date-sorted);
    // also grid position (first position event) and gap 90s ago for trends
    const lastPos = new Map<number, number>()
    const gridPos = new Map<number, number>()
    for (const p of clamped.positions) {
      lastPos.set(p.driver_number, p.position)
      if (!gridPos.has(p.driver_number)) gridPos.set(p.driver_number, p.position)
    }
    const lastInt = new Map<number, IntervalRow>()
    const pastGtl = new Map<number, number>() // gap_to_leader ~90s before latest
    const latestDate = clamped.intervals.length
      ? new Date(clamped.intervals[clamped.intervals.length - 1].date).getTime()
      : 0
    for (const r of clamped.intervals) {
      lastInt.set(r.driver_number, r)
      if (
        typeof r.gap_to_leader === 'number' &&
        new Date(r.date).getTime() <= latestDate - 90_000
      ) {
        pastGtl.set(r.driver_number, r.gap_to_leader)
      }
    }

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

      // gaining/losing vs leader over the last ~90s
      let trend: -1 | 0 | 1 = 0
      const past = pastGtl.get(n)
      if (past != null && typeof int?.gap_to_leader === 'number') {
        const delta = int.gap_to_leader - past
        if (delta < -0.4) trend = -1 // closing on leader
        else if (delta > 0.4) trend = 1
      }

      const pos = lastPos.get(n) ?? null
      const grid = gridPos.get(n) ?? null
      const currentLapNum = lastLap ? lastLap.lap_number + 1 : 1
      const personalBest = laps.reduce<number | null>(
        (best, l) => (l.lap_duration != null && (best == null || l.lap_duration < best) ? l.lap_duration : best),
        null,
      )
      return {
        driver: n,
        position: pos,
        gridDelta: pos != null && grid != null ? grid - pos : null,
        trend,
        isPersonalBest: lastLap?.lap_duration != null && lastLap.lap_duration === personalBest,
        personalBest,
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
  const sessionBest = rows.reduce<number | null>(
    (best, r) => (r.personalBest != null && (best == null || r.personalBest < best) ? r.personalBest : best),
    null,
  )

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
              <th className="r" title="positions gained/lost vs grid">
                +/−
              </th>
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
                  <td className="r griddelta">
                    {r.gridDelta == null || r.gridDelta === 0 ? (
                      ''
                    ) : r.gridDelta > 0 ? (
                      <span className="up">▲{r.gridDelta}</span>
                    ) : (
                      <span className="down">▼{-r.gridDelta}</span>
                    )}
                  </td>
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
                  <td
                    className="r"
                    style={
                      r.stale || !r.isPersonalBest
                        ? undefined
                        : {
                            color:
                              r.lastLap != null && r.lastLap === sessionBest
                                ? 'var(--purple)'
                                : 'var(--green)',
                          }
                    }
                  >
                    {r.stale ? 'no data' : fmtLapTime(r.lastLap)}
                  </td>
                  <td className="r">
                    {r.stale ? (
                      ''
                    ) : isLeader ? (
                      '—'
                    ) : (
                      <>
                        {r.trend === -1 && <span className="up">▲</span>}
                        {r.trend === 1 && <span className="down">▼</span>}
                        {fmtGap(gap)}
                      </>
                    )}
                  </td>
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
