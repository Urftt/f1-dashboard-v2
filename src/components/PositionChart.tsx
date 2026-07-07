// Lap-by-lap race positions — the classic lap chart. Position at lap N =
// order in which drivers completed lap N (clamped data, so it only exists
// up to the replay clock). Whole field in faint grey, selected drivers in
// team colors.

import { memo, useMemo } from 'react'
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
import { driverColor } from '../race/analysis'
import { isSecondCar } from './DriverSelect'

interface Props {
  clamped: ClampedSession
  selected: number[]
}

function PositionChart({ clamped, selected }: Props) {
  const { series, maxLap, fieldSize } = useMemo(() => {
    // completion order per lap number
    const byLap = new Map<number, { driver: number; completion: number }[]>()
    for (const [driver, laps] of clamped.lapsByDriver) {
      for (const lap of laps) {
        if (lap.completionMs === Infinity) continue
        let arr = byLap.get(lap.lap_number)
        if (!arr) {
          arr = []
          byLap.set(lap.lap_number, arr)
        }
        arr.push({ driver, completion: lap.completionMs })
      }
    }
    const perDriver = new Map<number, { lap: number; pos: number | null }[]>()
    let maxLap = 0
    const lapNums = [...byLap.keys()].sort((a, b) => a - b)
    for (const lapNum of lapNums) {
      maxLap = Math.max(maxLap, lapNum)
      const order = byLap.get(lapNum)!.sort((a, b) => a.completion - b.completion)
      order.forEach(({ driver }, i) => {
        let arr = perDriver.get(driver)
        if (!arr) {
          arr = []
          perDriver.set(driver, arr)
        }
        arr.push({ lap: lapNum, pos: i + 1 })
      })
    }
    const series = [...perDriver.entries()].map(([driver, data]) => ({ driver, data }))
    return { series, maxLap, fieldSize: clamped.drivers.length }
  }, [clamped])

  const acr = (n: number) => clamped.drivers.find((d) => d.driver_number === n)?.name_acronym ?? String(n)

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Positions</h3>
        <span className="spacer" />
        <span className="gap-hint">order at the line each lap · selected drivers highlighted</span>
      </div>
      <div className="panel-body">
        {maxLap < 1 ? (
          <div className="placeholder">No completed laps yet.</div>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(260, fieldSize * 15)}>
            <LineChart margin={{ top: 8, right: 34, bottom: 4, left: 4 }}>
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
                dataKey="pos"
                type="number"
                reversed
                domain={[1, fieldSize]}
                interval={0}
                tickCount={fieldSize}
                allowDecimals={false}
                stroke="var(--text-faint)"
                tickLine={false}
                fontSize={10}
                width={26}
              />
              <Tooltip
                isAnimationActive={false}
                content={<PosTooltip acr={acr} />}
              />
              {series.map(({ driver, data }) => {
                const on = selected.includes(driver)
                const d = clamped.drivers.find((x) => x.driver_number === driver)
                return (
                  <Line
                    key={driver}
                    data={data}
                    dataKey="pos"
                    name={String(driver)}
                    stroke={on ? driverColor(d?.team_colour) : '#2c3342'}
                    strokeWidth={on ? 2 : 1}
                    strokeDasharray={on && isSecondCar(clamped.drivers, driver) ? '5 3' : undefined}
                    dot={false}
                    isAnimationActive={false}
                    label={undefined}
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
function PosTooltip({ active, payload, label, acr }: any) {
  if (!active || !payload?.length) return null
  const items = [...payload].filter((p) => p.value != null).sort((a, b) => a.value - b.value)
  return (
    <div className="chart-tooltip">
      <div className="tt-title num">LAP {label}</div>
      {items.slice(0, 8).map((p) => (
        <div key={p.name} className="tt-row num">
          <span className="dot" style={{ background: p.stroke }} />
          <span className="acr">{acr(Number(p.name))}</span>
          <span className="val">P{p.value}</span>
        </div>
      ))}
    </div>
  )
}

export default memo(PositionChart)
