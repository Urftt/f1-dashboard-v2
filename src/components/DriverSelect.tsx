// Driver multi-select chips, colored by team. Selection lives in the URL
// (?d=1,63) so reloads keep it. Teammate #2 gets a dashed underline to match
// the dashed chart line.

import { memo, useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { Driver } from '../api/types'
import { driverColor } from '../race/analysis'

export type SelectedUpdater = number[] | ((cur: number[]) => number[])

function parseSelected(raw: string | null): number[] {
  if (!raw) return []
  return raw
    .split(',')
    .map(Number)
    .filter((n) => Number.isFinite(n))
}

export function useSelectedDrivers(): [number[], (next: SelectedUpdater) => void] {
  const [params, setParams] = useSearchParams()
  const selected = useMemo(() => parseSelected(params.get('d')), [params])

  // functional updater reads the CURRENT params so rapid clicks don't lose
  // each other's updates; useCallback keeps the identity stable so memoized
  // panels don't re-render on every clock tick
  const set = useCallback(
    (next: SelectedUpdater) => {
      setParams(
        (p) => {
          const np = new URLSearchParams(p)
          const resolved = typeof next === 'function' ? next(parseSelected(np.get('d'))) : next
          if (resolved.length) np.set('d', resolved.join(','))
          else np.delete('d')
          return np
        },
        { replace: true },
      )
    },
    [setParams],
  )
  return [selected, set]
}

/** true for the second car of a team, to dash its line in charts */
export function isSecondCar(drivers: Driver[], driverNumber: number): boolean {
  const d = drivers.find((x) => x.driver_number === driverNumber)
  if (!d?.team_name) return false
  const teamCars = drivers
    .filter((x) => x.team_name === d.team_name)
    .map((x) => x.driver_number)
    .sort((a, b) => a - b)
  return teamCars.indexOf(driverNumber) === 1
}

interface Props {
  drivers: Driver[]
  selected: number[]
  onChange: (next: SelectedUpdater) => void
}

export default memo(function DriverSelect({ drivers, selected, onChange }: Props) {
  const sorted = [...drivers].sort((a, b) => {
    const t = (a.team_name ?? '').localeCompare(b.team_name ?? '')
    return t !== 0 ? t : a.driver_number - b.driver_number
  })

  const toggle = (n: number) => {
    onChange((cur) => (cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n]))
  }

  return (
    <div className="driver-select">
      {sorted.map((d) => {
        const on = selected.includes(d.driver_number)
        const color = driverColor(d.team_colour)
        return (
          <button
            key={d.driver_number}
            className={`chip num${on ? ' on' : ''}`}
            style={on ? { borderColor: color, color } : undefined}
            onClick={() => toggle(d.driver_number)}
            title={d.full_name}
          >
            <span
              className="swatch"
              style={{
                background: color,
                opacity: on ? 1 : 0.35,
              }}
            />
            {d.name_acronym}
          </button>
        )
      })}
      {selected.length > 0 && (
        <button className="chip clear" onClick={() => onChange([])}>
          clear
        </button>
      )}
    </div>
  )
})
