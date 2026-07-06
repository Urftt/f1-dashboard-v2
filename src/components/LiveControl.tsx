// LIVE mode: pins the replay clock a few seconds behind wall time and
// re-polls the mutable datasets through the same rate-limited queue.
//
// The OpenF1 free tier may serve session data with delay (unverified against
// a live session — paid tier is documented as real-time). The banner is
// honest about it; if no data flows, the panels stay in their empty states.

import { useEffect, useState } from 'react'
import type { Session } from '../api/types'
import { refreshLiveDatasets } from '../data/sessionStore'
import { useClock } from '../replay/ClockContext'

const SAFETY_LAG_MS = 5_000
const FAST_POLL_MS = 30_000 // intervals + positions
const SLOW_POLL_MS = 60_000 // laps, stints, pits, race control

export function isSessionLiveNow(s: Session): boolean {
  const now = Date.now()
  return (
    now >= new Date(s.date_start).getTime() - 10 * 60_000 &&
    now <= new Date(s.date_end).getTime() + 30 * 60_000
  )
}

export default function LiveControl({ session }: { session: Session }) {
  const { syncTo, setMode } = useClock()
  const [live, setLive] = useState(false)

  useEffect(() => {
    if (!live) return
    setMode('replay')
    syncTo(Date.now() - SAFETY_LAG_MS)

    const fast = setInterval(() => {
      refreshLiveDatasets(session, ['intervals', 'positions'])
    }, FAST_POLL_MS)
    const slow = setInterval(() => {
      refreshLiveDatasets(session, ['laps', 'stints', 'pits', 'raceControl'])
    }, SLOW_POLL_MS)
    refreshLiveDatasets(session, ['intervals', 'positions', 'laps', 'stints', 'pits', 'raceControl'])

    return () => {
      clearInterval(fast)
      clearInterval(slow)
    }
  }, [live, session, syncTo, setMode])

  return (
    <div className="livebar">
      <button className={live ? 'live-on' : ''} onClick={() => setLive((v) => !v)}>
        {live ? '◉ LIVE' : '◎ Go live'}
      </button>
      {live && (
        <span className="live-note">
          polling OpenF1 · free-tier data can lag the broadcast — if nothing appears, the session
          feed isn’t public yet
        </span>
      )}
    </div>
  )
}
