// Golden-fixture smoke test against the live OpenF1 API.
// Fixtures: Melbourne 2026 (meeting 1279), verified 2026-07-06.
// Run: npm run smoke

const BASE = 'https://api.openf1.org/v1'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let pass = 0
let fail = 0

function check(name, cond, detail = '') {
  if (cond) {
    pass++
    console.log(`PASS  ${name}`)
  } else {
    fail++
    console.error(`FAIL  ${name}  ${detail}`)
  }
}

async function get(path) {
  await sleep(600)
  const res = await fetch(`${BASE}/${path}`)
  if (res.status === 429) {
    await sleep(3000)
    return get(path)
  }
  if (!res.ok) throw new Error(`${res.status} on ${path}`)
  return res.json()
}

const sessions = await get('sessions?meeting_key=1279')
check(
  'sessions: Melbourne 2026 has 5 sessions incl. Race 11234',
  sessions.length === 5 && sessions.some((s) => s.session_key === 11234),
  `got ${sessions.map((s) => s.session_key).join(',')}`,
)

const drivers = await get('drivers?session_key=11234')
// 2026 grid = 11 teams / 22 cars
check('drivers: 22 with team_colour', drivers.length === 22 && drivers.every((d) => d.team_colour), `got ${drivers.length}`)

const laps = await get('laps?session_key=11234')
check('laps: 1002 rows', laps.length === 1002, `got ${laps.length}`)
const nor2 = laps.find((l) => l.driver_number === 1 && l.lap_number === 2)
check('laps: NOR lap 2 = 86.863', nor2?.lap_duration === 86.863, `got ${nor2?.lap_duration}`)
const nor1 = laps.find((l) => l.driver_number === 1 && l.lap_number === 1)
check('laps: lap 1 is pit-out with null duration', nor1?.is_pit_out_lap === true && nor1?.lap_duration === null)

const stints = await get('stints?session_key=11234&driver_number=1')
check(
  'stints: NOR M(1-10) H(11-33) M(34-58)',
  stints.length === 3 &&
    stints[0].compound === 'MEDIUM' &&
    stints[0].lap_end === 10 &&
    stints[1].compound === 'HARD' &&
    stints[1].lap_end === 33 &&
    stints[2].compound === 'MEDIUM',
  JSON.stringify(stints.map((s) => [s.compound, s.lap_start, s.lap_end])),
)

const pits = await get('pit?session_key=11234&driver_number=1')
check(
  'pit: NOR stops on laps 11 and 34',
  pits.length === 2 && pits[0].lap_number === 11 && pits[1].lap_number === 34,
  JSON.stringify(pits.map((p) => p.lap_number)),
)

const rc = await get('race_control?session_key=11234')
check(
  'race_control: contains VSC DEPLOYED',
  rc.some((m) => m.category === 'SafetyCar' && /VSC DEPLOYED/.test(m.message)),
)

const intervals = await get('intervals?session_key=11234&driver_number=1')
check('intervals: >1000 rows for one driver', intervals.length > 1000, `got ${intervals.length}`)
check(
  'intervals: rows carry date + gap_to_leader',
  intervals.every((r) => r.date != null) && intervals.some((r) => typeof r.gap_to_leader === 'number'),
)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
