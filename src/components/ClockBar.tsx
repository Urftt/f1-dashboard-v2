// Replay clock controls: mode toggle, sync anchors, transport, status.
// Keyboard: space = play/pause, ←/→ = ±5s, shift+←/→ = ±30s, L = lights out.

import { useEffect, useMemo, useState } from 'react'
import { useClock } from '../replay/ClockContext'
import { lapStartTime, type ClampedSession, type PreparedSession } from '../replay/clamp'

function fmtElapsed(ms: number): string {
  const sign = ms < 0 ? '−' : '+'
  const s = Math.floor(Math.abs(ms) / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(sec).padStart(2, '0')
  return h > 0 ? `${sign}${h}:${mm}:${ss}` : `${sign}${mm}:${ss}`
}

interface Props {
  clamped: ClampedSession
  UNSAFE_prep: PreparedSession
}

export default function ClockBar({ clamped, UNSAFE_prep }: Props) {
  const { t, playing, mode, syncTo, play, pause, nudge, setMode } = useClock()
  const [syncOpen, setSyncOpen] = useState(false)
  const [syncDriver, setSyncDriver] = useState<number | ''>('')
  const [syncLap, setSyncLap] = useState('')

  const replay = mode === 'replay'
  const synced = t != null

  // leader-by-laps at T, for lap-based nudges
  const leaderLaps = useMemo(() => {
    if (!synced) return null
    let best: { laps: number; driver: number } | null = null
    for (const [driver, last] of clamped.lastLapByDriver) {
      if (!best || last > best.laps) best = { laps: last, driver }
    }
    return best ? (UNSAFE_prep.lapsByDriver.get(best.driver) ?? null) : null
  }, [clamped, UNSAFE_prep, synced])

  const nudgeLap = (dir: 1 | -1) => {
    if (t == null || !leaderLaps) return
    if (dir === 1) {
      const next = leaderLaps.find((l) => l.startMs != null && l.startMs > t)
      if (next?.startMs != null) syncTo(next.startMs + 500, { play: playing })
    } else {
      const prevs = leaderLaps.filter((l) => l.startMs != null && l.startMs < t - 2000)
      const prev = prevs[prevs.length - 1]
      if (prev?.startMs != null) syncTo(prev.startMs + 500, { play: playing })
    }
  }

  const lightsOut = () => {
    if (UNSAFE_prep.raceStartMs != null) syncTo(UNSAFE_prep.raceStartMs - 1000)
    else if (UNSAFE_prep.firstDataMs != null) syncTo(UNSAFE_prep.firstDataMs)
  }

  const doManualSync = () => {
    if (syncDriver === '' || !syncLap) return
    const start = lapStartTime(UNSAFE_prep, Number(syncDriver), Number(syncLap))
    if (start != null) {
      syncTo(start)
      setSyncOpen(false)
    }
  }

  const isRace = clamped.session.session_type === 'Race'
  const startMs = UNSAFE_prep.raceStartMs ?? UNSAFE_prep.firstDataMs
  const elapsed = synced && startMs != null ? t - startMs : null

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) return
      if (mode !== 'replay') return
      if (e.code === 'Space') {
        e.preventDefault()
        if (t != null) (playing ? pause : play)()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        nudge(e.shiftKey ? -30_000 : -5_000)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        nudge(e.shiftKey ? 30_000 : 5_000)
      } else if (e.key === 'l' || e.key === 'L') {
        lightsOut()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, playing, t == null, UNSAFE_prep])

  return (
    <div className="clockbar">
      <div className="seg">
        <button className={replay ? 'toggled' : ''} onClick={() => setMode('replay')}>
          Replay
        </button>
        <button
          className={!replay ? 'toggled' : ''}
          onClick={() => setMode('full')}
          title="Show the complete session — spoilers!"
        >
          Full session
        </button>
      </div>

      {replay && (
        <>
          <span className="sep" />
          <button className="primary" onClick={lightsOut} title="Sync to session start">
            ● {isRace ? 'Lights out' : 'Session start'}
          </button>
          <button className={syncOpen ? 'toggled' : ''} onClick={() => setSyncOpen((v) => !v)}>
            Sync…
          </button>

          {syncOpen && (
            <span className="syncform">
              <select
                value={syncDriver}
                onChange={(e) => setSyncDriver(Number(e.target.value))}
                aria-label="Sync driver"
              >
                <option value="" disabled>
                  Driver
                </option>
                {clamped.drivers.map((d) => (
                  <option key={d.driver_number} value={d.driver_number}>
                    {d.name_acronym}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                placeholder="lap #"
                value={syncLap}
                onChange={(e) => setSyncLap(e.target.value)}
                style={{ width: 64 }}
                aria-label="Sync lap number"
              />
              <button className="primary" onClick={doManualSync}>
                Go
              </button>
              <span className="hint">just started this lap</span>
            </span>
          )}

          <span className="sep" />
          <span className="transport">
            <button onClick={() => nudgeLap(-1)} disabled={!synced} title="Back one lap">
              −1L
            </button>
            <button onClick={() => nudge(-30_000)} disabled={!synced}>
              −30s
            </button>
            <button onClick={() => nudge(-5_000)} disabled={!synced}>
              −5s
            </button>
            <button
              onClick={playing ? pause : play}
              disabled={!synced}
              style={{ minWidth: 52 }}
              title="Space"
            >
              {playing ? '❚❚' : '▶'}
            </button>
            <button onClick={() => nudge(5_000)} disabled={!synced}>
              +5s
            </button>
            <button onClick={() => nudge(30_000)} disabled={!synced}>
              +30s
            </button>
            <button onClick={() => nudgeLap(1)} disabled={!synced} title="Forward one lap">
              +1L
            </button>
          </span>

          <span className="spacer" />
          <span className="status num">
            {!synced && 'not synced'}
            {synced && elapsed != null && elapsed < 0 && `start in ${fmtElapsed(-elapsed).slice(1)}`}
            {synced && elapsed != null && elapsed >= 0 && (
              <>
                {isRace && <>LAP {clamped.currentLap} · </>}
                {fmtElapsed(elapsed)}
              </>
            )}
            {synced && elapsed == null && 'synced'}
            {synced && !playing && <span className="paused"> · PAUSED</span>}
          </span>
        </>
      )}

      {!replay && (
        <>
          <span className="spacer" />
          <span className="status spoiler-note">full session visible — spoilers</span>
        </>
      )}
    </div>
  )
}
