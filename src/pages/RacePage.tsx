import { useEffect } from 'react'
import { useWeekend } from '../data/WeekendContext'
import { ensureSessionLoaded, isEntryComplete, useSessionEntry } from '../data/sessionStore'
import LoadingChecklist from '../components/LoadingChecklist'

export default function RacePage() {
  const { sessions, meeting, loading, error } = useWeekend()
  const race = sessions.find((s) => s.session_name === 'Race') ?? null

  useEffect(() => {
    if (race) ensureSessionLoaded(race)
  }, [race])

  const entry = useSessionEntry(race?.session_key ?? null)

  if (error) return <div className="placeholder">{error}</div>
  if (loading || !meeting) return <div className="placeholder">Loading weekend…</div>
  if (!race) return <div className="placeholder">No race session in this weekend.</div>
  if (!entry) return <div className="placeholder">Preparing…</div>
  if (!isEntryComplete(entry)) return <LoadingChecklist entry={entry} />

  return (
    <div className="placeholder">
      {meeting.meeting_name} — race data loaded ({entry.data.laps?.length} laps,{' '}
      {entry.data.intervals?.length} interval rows)
    </div>
  )
}
