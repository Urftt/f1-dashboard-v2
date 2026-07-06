import { useEffect } from 'react'
import { useWeekend } from '../data/WeekendContext'
import { ensureSessionLoaded, useSessionEntry } from '../data/sessionStore'
import { useClampedSession } from '../replay/useClampedSession'
import LoadingChecklist from '../components/LoadingChecklist'
import ClockBar from '../components/ClockBar'
import DriverSelect, { useSelectedDrivers } from '../components/DriverSelect'
import LapChart from '../components/LapChart'

export default function RacePage() {
  const { sessions, meeting, loading, error } = useWeekend()
  const race = sessions.find((s) => s.session_name === 'Race') ?? null

  useEffect(() => {
    if (race) ensureSessionLoaded(race)
  }, [race])

  const entry = useSessionEntry(race?.session_key ?? null)
  const { clamped, UNSAFE_prep } = useClampedSession(race)
  const [selected, setSelected] = useSelectedDrivers()

  if (error) return <div className="placeholder">{error}</div>
  if (loading || !meeting) return <div className="placeholder">Loading weekend…</div>
  if (!race) return <div className="placeholder">No race session in this weekend.</div>
  if (!clamped || !UNSAFE_prep) {
    return entry ? <LoadingChecklist entry={entry} /> : <div className="placeholder">Preparing…</div>
  }

  return (
    <div>
      <ClockBar clamped={clamped} UNSAFE_prep={UNSAFE_prep} />
      <DriverSelect drivers={clamped.drivers} selected={selected} onChange={setSelected} />
      <div className="race-grid">
        <div className="left">
          <LapChart clamped={clamped} selected={selected} />
        </div>
        <div className="right">
          <div className="panel">
            <div className="panel-head">
              <h3>Timing</h3>
            </div>
            <div className="placeholder">Timing board — phase 5</div>
          </div>
        </div>
      </div>
    </div>
  )
}
