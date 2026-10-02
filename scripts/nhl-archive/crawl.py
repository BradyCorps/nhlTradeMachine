#!/usr/bin/env python3
"""Archive the NHL's public JSON, verbatim, so a season cannot be lost.

    python3 scripts/nhl-archive/crawl.py discover
    python3 scripts/nhl-archive/crawl.py harvest --seasons 20232024,20242025
    python3 scripts/nhl-archive/crawl.py harvest --seasons 20242025 --dry-run

WHY THIS EXISTS

Every model in this repo is fitted on data the app fetches and then throws
away. `skater-fmv.json` records a sha256 for each source, which is honest and
useless once the feed has rolled over: the file it names no longer exists
anywhere. That makes the fits unreproducible, it makes a drifting model
indistinguishable from a changing feed, and it makes the season-over-season
comparison impossible, because there is nothing to compare against.

Raw JSON is the right thing to keep. Derived tables can always be rebuilt from
the responses; the responses cannot be rebuilt from anything.

WHAT "FIND EVERY API" ACTUALLY MEANS HERE

There is no directory to crawl and no published spec, so this cannot enumerate
the NHL's surface the way a sitemap would. Two things are possible and both are
done:

  * `api.nhle.com/stats/rest/en/config` genuinely enumerates that service — the
    report tables and their attributes. That IS discovery, and every report it
    names is probed.

  * `api-web.nhle.com/v1/*` has no index, so it gets a probe list: the patterns
    this app already calls plus the widely documented ones. Anything answering
    200 with JSON is recorded as live. Absence of evidence here is not evidence
    of absence, and the output says so.

BEING A GOOD CITIZEN

This is somebody else's public service and it owes us nothing. Requests are
serialised and rate limited, 429 and 5xx get exponential backoff, and the
User-Agent says who is calling. Do not raise --rate to be clever; a discovery
sweep that hammers the API is how a project gets blocked, and the whole archive
is worthless if the source shuts the door.

STORAGE

Content-addressed: the body is hashed and written once, so re-fetching an
unchanged endpoint costs a manifest line and no duplicate payload. That is what
makes "did this feed change, and when" answerable later.

    OtherData/nhl-archive/manifest.jsonl     one line per fetch, append-only
    OtherData/nhl-archive/raw/<slug>/<ab>/<sha256>.json.gz

Standard library only — no pip install, so it runs anywhere.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ARCHIVE = ROOT / "OtherData" / "nhl-archive"
MANIFEST = ARCHIVE / "manifest.jsonl"

WEB = "https://api-web.nhle.com/v1"
STATS = "https://api.nhle.com/stats/rest/en"

USER_AGENT = (
    "cap-and-crease-archiver/1.0 "
    "(hockey analytics; archival of public data; contact via repository)"
)

# ── Politeness ───────────────────────────────────────────────────
DEFAULT_RATE = 3.0          # requests per second, ceiling
MAX_RETRIES = 4
BACKOFF_BASE = 2.0          # seconds, doubled per retry
TIMEOUT = 30

TEAMS = [
    "ANA", "BOS", "BUF", "CAR", "CBJ", "CGY", "CHI", "COL", "DAL", "DET",
    "EDM", "FLA", "LAK", "MIN", "MTL", "NJD", "NSH", "NYI", "NYR", "OTT",
    "PHI", "PIT", "SEA", "SJS", "STL", "TBL", "TOR", "UTA", "VAN", "VGK",
    "WPG", "WSH",
]


@dataclass
class Fetch:
    url: str
    status: int
    sha256: str | None
    bytes: int
    fetched_at: str
    path: str | None
    error: str | None = None


class Client:
    """Serialised, rate-limited, backing off. Deliberately unclever."""

    def __init__(self, rate: float, dry_run: bool = False):
        self.min_interval = 1.0 / rate if rate > 0 else 0.0
        self.last = 0.0
        self.dry_run = dry_run
        self.counts = {"ok": 0, "missing": 0, "error": 0, "cached": 0}

    def _wait(self) -> None:
        gap = time.monotonic() - self.last
        if gap < self.min_interval:
            time.sleep(self.min_interval - gap)
        self.last = time.monotonic()

    def get(self, url: str) -> tuple[int, bytes | None, str | None]:
        if self.dry_run:
            return 0, None, "dry-run"
        for attempt in range(MAX_RETRIES):
            self._wait()
            req = urllib.request.Request(url, headers={
                "User-Agent": "Mozilla/5.0 " + USER_AGENT,
                "Origin": "https://www.nhl.com",
                "Referer": "https://www.nhl.com/",
                "Accept": "application/json",
            })
            try:
                with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                    return resp.status, resp.read(), None
            except urllib.error.HTTPError as e:
                # 404 is a real answer — the endpoint is not there. Retrying it
                # is just noise aimed at somebody else's server.
                if e.code == 404:
                    return 404, None, None
                if e.code == 429 or e.code >= 500:
                    wait = BACKOFF_BASE * (2 ** attempt)
                    retry_after = e.headers.get("Retry-After") if e.headers else None
                    if retry_after and retry_after.isdigit():
                        wait = max(wait, int(retry_after))
                    print(f"    {e.code} — backing off {wait:.0f}s", file=sys.stderr)
                    time.sleep(wait)
                    continue
                return e.code, None, str(e)
            except Exception as e:  # noqa: BLE001 — network, DNS, timeouts
                wait = BACKOFF_BASE * (2 ** attempt)
                print(f"    {type(e).__name__} — retrying in {wait:.0f}s", file=sys.stderr)
                time.sleep(wait)
        return 0, None, "gave up after retries"


def slugify(url: str) -> str:
    """A stable directory name for an endpoint family."""
    path = re.sub(r"^https?://[^/]+/", "", url)
    path = path.split("?")[0]
    # Collapse anything that looks like an id or a season so one family lands in
    # one folder rather than ten thousand.
    path = re.sub(r"/\d{8,}", "/_season", path)
    path = re.sub(r"/\d+", "/_id", path)
    path = re.sub(r"/\d{4}-\d{2}-\d{2}", "/_date", path)
    return re.sub(r"[^a-zA-Z0-9._-]+", "-", path).strip("-") or "root"


def store(client: Client, url: str, seen: set[str]) -> Fetch:
    now = datetime.now(timezone.utc).isoformat()
    status, body, err = client.get(url)

    if body is None:
        if status == 404:
            client.counts["missing"] += 1
        elif err != "dry-run":
            client.counts["error"] += 1
        return Fetch(url, status, None, 0, now, None, err)

    digest = hashlib.sha256(body).hexdigest()
    slug = slugify(url)
    rel = Path("raw") / slug / digest[:2] / f"{digest}.json.gz"
    dest = ARCHIVE / rel

    if dest.exists():
        # Same bytes as a previous fetch. The manifest still records that we
        # looked, which is how "when did this last change" stays answerable.
        with gzip.open(dest, "rb") as fh:
            if hashlib.sha256(fh.read()).hexdigest() != digest:
                raise ValueError(f"corrupt archive object: {dest}; refusing to overwrite")
        client.counts["cached"] += 1
    else:
        dest.parent.mkdir(parents=True, exist_ok=True)
        with gzip.open(dest, "wb") as fh:
            fh.write(body)
        seen.add(digest)
        client.counts["ok"] += 1

    return Fetch(url, status, digest, len(body), now, str(rel))


def append(records: list[Fetch]) -> None:
    ARCHIVE.mkdir(parents=True, exist_ok=True)
    with MANIFEST.open("a", encoding="utf-8") as fh:
        for r in records:
            fh.write(json.dumps(asdict(r), separators=(",", ":")) + "\n")


def known_digests() -> set[str]:
    if not MANIFEST.exists():
        return set()
    out: set[str] = set()
    with MANIFEST.open(encoding="utf-8") as fh:
        for line in fh:
            try:
                d = json.loads(line).get("sha256")
            except json.JSONDecodeError:
                continue
            if d:
                out.add(d)
    return out


# ── Discovery ────────────────────────────────────────────────────

def probe_list(season: str, team: str, player: str, game: str) -> list[str]:
    """Endpoints to test for liveness.

    The app's own calls, plus the widely documented rest of the surface. A 404
    here means "not at this path with these arguments", which is weaker than
    "does not exist" — some endpoints only answer during a season, or for a
    game id that actually happened.
    """
    return [
        # ── in use by this app today ──
        f"{WEB}/standings/now",
        f"{WEB}/roster/{team}/{season}",
        f"{WEB}/roster/{team}/current",
        f"{WEB}/player/{player}/landing",
        f"{WEB}/edge/skater-detail/{player}/{season}/2",
        f"{STATS}/skater/summary?limit=1&cayenneExp=seasonId={season}",
        f"{STATS}/goalie/summary?limit=1&cayenneExp=seasonId={season}",
        f"{STATS}/team/summary?limit=1&cayenneExp=seasonId={season}",
        # ── the enumerable one: this lists the stats service's own tables ──
        f"{STATS}/config",
        # ── probes ──
        f"{WEB}/meta",
        f"{WEB}/season",
        f"{WEB}/standings-season",
        f"{WEB}/roster-season/{team}",
        f"{WEB}/club-stats/{team}/{season}/2",
        f"{WEB}/club-stats-season/{team}",
        f"{WEB}/club-schedule-season/{team}/{season}",
        f"{WEB}/scoreboard/{team}/now",
        f"{WEB}/player/{player}/game-log/{season}/2",
        f"{WEB}/player-spotlight",
        f"{WEB}/skater-stats-leaders/{season}/2?limit=1",
        f"{WEB}/goalie-stats-leaders/{season}/2?limit=1",
        f"{WEB}/gamecenter/{game}/play-by-play",
        f"{WEB}/gamecenter/{game}/boxscore",
        f"{WEB}/gamecenter/{game}/landing",
        f"{WEB}/gamecenter/{game}/right-rail",
        f"{WEB}/draft/picks/2024/1",
        f"{WEB}/draft/rankings/2024/1",
        f"{WEB}/draft/tracker/now",
        f"{WEB}/schedule/now",
        f"{WEB}/score/now",
        f"{WEB}/where-to-watch",
        f"{WEB}/partner-game/US/now",
        f"{STATS}/componentSeason",
        f"{STATS}/season",
        f"{STATS}/team",
        f"{STATS}/franchise",
        f"{STATS}/players",
        f"{STATS}/draft?limit=1",
        f"{STATS}/officials?limit=1",
        f"{STATS}/attendance",
        f"{STATS}/game?limit=1",
        f"{STATS}/leaders/skaters/points?cayenneExp=season={season}",
    ]


def discover(args: argparse.Namespace) -> None:
    client = Client(args.rate, args.dry_run)
    seen = known_digests()
    urls = probe_list(args.season, args.team, args.player, args.game)

    verb = "Would probe" if args.dry_run else "Probing"
    print(f"{verb} {len(urls)} endpoints at {args.rate}/s. This is a public "
          f"service — the rate limit is deliberate.\n")
    records: list[Fetch] = []
    live: list[str] = []
    for url in urls:
        rec = store(client, url, seen)
        if args.dry_run:
            print(f"  would probe  {url}")
            continue
        records.append(rec)
        mark = {200: " live", 404: "  404"}.get(rec.status, f"  {rec.status or 'ERR'}")
        size = f"{rec.bytes / 1024:8.1f} KB" if rec.bytes else " " * 11
        print(f"  {mark} {size}  {url}")
        if rec.status == 200:
            live.append(url)
    if args.dry_run:
        print(f"\n  {len(urls)} endpoints would be probed. Nothing was fetched.")
        return
    append(records)

    print(f"\n  live {len(live)}   missing {client.counts['missing']}   "
          f"errors {client.counts['error']}   already archived {client.counts['cached']}")

    # The stats service names its own reports. Anything here is harvestable and
    # is the closest thing to a real directory the NHL publishes.
    cfg = next((r for r in records if r.url.endswith("/config") and r.sha256), None)
    if cfg and cfg.path:
        with gzip.open(ARCHIVE / cfg.path, "rb") as fh:
            data = json.load(fh)
        tables = sorted(data.keys()) if isinstance(data, dict) else []
        print(f"\n  stats/rest/en/config enumerates {len(tables)} report groups:")
        print("    " + ", ".join(tables[:24]) + (" …" if len(tables) > 24 else ""))
        print("\n  Those are the report families worth harvesting; nothing else")
        print("  the NHL publishes is self-describing.")

    print(f"\n  manifest: {MANIFEST}")


# ── Harvest ──────────────────────────────────────────────────────

def harvest_plan(seasons: list[str], game_types: list[int]) -> list[str]:
    plan: list[str] = []
    for season in seasons:
        for game_type in game_types:
            for report in ["skater/summary", "goalie/summary", "team/summary"]:
                # -1 requests the entire summary; completeness is checked before player discovery.
                plan.append(f"{STATS}/{report}?limit=-1&cayenneExp=seasonId={season}%20and%20gameTypeId={game_type}")
            for team in TEAMS:
                plan.append(f"{WEB}/club-stats/{team}/{season}/{game_type}")
        for team in TEAMS:
            plan.append(f"{WEB}/roster/{team}/{season}")
    return plan


def harvest(args: argparse.Namespace) -> None:
    seasons = [s.strip() for s in args.seasons.split(",") if s.strip()]
    if not seasons:
        sys.exit("--seasons is required, e.g. --seasons 20232024,20242025")

    client = Client(args.rate, args.dry_run)

    game_types = [int(g) for g in args.game_types.split(",")]
    if not game_types or any(g not in (2, 3) for g in game_types):
        sys.exit("--game-types must contain 2 (regular season) and/or 3 (playoffs)")
    if any(not re.fullmatch(r"20\d{6}", season) or int(season[4:]) != int(season[:4]) + 1 for season in seasons):
        sys.exit("invalid consecutive NHL season id")
    plan = harvest_plan(seasons, game_types)

    est = len(plan) / max(args.rate, 0.1) / 60
    print(f"{len(plan)} requests across {len(seasons)} season(s) — roughly "
          f"{est:.0f} minutes at {args.rate}/s.")
    if args.dry_run:
        for u in plan[:20]:
            print(f"  would fetch  {u}")
        print(f"  … {max(0, len(plan) - 20)} more")
        if args.include_player_details: print("  plus all players discovered from complete summaries: landing, game logs, EDGE")
        return

    seen = known_digests()
    records: list[Fetch] = []
    player_plan: set[str] = set()
    for i, url in enumerate(plan, 1):
        rec = store(client, url, seen)
        records.append(rec)
        # Discover every player from the complete selected summary, including retired players.
        if "/summary?" in url:
            if rec.status != 200 or not rec.path:
                append(records)
                sys.exit("cannot preserve a complete inventory from an unavailable summary")
            with gzip.open(ARCHIVE / rec.path, "rt") as fh:
                summary = json.load(fh)
            rows = summary.get("data", [])
            season = re.search(r"seasonId=(\d+)", url).group(1)
            game_type = int(re.search(r"gameTypeId=(\d+)", url).group(1))
            if summary.get("total") != len(rows) or any(row.get("seasonId") != int(season) for row in rows):
                append(records)
                sys.exit("refusing a truncated or wrong-season summary")
            kind = "goalie" if "/goalie/" in url else "skater"
            for row in rows if args.include_player_details and "/team/" not in url else []:
                player = row["playerId"]
                player_plan.add(f"{WEB}/player/{player}/landing")
                player_plan.add(f"{WEB}/player/{player}/game-log/{season}/{game_type}")
                player_plan.add(f"{WEB}/edge/{kind}-detail/{player}/{season}/{game_type}")
        if i % 25 == 0 or i == len(plan):
            print(f"  {i}/{len(plan)}  new {client.counts['ok']}  "
                  f"unchanged {client.counts['cached']}  missing {client.counts['missing']}")
        # Flush periodically so an interrupted run keeps what it got.
        if len(records) >= 50:
            append(records)
            records = []
    append(records)
    for i, url in enumerate(sorted(player_plan), 1):
        rec = store(client, url, seen)
        append([rec])
        if i % 50 == 0: print(f"  player details {i}/{len(player_plan)}")
    if client.counts["error"]:
        sys.exit(f"archive incomplete: {client.counts['error']} failed requests; manifest retained for retry")

    total = sum(f.stat().st_size for f in (ARCHIVE / "raw").rglob("*.json.gz")) if (ARCHIVE / "raw").exists() else 0
    print(f"\n  archive now {total / 1e6:.1f} MB on disk")
    print(f"  manifest: {MANIFEST}")


def verify(args: argparse.Namespace) -> None:
    records = {}
    for line in MANIFEST.read_text().splitlines():
        record = json.loads(line)
        records[record["url"]] = record
        if record["status"] == 200:
            path = (ARCHIVE / record["path"]).resolve()
            if not path.is_relative_to(ARCHIVE): sys.exit("archive object escaped archive directory")
            with gzip.open(path, "rb") as fh: body = fh.read()
            if hashlib.sha256(body).hexdigest() != record["sha256"] or len(body) != record["bytes"]:
                sys.exit("archive object digest/size mismatch")
    seasons = [season.strip() for season in args.seasons.split(",") if season.strip()]
    if not seasons: sys.exit("--seasons is required for verification")
    required = set(harvest_plan(seasons, [int(g) for g in args.game_types.split(",")]))
    for url in list(required):
        record = records.get(url)
        if "/summary?" in url:
            if not record or record["status"] != 200: sys.exit(f"missing summary: {url}")
            with gzip.open(ARCHIVE / record["path"], "rt") as fh: summary = json.load(fh)
            rows = summary.get("data", [])
            season = re.search(r"seasonId=(\d+)", url).group(1)
            game_type = int(re.search(r"gameTypeId=(\d+)", url).group(1))
            if summary.get("total") != len(rows) or any(row.get("seasonId") != int(season) for row in rows):
                sys.exit("incomplete or wrong-season summary")
            if args.include_player_details and "/team/" not in url:
                kind = "goalie" if "/goalie/" in url else "skater"
                for row in rows:
                    player = row["playerId"]
                    required.update([f"{WEB}/player/{player}/landing", f"{WEB}/player/{player}/game-log/{season}/{game_type}",
                                     f"{WEB}/edge/{kind}-detail/{player}/{season}/{game_type}"])
    for url in required:
        record = records.get(url)
        if not record or record["status"] not in (200, 404): sys.exit(f"missing or failed archive request: {url}")
    print(f"Verified {len(required)} requested URLs and all stored object digests. 404 means absent coverage, not zero games.")


def main() -> None:
    global ARCHIVE, MANIFEST
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("mode", choices=["discover", "harvest", "verify"])
    p.add_argument("--rate", type=float, default=DEFAULT_RATE,
                   help=f"requests per second (default {DEFAULT_RATE}); raising this is a bad idea")
    p.add_argument("--dry-run", action="store_true", help="print the plan, fetch nothing")
    p.add_argument("--archive-dir", type=Path, default=ARCHIVE, help="content-addressed archive destination")
    p.add_argument("--game-types", default="2,3", help="harvest: regular season 2, playoffs 3")
    p.add_argument("--include-player-details", action="store_true", help="harvest: archive all summary player landings, game logs and EDGE")
    p.add_argument("--seasons", default="", help="harvest: comma-separated, e.g. 20232024,20242025")
    p.add_argument("--season", default="20242025", help="discover: a season id to probe with")
    p.add_argument("--team", default="TOR", help="discover: a team code to probe with")
    p.add_argument("--player", default="8478402", help="discover: a player id to probe with")
    p.add_argument("--game", default="2024020001", help="discover: a game id to probe with")
    args = p.parse_args()
    ARCHIVE = args.archive_dir.resolve()
    MANIFEST = ARCHIVE / "manifest.jsonl"

    if args.rate > 8:
        sys.exit("refusing: a rate above 8/s on a public API is abusive and will get you blocked")

    {"discover": discover, "harvest": harvest, "verify": verify}[args.mode](args)


if __name__ == "__main__":
    main()
