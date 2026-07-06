// Clamped race-control messages, newest first. Penalties and safety cars
// are exactly the things a broadcast under-reports.

import { useMemo } from 'react'
import type { ClampedSession } from '../replay/clamp'

const MAX_SHOWN = 40

function msgClass(category: string, message: string): string {
  if (/PENALTY|INVESTIGATION|DELETED|WARNING/i.test(message)) return 'rc-penalty'
  if (category === 'SafetyCar' || /SAFETY CAR|VSC/.test(message)) return 'rc-sc'
  if (/RED FLAG/.test(message)) return 'rc-red'
  if (/YELLOW/.test(message)) return 'rc-yellow'
  return ''
}

export default function RaceControlFeed({ clamped }: { clamped: ClampedSession }) {
  const msgs = useMemo(
    () =>
      clamped.raceControl
        .slice(-MAX_SHOWN)
        .reverse()
        .map((m, i) => ({ ...m, key: i })),
    [clamped.raceControl],
  )

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Race control</h3>
      </div>
      {msgs.length === 0 ? (
        <div className="placeholder">No messages yet.</div>
      ) : (
        <ul className="rc-feed num">
          {msgs.map((m) => (
            <li key={m.key} className={msgClass(m.category, m.message ?? '')}>
              <span className="rc-lap">{m.lap_number != null ? `L${m.lap_number}` : ''}</span>
              <span className="rc-msg">{m.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
