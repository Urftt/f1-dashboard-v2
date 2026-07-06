import type { DatasetName } from '../api/types'
import { retryDataset, type SessionEntry } from '../data/sessionStore'

const LABELS: Record<DatasetName, string> = {
  drivers: 'Drivers',
  laps: 'Laps',
  stints: 'Stints',
  pits: 'Pit stops',
  raceControl: 'Race control',
  positions: 'Positions',
  intervals: 'Intervals',
}

export default function LoadingChecklist({ entry }: { entry: SessionEntry }) {
  const names = Object.keys(LABELS) as DatasetName[]
  return (
    <div className="panel" style={{ maxWidth: 360, margin: '48px auto' }}>
      <div className="panel-head">
        <h3>Loading {entry.session.session_name}</h3>
      </div>
      <div className="panel-body">
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
          {names.map((n) => {
            const st = entry.status[n]
            return (
              <li key={n} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  className="num"
                  style={{
                    width: 16,
                    color:
                      st === 'ready'
                        ? 'var(--green)'
                        : st === 'error'
                          ? 'var(--accent)'
                          : 'var(--text-faint)',
                  }}
                >
                  {st === 'ready' ? '✓' : st === 'error' ? '✕' : '·'}
                </span>
                <span style={{ flex: 1 }}>{LABELS[n]}</span>
                {st === 'error' && (
                  <button onClick={() => retryDataset(entry.session, n)}>Retry</button>
                )}
              </li>
            )
          })}
        </ul>
        <p style={{ color: 'var(--text-faint)', marginBottom: 0 }}>
          Requests are paced to respect the OpenF1 rate limit.
        </p>
      </div>
    </div>
  )
}
