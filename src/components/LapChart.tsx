// Lap-time evolution: one line per selected driver, dots colored by tyre
// compound, optional filtering of in/out laps and SC/VSC/red-flag laps.
//
// Two x-axis modes:
//  - "lap": classic lap-number axis, one line per driver.
//  - "tyre age": each stint becomes its own line starting at its tyre age —
//    drivers who pitted on different laps overlay directly, so stint pace
//    and degradation compare like-for-like.

import { useMemo, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { ClampedSession } from '../replay/clamp'
import {
  COMPOUND_COLORS,
  COMPOUND_LETTER,
  driverColor,
  fmtLapTime,
  isCleanLap,
  neutralizedWindows,
  percentile,
  pitInLaps,
} from '../race/analysis'
import { isSecondCar } from './DriverSelect'

interface Props {
  clamped: ClampedSession
  selected: number[]
}

interface Row {
  x: number
  [key: string]: number | string | undefined
}

interface LineDef {
  dataKey: string
  driver: number
  /** fixed compound for age mode; undefined = read per-point from row */
  compound?: string
}

export default function LapChart({ clamped, selected }: Props) {
  const [cleanOnly, setCleanOnly] = useState(true)
  const [xMode, setXMode] = useState<'lap' | 'age'>('lap')

  const { rows, yDomain, lines } = useMemo(() => {
    const windows = neutralizedWindows(clamped.raceControl)
    const pitIn = pitInLaps(clamped.pits)
    const byX = new Map<number, Row>()
    const values: number[] = []
    const lines: LineDef[] = []

    const rowAt = (x: number): Row => {
      let row = byX.get(x)
      if (!row) {
        row = { x }
        byX.set(x, row)
      }
      return row
    }

    for (const n of selected) {
      const laps = clamped.lapsByDriver.get(n) ?? []
      const stints = clamped.stintsByDriver.get(n) ?? []
      if (xMode === 'lap') {
        lines.push({ dataKey: `t${n}`, driver: n })
        for (const lap of laps) {
          if (lap.lap_duration == null) continue
          if (cleanOnly && !isCleanLap(lap, windows, pitIn)) continue
          const row = rowAt(lap.lap_number)
          row[`t${n}`] = lap.lap_duration
          const stint = stints.find(
            (s) => s.lap_start <= lap.lap_number && lap.lap_number <= s.lap_end,
          )
          row[`c${n}`] = stint?.compound ?? 'UNKNOWN'
          values.push(lap.lap_duration)
        }
      } else {
        for (const st of stints) {
          const key = `t${n}s${st.stint_number}`
          let any = false
          for (const lap of laps) {
            if (lap.lap_number < st.lap_start || lap.lap_number > st.lap_end) continue
            if (lap.lap_duration == null) continue
            if (cleanOnly && !isCleanLap(lap, windows, pitIn)) continue
            const age = (st.tyre_age_at_start ?? 0) + (lap.lap_number - st.lap_start)
            rowAt(age)[key] = lap.lap_duration
            values.push(lap.lap_duration)
            any = true
          }
          if (any) lines.push({ dataKey: key, driver: n, compound: st.compound ?? 'UNKNOWN' })
        }
      }
    }

    const rows = [...byX.values()].sort((a, b) => a.x - b.x)
    let yDomain: [number | string, number | string] = ['auto', 'auto']
    if (values.length > 4) {
      const lo = percentile(values, 0.05)! - 1
      const hi = percentile(values, 0.95)! + (cleanOnly ? 2 : 8)
      yDomain = [Math.floor(lo * 2) / 2, Math.ceil(hi * 2) / 2]
    }
    return { rows, yDomain, lines }
  }, [clamped, selected, cleanOnly, xMode])

  const renderDot = (line: LineDef) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (props: any) => {
      const { key, cx, cy, payload, value } = props
      if (cx == null || cy == null || value == null) return <g key={key} />
      const compound = line.compound ?? ((payload[`c${line.driver}`] as string) || 'UNKNOWN')
      return (
        <circle
          key={key}
          cx={cx}
          cy={cy}
          r={2.6}
          fill={COMPOUND_COLORS[compound] ?? 'var(--text-muted)'}
          stroke="none"
        />
      )
    }
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Lap times</h3>
        <div className="seg">
          <button className={xMode === 'lap' ? 'toggled' : ''} onClick={() => setXMode('lap')}>
            by lap
          </button>
          <button
            className={xMode === 'age' ? 'toggled' : ''}
            onClick={() => setXMode('age')}
            title="Align stints by tyre age to compare like-for-like"
          >
            by tyre age
          </button>
        </div>
        <span className="spacer" />
        <span className="legend">
          {Object.entries(COMPOUND_COLORS).map(([name, color]) => (
            <span key={name} className="legend-item">
              <span className="dot" style={{ background: color }} />
              {COMPOUND_LETTER[name]}
            </span>
          ))}
        </span>
        <button className={cleanOnly ? 'toggled' : ''} onClick={() => setCleanOnly((v) => !v)}>
          {cleanOnly ? 'Hiding' : 'Showing'} in/out + SC laps
        </button>
      </div>
      <div className="panel-body">
        {selected.length === 0 ? (
          <div className="placeholder">Select drivers above to plot lap times.</div>
        ) : rows.length === 0 ? (
          <div className="placeholder">No laps yet{clamped.full ? '' : ' — waiting for green flag data'}.</div>
        ) : (
          <ResponsiveContainer width="100%" height={340}>
            <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
              <XAxis
                dataKey="x"
                type="number"
                domain={[xMode === 'lap' ? 1 : 0, 'dataMax']}
                allowDecimals={false}
                stroke="var(--text-faint)"
                tickLine={false}
                fontSize={11}
                label={
                  xMode === 'age'
                    ? {
                        value: 'tyre age (laps)',
                        position: 'insideBottomRight',
                        offset: -2,
                        fill: 'var(--text-faint)',
                        fontSize: 10,
                      }
                    : undefined
                }
              />
              <YAxis
                domain={yDomain}
                tickFormatter={(v: number) => fmtLapTime(v, 0)}
                stroke="var(--text-faint)"
                tickLine={false}
                fontSize={11}
                width={52}
                allowDataOverflow
              />
              <Tooltip content={<LapTooltip clamped={clamped} xMode={xMode} />} isAnimationActive={false} />
              {lines.map((line) => {
                const d = clamped.drivers.find((x) => x.driver_number === line.driver)
                return (
                  <Line
                    key={line.dataKey}
                    dataKey={line.dataKey}
                    stroke={driverColor(d?.team_colour)}
                    strokeWidth={1.5}
                    strokeDasharray={isSecondCar(clamped.drivers, line.driver) ? '5 3' : undefined}
                    dot={renderDot(line)}
                    activeDot={{ r: 4 }}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                )
              })}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function LapTooltip({ active, payload, label, clamped, xMode }: any) {
  if (!active || !payload?.length) return null
  const items = [...payload]
    .filter((p) => p.value != null)
    .sort((a, b) => a.value - b.value)
  return (
    <div className="chart-tooltip">
      <div className="tt-title num">
        {xMode === 'age' ? `TYRE AGE ${label}` : `LAP ${label}`}
      </div>
      {items.map((p) => {
        const m = String(p.dataKey).match(/^t(\d+)(?:s(\d+))?$/)
        const n = m ? Number(m[1]) : 0
        const d = clamped.drivers.find((x: { driver_number: number }) => x.driver_number === n)
        const compound =
          xMode === 'age'
            ? (clamped.stintsByDriver
                .get(n)
                ?.find((s: { stint_number: number }) => s.stint_number === Number(m?.[2]))
                ?.compound ?? 'UNKNOWN')
            : (p.payload[`c${n}`] as string)
        return (
          <div key={p.dataKey} className="tt-row num">
            <span className="dot" style={{ background: p.stroke }} />
            <span className="acr">{d?.name_acronym ?? n}</span>
            <span
              className="compound"
              style={{ color: COMPOUND_COLORS[compound] ?? 'var(--text-muted)' }}
            >
              {COMPOUND_LETTER[compound] ?? '?'}
            </span>
            <span className="val">{fmtLapTime(p.value)}</span>
          </div>
        )
      })}
    </div>
  )
}
