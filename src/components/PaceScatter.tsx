// One-lap pace vs race pace, one dot per driver. The classic Friday question:
// who is genuinely quick, and who is glory-running vs sandbagging.
// Quadrants split at the field medians:
//   bottom-left  = fast lap AND fast long runs (the real deal)
//   top-left     = quali-fast, race-slow (low-fuel glory runs)
//   bottom-right = race-fast, quali-modest (sandbagging / race trim focus)

import { memo, useMemo } from 'react'
import {
  CartesianGrid,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { ClampedSession } from '../replay/clamp'
import { driverColor, fmtLapTime } from '../race/analysis'
import { practiceSummary } from '../practice/analysis'

interface Props {
  clamped: ClampedSession
  selected: number[]
}

interface Dot {
  driver: number
  acr: string
  color: string
  best: number
  race: number
}

function median(xs: number[]): number | null {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

function PaceScatter({ clamped, selected }: Props) {
  const { dots, mx, my } = useMemo(() => {
    const rows = practiceSummary(clamped)
    const dots: Dot[] = []
    for (const r of rows) {
      if (r.bestLap == null || r.longRunPace == null) continue
      const d = clamped.drivers.find((x) => x.driver_number === r.driver)
      dots.push({
        driver: r.driver,
        acr: d?.name_acronym ?? String(r.driver),
        color: driverColor(d?.team_colour),
        best: r.bestLap,
        race: r.longRunPace,
      })
    }
    return { dots, mx: median(dots.map((d) => d.best)), my: median(dots.map((d) => d.race)) }
  }, [clamped])

  if (dots.length < 4) {
    return (
      <div className="panel">
        <div className="panel-head">
          <h3>One-lap vs race pace</h3>
        </div>
        <div className="placeholder">Not enough long-run data for the pace map.</div>
      </div>
    )
  }

  const xs = dots.map((d) => d.best)
  const ys = dots.map((d) => d.race)
  const pad = 0.3

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>One-lap vs race pace</h3>
        <span className="spacer" />
        <span className="gap-hint">
          bottom-left = quick everywhere · below the line at right = sandbagging?
        </span>
      </div>
      <div className="panel-body">
        <ResponsiveContainer width="100%" height={360}>
          <ScatterChart margin={{ top: 8, right: 26, bottom: 18, left: 6 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" />
            <XAxis
              dataKey="best"
              type="number"
              domain={[Math.min(...xs) - pad, Math.max(...xs) + pad]}
              tickFormatter={(v: number) => fmtLapTime(v, 1)}
              stroke="var(--text-faint)"
              tickLine={false}
              fontSize={11}
              label={{
                value: 'best single lap',
                position: 'insideBottom',
                offset: -10,
                fill: 'var(--text-faint)',
                fontSize: 11,
              }}
            />
            <YAxis
              dataKey="race"
              type="number"
              domain={[Math.min(...ys) - pad, Math.max(...ys) + pad]}
              tickFormatter={(v: number) => fmtLapTime(v, 1)}
              stroke="var(--text-faint)"
              tickLine={false}
              fontSize={11}
              width={56}
              label={{
                value: 'long-run pace',
                angle: -90,
                position: 'insideLeft',
                fill: 'var(--text-faint)',
                fontSize: 11,
              }}
            />
            {mx != null && <ReferenceLine x={mx} stroke="var(--border-strong)" strokeDasharray="4 4" />}
            {my != null && <ReferenceLine y={my} stroke="var(--border-strong)" strokeDasharray="4 4" />}
            <Tooltip
              isAnimationActive={false}
              cursor={{ strokeDasharray: '3 3', stroke: 'var(--text-faint)' }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              content={({ active, payload }: any) => {
                if (!active || !payload?.length) return null
                const p = payload[0].payload as Dot
                return (
                  <div className="chart-tooltip">
                    <div className="tt-title num">{p.acr}</div>
                    <div className="tt-row num">best {fmtLapTime(p.best)}</div>
                    <div className="tt-row num">long run {fmtLapTime(p.race)}</div>
                  </div>
                )
              }}
            />
            {dots.map((d) => (
              <Scatter
                key={d.driver}
                data={[d]}
                dataKey="race"
                fill={d.color}
                stroke={selected.includes(d.driver) ? 'var(--text)' : 'none'}
                strokeWidth={1.5}
                isAnimationActive={false}
              >
                <LabelList
                  dataKey="acr"
                  position="right"
                  offset={6}
                  style={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
                />
              </Scatter>
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export default memo(PaceScatter)
