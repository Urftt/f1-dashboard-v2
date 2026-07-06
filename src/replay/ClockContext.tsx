// The virtual session clock. One clock for the whole app.
//
// mode 'replay': every component sees data clamped to virtual time `t`.
// mode 'full':   no clamp — full session visible (post-race analysis).
//
// `t` advances in real time while playing, using performance.now() deltas so
// interval jitter and tab throttling cannot make it drift relative to the
// user's TV broadcast.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'

export type ClockMode = 'replay' | 'full'

interface ClockState {
  /** virtual time, ms since epoch; null = not synced yet */
  t: number | null
  playing: boolean
  mode: ClockMode
  syncTo: (tMs: number, opts?: { play?: boolean }) => void
  play: () => void
  pause: () => void
  nudge: (deltaMs: number) => void
  setMode: (m: ClockMode) => void
}

const Ctx = createContext<ClockState | null>(null)

// Survive accidental reloads mid-replay: the clock state is persisted per
// tab and restored with elapsed real time added back while playing.
const STORAGE_KEY = 'pitwall-clock'

interface StoredClock {
  t: number | null
  playing: boolean
  mode: ClockMode
  savedAt: number
}

function loadStored(): StoredClock | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as StoredClock
  } catch {
    return null
  }
}

export function ClockProvider({ children }: { children: ReactNode }) {
  const stored = useRef(loadStored()).current
  const [t, setT] = useState<number | null>(() =>
    stored?.t != null ? stored.t + (stored.playing ? Date.now() - stored.savedAt : 0) : null,
  )
  const [playing, setPlaying] = useState(stored?.playing ?? false)
  const [mode, setMode] = useState<ClockMode>(stored?.mode ?? 'replay')
  const lastReal = useRef<number>(0)

  useEffect(() => {
    if (!playing || t == null) return
    lastReal.current = performance.now()
    const id = setInterval(() => {
      const now = performance.now()
      const delta = now - lastReal.current
      lastReal.current = now
      setT((cur) => (cur == null ? cur : cur + delta))
    }, 500)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, t == null])

  useEffect(() => {
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ t, playing, mode, savedAt: Date.now() } satisfies StoredClock),
      )
    } catch {
      // storage full/unavailable — replay still works, just won't survive reload
    }
  }, [t, playing, mode])

  const syncTo = useCallback((tMs: number, opts?: { play?: boolean }) => {
    setT(tMs)
    if (opts?.play !== false) setPlaying(true)
  }, [])

  const play = useCallback(() => setPlaying(true), [])
  const pause = useCallback(() => setPlaying(false), [])
  const nudge = useCallback((deltaMs: number) => {
    setT((cur) => (cur == null ? cur : cur + deltaMs))
  }, [])

  return (
    <Ctx.Provider value={{ t, playing, mode, syncTo, play, pause, nudge, setMode }}>
      {children}
    </Ctx.Provider>
  )
}

export function useClock(): ClockState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useClock outside ClockProvider')
  return v
}
