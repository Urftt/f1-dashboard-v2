# Pitwall — build-out brief for the next session

Written 2026-07-07 by the session that built v1 (branch `v1`, 25 commits).
This is a working document for continuing development: architecture map,
non-negotiable invariants, priority fixes, then ranked feature directions
with concrete build guidance. Trust this file over guesses; verify against
code when in doubt.

---

## 1. Architecture in one screen

Client-only Vite + React 19 + TS SPA. No backend. Data: OpenF1 free API
(`https://api.openf1.org/v1`), CORS-open, **hard rate limit** (429s from the
4th rapid request).

```
src/api/queue.ts        ← THE ONLY fetch to openf1. Serialized, 500ms spacing,
                          429 backoff, 404 ⇒ [] (OpenF1's "no rows").
src/api/openf1.ts       ← typed endpoint wrappers + IndexedDB cache (idb-keyval).
                          Finished sessions cached forever; in-flight dedupe.
src/data/sessionStore.ts← per-session dataset loading, per-dataset status,
                          useSyncExternalStore. CORE_DATASETS gate the page;
                          intervals stream in late. skip() for race-only data.
src/data/WeekendContext ← year → meeting (URL ?m=) → sessions. Auto-loads the
                          latest finished race weekend.
src/replay/ClockContext ← virtual clock {t, playing, mode}. performance.now
                          deltas; persisted to sessionStorage (survives reload).
src/replay/clamp.ts     ← ★ THE SPOILER CLAMP. prepareSession() indexes once,
                          clampPrepared(prep, t) cuts every dataset to T.
                          Laps visible only when COMPLETED; stints truncated.
src/replay/useClampedSession.ts ← the ONLY door for UI. Quantizes t to 2s
                          buckets so memoized panels re-render at 0.5Hz max.
src/pages/{Race,Quali,Practice}Page.tsx
src/components/*        ← all panels are React.memo'd, fed CLAMPED data only.
src/race|quali|practice/analysis helpers (pure functions on clamped data).
scripts/smoke.mjs       ← golden-fixture API test (npm run smoke).
wargames/10-automation.md ← original battle plan; §7 = verification runs V1–V11.
```

Driver selection lives in the URL (`?d=1,63`), weekend in `?m=`, clock in
sessionStorage. Reload loses nothing.

## 2. Non-negotiables (breaking these ruins the product)

1. **Spoiler law.** Every UI component consumes clamped data via
   `useClampedSession` and nothing else. Anything unclamped is named
   `UNSAFE_*` (grep for it — currently only sync controls use it, contained).
   The subtle rules live as comments in `clamp.ts`: laps clamp by *completion*
   time; stint `lap_end` truncates to the current lap (a stint's true end
   reveals the next pit stop); axis domains grow with data (`dataMax`), never
   pre-scaled to race distance; **no full-race scrub slider** (its length is a
   spoiler); `session_result` / Jolpica results are never fetched in replay;
   never render "OUT/retired" (grey + "no data" only — retirement is an
   inference about the future); total lap count never appears in replay.
   **After ANY change to data flow, run the spoiler test (§5).**
2. **Queue law.** No fetch to openf1 outside `queue.ts`. New endpoints go
   through `openf1.ts` wrappers with the cache. The rate limit is real.
3. **Design law.** Dark timing-wall aesthetic: tokens in `index.css`,
   `tabular-nums` mono for every number (`.num`), team colors from the API's
   `team_colour` (entity-fixed — never invent palettes for drivers), compound
   colors are domain-standard (S red / M yellow / H white / I green / W blue),
   teammate #2 dashed. No gradients, no emoji, no rounded-blob cards. Recharts
   with `isAnimationActive={false}` everywhere (replay re-renders).
4. **Perf discipline.** Panels are `React.memo`; anything passed to them must
   be referentially stable between clamp buckets (callbacks via `useCallback`,
   time via the 2s-quantized value). Don't hand a panel raw `t`.

## 3. Priority 0 — fix before adding features

**P0.1 — Mode leaks across weekends (real spoiler bug).**
`mode: 'full'` is global + persisted. Analyze race A in Full session, then
switch the weekend picker to unwatched race B → B renders fully. Fix: on
meeting/session change, force `mode` back to `'replay'` (a `useEffect` in
`WeekendProvider` watching `meetingKey`, calling a new `resetToReplay()` on
the clock context — or move `mode` into WeekendContext keyed per meeting).
Add this case to the spoiler test.

**P0.2 — Clamp regression tests.**
The clamp is load-bearing and only integration-tested by hand. Add vitest
(dev-dep) + `src/replay/clamp.test.ts` with a small synthetic session fixture
(3 drivers × 6 laps, 2 stints, pits, RC messages — hand-written, no network):
assert lap-completion visibility, stint truncation at current lap, -Infinity
clamps everything, null-duration lap-1 handling, full mode passthrough. Then
`npm test` joins the verification protocol. Also port the pure-function tests:
`neutralizedWindows` (VSC open/close + unclosed window), `qualiClassification`
elimination counts (20 and 22-car fields), `findLongRuns` boundaries.

**P0.3 — Bundle size.** 650KB JS, recharts is most of it. Route-level
`React.lazy` for the three pages + `manualChunks: { recharts: ['recharts'] }`
in `vite.config.ts`. Don't replace recharts; it's fine.

## 4. Feature directions, ranked

### Direction A — race replay intelligence (highest value: the core use case)

**A1. Battle radar.** Auto-surface developing battles instead of making the
user pick pairs. From clamped intervals: all pairs where gap < 2.5s OR
(gap < 6s AND closing ≥ 0.3 s/lap sustained over ~3 laps). Render as a small
ranked list panel on the Race page right column: `VER → NOR  1.8s  ▲0.4/lap`,
click = loads that pair into the GapChart. Reuse `closingRate()` logic from
GapChart (extract to `src/race/analysis.ts` first). Suppress during SC/VSC
windows (everything closes then — noise).

**A2. Strategy what-if.** "If X pits now vs in N laps, where do they come
out?" Extend PitWindow: for the selected driver take current gap-to-leader
trajectory, deg slope of their current stint (fit on clamped laps, ≥5 pts,
else practice-derived slope, else 0.05 s/lap default — label the source!),
project both branches 10 laps and show rejoin gaps vs the 2–3 cars around
them. Keep it honest: dashed lines, "projection" label, only from clamped
data. This is the feature a real pit wall has; even a rough version reads
brilliantly during a replay.

**A3. Moments ticker.** A compact clamped event feed above the charts:
overtakes (position swaps between consecutive laps from PositionChart's
completion-order data), pit stops, fastest laps, SC/VSC. Newest first, driver
chips inline, click = sync gap chart to that pair. Everything already exists
in clamped data; this is assembly, not new data. It answers "what did I just
miss while looking at my phone".

**A4. Head-to-head mode.** When exactly 2 drivers are selected, show a
dedicated strip under the DriverSelect: gap now + trend, lap-time delta last
5 laps, tyre offset (compound + age difference), pit stops used. All values
exist; it's a compact composition. This is the "is the undercut working"
cockpit.

### Direction B — sync & replay UX (second: friction kills the core loop)

**B1. Smart mid-race sync.** Current sync needs a driver + lap number from TV
graphics. Better: user types a gap they see on screen ("VER +3.2 HAM") →
search the interval series for timestamps where that pair's gap ≈ value
(±0.15s), take the FIRST match after race start, sync there, show "synced,
nudge if the picture doesn't match". Implementation: pure function over
`prep.intervals` (this is a legitimate UNSAFE_prep use — searching is not
displaying); if multiple matches >2min apart, offer "next match" button
rather than a list (a list's length leaks race shape).

**B2. Playback speed.** 1×/1.5×/2× on the clock (`rate` field already exists
in spirit — ClockContext hardcodes 1). Useful for catching up to live after
starting late, or skimming a dull stint. Add ×4 with a "skip boring stint"
framing. Keep the status bar honest (`2×` badge). Trivial: multiply delta in
the tick effect.

**B3. TV-tray layout.** A compact mode (toggle in topbar) that collapses to:
ClockBar + TimingBoard + one chart, single column, larger type — for when the
dashboard shares a laptop screen with the stream. Mostly CSS (`.compact`
class on `.app`, hide panels via a per-panel visibility preference persisted
in localStorage).

### Direction C — the weekend & season story (third: breadth)

**C1. Weekend overview page.** A fourth tab synthesizing FP→Q→R: practice
pace map vs quali result vs race result deltas ("ANT qualified P1, raced
P2"), strategy summary (compound usage grid), key numbers. Post-race
analysis only (full-mode gated: show it blurred/locked while the race replay
is mid-flight — reuses `mode`).

**C2. Spoiler-safe season catch-up.** The killer app extension for someone
who watches delayed: a Season page where the user marks "watched up to round
N" (localStorage watermark). Standings computed from `session_result` of
rounds ≤ N only (fetch via existing wrappers — this is legitimate because the
user declared those rounds watched), later rounds shown as "not watched yet"
with no numbers. Points math: 25-18-15-12-10-8-6-4-2-1 + sprint 8-7-6-5-4-3-2-1;
verify against Jolpica standings for a past season rather than trusting the
constants blindly (fastest-lap point died after 2024 — check per season).

### Direction D — live hardening (event-gated: needs a live session)

Next race weekend, while a session is live, run the wargame R1 probe
(`laps?session_key=latest` twice 60s apart, compare newest `date_start` to
wall clock). Then: switch LiveControl polling to incremental fetches
(`laps?session_key=X&lap_number>=N`, `intervals?...&date>ISO` — OpenF1
supports comparison operators; MERGE into the store instead of replacing,
which needs a small `mergeDataset` in sessionStore keyed on natural ids).
Add an optional API token field (`Authorization: Bearer`) in queue.ts read
from localStorage for the paid real-time tier. Don't build any of this
speculatively before the probe — the free tier's live behavior decides the
design.

### Direction E — platform quality (steady background investment)

- **E1. PWA/offline**: manifest + service worker (vite-plugin-pwa) — cached
  weekends already make offline replay nearly work; finish it. Watch a replay
  on a plane.
- **E2. Extract `useWeekendSession(sessionType)` hook** — the three pages
  duplicate the pick/ensureLoaded/clamp/loading-gate boilerplate (~30 lines
  each).
- **E3. Shared chart chrome** — tooltip container, axis prop bundles, and the
  driver-line pattern (color + teammate dash) repeat in five files; extract
  `src/components/chart/common.tsx`. Do this BEFORE adding more charts.
- **E4. 2023 quirks**: `qualifying_phase` may be null pre-2024 → QualiPage
  falls back to a single "Q" group; implement the gap-based splitter from
  wargame R3 fallback if you touch it. Sector data may be sparser — the
  SectorTable already tolerates nulls.

## 5. Verification protocol (run after every feature)

1. `npx tsc --noEmit -p tsconfig.app.json` and `npm run build` — both clean.
2. `npm run smoke` — OpenF1 golden fixtures (Melbourne 2026, session 11234).
3. (after P0.2) `npm test` — clamp unit suite.
4. **Spoiler test** (the one that matters), fixture = Australian GP 2026,
   `?m=1279`: Replay mode → Sync… → NOR, lap 20 → Go → pause. Then check
   every panel and the DOM: no lap > 20 anywhere including axis ends; NOR
   shows exactly 1 pit stop (lap 11) and stints M(1–10)+H(truncated) — the
   lap-34 stop must be invisible; no element shows "58" (total laps); the
   final podium (63/12/16) must not be derivable; timing board shows LEC
   leading around lap 20; switch to Quali tab (fully visible — it's in the
   past) and back without any flash of future race data; press play — data
   streams in at 1×. Also test P0.1's case: switch weekend in full mode →
   must land in replay mode.
5. Eyeball at 1280×800 (`preview_resize`): no horizontal scroll, panels
   usable.

Golden fixture facts (verified against live API): Melbourne 2026 meeting
1279, race session 11234, 22 drivers, NOR=1/VER=3/HAM=44/RUS=63; NOR stints
M1–10/H11–33/M34–58, pits laps 11+34; VSC laps ~12 and ~18; winner 63 (only
for asserting its absence). Silverstone 2026 = meeting 1289 (sprint weekend:
Sprint Qualifying, Sprint, Qualifying, Race — good for testing sub-tabs).

## 6. Don'ts

- Don't add state libraries, CSS frameworks, or a second chart library.
- Don't fetch outside the queue, don't parallelize queue dispatch.
- Don't "improve" the sync UX with a full-session timeline scrubber.
- Don't trust `interval` field for gap math — use `gap_to_leader` (leader's
  interval is null; lapped cars are strings like "1 LAP").
- Don't compute anything user-visible from `UNSAFE_prep` except sync targets.
- Don't remove the 404⇒[] handling or the adaptive staleness threshold in
  GapChart (2023 data cadence is ~40s vs ~4s in 2024+).
- Don't mark a task done without the §5 protocol; especially the spoiler test.

## 7. Suggested order

P0.1 → P0.2 → A1 → A3 → B2 (trivial) → A4 → B1 → A2 → E2/E3 (before more
charts) → P0.3 → C1 → B3 → C2 → E1 → D (event-gated).

Rationale: P0s protect the product's one hard promise. A-series deepens the
exact thing the app is for (watching races). B2/B1 remove the most friction
per line of code. C opens breadth once depth is solid. D waits for a live
session by necessity.
