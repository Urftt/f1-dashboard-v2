// OpenF1 API row shapes. Fields observed against the live API 2026-07-06;
// almost everything can arrive null, so type accordingly.

export interface Meeting {
  meeting_key: number
  meeting_name: string
  meeting_official_name: string
  location: string
  country_name: string
  circuit_short_name: string
  date_start: string
  date_end?: string
  year: number
  is_cancelled?: boolean
}

export type SessionType = 'Practice' | 'Qualifying' | 'Race'

export interface Session {
  session_key: number
  session_type: SessionType
  session_name: string // "Practice 1", "Sprint Qualifying", "Race", ...
  date_start: string
  date_end: string
  meeting_key: number
  circuit_short_name: string
  country_name: string
  location: string
  year: number
  is_cancelled?: boolean
}

export interface Driver {
  driver_number: number
  name_acronym: string
  full_name: string
  broadcast_name: string
  team_name: string | null
  team_colour: string | null // hex without '#'
  headshot_url: string | null
}

export interface Lap {
  driver_number: number
  lap_number: number
  date_start: string | null
  lap_duration: number | null // seconds; null on lap 1 / aborted laps
  duration_sector_1: number | null
  duration_sector_2: number | null
  duration_sector_3: number | null
  is_pit_out_lap: boolean
  st_speed: number | null
}

export interface Stint {
  driver_number: number
  stint_number: number
  lap_start: number
  lap_end: number
  compound: string | null // SOFT | MEDIUM | HARD | INTERMEDIATE | WET | null
  tyre_age_at_start: number | null
}

export interface PitStop {
  driver_number: number
  date: string
  lap_number: number
  pit_duration: number | null // pit-lane time in seconds
}

export interface IntervalRow {
  driver_number: number
  date: string
  interval: number | string | null // to car ahead; "1 LAP" for lapped cars
  gap_to_leader: number | string | null
}

export interface RaceControlMsg {
  date: string
  lap_number: number | null
  category: string // "SafetyCar" | "Flag" | "Other" | ...
  flag: string | null
  scope: string | null
  message: string
  driver_number: number | null
  qualifying_phase: string | number | null
}

export interface PositionRow {
  driver_number: number
  date: string
  position: number
}

// Final classification — SPOILER. Only ever fetched in full-session mode.
export interface SessionResultRow {
  position: number | null
  driver_number: number
  number_of_laps: number
  dnf: boolean
  dns: boolean
  dsq: boolean
  duration: number | number[] | null
  gap_to_leader: number | string | null
}

/** Everything the app loads for one session. Raw = unclamped = spoilers. */
export interface RawSessionData {
  session: Session
  drivers: Driver[]
  laps: Lap[]
  stints: Stint[]
  pits: PitStop[]
  intervals: IntervalRow[]
  raceControl: RaceControlMsg[]
  positions: PositionRow[]
}

export type DatasetName = keyof Omit<RawSessionData, 'session'>
