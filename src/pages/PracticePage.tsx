import { useEffect, useMemo, useState } from 'react'
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useWeekend } from '../data/WeekendContext'
import { ensureSessionLoaded, useSessionEntry } from '../data/sessionStore'
import LoadingChecklist from '../components/LoadingChecklist'
import DriverSelect, { useSelectedDrivers } from '../components/DriverSelect'
import {
  COMPOUND_COLORS,
  COMPOUND_LETTER,
  driverColor,
  fmtLapTime,
} from '../race/analysis'
import { findLongRuns, fitSegment, practiceSummary } from '../practice/analysis'
import type { ClampedSession } from '../replay/clamp'

export default function PracticePage() {
  const { sessions, meeting, loading, error } = useWeekend()
  const fpSessions = sessions.filter((s) => s.session_type === 'Practice')
  const [pick, setPick] = useState<number | null>(null)

  const session = fpSessions.find((s) => s.session_key === pick) ?? fpSessions[0] ?? null

  useEffect(() => {
    if (session) ensureSessionLoaded(session)
  }, [session])

  const entry = useSessionEntry(session?.session_key ?? null)
  // Practice analysis is post-hoc by nature: always full data.
  const { clamped } = useClampedSessionFull(session)
  const [selected, setSelected] = useSelectedDrivers()

  if (error) return <div className="placeholder">{error}</div>
  if (loading || !meeting) return <div className="placeholder">Loading weekend…</div>
  if (!session) return <div className="placeholder">No practice session in this weekend.</div>
  if (!clamped) {
    return entry ? <LoadingChecklist entry={entry} /> : <div className="placeholder">Preparing…</div>
  }

  return (
    <div>
      {fpSessions.length > 1 && (
        <div className="subtabs">
          {fpSessions.map((s) => (
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
      <div className="race-grid">
        <div className="left">
          <DegradationChart clamped={clamped} selected={selected} />
        </div>
        <div className="right">
          <PaceTable clamped={clamped} selected={selected} onSelect={setSelected} />
        </div>
      </div>
    </div>
  )
}

// practice page always shows the complete session, independent of the clock
import type { Session } from '../api/types'
import { isEntryComplete } from '../data/sessionStore'
import { clampPrepared, prepareSession } from '../replay/clamp'

function useClampedSessionFull(session: Session | null): { clamped: ClampedSession | null } {
  const entry = useSessionEntry(session?.session_key ?? null)
  const clamped = useMemo(() => {
    if (!entry || !isEntryComplete(entry)) return null
    return clampPrepared(prepareSession(entry.data, entry.session), null)
  }, [entry])
  return { clamped }
}

function PaceTable({
  clamped,
  selected,
  onSelect,
}: {
  clamped: ClampedSession
  selected: number[]
  onSelect: (u: (cur: number[]) => number[]) => void
}) {
  const [sortBy, setSortBy] = useState<'best' | 'race'>('race')
  const rows = useMemo(() => practiceSummary(clamped), [clamped])

  const sorted = [...rows].sort((a, b) => {
    const ka = sortBy === 'best' ? a.bestLap : a.longRunPace
    const kb = sortBy === 'best' ? b.bestLap : b.longRunPace
    if (ka == null && kb == null) return 0
    if (ka == null) return 1
    if (kb == null) return -1
    return ka - kb
  })

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Pace</h3>
        <span className="spacer" />
        <div className="seg">
          <button className={sortBy === 'race' ? 'toggled' : ''} onClick={() => setSortBy('race')}>
            Race pace
          </button>
          <button className={sortBy === 'best' ? 'toggled' : ''} onClick={() => setSortBy('best')}>
            Best lap
          </button>
        </div>
      </div>
      <table className="timing num">
        <thead>
          <tr>
            <th>Driver</th>
            <th className="r">Best</th>
            <th className="r">Long run</th>
            <th className="r">Deg</th>
            <th>Tyres</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const d = clamped.drivers.find((x) => x.driver_number === r.driver)!
            const on = selected.includes(r.driver)
            return (
              <tr
                key={r.driver}
                className={on ? 'sel' : ''}
                onClick={() =>
                  onSelect((cur) =>
                    cur.includes(r.driver) ? cur.filter((x) => x !== r.driver) : [...cur, r.driver],
                  )
                }
                title={`${d.full_name} — click to plot (${r.longRunLaps} long-run laps)`}
              >
                <td>
                  <span className="teambar" style={{ background: driverColor(d.team_colour) }} />
                  {d.name_acronym}
                </td>
                <td className="r">{fmtLapTime(r.bestLap)}</td>
                <td className="r">
                  {r.longRunPace != null ? fmtLapTime(r.longRunPace) : (
                    <span style={{ color: 'var(--text-faint)' }}>insufficient</span>
                  )}
                </td>
                <td className="r">
                  {r.degSlope != null ? (
                    `${r.degSlope >= 0 ? '+' : '−'}${Math.abs(r.degSlope).toFixed(2)}`
                  ) : (
                    <span style={{ color: 'var(--text-faint)' }}>—</span>
                  )}
                </td>
                <td>
                  {r.compounds.map((c) => (
                    <span
                      key={c}
                      className="compound"
                      style={{ color: COMPOUND_COLORS[c] ?? 'var(--text-muted)', marginRight: 3 }}
                    >
                      {COMPOUND_LETTER[c] ?? '?'}
                    </span>
                  ))}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function DegradationChart({
  clamped,
  selected,
}: {
  clamped: ClampedSession
  selected: number[]
}) {
  const runs = useMemo(() => findLongRuns(clamped), [clamped])

  const { scatters, fits, yDomain } = useMemo(() => {
    const myRuns = runs.filter((r) => selected.includes(r.driver))
    const values: number[] = []
    const scatters = myRuns.map((r) => ({
      key: `${r.driver}-${r.compound}-${r.laps[0]?.lap.lap_number}`,
      driver: r.driver,
      compound: r.compound,
      data: r.laps.map((rl) => {
        values.push(rl.lap.lap_duration!)
        return { age: rl.tyreAge, t: rl.lap.lap_duration! }
      }),
    }))
    // one fit per driver+compound, pooled across that driver's runs
    const byDriverCompound = new Map<string, typeof myRuns>()
    for (const r of myRuns) {
      const k = `${r.driver}:${r.compound}`
      byDriverCompound.set(k, [...(byDriverCompound.get(k) ?? []), r])
    }
    const fits = [...byDriverCompound.entries()]
      .map(([k, rs]) => {
        const laps = rs.flatMap((r) => r.laps)
        const seg = fitSegment(laps)
        return seg
          ? { key: k, driver: rs[0].driver, compound: rs[0].compound, data: seg, laps: laps.length }
          : null
      })
      .filter((x): x is NonNullable<typeof x> => x != null)
    const yDomain: [number | string, number | string] = values.length
      ? [Math.min(...values) - 0.4, Math.max(...values) + 0.4]
      : ['auto', 'auto']
    return { scatters, fits, yDomain }
  }, [runs, selected])

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Tyre degradation</h3>
        <span className="spacer" />
        <span className="gap-hint">long-run laps vs tyre age · fit per driver+compound</span>
      </div>
      <div className="panel-body">
        {selected.length === 0 ? (
          <div className="placeholder">Select drivers (or click rows) to plot long runs.</div>
        ) : scatters.length === 0 ? (
          <div className="placeholder">No long runs (≥5 steady laps) for this selection.</div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={380}>
              <ComposedChart margin={{ top: 8, right: 12, bottom: 16, left: 4 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
                <XAxis
                  dataKey="age"
                  type="number"
                  domain={[0, 'dataMax']}
                  allowDecimals={false}
                  stroke="var(--text-faint)"
                  tickLine={false}
                  fontSize={11}
                  label={{
                    value: 'tyre age (laps)',
                    position: 'insideBottom',
                    offset: -8,
                    fill: 'var(--text-faint)',
                    fontSize: 11,
                  }}
                />
                <YAxis
                  dataKey="t"
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
                  labelFormatter={(v) => `age ${v}`}
                  contentStyle={{
                    background: '#0e1118',
                    border: '1px solid var(--border-strong)',
                    borderRadius: 4,
                    fontSize: 12,
                  }}
                />
                {scatters.map((s) => (
                  <Scatter
                    key={s.key}
                    data={s.data}
                    dataKey="t"
                    fill={COMPOUND_COLORS[s.compound] ?? 'var(--text-muted)'}
                    stroke={driverColor(
                      clamped.drivers.find((d) => d.driver_number === s.driver)?.team_colour,
                    )}
                    strokeWidth={1}
                    shape="circle"
                    isAnimationActive={false}
                  />
                ))}
                {fits.map((f) => (
                  <Line
                    key={f.key}
                    data={f.data}
                    dataKey="t"
                    stroke={driverColor(
                      clamped.drivers.find((d) => d.driver_number === f.driver)?.team_colour,
                    )}
                    strokeWidth={1.5}
                    strokeDasharray="6 3"
                    dot={false}
                    isAnimationActive={false}
                  />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
            <div className="fit-labels num">
              {fits.map((f) => {
                const d = clamped.drivers.find((x) => x.driver_number === f.driver)
                const slope = (f.data[1].t - f.data[0].t) / Math.max(1, f.data[1].age - f.data[0].age)
                return (
                  <span key={f.key} className="fit-label">
                    <span className="dot" style={{ background: driverColor(d?.team_colour) }} />
                    {d?.name_acronym}{' '}
                    <span style={{ color: COMPOUND_COLORS[f.compound] }}>
                      {COMPOUND_LETTER[f.compound]}
                    </span>{' '}
                    {slope >= 0 ? '+' : '−'}
                    {Math.abs(slope).toFixed(2)} s/lap ({f.laps} laps)
                  </span>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
