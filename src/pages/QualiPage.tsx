import { useEffect, useMemo, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useWeekend } from '../data/WeekendContext'
import { ensureSessionLoaded, useSessionEntry } from '../data/sessionStore'
import { useClampedSession } from '../replay/useClampedSession'
import { useClock } from '../replay/ClockContext'
import LoadingChecklist from '../components/LoadingChecklist'
import ClockBar from '../components/ClockBar'
import DriverSelect, { useSelectedDrivers, isSecondCar } from '../components/DriverSelect'
import { driverColor, fmtLapTime } from '../race/analysis'
import { lapPhase, qualiClassification, type PhaseWindow } from '../quali/phases'
import type { ClampedSession } from '../replay/clamp'

export default function QualiPage() {
  const { sessions, meeting, loading, error } = useWeekend()
  const qualiSessions = sessions.filter((s) => s.session_type === 'Qualifying')
  const [pick, setPick] = useState<number | null>(null)

  const session =
    qualiSessions.find((s) => s.session_key === pick) ??
    qualiSessions.find((s) => s.session_name === 'Qualifying') ??
    qualiSessions[0] ??
    null

  useEffect(() => {
    if (session) ensureSessionLoaded(session)
  }, [session])

  const entry = useSessionEntry(session?.session_key ?? null)
  const { clamped, UNSAFE_prep } = useClampedSession(session)
  const [selected, setSelected] = useSelectedDrivers()
  const { t, mode } = useClock()

  if (error) return <div className="placeholder">{error}</div>
  if (loading || !meeting) return <div className="placeholder">Loading weekend…</div>
  if (!session) return <div className="placeholder">No qualifying session in this weekend.</div>
  if (!clamped || !UNSAFE_prep) {
    return entry ? <LoadingChecklist entry={entry} /> : <div className="placeholder">Preparing…</div>
  }

  const notSynced = mode === 'replay' && t == null

  return (
    <div>
      <ClockBar clamped={clamped} UNSAFE_prep={UNSAFE_prep} />
      {qualiSessions.length > 1 && (
        <div className="subtabs">
          {qualiSessions.map((s) => (
            <button
              key={s.session_key}
              className={s.session_key === session.session_key ? 'toggled' : ''}
              onClick={() => setPick(s.session_key)}
            >
              {s.session_name}
            </button>
          ))}
        </div>
      )}
      <DriverSelect drivers={clamped.drivers} selected={selected} onChange={setSelected} />
      {notSynced ? (
        <div className="placeholder">
          Replay mode, clock not synced — press <b>● Lights out</b> to replay this session from the
          start, or switch to <b>Full session</b> to analyse it.
        </div>
      ) : (
        <div className="race-grid">
          <div className="left">
            <QualiChart clamped={clamped} selected={selected} />
          </div>
          <div className="right">
            <QualiTable clamped={clamped} selected={selected} onSelect={setSelected} />
          </div>
        </div>
      )}
    </div>
  )
}

function QualiTable({
  clamped,
  selected,
  onSelect,
}: {
  clamped: ClampedSession
  selected: number[]
  onSelect: (u: (cur: number[]) => number[]) => void
}) {
  const { rows, currentPhase, advance } = useMemo(() => qualiClassification(clamped), [clamped])

  const bestOfPhase: Partial<Record<1 | 2 | 3, number>> = {}
  for (const p of [1, 2, 3] as const) {
    const times = rows.map((r) => r.best[p]).filter((x): x is number => x != null)
    if (times.length) bestOfPhase[p] = Math.min(...times)
  }

  const anyTime = rows.some((r) => r.latestPhase != null)
  const leaderKey = rows[0]?.sortKey

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Classification</h3>
        <span className="spacer" />
        <span className="gap-hint">Q{currentPhase}</span>
      </div>
      {!anyTime ? (
        <div className="placeholder">No times set yet.</div>
      ) : (
        <table className="timing num">
          <thead>
            <tr>
              <th className="r">P</th>
              <th>Driver</th>
              <th className="r">Q1</th>
              <th className="r">Q2</th>
              <th className="r">Q3</th>
              <th className="r">Gap</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const d = clamped.drivers.find((x) => x.driver_number === r.driver)!
              const on = selected.includes(r.driver)
              const cutQ1 = i === advance.q1 - 1 && currentPhase === 1
              const cutQ2 = i === advance.q2 - 1 && currentPhase === 2
              return (
                <tr
                  key={r.driver}
                  className={`${on ? 'sel' : ''}${cutQ1 || cutQ2 ? ' cutoff' : ''}`}
                  onClick={() =>
                    onSelect((cur) =>
                      cur.includes(r.driver) ? cur.filter((x) => x !== r.driver) : [...cur, r.driver],
                    )
                  }
                  title={`${d.full_name} — click to plot`}
                >
                  <td className="r pos">{r.latestPhase ? i + 1 : '·'}</td>
                  <td>
                    <span className="teambar" style={{ background: driverColor(d.team_colour) }} />
                    {d.name_acronym}
                  </td>
                  {([1, 2, 3] as const).map((p) => (
                    <td
                      key={p}
                      className="r"
                      style={
                        r.best[p] != null && r.best[p] === bestOfPhase[p]
                          ? { color: 'var(--purple)', fontWeight: 600 }
                          : undefined
                      }
                    >
                      {r.best[p] != null ? fmtLapTime(r.best[p]) : ''}
                    </td>
                  ))}
                  <td className="r" style={{ color: 'var(--text-muted)' }}>
                    {r.latestPhase && leaderKey != null && r.sortKey !== leaderKey && r.sortKey !== Infinity
                      ? `+${(r.sortKey - leaderKey).toFixed(3)}`
                      : ''}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

function QualiChart({ clamped, selected }: { clamped: ClampedSession; selected: number[] }) {
  const { windows } = useMemo(() => qualiClassification(clamped), [clamped])

  const t0 = windows[0]?.startMs ?? null

  const { series, yDomain, xMax } = useMemo(() => {
    if (t0 == null) return { series: [], yDomain: ['auto', 'auto'] as [string, string], xMax: 0 }
    const series: { n: number; data: { min: number; t: number | null }[] }[] = []
    const values: number[] = []
    let xMax = 0
    for (const n of selected) {
      const laps = clamped.lapsByDriver.get(n) ?? []
      const pts: { min: number; t: number | null; phase: number | null }[] = []
      for (const lap of laps) {
        if (lap.lap_duration == null || lap.is_pit_out_lap) continue
        if (lap.completionMs === Infinity) continue
        pts.push({
          min: (lap.completionMs - t0) / 60_000,
          t: lap.lap_duration,
          phase: lapPhase(lap, windows),
        })
      }
      // keep only laps within 4% of the driver's best — real flyers
      const flyers = pts.map((p) => p.t!).sort((a, b) => a - b)
      const best = flyers[0]
      const kept = pts.filter((p) => best != null && p.t! <= best * 1.04)
      // break the line between phases with a null sentinel
      const data: { min: number; t: number | null }[] = []
      for (let i = 0; i < kept.length; i++) {
        if (i > 0 && kept[i].phase !== kept[i - 1].phase) {
          data.push({ min: (kept[i - 1].min + kept[i].min) / 2, t: null })
        }
        data.push({ min: kept[i].min, t: kept[i].t })
        values.push(kept[i].t!)
        xMax = Math.max(xMax, kept[i].min)
      }
      if (data.length) series.push({ n, data })
    }
    let yDomain: [number | string, number | string] = ['auto', 'auto']
    if (values.length) {
      const lo = Math.min(...values)
      const hi = Math.max(...values)
      yDomain = [lo - 0.4, hi + 0.4]
    }
    return { series, yDomain: yDomain as [string, string], xMax }
  }, [clamped, selected, t0, windows])

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Lap evolution</h3>
        <span className="spacer" />
        <span className="gap-hint">flying laps over session time</span>
      </div>
      <div className="panel-body">
        {selected.length === 0 ? (
          <div className="placeholder">Select drivers (or click rows) to plot their laps.</div>
        ) : series.length === 0 ? (
          <div className="placeholder">No flying laps yet.</div>
        ) : (
          <ResponsiveContainer width="100%" height={380}>
            <LineChart margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
              {t0 != null &&
                windows.map((w: PhaseWindow) => (
                  <ReferenceArea
                    key={w.phase}
                    x1={Math.max(0, (w.startMs - t0) / 60_000)}
                    x2={Math.min(xMax, (w.endMs - t0) / 60_000)}
                    fill="#1a2030"
                    fillOpacity={0.5}
                    ifOverflow="visible"
                    label={{
                      value: `Q${w.phase}`,
                      position: 'insideTopLeft',
                      fill: 'var(--text-faint)',
                      fontSize: 11,
                    }}
                  />
                ))}
              <XAxis
                dataKey="min"
                type="number"
                domain={[0, 'dataMax']}
                tickFormatter={(v: number) => `${Math.round(v)}m`}
                stroke="var(--text-faint)"
                tickLine={false}
                fontSize={11}
              />
              <YAxis
                domain={yDomain}
                tickFormatter={(v: number) => fmtLapTime(v, 1)}
                stroke="var(--text-faint)"
                tickLine={false}
                fontSize={11}
                width={56}
                allowDataOverflow
              />
              <Tooltip
                isAnimationActive={false}
                formatter={(v) => fmtLapTime(typeof v === 'number' ? v : null)}
                labelFormatter={(v) => `${Number(v).toFixed(1)} min`}
                contentStyle={{
                  background: '#0e1118',
                  border: '1px solid var(--border-strong)',
                  borderRadius: 4,
                  fontSize: 12,
                }}
              />
              {series.map(({ n, data }) => {
                const d = clamped.drivers.find((x) => x.driver_number === n)
                return (
                  <Line
                    key={n}
                    data={data}
                    dataKey="t"
                    name={d?.name_acronym ?? String(n)}
                    stroke={driverColor(d?.team_colour)}
                    strokeWidth={1.4}
                    strokeDasharray={isSecondCar(clamped.drivers, n) ? '5 3' : undefined}
                    dot={{ r: 2.5, fill: driverColor(d?.team_colour), strokeWidth: 0 }}
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
