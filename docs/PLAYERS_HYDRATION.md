# Players hydration correction

## Reproduced causes

On October 4, 2026, Production at `1156011f16d6d5843d721e4a22b8a8ef29ca9e92`
logged React #418 on `/players`, a `q=mcdavid&season=20262027&gameType=2` URL,
and a `player=8478402&season=20252026&gameType=2` deep link.

The plain page HTML contained `Oct 3 Data Feed Active`, while the browser
rendered October 4. The shared Header computed its date during render; a
statically rendered Players page could therefore be served on another day.
The header now renders the same undated label initially and adds the date
after mount. Other header content remains server-rendered.

The unloaded data-context rail also synthesized a valuation day when no API
provenance existed. Its missing season reference now says `Unavailable`, just
like its missing timestamp and source coverage. Loaded API provenance is
unchanged. The next-day browser regression exposed this second date mismatch.

The search URL had a second mismatch. Server rendering used empty URL defaults,
but the first browser render read `q=` and added a `Filter (1)` chip. The local
development React diff identified that button text directly. This is the URL
initialization defect associated with search-link hydration; it does not
explain the separate date mismatch on the plain page. Current Production
reproduction retained `q=mcdavid` after React recovered, so search loss was
not independently reproduced in this pass.

Players now uses identical defaults for server and first browser render,
then restores filters, selected player, season and competition after mount.
Statistics reads and URL writes retain their readiness gate. URL serialization
uses immediate search state, avoiding a deferred-search overwrite during
restoration; deferred search remains in result filtering. `popstate` restores
the same URL state for browser Back/Forward.

## Focused verification

- `npm test -- __tests__/players-hydration.test.ts __tests__/players-url-state.test.ts __tests__/qw02-player-search.test.ts __tests__/mob-players-stabilization.test.ts __tests__/qw03-data-context.test.ts`
- `npx tsc --noEmit`
- `npx eslint app/components/Header.tsx app/players/page.tsx app/lib/data-context.ts __tests__/players-hydration.test.ts scripts/verify-players-hydration.mjs`
- `node scripts/verify-players-hydration.mjs`: isolated API responses, mobile
  412px and desktop 1280px; direct load/reload for all three URLs, search,
  season selection and Back/Forward. The browser clock is fixed to October 5
  to exercise a different day from the server render. Local development uses
  CSP bypass for React development diagnostics only; Preview does not.

Local results: 40/40 focused tests across five files; TypeScript and targeted
lint passed. Both widths passed the three direct-load/reload pairs and the
search/season/history journey with zero hydration or browser errors.

The browser harness accepts `PLAYERS_HYDRATION_BASE_URL` and
`PLAYERS_HYDRATION_OUTPUT`. Fixtures prove UI/hydration behavior, not live NHL
coverage. No API, roster, valuation, storage, cache or Labs behavior changes.
Normal PR CI supplies broader tests/build checks. Do not merge or deploy before
independent review.
