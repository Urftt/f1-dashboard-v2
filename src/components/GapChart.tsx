// Pairwise gap: gap_to_leader(A) − gap_to_leader(B) resampled onto a 5s
// grid. Positive = A behind B. Shows closing rate and projected contact,
// computed ONLY from clamped (already-seen) data.

import { useMemo, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { ClampedSession } from '../replay/clamp'
import { driverColor } from '../race/analysis'

const GRID_MS = 5_000
const MAX_POINTS = 1500

interface Props {
  clamped: ClampedSession
  selected: number[]
}

interface GapPoint {
  min: number // minutes since race start
  gap: number
}

function gapSeries(clamped: ClampedSession, a: number, b: number): GapPoint[] {
  const t0 = clamped.raceStartMs
  if (t0 == null) return []

  const series = (n: number) => {
    const pts: { t: number; v: number }[] = []
    for (const r of clamped.intervals) {
      if (r.driver_number !== n) continue
      const v = r.gap_to_leader
      if (typeof v === 'number' && Number.isFinite(v)) {
        pts.push({ t: new Date(r.date).getTime(), v })
      }
    }
    return pts
  }

  const A = series(a)
  const B = series(b)
  if (A.length < 2 || B.length < 2) return []

  const start = Math.max(A[0].t, B[0].t)
  const end = Math.min(A[A.length - 1].t, B[B.length - 1].t)
  if (end <= start) return []

  const out: GapPoint[] = []
  let ia = 0
  let ib = 0
  for (let t = start; t <= end; t += GRID_MS) {
    while (ia + 1 < A.length && A[ia + 1].t <= t) ia++
    while (ib + 1 < B.length && B[ib + 1].t <= t) ib++
    // drop grid points where either driver's data is stale (pit lane, crash,
    // lapped-car strings) — a last-known value older than ~20s is a lie
    if (t - A[ia].t > 20_000 || t - B[ib].t > 20_000) continue
    out.push({ min: (t - t0) / 60_000, gap: A[ia].v - B[ib].v })
  }

  if (out.length > MAX_POINTS) {
    const stride = Math.ceil(out.length / MAX_POINTS)
    return out.filter((_, i) => i % stride === 0)
  }
  return out
}

/** least-squares slope (s/min) over the last `windowMin` minutes */
function closingRate(pts: GapPoint[], windowMin: number): number | null {
  if (pts.length < 8) return null
  const cutoff = pts[pts.length - 1].min - windowMin
  const recent = pts.filter((p) => p.min >= cutoff)
  if (recent.length < 8) return null
  const n = recent.length
  let sx = 0
  let sy = 0
  let sxx = 0
  let sxy = 0
  for (const p of recent) {
    sx += p.min
    sy += p.gap
    sxx += p.min * p.min
    sxy += p.min * p.gap
  }
  const denom = n * sxx - sx * sx
  if (Math.abs(denom) < 1e-9) return null
  return (n * sxy - sx * sy) / denom
}

export default function GapChart({ clamped, selected }: Props) {
  const [a, setA] = useState<number | null>(null)
  const [b, setB] = useState<number | null>(null)

  // default to the first two globally selected drivers
  const effA = a ?? selected[0] ?? null
  const effB = b ?? (selected[1] !== effA ? (selected[1] ?? null) : null)

  const drv = (n: number | null) => clamped.drivers.find((d) => d.driver_number === n)

  const pts = useMemo(
    () => (effA != null && effB != null ? gapSeries(clamped, effA, effB) : []),
    [clamped, effA, effB],
  )

  const medianLapMin = useMemo(() => {
    if (effA == null) return 1.5
    const durs = (clamped.lapsByDriver.get(effA) ?? [])
      .map((l) => l.lap_duration)
      .filter((d): d is number => d != null)
      .sort((x, y) => x - y)
    return durs.length ? durs[Math.floor(durs.length / 2)] / 60 : 1.5
  }, [clamped, effA])

  const rate = useMemo(() => closingRate(pts, 5 * medianLapMin), [pts, medianLapMin])

  const last = pts[pts.length - 1]
  let annotation: string | null = null
  if (rate != null && last) {
    const perLap = rate * medianLapMin
    if (Math.abs(perLap) >= 0.05) {
      const closing = Math.sign(perLap) !== Math.sign(last.gap || 1)
      const verb = closing ? 'closing' : 'pulling away'
      annotation = `${verb} ${Math.abs(perLap).toFixed(2)} s/lap`
      if (closing && Math.abs(last.gap) > 0.8) {
        const laps = Math.abs(last.gap) / Math.abs(perLap)
        if (laps < 40) annotation += ` · contact in ~${Math.ceil(laps)} laps`
      }
    }
  }

  const pitMarks = useMemo(() => {
    const t0 = clamped.raceStartMs
    if (t0 == null || effA == null || effB == null) return []
    return clamped.pits
      .filter((p) => p.driver_number === effA || p.driver_number === effB)
      .map((p) => ({
        min: (new Date(p.date).getTime() - t0) / 60_000,
        driver: p.driver_number,
      }))
  }, [clamped, effA, effB])

  const dA = drv(effA)
  const dB = drv(effB)

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Gap</h3>
        <select
          value={effA ?? ''}
          onChange={(e) => setA(Number(e.target.value))}
          aria-label="Gap driver A"
        >
          <option value="" disabled>
            A
          </option>
          {clamped.drivers.map((d) => (
            <option key={d.driver_number} value={d.driver_number}>
              {d.name_acronym}
            </option>
          ))}
        </select>
        <span style={{ color: 'var(--text-faint)' }}>vs</span>
        <select
          value={effB ?? ''}
          onChange={(e) => setB(Number(e.target.value))}
          aria-label="Gap driver B"
        >
          <option value="" disabled>
            B
          </option>
          {clamped.drivers.map((d) => (
            <option key={d.driver_number} value={d.driver_number}>
              {d.name_acronym}
            </option>
          ))}
        </select>
        {dA && dB && (
          <span className="gap-hint">
            above 0 = {dA.name_acronym} behind {dB.name_acronym}
          </span>
        )}
        <span className="spacer" />
        {annotation && last && (
          <span className="num gap-annotation">
            {Math.abs(last.gap).toFixed(1)}s · {annotation}
          </span>
        )}
      </div>
      <div className="panel-body">
        {effA == null || effB == null ? (
          <div className="placeholder">Pick two drivers (or select two above).</div>
        ) : pts.length < 2 ? (
          <div className="placeholder">Not enough shared running yet.</div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={pts} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
              <XAxis
                dataKey="min"
                type="number"
                domain={['dataMin', 'dataMax']}
                tickFormatter={(v: number) => `${Math.round(v)}m`}
                stroke="var(--text-faint)"
                tickLine={false}
                fontSize={11}
              />
              <YAxis
                stroke="var(--text-faint)"
                tickLine={false}
                fontSize={11}
                width={44}
                tickFormatter={(v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}`}
              />
              <Tooltip
                isAnimationActive={false}
                content={<GapTooltip a={dA?.name_acronym} b={dB?.name_acronym} />}
              />
              <ReferenceLine y={0} stroke="var(--text-muted)" strokeWidth={1.5} />
              {pitMarks.map((p, i) => (
                <ReferenceLine
                  key={i}
                  x={p.min}
                  stroke={driverColor(drv(p.driver)?.team_colour)}
                  strokeDasharray="3 3"
                  label={{
                    value: `${drv(p.driver)?.name_acronym ?? p.driver} pit`,
                    position: 'insideTopRight',
                    fill: 'var(--text-faint)',
                    fontSize: 10,
                  }}
                />
              ))}
              <Line
                dataKey="gap"
                stroke={driverColor(dA?.team_colour) || 'var(--blue)'}
                strokeWidth={1.6}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function GapTooltip({ active, payload, label, a, b }: any) {
  if (!active || !payload?.length) return null
  const gap = payload[0].value as number
  const ahead = gap > 0 ? b : a
  const behind = gap > 0 ? a : b
  return (
    <div className="chart-tooltip">
      <div className="tt-title num">{Math.floor(label)}m {Math.round((label % 1) * 60)}s</div>
      <div className="tt-row num">
        {behind} +{Math.abs(gap).toFixed(2)}s behind {ahead}
      </div>
    </div>
  )
}
