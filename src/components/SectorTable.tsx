// Qualifying sector analysis: personal-best sectors, theoretical ideal lap,
// and how much time each driver left on the table. Built from CLAMPED laps,
// so during a quali replay it only knows sectors already set.

import { memo, useMemo } from 'react'
import type { ClampedSession } from '../replay/clamp'
import { driverColor, fmtLapTime } from '../race/analysis'
import type { SelectedUpdater } from './DriverSelect'

interface Row {
  driver: number
  s1: number | null
  s2: number | null
  s3: number | null
  ideal: number | null
  best: number | null
  delta: number | null // best − ideal, "left on the table"
  idealRank: number | null
}

function build(clamped: ClampedSession): Row[] {
  const rows: Row[] = clamped.drivers.map((d) => {
    const laps = clamped.lapsByDriver.get(d.driver_number) ?? []
    let s1: number | null = null
    let s2: number | null = null
    let s3: number | null = null
    let best: number | null = null
    for (const lap of laps) {
      if (lap.duration_sector_1 != null && (s1 == null || lap.duration_sector_1 < s1)) s1 = lap.duration_sector_1
      if (lap.duration_sector_2 != null && (s2 == null || lap.duration_sector_2 < s2)) s2 = lap.duration_sector_2
      if (lap.duration_sector_3 != null && (s3 == null || lap.duration_sector_3 < s3)) s3 = lap.duration_sector_3
      if (lap.lap_duration != null && !lap.is_pit_out_lap && (best == null || lap.lap_duration < best))
        best = lap.lap_duration
    }
    const ideal = s1 != null && s2 != null && s3 != null ? s1 + s2 + s3 : null
    return {
      driver: d.driver_number,
      s1,
      s2,
      s3,
      ideal,
      best,
      delta: ideal != null && best != null ? Math.max(0, best - ideal) : null,
      idealRank: null,
    }
  })

  const ranked = rows
    .filter((r) => r.ideal != null)
    .sort((a, b) => a.ideal! - b.ideal!)
  ranked.forEach((r, i) => {
    r.idealRank = i + 1
  })

  rows.sort((a, b) => {
    if (a.best == null && b.best == null) return a.driver - b.driver
    if (a.best == null) return 1
    if (b.best == null) return -1
    return a.best - b.best
  })
  return rows.filter((r) => r.best != null)
}

interface Props {
  clamped: ClampedSession
  selected: number[]
  onSelect: (u: SelectedUpdater) => void
}

function SectorTable({ clamped, selected, onSelect }: Props) {
  const rows = useMemo(() => build(clamped), [clamped])

  const bests = useMemo(() => {
    const min = (get: (r: Row) => number | null) => {
      let m: number | null = null
      for (const r of rows) {
        const v = get(r)
        if (v != null && (m == null || v < m)) m = v
      }
      return m
    }
    return { s1: min((r) => r.s1), s2: min((r) => r.s2), s3: min((r) => r.s3) }
  }, [rows])

  if (rows.length === 0) return null

  const sectorCell = (v: number | null, best: number | null) => (
    <td
      className="r"
      style={v != null && v === best ? { color: 'var(--purple)', fontWeight: 600 } : undefined}
    >
      {v != null ? v.toFixed(3) : ''}
    </td>
  )

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Sectors &amp; ideal lap</h3>
        <span className="spacer" />
        <span className="gap-hint">
          best sectors so far · ideal = S1+S2+S3 · Δ = time left on the table
        </span>
      </div>
      <table className="timing num">
        <thead>
          <tr>
            <th className="r">P</th>
            <th>Driver</th>
            <th className="r">S1</th>
            <th className="r">S2</th>
            <th className="r">S3</th>
            <th className="r">Ideal</th>
            <th className="r">Best</th>
            <th className="r">Δ</th>
            <th className="r" title="position if everyone completed their ideal lap">
              iP
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const d = clamped.drivers.find((x) => x.driver_number === r.driver)!
            const on = selected.includes(r.driver)
            const gain = r.idealRank != null && r.idealRank < i + 1
            return (
              <tr
                key={r.driver}
                className={on ? 'sel' : ''}
                onClick={() =>
                  onSelect((cur) =>
                    cur.includes(r.driver) ? cur.filter((x) => x !== r.driver) : [...cur, r.driver],
                  )
                }
                title={`${d.full_name} — click to plot`}
              >
                <td className="r pos">{i + 1}</td>
                <td>
                  <span className="teambar" style={{ background: driverColor(d.team_colour) }} />
                  {d.name_acronym}
                </td>
                {sectorCell(r.s1, bests.s1)}
                {sectorCell(r.s2, bests.s2)}
                {sectorCell(r.s3, bests.s3)}
                <td className="r" style={{ color: 'var(--text-muted)' }}>
                  {fmtLapTime(r.ideal)}
                </td>
                <td className="r">{fmtLapTime(r.best)}</td>
                <td className="r" style={{ color: r.delta != null && r.delta > 0.25 ? 'var(--yellow)' : 'var(--text-faint)' }}>
                  {r.delta != null ? `+${r.delta.toFixed(3)}` : ''}
                </td>
                <td className="r" style={{ color: gain ? 'var(--green)' : 'var(--text-faint)' }}>
                  {r.idealRank ?? ''}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default memo(SectorTable)
