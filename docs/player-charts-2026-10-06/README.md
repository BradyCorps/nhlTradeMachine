# Player charts: searchable league-context scatter and percentile radar prototype

Presentation only. No valuation formula, `calculateAssetNAV → calcNAV`, percentile calculation,
cohort rule, Gravity flag, snapshot or data change. Valuation stays on the server; the browser only
draws values the page already computed.

## A. League-context scatter (`NavLeagueScatter`, dossier)

Recharts `ScatterChart`, same props and cohort as before.

- Axes are **contributions to X-NAV in NAV points** (the OFF and DEF stage values of the value
  breakdown). The panel says they are not percentiles and not overall player ratings.
- Dossier player always highlighted and labelled; the league is a subdued background; **only selected
  players are labelled** (first initial added only if two labelled players share a last name).
- Search (the shared `PlayerPicker` from #45) selects up to three comparison players. Typing also rings
  the matching players on the chart. Tapping a faint point adds it; chips and "Reset comparisons" remove.
- Cohort and median lines are **computed once from the whole cohort** (upper median, `floor(n/2)`, exactly
  as before). Search, selection and reset never change them (tested against the previous formula).
- Exact OFF / DEF / NAV for the dossier player and the selection sit in an always-visible table, with
  differences from the dossier player. The all-players table is kept (read-only).
- Neutral quadrant wording: "Above median: both / offence / defence", "Below median: both".
- No tab stop per point (`accessibilityLayer` off, no focusable marks). Keyboard and touch use the search,
  chips, reset and tables.
- Wider: the old chart was a fixed 400-unit SVG; this one fills the panel.

Dropped from the old chart, deliberately: drag-to-brush selection and the hex-density wash. Brushing has no
keyboard path and is replaced by search plus multi-select; the faint dots carry density.

## B. Percentile radar prototype (`PercentileRadar`, expanded player card)

A "Radar (prototype)" view beside the existing bars, which stay as **"Detailed values"** (the default).

- Fixed 0–100 scale; dashed ring labelled as the 50th percentile (middle of the comparison group);
  fixed axis order per position group; one player plus at most one comparison.
- The comparison reuses the card's existing STRAND comparison selection. There is no second picker.
- Percentiles come from the card's own arrays and `metricPercentile` call, unchanged.
- **Missing is never plotted.** Recharts draws a null at the centre (observed in a browser, so a missing axis
  would look like a 0). The component draws its own dots and polygon from the model: no dot for a missing
  axis, and no polygon at all unless every axis has a real percentile. Missing axes read "n/a" and
  "unavailable" in the table.
- No polygon area, no combined score, no classification.
- Only production and on-ice-impact metrics are on the radar. Time on ice, competition and zone starts
  describe how a player is used, so they sit in a separate "role, not ability" group in the table.
- Tap/keyboard detail: metric buttons in the table (and tapping a point or label) show value, unit,
  percentile and group median. Goalies keep the bars (three metrics are not a radar).

### The "Elite · avg percentile" footer was removed
It was an unweighted mean of every percentile on the card (pts, goals, assists, xG, OPS, DPS, on-ice
metrics, **and** usage metrics such as TOI, QoC and zone starts), then mapped to ELITE / ABOVE AVG /
AVERAGE / BELOW AVG / POOR by fixed thresholds. Those metrics overlap heavily and usage is not ability;
nothing validates the average or the thresholds. The card and the PNG export now say
"Individual percentiles vs {group} · not combined into one rating", the per-bar accessible labels read
"83rd percentile of all forwards" instead of a quality word, and the PNG payload carries
`avgPercentile: null`. Per-bar colouring is unchanged and still decorative. No recalibration.

## Bundle size
Recharts is about 350 KiB of JavaScript, so both chart components load lazily (`next/dynamic`, `ssr: false`)
behind same-height placeholders. First-load JS from `.next/diagnostics/route-bundle-stats.json`, main vs
this branch (uncompressed):

| Route | main | branch | delta |
|---|---|---|---|
| `/players` | 1,405,587 B | 1,413,655 B | +7.9 KiB |
| `/players/[playerId]` | 831,072 B | 835,670 B | +4.5 KiB |
| `/teams`, `/teams/[team]` | 1,330,813 B | 1,331,957 B | +1.1 KiB |
| other 25 routes | | | unchanged |

Measured without lazy loading, the same build was +337 KiB on `/players` and +382 KiB on the dossier. The
chart chunk still downloads on the dossier (after hydration, since the scatter is on the page) and on
`/players` only when someone opens the radar.

## Verification
Pure rules: `__tests__/league-scatter.test.ts`, `__tests__/percentile-radar.test.ts`. Browser (production build,
fictional fixtures, old components from `main` beside the new ones, identical inputs) at 320 / 412 / 1280 px with
reduced motion emulated: no console errors (so no hydration errors), no horizontal overflow, no tab stops on
points, nothing animating; keyboard selection of three players, picker disables at three, reset works, tapping
a point adds it; a card with two missing metrics draws 6 dots, 0 polygons and two "n/a" labels.
Screenshots: `docs/player-charts-2026-10-06/screenshots/`. Fixture data only; no real player appears.

## Limitations
- Real dossier and `/players` pages were not opened with live data (the roster and NHL feeds are not reachable
  from the build environment); the harness used the same components and props with fixtures.
- Recharts tooltips are hover/tap only; the tables are the accessible path.
- The radar shows production and impact metrics only, so it is a partial view of the card by design.
