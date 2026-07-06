# Pitwall

A spoiler-safe Formula 1 dashboard for watching races — replayed or live — on
a laptop next to the TV. Data comes straight from the free
[OpenF1 API](https://openf1.org); no backend, no build-time data.

## Run it

```sh
npm install
npm run dev        # http://localhost:5173
npm run smoke      # golden-fixture test against the live OpenF1 API
npm run build      # production build in dist/
```

## How replay sync works

Pick a race weekend (the latest completed one auto-loads). The **Race** page
starts in **Replay** mode with nothing visible — no spoilers on screen, ever,
until the virtual clock reaches them.

- **● Lights out** — press it the moment the race starts on your screen.
- **Sync…** — mid-race resync: pick a driver + the lap they just started
  (read it from the TV graphics) and hit Go.
- Nudge buttons / **←→** keys (±5 s, shift = ±30 s), **space** = pause,
  **L** = lights out. ±1L jumps one leader-lap.
- The clock survives page reloads (per tab).

**Full session** mode drops the clamp and shows everything — it's labeled
with a spoiler warning.

### The spoiler model

All session data is fetched once and clamped to the virtual clock in a single
place (`src/replay/clamp.ts`): laps appear only once *completed*, stints are
truncated so a stint's end can't reveal the next pit stop, chart axes grow
with the data instead of being pre-scaled to the race distance, and the final
classification endpoint is never fetched in replay mode.

## Pages

- **Race** — lap-time chart (tyre-compound dots, in/out + SC/VSC laps
  filterable), pairwise gap chart with closing-rate projection, lap-by-lap
  position chart, whole-field tyre-strategy timeline, timing board
  (interval ↔ gap-to-leader, grid +/−, gain/lose trend arrows), race-control
  feed, pit-window/undercut panel, live track/air temperature. Sprint
  sessions get their own tab on sprint weekends. A **Go live** toggle appears
  while a session is actually running (OpenF1's free tier may lag the
  broadcast).
- **Qualifying** — Q1/Q2/Q3 classification with elimination cutoffs and a
  flying-lap evolution chart. Replayable like the race.
- **Practice** — long-run detection, race-pace vs best-lap table, tyre
  degradation scatter with per-driver/compound fits.

## Notes

- OpenF1 coverage starts in 2023; the free tier rate-limits aggressively, so
  all requests go through one paced queue (`src/api/queue.ts`) and completed
  sessions are cached in IndexedDB — a weekend is only downloaded once.
- Timing data (gaps/intervals) exists for races only; qualifying and practice
  views are built from lap and stint data.
