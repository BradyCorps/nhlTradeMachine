# Purging the large CSVs from git history

**Status: not done. Must be run from a clone with full history.**

## What is left to do

Two files are untracked as of 2026-07-31 but still sit in every commit that
carried them:

| file | raw size |
| --- | ---: |
| `OtherData/HistoricalData/lines_2008_to_2024.csv` | 75 MB |
| `OtherData/HistoricalData/skaters_2008_to_2024.csv` | 54 MB |
| `repomix-output.xml` | 45 MB |
| `repomix-output.txt` | 23 MB |

Untracking stops them growing with future revisions. It does not remove them
from history, so every clone still downloads them.

## What the saving actually is

**About 10 MB of packfile, not 197 MB.** CSVs compress hard, so the raw file
sizes wildly overstate what a clone pays. Measured on a partial clone before and
after: `size-pack` 49.87 MiB → 40.12 MiB.

That is worth having, and it is not the emergency the file listing suggests. The
better reason to do it is that these files change wholesale when a season is
added — a new revision of a 54 MB CSV is a new 54 MB blob, forever.

## Why it was not done from the agent session

The session's clone had **truncated history** — 62 commits, ending at
`2d9b655`, where the real repository has 611 ending at `aa6c146 Initial commit`.
It was not marked shallow (`git rev-parse --is-shallow-repository` returned
`false`, no `.git/shallow`), so `git filter-repo` had no way to detect the
problem and rewrote only what it could see.

The result looked entirely successful — 62 commits parsed, pack shrunk, tests
green. Force-pushing it would have **destroyed 548 commits of history**. The
discrepancy was caught by comparing `git rev-list --count HEAD` against the same
count on the fetched remote before pushing.

If you take one thing from this: before any force-push that follows a history
rewrite, compare the commit count against the remote. A rewrite that silently
drops history looks exactly like one that worked.

## How to do it properly

From a machine with a full clone, on a fresh copy:

```bash
# 1. Fresh, complete clone — filter-repo wants one, and it keeps your working
#    copy safe if anything goes wrong.
git clone https://github.com/BradyCorps/nhlTradeMachine.git rewrite-tmp
cd rewrite-tmp

# 2. VERIFY the history is complete before touching anything.
git rev-list --count HEAD          # expect ~611+, not ~62
git log --oneline | tail -1        # expect: aa6c146 Initial commit

# 3. Rewrite.
pip install git-filter-repo
git filter-repo \
  --path OtherData/HistoricalData/lines_2008_to_2024.csv \
  --path OtherData/HistoricalData/skaters_2008_to_2024.csv \
  --path repomix-output.txt \
  --path repomix-output.xml \
  --invert-paths

# 4. VERIFY AGAIN — the count must be unchanged, only the blobs gone.
git rev-list --count HEAD          # same number as step 2
git count-objects -vH | grep size-pack

# 5. Only now, push.
git remote add origin https://github.com/BradyCorps/nhlTradeMachine.git
git push --force origin main
```

## After the force-push

Every existing clone — your Codespace, any other machine — has history that no
longer matches. Each needs:

```bash
git fetch origin
git reset --hard origin/main
```

Anything committed but unpushed at that moment is lost, so push first.

You will also need the two CSVs back on disk for the offline builders. They are
gitignored now, so put them in `OtherData/HistoricalData/` and verify against
the `sha256` each artifact records in `app/data/*.json` under `sources`.

## Is it worth doing at all

Reasonable to skip. 10 MB on a clone is not much, the files are untracked so
they will not grow, and a force-push on a repository with a live deploy carries
its own risk. The case for doing it is future seasons: each new revision of a
54 MB CSV would add another permanent blob, and that does compound.
