# Teams game-day view — 2026-10-07

## This change

The home page has a horizontally scrollable NHL game strip. Each card links to
`/teams?view=games&game=<id>`, selecting the same matchup offered by the Teams
index's **Tonight's games** tab. Existing team analytics remain in their own view.
The slate loads independently of the roster/model request; unavailable models
do not prevent a reader from seeing the games.

Matchups show the NHL record, game status, venue and broadcasters beside existing
Cap & Crease present/future outlook, signed roster X-NAV and cap space. Model
comparisons retain current roster/contract identity and the existing 2025–26
inputs. They do not represent win probabilities or a game-day lineup.

`GET /api/nhl/games` reads the first-party NHL `/v1/score/<date>` endpoint through
the existing bounded fetch helper. It never reads or writes the database. The
response retains season, competition and schedule-date identity. Eastern Time
defines the slate and displayed start times, including west-coast starts after
midnight UTC. Upstream errors, wrong-day data, malformed entries and duplicate
game IDs produce an unavailable response rather than a fabricated empty slate.
Verified responses have a 30-second CDN cache plus 30-second stale allowance.
The client refreshes every minute while visible, aborts on unmount, shows the
last successful retrieval time, and labels retained results when a refresh fails.

The team page's **Projected Lines** heading is now **Model depth chart**. Model
groups and goalie ranks no longer imply reported combinations or an announced
starter. Ranking calculations and original analytics are unchanged.

## Source review and remaining lineup work

The October 7 live probe returned three regular-season 2026–27 games:
PIT–WSH and COL–WPG at 7:30 p.m. Eastern, and EDM–ANA at 10 p.m. Eastern.
These are observations from the endpoint, not seeded application fixtures.

- NHL schedule/score source: <https://api-web.nhle.com/v1/score/2026-10-07>
- NHL projected-lines article supplied by the user:
  <https://www.nhl.com/news/colorado-avalanche-winnipeg-jets-game-preview-october-7-2026>
- Daily Faceoff's Winnipeg page:
  <https://www.dailyfaceoff.com/teams/winnipeg-jets/line-combinations>
- Layout reference supplied by the user:
  <https://www.hockeydecoded.com/teams/WPG?season=20262027>

Our existing groups are produced by `buildTeamLines` and `lineupContributionScore`,
using production, ice time, experience, role, NAV and leadership inputs. They are
not imported from NHL game previews, practices, scratches or starter announcements.
The live public WPG league payload was also checked: it contains Viggo Björck
with zero prior-season games, while Clay Stevenson from the NHL projected goalie
pair is absent. This is an additional shared-roster coverage issue, not merely a
different sorting order. No shared roster, contract or valuation data is changed
by this UI task. That coverage gap must be reconciled before claiming a complete
reported game-day lineup.

The NHL preview and Daily Faceoff both describe projected combinations; even
their Winnipeg defensive pairings differed in the reviewed October 7 pages.
Daily Faceoff credits a reporter and timestamps its update. A team's goalie
leader in the NHL score feed does not establish tonight's starter.

Importing actual projected lines remains a separate follow-up. It needs a reliable
provider or maintained reporting workflow, NHL player-ID reconciliation, game/date
identity, source link and update time, and explicit projected/confirmed/unavailable
status. Do not hard-code the October 7 article as an evergreen lineup, silently
scrape a fragile article layout, or treat a model-ranked goalie as confirmed.
This release explicitly says reported lines and starters are unavailable.

The Hockey Decoded reference is useful for a later team-page presentation pass:
headline record and clear measures first, explanations near charts, complete
roster contributions and recent-game drill-downs. This change does not implement
its depth methodology or introduce new analytical claims.

## October 8 follow-up: retain the model and all selected players

The requested approach is to keep the model depth chart. Existing per-team Admin
Contracts assignments and roster exclusions remain the manual roster controls;
game-day reported-line ingestion is not part of this correction. The full assigned
roster includes players outside the model's top twelve forwards, six defenders
and two goalies. A scratch is not an instruction to remove a player's contract
from the assigned roster.

The forward grouping had a separate display defect: it selected twelve forwards,
reserved four centre slots, then discarded any additional pure centres. Winnipeg's
selected Morgan Barron and Vladislav Namestnikov consequently disappeared. The
grouping now keeps every selected forward, using the existing ranking for remaining
places and preserving each player's actual position label. These are model groups,
not assertions that a surplus centre plays wing. Ranking inputs, selection limits,
defence/goalie ranking, NAV and statistics readers are unchanged.

Read-only October 8 checks of the public current-season payload confirm Clay
Stevenson and Viggo Björck assigned to WPG and Connor Hellebuyck excluded. The
October 7 page had served an older CDN response after the underlying roster was
corrected; the exact Teams request subsequently refreshed to the corrected roster.
Björck is in the full roster, but his zero 2025–26 model games place him below the
top-twelve cutoff. His observed 2026–27 regular-season record has four games.

The public `observedStats` overlay matched NHL's season-filtered regular-season
summary for all 22 Winnipeg players with summary rows: 196 checked fields,
including the seconds-to-minutes conversion for skater average TOI. The other 18
assigned depth/prospect players were explicitly missing observations, rather than
receiving invented zeros. This verifies current displayed observations; it does
not independently prove scheduled historical snapshot persistence. No real capture,
Production record edit, migration, flag or cache mutation was performed in this
follow-up. Existing season/source gates and withheld EDGE evolution metrics remain.

Follow-up verification: full suite 2,886 passed / zero failed, then seven focused
tests passed after adding one more centre/flex-priority regression; typecheck and
changed-file lint passed. An isolated browser fixture of the public roster showed
four groups of three unique forwards, including Barron and Namestnikov, with
Björck/Stevenson in the full roster and Hellebuyck absent. Page widths 320/412/1280
had no overflow or browser errors. This checked the expanded Teams card; the local
development server returned 404 for the existing detail route. The hosted Preview
of code commit `74e08f9` returned HTTP 200 with the Winnipeg Team Analytics title
for `/teams/wpg?season=20262027&gameType=2`. No route implementation was changed.

## Verification

- Parser and route tests cover Eastern dates/DST, actual zero scores, scheduled
  games without invented scores, postponements, OT/SO, missing records, invalid
  dates, wrong-day/malformed/duplicate source data, and explicit upstream failures.
- URL tests retain the selected matchup alongside existing sorting and filters.
- Browser checks use mocked league and game responses, not Production records:
  home → selected matchup, refresh/deep link, model/goalie labels, unavailable vs
  empty slate, retry, keyboard expansion, and no page overflow at 320/412/1280px.
- Full local test run: 2,882 passed and one heading canary failed after the page
  heading changed. Restoring the existing heading resolved it; the targeted rerun
  passed all 476 tests across four files. Typecheck, changed-file lint and production
  build passed (34 generated pages). Final PR CI is the full-suite head gate.
- Live API verification is read-only. No migrations, capture, flags, new
  dependencies or Production deployment belong to this change's implementation.
