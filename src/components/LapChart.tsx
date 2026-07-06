// Lap-time evolution: one line per selected driver, dots colored by tyre
// compound, optional filtering of in/out laps and SC/VSC/red-flag laps.

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
  lap: number
  [key: string]: number | string | undefined
}

export default function LapChart({ clamped, selected }: Props) {
  const [cleanOnly, setCleanOnly] = useState(true)

  const { rows, yDomain } = useMemo(() => {
    const windows = neutralizedWindows(clamped.raceControl)
    const pitIn = pitInLaps(clamped.pits)
    const byLap = new Map<number, Row>()
    const values: number[] = []

    for (const n of selected) {
      const laps = clamped.lapsByDriver.get(n) ?? []
      const stints = clamped.stintsByDriver.get(n) ?? []
      for (const lap of laps) {
        if (lap.lap_duration == null) continue
        if (cleanOnly && !isCleanLap(lap, windows, pitIn)) continue
        let row = byLap.get(lap.lap_number)
        if (!row) {
          row = { lap: lap.lap_number }
          byLap.set(lap.lap_number, row)
        }
        row[`t${n}`] = lap.lap_duration
        const stint = stints.find((s) => s.lap_start <= lap.lap_number && lap.lap_number <= s.lap_end)
        row[`c${n}`] = stint?.compound ?? 'UNKNOWN'
        values.push(lap.lap_duration)
      }
    }

    const rows = [...byLap.values()].sort((a, b) => (a.lap as number) - (b.lap as number))
    let yDomain: [number | string, number | string] = ['auto', 'auto']
    if (values.length > 4) {
      const lo = percentile(values, 0.05)! - 1
      const hi = percentile(values, 0.95)! + (cleanOnly ? 2 : 8)
      yDomain = [Math.floor(lo * 2) / 2, Math.ceil(hi * 2) / 2]
    }
    return { rows, yDomain }
  }, [clamped, selected, cleanOnly])

  const renderDot = (n: number) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (props: any) => {
      const { key, cx, cy, payload, value } = props
      if (cx == null || cy == null || value == null) return <g key={key} />
      const compound = (payload[`c${n}`] as string) ?? 'UNKNOWN'
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
                dataKey="lap"
                type="number"
                domain={[1, 'dataMax']}
                allowDecimals={false}
                stroke="var(--text-faint)"
                tickLine={false}
                fontSize={11}
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
              <Tooltip content={<LapTooltip clamped={clamped} />} isAnimationActive={false} />
              {selected.map((n) => {
                const d = clamped.drivers.find((x) => x.driver_number === n)
                return (
                  <Line
                    key={n}
                    dataKey={`t${n}`}
                    stroke={driverColor(d?.team_colour)}
                    strokeWidth={1.5}
                    strokeDasharray={isSecondCar(clamped.drivers, n) ? '5 3' : undefined}
                    dot={renderDot(n)}
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
function LapTooltip({ active, payload, label, clamped }: any) {
  if (!active || !payload?.length) return null
  const items = [...payload]
    .filter((p) => p.value != null)
    .sort((a, b) => a.value - b.value)
  return (
    <div className="chart-tooltip">
      <div className="tt-title num">LAP {label}</div>
      {items.map((p) => {
        const n = Number(String(p.dataKey).slice(1))
        const d = clamped.drivers.find((x: { driver_number: number }) => x.driver_number === n)
        const compound = p.payload[`c${n}`] as string
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
