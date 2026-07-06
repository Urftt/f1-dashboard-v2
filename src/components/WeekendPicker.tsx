import { CURRENT_SEASON, FIRST_SEASON, useWeekend } from '../data/WeekendContext'

export default function WeekendPicker() {
  const { year, setYear, meetings, meeting, setMeetingKey } = useWeekend()

  const years = []
  for (let y = CURRENT_SEASON; y >= FIRST_SEASON; y--) years.push(y)

  // hide pre-season testing from the picker; it has no race weekend structure
  const raceMeetings = meetings.filter((m) => !/test/i.test(m.meeting_name))

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <select value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Season">
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
      <select
        value={meeting?.meeting_key ?? ''}
        onChange={(e) => setMeetingKey(Number(e.target.value))}
        aria-label="Race weekend"
        style={{ minWidth: 220 }}
      >
        {meeting == null && <option value="">Select weekend…</option>}
        {raceMeetings.map((m) => (
          <option key={m.meeting_key} value={m.meeting_key}>
            {m.meeting_name} — {m.location}
          </option>
        ))}
      </select>
    </div>
  )
}
