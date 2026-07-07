// Pit window: for each selected driver, project where they rejoin if they
// pit RIGHT NOW (current gap-to-leader + pit loss), who they rejoin next to,
// and what an undercut on the car ahead would need. Clamped data only.

import { memo, useMemo, useState } from 'react'
import type { ClampedSession } from '../replay/clamp'
import { driverColor } from '../race/analysis'

interface Props {
  clamped: ClampedSession
  selected: number[]
}

interface Standing {
  driver: number
  gtl: number // numeric gap to leader
  interval: number | null
}

function PitWindow({ clamped, selected }: Props) {
  const [pitLossOverride, setPitLossOverride] = useState<string>('')

  // median observed pit-lane time + 3s for the slow-down/speed-up delta
  const defaultPitLoss = useMemo(() => {
    const durs = clamped.pits
      .map((p) => p.pit_duration)
      .filter((d): d is number => d != null && d > 5 && d < 60)
      .sort((a, b) => a - b)
    if (!durs.length) return 20
    return Math.round((durs[Math.floor(durs.length / 2)] + 3) * 10) / 10
  }, [clamped.pits])

  const pitLoss = pitLossOverride !== '' ? Number(pitLossOverride) : defaultPitLoss
  const noStopsYet = clamped.pits.length === 0

  const standings: Standing[] = useMemo(() => {
    const last = new Map<number, Standing>()
    for (const r of clamped.intervals) {
      if (typeof r.gap_to_leader === 'number') {
        last.set(r.driver_number, {
          driver: r.driver_number,
          gtl: r.gap_to_leader,
          interval: typeof r.interval === 'number' ? r.interval : null,
        })
      }
    }
    return [...last.values()].sort((a, b) => a.gtl - b.gtl)
  }, [clamped.intervals])

  const acr = (n: number) => clamped.drivers.find((d) => d.driver_number === n)?.name_acronym ?? String(n)

  const rows = useMemo(() => {
    return selected
      .map((n) => {
        const me = standings.find((s) => s.driver === n)
        if (!me) return null
        const idx = standings.indexOf(me)
        const ahead = idx > 0 ? standings[idx - 1] : null
        const newGtl = me.gtl + pitLoss
        const rejoinPos = standings.filter((s) => s.driver !== n && s.gtl < newGtl).length + 1
        const traffic = standings.filter((s) => s.driver !== n && Math.abs(s.gtl - newGtl) < 3)
        const gapToAhead = ahead ? me.gtl - ahead.gtl : null
        return { n, me, newGtl, rejoinPos, traffic, ahead, gapToAhead }
      })
      .filter((x): x is NonNullable<typeof x> => x != null)
  }, [selected, standings, pitLoss])

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Pit window</h3>
        <span className="spacer" />
        <label className="pitloss num">
          pit loss{' '}
          <input
            type="number"
            step={0.5}
            min={5}
            value={pitLossOverride !== '' ? pitLossOverride : defaultPitLoss}
            onChange={(e) => setPitLossOverride(e.target.value)}
            style={{ width: 58 }}
          />
          s{noStopsYet && <span className="hint"> (no stops seen yet)</span>}
        </label>
      </div>
      <div className="panel-body">
        {rows.length === 0 ? (
          <div className="placeholder">Select drivers to project pit stops.</div>
        ) : (
          <div className="pitrows">
            {rows.map(({ n, rejoinPos, traffic, ahead, gapToAhead }) => {
              const d = clamped.drivers.find((x) => x.driver_number === n)
              return (
                <div key={n} className="pitrow">
                  <span className="teambar" style={{ background: driverColor(d?.team_colour) }} />
                  <span className="who num">{acr(n)}</span>
                  <span className="proj num">
                    pits now → ~P{rejoinPos}
                    {traffic.length > 0 && (
                      <span className="traffic"> near {traffic.map((s) => acr(s.driver)).join(', ')}</span>
                    )}
                    {traffic.length === 0 && <span className="clear-air"> clear air</span>}
                  </span>
                  {ahead && gapToAhead != null && (
                    <span className="undercut num">
                      undercut {acr(ahead.driver)}: needs &gt;{gapToAhead.toFixed(1)}s over 1 lap
                      {gapToAhead < 2.5 && <span className="viable"> ●</span>}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default memo(PitWindow)
