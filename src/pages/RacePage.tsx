import { useEffect, useState } from 'react'
import { useWeekend } from '../data/WeekendContext'
import { ensureSessionLoaded, useSessionEntry } from '../data/sessionStore'
import { useClampedSession } from '../replay/useClampedSession'
import LoadingChecklist from '../components/LoadingChecklist'
import ClockBar from '../components/ClockBar'
import DriverSelect, { useSelectedDrivers } from '../components/DriverSelect'
import LapChart from '../components/LapChart'
import GapChart from '../components/GapChart'
import TimingBoard from '../components/TimingBoard'
import PitWindow from '../components/PitWindow'
import LiveControl, { isSessionLiveNow } from '../components/LiveControl'
import PositionChart from '../components/PositionChart'
import StrategyTimeline from '../components/StrategyTimeline'
import RaceControlFeed from '../components/RaceControlFeed'
import { useClock } from '../replay/ClockContext'

export default function RacePage() {
  const { sessions, meeting, loading, error } = useWeekend()
  // sprint weekends have two race-type sessions: Sprint and Race
  const raceSessions = sessions.filter((s) => s.session_type === 'Race')
  const [pick, setPick] = useState<number | null>(null)
  const race =
    raceSessions.find((s) => s.session_key === pick) ??
    raceSessions.find((s) => s.session_name === 'Race') ??
    raceSessions[0] ??
    null

  useEffect(() => {
    if (race) ensureSessionLoaded(race)
  }, [race])

  const entry = useSessionEntry(race?.session_key ?? null)
  const { clamped, UNSAFE_prep } = useClampedSession(race)
  const [selected, setSelected] = useSelectedDrivers()
  const { t, mode } = useClock()

  if (error) return <div className="placeholder">{error}</div>
  if (loading || !meeting) return <div className="placeholder">Loading weekend…</div>
  if (!race) return <div className="placeholder">No race session in this weekend.</div>
  if (!clamped || !UNSAFE_prep) {
    return entry ? <LoadingChecklist entry={entry} /> : <div className="placeholder">Preparing…</div>
  }

  return (
    <div>
      <ClockBar clamped={clamped} UNSAFE_prep={UNSAFE_prep} />
      <div className="race-toolbar">
        {raceSessions.length > 1 && (
          <div className="subtabs">
            {raceSessions.map((s) => (
              <button
                key={s.session_key}
                className={s.session_key === race.session_key ? 'toggled' : ''}
                onClick={() => setPick(s.session_key)}
              >
                {s.session_name}
              </button>
            ))}
          </div>
        )}
        {isSessionLiveNow(race) && <LiveControl session={race} />}
      </div>
      <DriverSelect drivers={clamped.drivers} selected={selected} onChange={setSelected} />
      <div className="race-grid">
        <div className="left">
          <LapChart clamped={clamped} selected={selected} />
          <GapChart clamped={clamped} selected={selected} />
          <PositionChart clamped={clamped} selected={selected} />
        </div>
        <div className="right">
          <TimingBoard
            clamped={clamped}
            t={mode === 'full' ? null : t}
            selected={selected}
            onSelect={setSelected}
          />
          <PitWindow clamped={clamped} selected={selected} />
          <RaceControlFeed clamped={clamped} />
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <StrategyTimeline clamped={clamped} selected={selected} onSelect={setSelected} />
      </div>
    </div>
  )
}
