# WARGAME 10 — F1 Race Dashboard (replay-first, spoiler-safe)

Wargamed 2026-07-06 against the live environment. Every "VERIFIED" fact below was
observed with real requests on that date. The executor follows this route move by
move. Do not improvise around a locked decision; improvise only inside a
counter-move or a marked fork.

---

## 0. Recon results (verified facts — build on these, do not re-litigate)

### Environment
- Repo `/Users/luckleineschaars/repos/f1-dashboard-v2` is empty: one commit, a
  Python-template `.gitignore`, a one-line README. No stack exists. You choose it
  (locked below). Append web/Node ignores to `.gitignore` (`node_modules/`,
  `dist/`, `*.local`); do not delete the Python section.
- Toolchain: node v25.8.1, npm 11.11.0, python 3.14.6. No pnpm/bun/yarn. macOS.

### Primary data source: OpenF1 (`https://api.openf1.org/v1/…`) — all VERIFIED
- **CORS is open** (`access-control-allow-origin: *`). The browser can call the
  API directly. **No backend and no proxy are needed.** Do not build a server.
- **2026 season data exists.** Melbourne 2026 meeting_key=1279 with sessions:
  FP1=11227, FP2=11228, FP3=11229, Quali=11230, Race=11234. These five keys are
  the golden fixtures for every verification run in §7.
- `laps?session_key=…` → per-lap rows with `date_start` (ISO), `lap_duration`
  (seconds, **null on lap 1 and often on aborted laps**), `is_pit_out_lap`,
  sector durations. Full race = 1002 rows, ~480 KB, fetched in ~0.3 s.
- `stints?session_key=…` → `compound` ("MEDIUM"/"HARD"/"SOFT"…), `lap_start`,
  `lap_end`, `tyre_age_at_start`. Available for race, quali AND practice.
- `pit?session_key=…` → pit events with `date`, `lap_number`, `pit_duration`
  (pit-lane time, seconds).
- `intervals?session_key=…` → `date`, `interval` (to car ahead, **null for the
  leader and during some phases**), `gap_to_leader` (0 for leader; can also be a
  string like `"1 LAP"` for lapped cars — parse defensively). ~4 s cadence,
  22,276 rows / ~3.2 MB for the full race, fetched in ~1.8 s. Race sessions only.
- `race_control?session_key=…` → 169 rows for the race, includes
  `category: "SafetyCar"` with messages `"VSC DEPLOYED"`, `"VSC ENDING"`,
  `"SAFETY CAR DEPLOYED"`, etc., each with `date` and `lap_number`. Also carries
  a `qualifying_phase` field usable to split Q1/Q2/Q3.
- `position?session_key=…` → timestamped position-change events (starting grid
  events appear pre-race; row count small).
- `drivers?session_key=…` → `driver_number`, `name_acronym`, `full_name`,
  `team_name`, `team_colour` (hex without `#`), `headshot_url`. Use
  `team_colour` for all driver line colors.
- `session_result?session_key=…` → **final classification. This is the spoiler
  endpoint. It must never be fetched while a race session is in replay mode.**
- **Rate limiting is aggressive**: a burst of 8 requests produced
  `200,404,200,429,429,429,404,404` — 429s begin around the 4th rapid request.
  No `Retry-After` header observed. Consequence: every API call must go through
  one serialized queue (locked decision D4).

### Secondary source: Jolpica-Ergast (`https://api.jolpi.ca/ergast/f1/…`) — VERIFIED
- Alive, CORS `*`, has the 2026 schedule. Use only as fallback for
  season/schedule metadata. Its results endpoints are spoilers — never in replay.

### Golden fixture values (Melbourne 2026 Race, session_key=11234) — VERIFIED
- Driver #1 is Lando NORRIS (champion's number in 2026 — don't assume Verstappen).
- Driver 1 stints: MEDIUM laps 1–10, HARD 11–33, MEDIUM 34–58.
- Driver 1 pit stops: lap 11 (18.2 s) and lap 34 (17.6 s).
- Driver 1 lap 2 `lap_duration` = 86.863; lap 1 has `is_pit_out_lap: true` and
  `lap_duration: null`.
- VSC deployed at lap 12 and lap 18 (race_control).
- Race start: first lap `date_start` ≈ `2026-03-08T04:03:26Z`.
- **Spoiler facts, for the spoiler test ONLY (§7 V6): final top 3 =
  driver 63 (P1), 12 (P2), 16 (P3). These numbers must be impossible to derive
  from the UI when the replay clock sits mid-race.**
- Quali 11230: driver 1 has 26 lap rows, representative flyer 79.475 s.

---

## 1. Locked decisions (the route)

- **D1 — Stack:** Vite + React + TypeScript, client-only SPA. No backend. React
  Router (two extra pages: Quali, Practice). State via plain React context +
  hooks; no Redux/Zustand.
- **D2 — Charts:** Recharts. If the pairwise-gap chart stutters with full-race
  interval data, downsample (fork F3) — do not switch libraries.
- **D3 — Cache:** `idb-keyval` for per-session API payload caching (intervals
  are 3.2 MB; localStorage's ~5 MB quota would overflow — do not use it).
  Cache key = `{endpoint}:{session_key}`. Completed sessions are immutable →
  cache forever; refetch only when the session's `date_end` is in the future.
- **D4 — Rate limiter:** a single module `src/api/queue.ts`. All fetches pass
  through it. Serialized, minimum 500 ms spacing, on 429 exponential backoff
  (1 s, 2 s, 4 s, 8 s + jitter, max 5 tries). Nothing anywhere else may call
  `fetch` to openf1.
- **D5 — Spoiler safety model:** fetch the **whole** session's data once into
  memory/IDB (spoilers exist in memory — acceptable; they must never render).
  A single `SessionClock` holds virtual time `T`. One clamp function
  `clampToClock(rows, T)` filters any timestamped array to `date <= T`.
  **Every component receives only clamped data** from a central
  `useClampedSession()` hook. Components never import raw fetch results.
  Additional spoiler rules the clamp alone doesn't cover:
  - Never fetch/render `session_result` while a Race/Sprint session is replayed.
  - Total lap count is a spoiler: axis domains grow with the data seen so far
    (`domain={[1, 'dataMax']}`), never pre-scaled to the final lap.
  - Laps rows are clamped by lap **completion** time (`date_start` of the NEXT
    lap, or `date_start + lap_duration`) — clamping laps by `date_start` leaks
    the current lap's time before it is set.
  - Stints are truncated: a stint row with `lap_end` beyond the last clamped lap
    renders as ending at the last seen lap (its true `lap_end` reveals the next
    pit stop).
  - Retirements/crashes ahead of `T` must not appear (they're in race_control —
    the clamp covers it, but don't build any "drivers still running" count off
    unclamped arrays).
- **D6 — Sync UX:** two anchors. (a) "Lights out now" button → sets
  `T = min(lap 1 date_start across drivers)` and starts the clock at 1×.
  (b) Mid-race sync: user picks a driver + lap number they just saw start
  ("VER just started lap 23") → `T = that lap's date_start`. Plus nudge buttons
  (±5 s, ±30 s, ±1 lap of the reference driver) and pause/play. No free-scrub
  timeline slider spanning the whole race (its right edge = race length =
  spoiler).
- **D7 — Live mode:** same rendering path; the clock runs at wall-time and the
  data layer re-polls mutable endpoints. Feature-flagged and built LAST
  (phase 9); it degrades to "delayed replay" if the free tier lags (fork F5).
- **D8 — Look:** dark theme, near-black background, one accent per driver from
  `team_colour`, `tabular-nums` monospace for all timing figures, compact
  spacing, no gradients/glassmorphism/emoji. Timing-wall aesthetic, not a SaaS
  landing page.

---

## 2. Battle plan — moves

Conventions: each move = **Do → Expect → If it fails**. Commit after every
green move (small commits, `feat:`/`fix:` prefixes). Run the app with
`preview_start` (create `.claude/launch.json` in move 0.3) and verify visually
with `preview_snapshot`/`preview_inspect`, not screenshots alone.

### Phase 0 — Scaffold

**0.1** `npm create vite@latest . -- --template react-ts` (repo root; if it
refuses a non-empty dir, scaffold into `/tmp` and copy over, preserving
`.git/` and merging `.gitignore`). Then `npm install`, plus
`npm i react-router-dom recharts idb-keyval`.
- *Expect:* `npm run dev` boots; Vite welcome page on `http://localhost:5173`.
- *Fail:* peer-dep conflict on React 19 vs recharts → install
  `recharts@latest`; if still conflicting, `npm i recharts --legacy-peer-deps`.
  Node 25 warnings from Vite are noise; only act on hard errors.

**0.2** Strip Vite boilerplate. Create route shell: `/` (Race), `/quali`,
`/practice`, a top bar with the three tabs and a session-picker slot. Global
dark CSS (plain CSS or CSS modules — no Tailwind; keep the dependency
surface small for D8 control).
- *Expect:* three navigable empty pages, dark background, no console errors.
- *Fail:* router 404s on refresh under Vite → use `BrowserRouter`; Vite dev
  serves SPA fallback automatically. If it doesn't, switch to `HashRouter`.

**0.3** Write `.claude/launch.json` with `{"name":"f1-dashboard",
"runtimeExecutable":"npm","runtimeArgs":["run","dev"],"port":5173}`.
- *Expect:* `preview_start` returns a serverId; snapshot shows the shell.
- *Fail:* port taken → set `server.port` 5174 in `vite.config.ts` and update
  launch.json to match.

### Phase 1 — Data layer (the foundation; most failure modes live here)

**1.1** `src/api/types.ts`: interfaces for Meeting, Session, Driver, Lap,
Stint, PitStop, IntervalRow, RaceControlMsg, matching the schemas in §0
exactly (fields can be null — type them nullable).
- *Expect:* compiles.

**1.2** `src/api/queue.ts` per D4. Export `apiGet(path: string): Promise<any>`
— joins a queue, ≥500 ms since previous dispatch, retries 429 with backoff,
throws after 5 attempts.
- *Expect:* unit-testable; used by everything in 1.3.
- *Fail:* if 429s still appear in normal use (watch the network panel), raise
  spacing to 800 ms. The app's request count per session load is ~8 (sessions,
  drivers, laps, stints, pit, intervals, race_control, meetings) → ~6 s worst
  case at 800 ms; acceptable, show a loading progress indicator listing each
  dataset as it lands.

**1.3** `src/api/openf1.ts`: typed wrappers — `getMeetings(year)`,
`getSessions(meetingKey)`, `getDrivers(sessionKey)`, `getLaps(sessionKey)`,
`getStints(sessionKey)`, `getPit(sessionKey)`, `getIntervals(sessionKey)`,
`getRaceControl(sessionKey)`. Each: check idb-keyval cache first (D3), else
`apiGet`, then cache **only if** the session's `date_end` < now.
- *Expect:* second load of the same session issues zero network requests
  (verify in devtools/`preview_network`: only the first load hits openf1).
- *Fail:* IDB quota/serialization error → intervals array is big but plain
  JSON; if IDB write throws, log and continue uncached (cache is an
  optimization, not a dependency).
- *Fail:* `gap_to_leader` arrives as string `"1 LAP"` → keep as
  `number | string`; numeric parsing happens at the chart layer, lapped cars
  render as gaps in the line, with the raw string shown on the timing board.

**1.4** Smoke test before any UI: `scripts/smoke.mjs` (node has fetch) that
runs the golden-fixture assertions V1 from §7 against session 11234 through
plain fetches **with 600 ms sleeps between calls**. Wire as `npm run smoke`.
- *Expect:* prints all assertions PASS.
- *Fail:* any mismatch with §0 golden values → the API changed since recon;
  update fixtures to observed reality ONLY if the shape is intact; if a whole
  endpoint is gone/renamed → abort condition A1.

**1.5** Session picker: year select (2023–2026) → `getMeetings` → meeting
select → `getSessions` → session select. Store choice in URL query params
(`?session=11234`) so reloads restore it. On selection, fire all dataset
loads through the queue with a visible per-dataset loading checklist.
- *Expect:* picking Melbourne 2026 Race loads 7 datasets in ≤ ~8 s; checklist
  ticks off one by one (that's the rate limiter pacing — correct behavior).
- *Fail:* one dataset 429s out after retries → show inline "retry" button per
  dataset; do not fail the whole load.

### Phase 2 — Replay clock + spoiler clamp (the heart; build before any chart)

**2.1** `src/replay/clock.ts`: `SessionClock` — state `{ T: Date | null,
playing: boolean, rate: 1 }`, advanced by a 500 ms `setInterval` adding real
elapsed time (use `performance.now()` deltas, not `+= 500`, so background-tab
throttling can't drift the clock). React context + `useClock()`.
- *Expect:* T ticks in the UI status bar ("Replay: +23:41 into session").
- *Fail:* laptop sleep/tab-throttle causes a jump forward on wake (real time
  passed) — that is CORRECT for replay-of-a-broadcast-you-paused? No: if the
  user paused their TV, the dashboard must pause too. Counter: on
  `visibilitychange`→hidden, keep running (user watches TV, not the tab), but
  show a prominent "synced Xs ago / drift?" hint and the resync affordance.
  This is a UX judgment call already made — implement as stated.

**2.2** Sync controls per D6: "Lights out" button, mid-race sync dialog
(driver + lap number → `T = lap.date_start`), nudges, pause/play. Show
current anchor ("synced to NOR lap 23 start").
- *Expect:* clicking Lights Out sets T to ≈ 04:03:26Z for fixture race; the
  status bar begins counting.
- *Fail:* min-of-lap-1 picks a pit-lane starter with weird `date_start` →
  use the **median** of lap-1 `date_start` across drivers instead of min if
  min deviates from median by >30 s.

**2.3** `src/replay/clamp.ts` + `useClampedSession()` per D5, including lap
completion-time clamping and stint truncation. THIS IS THE ONLY DOOR:
delete/never-export raw data from the store; components can only import the
clamped hook.
- *Expect:* with T set mid-race (e.g. lap 20), a debug dump shows laps ≤ 19
  complete, stints truncated at lap ≤ 20, zero interval rows beyond T.
- *Fail (insidious):* a component quietly imports the raw store to "just get
  the driver list" and later someone reads laps off it. Counter: export raw
  data under the name `UNSAFE_rawSession` so any leak is grep-visible; drivers
  list (not a spoiler) is exported separately as safe metadata.

**2.4** Replay/Full-session mode toggle. Full-session mode (for post-race
analysis) sets `T = ∞` and unlocks `session_result`. Mode is explicit and
sticky per session; default for Race sessions = Replay.
- *Expect:* toggle flips charts between truncated and complete data.

### Phase 3 — Lap-time chart (Race page, feature 1)

**3.1** Driver multi-select (chips with team colors + acronyms). Selected
driver numbers in URL params.
**3.2** Recharts `LineChart`: x = lap_number, y = lap_duration, one line per
selected driver colored `#{team_colour}`, y-axis formatted `m:ss.SSS`.
Null lap_durations produce gaps (`connectNulls={false}`).
- *Expect:* fixture: NOR (#1) shows ~58 points in full mode; pit laps 11/34
  spike ~+18 s.
- *Fail:* two teammates share `team_colour` → dash the second teammate's line
  (`strokeDasharray`), keyed by second-occurrence of the color.
**3.3** Outlier toggle ("hide in/out & SC laps", default ON): drop laps where
`is_pit_out_lap`, laps whose NEXT lap is a pit-in (pit `lap_number` matches),
and laps overlapping SC/VSC windows derived from race_control
(DEPLOYED→ENDING date ranges). Also clamp y-domain to [p5−1 s, p95+3 s] of
visible laps so one 100 s lap doesn't flatten the chart.
- *Expect:* fixture with toggle ON: laps 11–14 & 18–19 region (VSC) and pit
  laps disappear; the remaining lines sit in a ~3–4 s band where stint trends
  are visible.
- *Fail:* SC windows misalign (race_control `lap_number` is the leader's lap)
  → prefer date-range overlap (lap.date_start .. +duration vs window), not
  lap-number matching.
**3.4** Tire compounds: color each point by stint compound via a `<Scatter>`
overlay or custom dot renderer (SOFT=red, MEDIUM=yellow, HARD=near-white,
INTER=green, WET=blue). Line stays team-colored; dots show compound. Legend
explains both encodings.
- *Expect:* fixture NOR: yellow dots laps 1–10, white 11–33, yellow 34–58
  (truncated in replay mode).

### Phase 4 — Pairwise gap chart (feature 2)

**4.1** Two-driver picker (A vs B, reuse chips; enforce exactly 2).
**4.2** Compute series from intervals: bucket both drivers' `gap_to_leader`
per timestamp (rows arrive per-driver at ~4 s cadence, timestamps don't align)
→ resample each driver to a common 5 s grid (last-known-value), then
`gapAB = gtl(A) − gtl(B)`. Skip grid points where either value is missing or
non-numeric ("1 LAP"). Downsample the result to ≤ 1500 points before Recharts.
- *Expect:* fixture VER-style pair shows a continuous line crossing zero when
  positions swap; pit stops appear as ~20 s steps.
- *Fail:* chart is janky/slow → fork F3 (coarser grid: 15 s or per-lap).
- *Fail:* leader has `interval: null` but `gap_to_leader: 0` — use
  `gap_to_leader` exclusively; never use the `interval` field for this chart.
**4.3** Zero line emphasized; annotation showing current gap value + trend
over the last 5 laps ("closing 0.4 s/lap → contact in ~6 laps" — linear fit
over the last 5 laps' gap; suppress when |slope| < 0.05 s/lap). In replay
mode the projection uses only clamped data (it predicts — that's the point —
but from seen data only).

### Phase 5 — Timing board (feature 3)

**5.1** Order = each driver's latest clamped position event (from `position`);
columns: P, driver chip, tyre (current clamped stint compound + age), last
lap time, interval / gap-to-leader (toggle, per feature request), pit count.
Values from the latest clamped rows of intervals/laps/stints/pit.
- *Expect:* fixture at T≈lap 20: 20 rows, plausible order, VSC-era gaps small;
  toggling flips the gap column header and values.
- *Fail:* stale/missing position rows for a driver (crashed cars stop
  emitting) → keep last known position, grey the row when its latest data is
  > 3 min older than T (likely retired — but do NOT say "OUT", that's an
  inference; grey + "no data" is spoiler-neutral).

### Phase 6 — Pit window / undercut view (feature 4)

**6.1** Pit-loss estimate per track: median `pit_duration` of clamped stops
+ constant 3 s (out-lap/in-lap delta approximation), editable number input
(default shown, user can override).
**6.2** Visualization: horizontal bar per selected driver pair: current gap
vs pit-loss line. "A pits now → rejoins X s behind/ahead of B", computed from
clamped `gap_to_leader` + pit loss. Undercut window = |gap| within
[pitLoss − 2 s, pitLoss + 2 s] highlighted.
- *Expect:* fixture at T just before lap 11: NOR's row shows rejoin position
  consistent with his actual lap-11 stop outcome.
- *Fail:* no clamped pit stops yet (early race) → fall back to editable
  default 20 s with "(no stops seen yet)" label.

### Phase 7 — Quali page (feature 5)

**7.1** Session picker filtered to Qualifying; split into Q1/Q2/Q3 via
race_control `qualifying_phase` (RECON NEEDED R3 fallback: split by the two
large time gaps between green-flag periods).
**7.2** Views: (a) best-lap-so-far bar chart per driver per phase, clamped —
in replay, bars grow as laps land; (b) lap evolution line (best lap vs time,
track evolution). Elimination-zone line (P16/P11 cutoff) computed from
clamped standings only.
- *Expect:* fixture 11230 full mode: driver 1 best ≈ 79.475.

### Phase 8 — Practice page (feature 6)

**8.1** Load FP1–FP3 for the meeting (3× datasets — the pacing queue matters;
show the checklist).
**8.2** Long-run detection: within a driver's stint, runs of ≥ 5 consecutive
clean laps (no in/out, no SC-window, lap within 107% of the driver's stint
median).
**8.3** Views: (a) race-pace table: median clean long-run lap per driver per
compound, sortable; (b) tyre degradation: scatter lap_duration vs
`tyre_age_at_start + (lap − lap_start)`, per compound, with least-squares
line; slope displayed as "+0.08 s/lap"; (c) predicted quali = per driver:
best FP lap − median(best FP lap − actual quali best) learned constant is NOT
available pre-quali — instead show "best single lap" ranking with low-fuel
runs flagged (laps preceded by ≥2 slow laps ≈ fuel run: label heuristic
clearly as an estimate).
- *Expect:* fixture FP2 11228: table has ~20 rows; degradation slopes mostly
  positive (0–0.15 s/lap); nothing NaN.
- *Fail:* too few clean laps for a fit (rain/red flags) → show "insufficient
  data" per cell, never an empty chart with no explanation.

### Phase 9 — Live mode (feature: nice-to-have; build last)

**9.1** RECON NEEDED R1 gate: during ANY live session (see F1 calendar via
`getSessions`), run: `curl "https://api.openf1.org/v1/laps?session_key=latest"`
twice, 60 s apart, unauthenticated. If new rows appear and their `date_start`
is within ~1 min of wall clock → free tier is live enough; proceed. If data
lags > 5 min or requires auth → fork F5.
**9.2** Implementation: "LIVE" toggle = clock pinned to `now − safetyLag(5 s)`;
mutable-endpoint re-poll through the SAME queue: intervals + position every
15 s, laps/stints/pit/race_control every 60 s, using incremental filters
(`laps?session_key=X&lap_number>=N`) to keep payloads small. Cache disabled
for the live session.
- *Expect:* during a live session the timing board updates without reload.
- *Fail:* 429 pressure from polling → lengthen poll intervals ×2; the queue
  already serializes so the app can't burst.

### Phase 10 — Polish (feature: "not vibe coded")

**10.1** Pass over per D8: consistent 8 px spacing grid, `font-variant-numeric:
tabular-nums`, one typeface + one mono, remove any default Recharts pastel,
tooltips restyled dark, empty/loading/error states for every panel, no dead
buttons. Kill anything gradient/rounded-blob/emoji.
**10.2** Keyboard shortcuts: space = pause/play, ←/→ = ±5 s, L = lights-out.
**10.3** README: how to run, how to sync, spoiler-safety model in 5 lines.

---

## 3. Forks

- **F1 — Vite scaffold refuses non-empty dir** → scaffold in temp dir, move
  files in, keep `.git/`, merge `.gitignore`. Trigger: create-vite prompt/error
  about existing files.
- **F2 — recharts incompatible with installed React major** → trigger: npm
  ERESOLVE mentioning react peer range. Route: `--legacy-peer-deps`; if runtime
  errors follow, pin `react@18` + `react-dom@18` (Vite template works on 18).
- **F3 — gap chart slow** → trigger: visible input lag or > 100 ms frame in
  interactions with the interval chart. Route: resample grid 5 s → 15 s → per
  lap; virtualization not needed beyond that.
- **F4 — race_control lacks usable SC windows for some race** (messages exist
  but phrasing differs) → trigger: outlier toggle removes nothing during a
  known SC period. Route: match message regex
  `/SAFETY CAR|VSC/` + `DEPLOYED|ENDING|IN THIS LAP`; fallback: flag `category
  === "SafetyCar"` rows in a debug list and derive windows from consecutive
  pairs.
- **F5 — free tier not live** (R1 fails) → route: ship live mode as "delayed
  live" with the measured delay shown ("data ~X min behind — OpenF1 free
  tier"), and document that real-time needs an OpenF1 paid account (config slot
  for an API token in the queue module: `Authorization: Bearer`). Do NOT buy or
  ask for credentials; park it.
- **F6 — clamp leaks found in V6 spoiler test** → trigger: any future fact
  visible. Route: stop feature work; move the leak's data path behind
  `useClampedSession`; re-run V6 before continuing. Spoiler correctness
  outranks every feature.

---

## 4. RECON NEEDED (unsettleable from a dead Sunday; each with its exact check)

- **R1 — Free-tier live latency.** Check (must run during a live F1 session —
  next opportunities are in the 2026 calendar via `getSessions`): fetch
  `laps?session_key=latest` twice 60 s apart; compare newest `date_start` to
  wall clock. Settles F5. Until then, live mode ships behind the toggle with
  the delayed-mode banner as default-safe behavior.
- **R2 — `intervals` availability in the first minutes of a live race.**
  Historical data has intervals from lap 1, but live emission order is
  unverified. Check: same live-session probe, endpoint `intervals`. Fallback if
  absent early: timing board shows positions without gaps until data flows.
- **R3 — `qualifying_phase` population.** Field exists in the race_control
  schema (verified) but its values during quali were not sampled. Check (30 s,
  any time): `curl ".../race_control?session_key=11230"` and inspect
  `qualifying_phase` values. If null throughout → use the gap-based Q1/Q2/Q3
  split fallback in 7.1.
- **R4 — pre-2024 data depth.** OpenF1 coverage starts 2023 and older sessions
  may lack `stints`/`intervals`. Check when the user first picks an old season:
  probe one 2023 race for both endpoints; if empty, grey out those seasons in
  the year picker with "no data" rather than rendering broken charts.

---

## 5. Abort conditions

- **A1 — OpenF1 schema/endpoint break**: smoke test (V1) fails on endpoint
  existence or a renamed core field, and the API's own docs
  (openf1.org) confirm removal. Stop; report exactly which endpoint died and
  what Jolpica can/cannot replace (laps: yes, coarse; intervals/stints: no).
  Do not attempt scraping formula1.com — ToS and brittleness.
- **A2 — Rate limit tightens below usability**: if even 1 req/s with backoff
  cannot load 7 datasets (i.e. sustained 429 for > 5 min from a residential
  IP), stop and report; a paid key or a caching proxy is a user decision.
- **A3 — Spoiler model unimplementable**: if V6 cannot be made to pass after
  F6 remediation (structural leak, e.g. a chart lib that renders full data
  domains regardless), stop feature work and report the leaking path. (No
  known mechanism makes this likely; listed because spoiler-safety is the
  mission's hard constraint.)
- **A4 — Disk/toolchain failure**: npm install cannot complete after cache
  clean + retry. Report the exact npm error.

Never-do list (standing orders): no `session_result`/Jolpica-results fetch in
replay mode; no timeline slider scaled to full race length; no scraping; no
extra chart/state libraries beyond D1–D3; no dark-pattern "are you sure"
spoiler reveals — the Full-session toggle is enough.

---

## 6. Order of battle (dependency spine)

Phase 0 → 1 → 2 are strictly sequential (everything hangs off clamp + queue).
Phases 3–6 are independent of each other after 2 (build in numbered order;
each is separately committable). 7 and 8 depend only on 1–2. 9 last, gated on
R1. 10 last of all. If context/session dies mid-run, `git log` + this file
locate the front line; every phase ends with a commit.

---

## 7. Verification runs (executor MUST perform; pass criteria explicit)

- **V1 — API smoke (after 1.4, and rerun before declaring done):**
  `npm run smoke` asserts against session 11234: laps rows = 1002; driver 1
  lap 2 duration = 86.863; driver 1 stints = M/H/M with boundaries 10/11,
  33/34; pit laps = [11, 34]; race_control contains ≥ 1 "VSC DEPLOYED";
  intervals rows > 20 000; drivers count = 20 with non-empty `team_colour`.
  **Pass = all assertions print PASS, zero 429-exhausted errors.**
- **V2 — Cache discipline:** load Melbourne 2026 Race, reload the page,
  observe `preview_network`. **Pass = zero requests to api.openf1.org on the
  second load** (all served from IDB).
- **V3 — Rate-limit discipline:** cold-load (clear IDB) while watching the
  network panel. **Pass = no 429 responses; requests visibly spaced;**
  checklist UI ticks datasets sequentially.
- **V4 — Lap chart correctness:** full-session mode, driver 1 selected.
  **Pass =** pit-lap spikes at laps 11 and 34; compound dots M/H/M per the
  golden stints; outlier toggle removes pit laps and the VSC-window laps
  (~12–14, 18–19) and the y-axis tightens to a ≤ ~5 s band.
- **V5 — Gap chart correctness:** drivers 1 vs 63, full mode. **Pass =** a
  continuous line with a visible step of roughly ±18–20 s at each of NOR's
  stops (laps 11 and 34), no NaN gaps except lapped/missing segments.
- **V6 — SPOILER TEST (the critical one; rerun after ANY change to data flow):**
  Replay mode, mid-race sync to driver 1 lap 20. Inspect every page and panel
  (timing board, both charts, pit view, tooltips, axis labels, legends, URL,
  page title). **Pass = ALL of:** (a) no lap > ~20 visible anywhere including
  axis max; (b) driver 1's stint shows MEDIUM→HARD only — the lap-34 MEDIUM
  stint and lap-34 pit stop are absent; (c) nothing identifies the final
  top 3 (63/12/16) as winners — no final classification, no "winner", no
  checkered flag; (d) no element shows total lap count 58; (e) switching to
  the Quali page and back does not flash unclamped data. Then click play,
  let T advance ~2 min. **Pass (f):** new laps stream in; nothing future
  appears early.
- **V7 — Sync controls:** press Lights Out. **Pass =** status bar shows
  T ≈ 2026-03-08T04:03:26Z and counting; timing board populates within a few
  in-replay seconds; nudge ±30 s moves data correspondingly; pause freezes
  everything.
- **V8 — Quali page:** session 11230, full mode. **Pass =** driver 1's best
  ≈ 1:19.475; three phase groups render (or the F7.1 fallback split), no
  empty chart without an explanation label.
- **V9 — Practice page:** FP2 11228. **Pass =** race-pace table sorted with
  ≥ 15 drivers having a median long-run value; degradation scatter shows
  fitted lines with finite slopes; low-data cells say "insufficient data".
- **V10 — Look check:** `preview_inspect` on the timing board: monospace
  tabular numerals, dark background (#0a0a0f–#15151d range), driver colors =
  `team_colour` values. `preview_resize` to 1280×800 (laptop) — no horizontal
  scroll, all panels usable. **Pass = matches D8 and no layout overflow.**
- **V11 — Build:** `npm run build` then `npm run preview`. **Pass = build
  succeeds with zero TS errors and the preview serves the app functioning as
  in dev.**

Done = V1–V11 pass (V9 gated only on data availability per its own criteria;
live-mode verification explicitly deferred to R1's next live session and NOT
part of done).
