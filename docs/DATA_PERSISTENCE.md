# Keeping the data we fetch

**Status: the crawler exists and has never been run. Everything below the first
section is a proposal.**

## The problem, stated concretely

The app calls MoneyPuck and the NHL API on every request and stores none of it.
Three things follow, and all three are already biting:

1. **The fitted models are not reproducible.** `skater-fmv.json`,
   `skater-stability.json`, `goalie-fmv.json` and `goal-value.json` each record
   a `sha256` for every source file. That is honest and it is useless once a
   feed rolls over, because the file those hashes name no longer exists
   anywhere. We cannot rebuild the artifacts, and we cannot prove what they were
   built from.

2. **A drifting model looks exactly like a changing feed.** Nothing records when
   a value was computed or against which version of the data. When a number
   moves, there is no way to tell whether the model changed its mind or the
   input changed underneath it.

3. **The season-over-season comparison is impossible.** "The market prices him
   here, his production measures him there, tracked across seasons" needs a
   per-player, per-season snapshot that survives. Today we recompute from a live
   feed that only holds the current year.

## What exists now

`scripts/nhl-archive/crawl.py` — standard library only, no `pip install`.

```bash
python3 scripts/nhl-archive/crawl.py discover --dry-run   # see the plan
python3 scripts/nhl-archive/crawl.py discover             # probe 42 endpoints
python3 scripts/nhl-archive/crawl.py harvest --seasons 20232024,20242025
```

`discover` probes an endpoint list and records what answers. There is no
directory to crawl and no published spec, so this is not enumeration in the
sitemap sense — with one exception. `api.nhle.com/stats/rest/en/config`
genuinely lists that service's report tables, and it is the closest thing to a
real index the NHL publishes.

It is rate limited to 3 requests a second, serialised, backs off on 429 and 5xx,
identifies itself in the User-Agent, and refuses to run above 8/s. This is
somebody else's public service; an archive is worthless if the source shuts the
door on us.

Storage is content-addressed:

```
OtherData/nhl-archive/manifest.jsonl              append-only, one line per fetch
OtherData/nhl-archive/raw/<slug>/<ab>/<sha256>.json.gz
```

Re-fetching an unchanged endpoint costs a manifest line and no duplicate
payload, which is what makes *when did this feed last change* answerable.

**The blobs are gitignored; the manifest is not.** The manifest is small, it is
the reproducibility record, and it belongs in version control. The payloads are
re-fetchable and would bloat the repository the way the historical CSVs already
did — see `docs/HISTORY_REWRITE.md` for how that went.

## The proposal: raw on disk, derived in the database

The app runs libsql (SQLite) through Drizzle. That is a good fit for derived,
queryable tables and a poor one for a growing pile of large JSON blobs.

So split it the way data warehouses do:

| layer | where | what | rebuildable? |
| --- | --- | --- | --- |
| **raw** | filesystem, gzipped, content-addressed | exactly what the API returned | no — this is the record |
| **derived** | libsql via Drizzle | per-player per-season rows the app queries | yes, from raw |
| **artifacts** | `app/data/*.json`, committed | fitted coefficients, aggregate only | yes, from raw |

Why raw does not go in the database:

- A raw response is an immutable historical fact. It never needs a migration,
  and a schema change must never be able to corrupt it.
- Blobs in SQLite are awkward to back up incrementally and awkward to diff. On
  disk they are `rsync`-able and `zcat | jq`-able today, with no tooling.
- The derived layer can be dropped and rebuilt at will, which is the whole point
  of keeping the raw layer separate.

Why derived goes in the database:

- It is what the app actually queries per request.
- It wants indexes, joins and a schema.
- It is disposable, so migrations carry no risk of losing anything.

### The table the longitudinal comparison needs

One row per player per season, written by a builder that reads the raw archive:

```
player_season(
  player_id, season,
  games, ice_seconds, points, goals,
  on_ice_xg_for, on_ice_xg_against, individual_xg,
  cap_hit, cap_pct,
  market_price_cap_pct,      -- what skater-fmv said, at the time
  production_value_goals,    -- what the outcomes read measured
  model_version,             -- which artifact produced those two
  computed_at
)
```

`model_version` and `computed_at` are the point. With them, a number that moves
can be attributed to the model or to the data. Without them the comparison is
just two lines with no provenance.

## Order of work

1. Run `discover` and see what is actually live. The probe list is educated
   guessing until it has met the real API.
2. Harvest the seasons we have contract data for — 2017 onward — so the fits can
   be rebuilt from the archive rather than from files on one laptop.
3. Add the `player_season` table and a builder that populates it from raw.
4. Only then wire the production line into the UI. It needs somewhere to live
   first.

## Things deliberately not decided

- **Whether the historical MoneyPuck CSVs move into the archive.** They are not
  from the NHL API and they are already the thing that bloated git history. They
  probably belong in the same raw layer, but under their own source key.
- **Retention.** Content-addressing means unchanged data costs nothing, but
  play-by-play for every game would be gigabytes. Harvest currently pulls
  rosters, club stats and the summary reports, not play-by-play.
- **Where the archive lives long term.** A local directory is fine for one
  machine and wrong for a deployed app. Object storage is the obvious answer and
  is not needed until something other than a laptop reads it.
