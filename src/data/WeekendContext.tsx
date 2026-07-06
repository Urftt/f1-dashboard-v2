// Global race-weekend selection: year -> meeting -> its sessions.
// Selection is kept in the URL (?m=<meeting_key>) so reloads restore it.
// With no selection, auto-picks the most recent weekend with a finished race.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useSearchParams } from 'react-router-dom'
import { getMeetings, getSessionsOfMeeting, getSessionsOfYear, isSessionFinished } from '../api/openf1'
import type { Meeting, Session } from '../api/types'

export const FIRST_SEASON = 2023 // OpenF1 coverage starts here
export const CURRENT_SEASON = new Date().getFullYear()

interface WeekendState {
  year: number
  setYear: (y: number) => void
  meetings: Meeting[]
  meeting: Meeting | null
  setMeetingKey: (mk: number) => void
  sessions: Session[]
  loading: boolean
  error: string | null
}

const Ctx = createContext<WeekendState | null>(null)

export function WeekendProvider({ children }: { children: ReactNode }) {
  const [params, setParams] = useSearchParams()
  const meetingKey = params.get('m') ? Number(params.get('m')) : null

  const [year, setYear] = useState<number>(CURRENT_SEASON)
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const setMeetingKey = useCallback(
    (mk: number) => {
      setParams(
        (p) => {
          const next = new URLSearchParams(p)
          next.set('m', String(mk))
          return next
        },
        { replace: false },
      )
    },
    [setParams],
  )

  // Auto-pick the latest weekend with a finished race when nothing selected.
  useEffect(() => {
    if (meetingKey != null) return
    let cancelled = false
    ;(async () => {
      try {
        for (const y of [CURRENT_SEASON, CURRENT_SEASON - 1]) {
          const all = await getSessionsOfYear(y)
          const races = all
            .filter((s) => s.session_name === 'Race' && isSessionFinished(s))
            .sort((a, b) => a.date_start.localeCompare(b.date_start))
          if (races.length && !cancelled) {
            setYear(y)
            setMeetingKey(races[races.length - 1].meeting_key)
            return
          }
        }
        if (!cancelled) setError('No completed race weekends found')
      } catch (e) {
        if (!cancelled) setError(`Failed to find latest race: ${String(e)}`)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [meetingKey, setMeetingKey])

  // Meetings list for the year dropdown.
  useEffect(() => {
    let cancelled = false
    getMeetings(year)
      .then((ms) => {
        if (!cancelled) setMeetings(ms)
      })
      .catch((e) => {
        if (!cancelled) setError(`Failed to load ${year} calendar: ${String(e)}`)
      })
    return () => {
      cancelled = true
    }
  }, [year])

  // Sessions of the selected meeting.
  useEffect(() => {
    if (meetingKey == null) return
    let cancelled = false
    setLoading(true)
    getSessionsOfMeeting(meetingKey)
      .then((ss) => {
        if (cancelled) return
        setSessions(ss)
        setLoading(false)
        setError(null)
        // keep the year dropdown in sync when restored from URL
        if (ss.length && ss[0].year !== year) setYear(ss[0].year)
      })
      .catch((e) => {
        if (cancelled) return
        setError(`Failed to load weekend: ${String(e)}`)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingKey])

  const meeting = useMemo(
    () => meetings.find((m) => m.meeting_key === meetingKey) ?? null,
    [meetings, meetingKey],
  )

  const value: WeekendState = {
    year,
    setYear,
    meetings,
    meeting,
    setMeetingKey,
    sessions,
    loading: loading && meetingKey != null,
    error,
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useWeekend(): WeekendState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useWeekend outside WeekendProvider')
  return v
}
