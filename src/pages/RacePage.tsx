import { useEffect } from 'react'
import { useWeekend } from '../data/WeekendContext'
import { ensureSessionLoaded, useSessionEntry } from '../data/sessionStore'
import { useClampedSession } from '../replay/useClampedSession'
import LoadingChecklist from '../components/LoadingChecklist'
import ClockBar from '../components/ClockBar'

export default function RacePage() {
  const { sessions, meeting, loading, error } = useWeekend()
  const race = sessions.find((s) => s.session_name === 'Race') ?? null

  useEffect(() => {
    if (race) ensureSessionLoaded(race)
  }, [race])

  const entry = useSessionEntry(race?.session_key ?? null)
  const { clamped, UNSAFE_prep } = useClampedSession(race)

  if (error) return <div className="placeholder">{error}</div>
  if (loading || !meeting) return <div className="placeholder">Loading weekend…</div>
  if (!race) return <div className="placeholder">No race session in this weekend.</div>
  if (!clamped || !UNSAFE_prep) {
    return entry ? <LoadingChecklist entry={entry} /> : <div className="placeholder">Preparing…</div>
  }

  return (
    <div>
      <ClockBar clamped={clamped} UNSAFE_prep={UNSAFE_prep} />
      {/* debug readout — replaced by charts in later phases */}
      <div className="placeholder num">
        visible: {clamped.laps.length} laps · {clamped.intervals.length} intervals ·{' '}
        {clamped.pits.length} pit stops · {clamped.raceControl.length} RC msgs · lap{' '}
        {clamped.currentLap}
      </div>
    </div>
  )
}
