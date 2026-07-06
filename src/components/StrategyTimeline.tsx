// Whole-field tyre strategy at a glance: one row per driver, stint bars
// colored by compound along a lap axis, pit stops as ticks. Clamped stints
// are already truncated at the current lap, so this is spoiler-safe by
// construction. Pure CSS — no chart library.

import { useMemo } from 'react'
import type { ClampedSession } from '../replay/clamp'
import { COMPOUND_COLORS, COMPOUND_LETTER, driverColor } from '../race/analysis'
import type { SelectedUpdater } from './DriverSelect'

interface Props {
  clamped: ClampedSession
  selected: number[]
  onSelect: (u: SelectedUpdater) => void
}

export default function StrategyTimeline({ clamped, selected, onSelect }: Props) {
  const { rows, maxLap } = useMemo(() => {
    // order rows by current race position (same source as the timing board)
    const lastPos = new Map<number, number>()
    for (const p of clamped.positions) lastPos.set(p.driver_number, p.position)

    let maxLap = 1
    for (const stints of clamped.stintsByDriver.values()) {
      for (const st of stints) maxLap = Math.max(maxLap, st.lap_end)
    }

    const rows = clamped.drivers
      .map((d) => ({
        driver: d,
        pos: lastPos.get(d.driver_number) ?? 99,
        stints: clamped.stintsByDriver.get(d.driver_number) ?? [],
        pits: clamped.pits.filter((p) => p.driver_number === d.driver_number),
      }))
      .sort((a, b) => a.pos - b.pos)
    return { rows, maxLap }
  }, [clamped])

  const anyStints = rows.some((r) => r.stints.length > 0)

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Strategy</h3>
        <span className="spacer" />
        <span className="gap-hint">stints by compound · ticks = pit stops · lap 1–{maxLap}</span>
      </div>
      <div className="panel-body">
        {!anyStints ? (
          <div className="placeholder">No stint data yet.</div>
        ) : (
          <div className="strategy">
            {rows.map(({ driver, stints, pits }) => (
              <div
                key={driver.driver_number}
                className={`strat-row${selected.includes(driver.driver_number) ? ' sel' : ''}`}
                onClick={() =>
                  onSelect((cur) =>
                    cur.includes(driver.driver_number)
                      ? cur.filter((x) => x !== driver.driver_number)
                      : [...cur, driver.driver_number],
                  )
                }
                title={`${driver.full_name} — click to plot`}
              >
                <span className="strat-name num">
                  <span
                    className="teambar"
                    style={{ background: driverColor(driver.team_colour) }}
                  />
                  {driver.name_acronym}
                </span>
                <span className="strat-track">
                  {stints.map((st) => {
                    const left = ((st.lap_start - 1) / maxLap) * 100
                    const width = Math.max(0.8, ((st.lap_end - st.lap_start + 1) / maxLap) * 100)
                    const c = st.compound ?? 'UNKNOWN'
                    const wide = st.lap_end - st.lap_start >= 4
                    return (
                      <span
                        key={st.stint_number}
                        className="stint num"
                        style={{
                          left: `${left}%`,
                          width: `${width}%`,
                          background: COMPOUND_COLORS[c] ?? '#3a4252',
                        }}
                        title={`${c} laps ${st.lap_start}–${st.lap_end} (age ${st.tyre_age_at_start ?? 0} at start)`}
                      >
                        {wide ? COMPOUND_LETTER[c] ?? '' : ''}
                      </span>
                    )
                  })}
                  {pits.map((p, i) => (
                    <span
                      key={i}
                      className="pit-tick"
                      style={{ left: `${(p.lap_number / maxLap) * 100}%` }}
                      title={`pit lap ${p.lap_number} (${p.pit_duration ?? '?'}s)`}
                    />
                  ))}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
