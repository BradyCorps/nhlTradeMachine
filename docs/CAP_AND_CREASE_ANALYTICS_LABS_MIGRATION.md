# Cap & Crease — Analytics Labs Architecture Migration

**Repository:** `BradyCorps/nhlTradeMachine`  
**Status:** Execution specification  
**Primary objective:** Evolve Cap & Crease from a site containing analytical code into a platform that can safely develop, validate, shadow-test, promote, monitor, and roll back analytics without destabilizing public production surfaces.

---

## 0. Codex operating instruction

This document is an **architecture migration runbook**, not permission to perform an uncontrolled rewrite.

Before changing code:

1. Pull the latest remote state.
2. Read `AGENTS.md`, `ANALYTICS.md`, current analytics-state/model-card documents, relevant admin code, migrations/schema, test conventions, and any active release-gate documents.
3. Inventory the actual current repository structure.
4. Compare the repo to the assumptions in this document.
5. If paths or implementation details differ, preserve the architectural intent and adapt to the repository rather than forcing the example paths literally.
6. Work in bounded phases.
7. At the end of each phase:
   - run the appropriate tests/typecheck/lint/build;
   - record what changed;
   - record what did **not** change;
   - stop if production behaviour has changed unexpectedly.

Do **not** combine this migration with a new analytical model fit.

### Non-negotiable rule

> Infrastructure work must not change public analytical values unless a change is explicitly required to preserve existing behaviour during the migration.

F-NAV, D-NAV, G-NAV, X-NAV, Gravity, simulation, projections, fantasy outputs, trade values, and other public analytical outputs are to be treated as **frozen production behaviour** during the migration.

---

# 1. Why this migration exists

Cap & Crease has outgrown its original architecture.

It is no longer only:

- a hockey website;
- a trade machine;
- a collection of player/team pages;
- a set of independent calculations.

It now contains analytical systems with:

- model-specific methodology;
- historical and current-season datasets;
- calibration;
- holdout validation;
- release gates;
- diagnostic-only models;
- shadow testing;
- production versus candidate behaviour;
- player-level and aggregate validation;
- season snapshots;
- model artifacts;
- feature flags;
- public methodology obligations;
- simulation dependencies.

The current research process has already demonstrated why this matters.

A model may:

- compile;
- pass software tests;
- improve an aggregate metric;
- still behave incorrectly for individual players.

Therefore **software correctness and analytical validity must be separate concerns**.

The target architecture is:

```text
DATA
  ↓
DATASET / SNAPSHOT REGISTRY
  ↓
LAB EXPERIMENT
  ↓
VERSIONED ANALYTICAL ARTIFACT
  ↓
VALIDATION GATES
  ↓
PRODUCTION COMPARISON
  ↓
SHADOW / CANDIDATE
  ↓
APPROVAL
  ↓
PROMOTION
  ↓
PRODUCTION REGISTRY
  ↓
PUBLIC CAP & CREASE
```

The public website should consume approved production analytics.

The Lab should be where analytics are developed and evaluated.

---

# 2. Desired end state

After this migration, Cap & Crease should have three clearly separated analytical states.

## 2.1 Production

Analytics currently trusted for public use.

Examples:

- production F-NAV;
- production D-NAV;
- production G-NAV;
- production Gravity version;
- production simulation model;
- production prospect model.

Public surfaces read only approved production versions unless a route is explicitly a Lab/admin surface.

---

## 2.2 Labs

Candidate and experimental analytical systems.

Examples:

- NAV calibration candidate;
- alternate D-NAV formulation;
- Gravity vNext;
- partner-dependency metric;
- simulation calibration candidate;
- projection model candidate.

These may run on real data but **must not silently affect public outputs**.

---

## 2.3 Research history

Rejected, failed, superseded, or retired work.

A failed experiment is not deleted.

It should retain:

- hypothesis;
- code/model version;
- dataset version;
- parameters;
- artifact;
- validation results;
- comparison against production;
- reason for rejection;
- date;
- commit SHA where possible.

This prevents failed approaches from being accidentally rediscovered and gives Cap & Crease a real analytical lineage.

---

# 3. Scope

## In scope

- freeze current NAV development;
- capture the current production analytical baseline;
- bounded analytics-oriented code cleanup;
- admin information architecture refactor;
- Analytics Registry;
- experiment/run records;
- artifact records;
- validation gate records;
- production-versus-candidate comparison;
- promotion;
- rollback;
- audit history;
- dataset/snapshot references;
- migration of current NAV research into Labs;
- use NAV as the first proving case;
- documentation and tests.

## Out of scope for this migration

Do not turn this into a platform rewrite.

Specifically avoid:

- rewriting all analytics;
- changing NAV maths;
- refitting NAV;
- refitting Gravity;
- redesigning the public website;
- rewriting the simulation;
- introducing arbitrary Python execution in the browser/admin panel;
- building a notebook product;
- drag-and-drop model building;
- general-purpose workflow orchestration;
- a full MLflow clone;
- AI agents autonomously publishing analytics;
- replacing the current database/ORM unless absolutely necessary;
- changing authentication technology merely because the admin UI is being refactored;
- rewriting all legacy modules for stylistic consistency.

---

# 4. Branch and execution strategy

Create a dedicated migration branch from the latest `main`.

Suggested name:

```text
feature/analytics-labs-platform
```

Do not perform this migration directly on `main`.

Prefer multiple commits or PR-sized increments, for example:

```text
LAB-00 baseline and inventory
LAB-01 analytics boundary cleanup
LAB-02 admin information architecture
LAB-03 analytics registry
LAB-04 experiment and artifact records
LAB-05 validation and comparison
LAB-06 promotion and rollback
LAB-07 NAV migration into Labs
LAB-08 hardening and docs
```

Each increment must leave the repository in a working state.

---

# 5. Phase 0 — Freeze and baseline

## Goal

Capture exactly what production means **before** changing the architecture.

## Required work

### 5.1 Record repository baseline

Capture:

- HEAD SHA;
- current date;
- test count;
- build status;
- relevant environment/feature flags that determine analytical visibility;
- current production model versions where available;
- current analytical artifact hashes where available.

Create a document similar to:

```text
docs/analytics/LABS_MIGRATION_BASELINE.md
```

Do not invent model version numbers if none currently exist. Record the actual implementation/version identifiers in use.

---

### 5.2 Record production analytics

Inventory at minimum:

- X-NAV umbrella / aggregate use;
- F-NAV;
- D-NAV;
- G-NAV;
- Gravity;
- team NAV split;
- trade valuation dependencies;
- simulation dependencies;
- fantasy dependencies;
- projections;
- any analytic exposed on player/team dossiers.

For each analytic record:

```text
Name
Current implementation path(s)
Current public consumers
Current API consumers
Current tests
Current release/validation docs
Current dataset dependencies
Current feature flags
Current persisted artifacts
Fallback behaviour
```

---

### 5.3 Capture representative golden outputs

Build a small deterministic regression fixture representing production.

Select representative cases such as:

- elite forward;
- middle forward;
- low-sample forward/prospect;
- elite defenseman;
- middle defenseman;
- low-sample defenseman;
- elite goalie;
- tandem goalie;
- low-sample goalie;
- representative teams.

Do not hardcode real-player expectations unnecessarily if existing fixtures already provide equivalent coverage.

The purpose is:

> after the infrastructure refactor, the same inputs should produce the same production outputs.

This is an architecture migration, not a model migration.

---

## Acceptance criteria

- baseline document exists;
- current model/public consumers are inventoried;
- a regression mechanism exists for key production outputs;
- existing tests pass;
- typecheck passes;
- lint passes;
- production build passes;
- no public analytical values intentionally changed.

**STOP if baseline behaviour cannot be reproduced.**

Resolve that before continuing.

### 5.4 Phase 0 repository reconciliation — 2026-09-11

The baseline is recorded in `docs/analytics/LABS_MIGRATION_BASELINE.md` at
repository SHA `48964340f28fef3dcfeeae6b8250f99c5086b419`. The following
amendments are binding for later phases:

- retain `app/lib/asset-nav.ts#calculateAssetNAV` as the public NAV boundary;
  do not introduce a parallel selector path;
- extend the existing Drizzle/libSQL schema and season-snapshot conventions,
  rather than creating a separate snapshot/data registry;
- import code, tightly scoped environment flags, and the pinned Gravity v4
  artifact as the current production-selection reality before a registry exists;
- treat server-side authorization for new analytics mutations and any
  server-rendered admin-page protection as separate, explicitly tested work;
- do not assume season snapshot tables contain historical production rows;
  verify and record their population before reuse as run provenance;
- reconcile the documented older D-NAV presentation claim during the later
  documentation phase; it is not a Phase 0 mathematical change.

---

# 6. Phase 1 — Bounded analytics code cleanup

## Goal

Create clean boundaries between:

1. analytical implementation;
2. analytical artifact;
3. production selection;
4. presentation.

Do not perform a repository-wide cleanup.

---

## 6.1 Target conceptual structure

Adapt paths to existing repository conventions.

A reasonable end-state concept is:

```text
app/
  admin/
    ...
  players/
  teams/
  ...

lib/
  analytics/
    registry/
    production/
    labs/
    validation/
    artifacts/
    datasets/
    nav/
    gravity/
    simulation/
    ...

scripts/
  analytics/
    ...

docs/
  analytics/
    ...
```

If the repository already has better established locations, keep them.

---

## 6.2 Required separation

Public pages should not contain model-fitting or research logic.

Prefer:

```text
Public Page
   ↓
analytics service / selector
   ↓
production registry
   ↓
approved implementation/artifact
```

Avoid:

```text
Public Page
   ↓
feature-flag chain
   ↓
JSON import
   ↓
inline calculation
   ↓
alternate fallback
```

Feature flags may remain where genuinely useful, but model identity should become explicit rather than emergent.

---

## 6.3 Production selector

Introduce one authoritative way to answer:

> Which version of this analytic is currently production?

This might be:

- a database registry;
- an existing settings table extended for analytics;
- a strongly typed registry backed by the existing persistence layer.

Follow the repository's existing persistence conventions.

Do **not** create duplicate sources of truth.

---

## Acceptance criteria

- public outputs remain identical to baseline;
- analytical logic is not moved merely for aesthetics;
- production selection has one authoritative interface;
- existing fallbacks continue to work;
- tests/typecheck/lint/build pass.

---

# 7. Phase 2 — Refactor Admin into an operating layer

## Goal

Keep existing admin capabilities while making the navigation and conceptual model scalable.

The current admin should evolve, not be discarded.

Target information architecture:

```text
ADMIN

Overview

Content
├── News / Insights
└── Publishing
    (only if these capabilities actually exist)

Data
├── Players
├── Teams
├── Seasons
├── Data Health
└── Imports / Snapshots

Analytics
├── Production
├── Labs
├── Validation
└── Releases

Simulation
├── Model Health
├── Runs
└── Calibration
    (only where backed by real functionality)

Operations
├── Jobs / Health
├── Logs
├── Feature Flags / Settings
└── System Status
```

Do not create dead navigation entries for imaginary future products.

Only expose sections that are implemented or explicitly marked as coming later.

---

## 7.1 Preserve current admin tools

Existing admin workflows such as contracts, draft picks, health, season setup, teams, trades, trade block, and settings must remain reachable unless a deliberate migration moves them.

Do not sacrifice functional admin workflows to achieve a cleaner sidebar.

---

## 7.2 Admin overview

The new overview should answer operational questions, not just display cards.

At minimum consider:

- production analytics health;
- active Lab candidates;
- failed validation runs;
- stale datasets;
- last season snapshot/import;
- public analytics version state;
- recent promotions/rollbacks;
- system health warnings.

Avoid dashboard clutter.

---

## Acceptance criteria

- current admin functions remain available;
- navigation is coherent on desktop and mobile;
- Analytics has an explicit home;
- no public routes affected;
- admin authorization still protects all admin pages/actions;
- tests/typecheck/lint/build pass.

---

# 8. Phase 3 — Analytics Registry

## Goal

Create an explicit model inventory.

This is the foundation of Labs.

---

## 8.1 Analytic identity

Every analytic needs a stable machine ID.

Examples:

```text
nav.forward
nav.defense
nav.goalie
nav.aggregate
gravity
simulation.season
projection.player
prospect.nhle
trade.value
```

Do not assume these exact IDs are correct; map the actual repository systems.

---

## 8.2 Minimum registry fields

Conceptually:

```ts
type Analytic = {
  id: string
  name: string
  description: string
  domain: string
  owner?: string
  productionVersionId?: string
  status: "ACTIVE" | "EXPERIMENTAL" | "RETIRED"
}
```

Version:

```ts
type AnalyticVersion = {
  id: string
  analyticId: string
  version: string
  lifecycle:
    | "DEVELOPMENT"
    | "SHADOW"
    | "CANDIDATE"
    | "APPROVED"
    | "PRODUCTION"
    | "FAILED"
    | "RETIRED"

  gitSha?: string
  datasetRefs: string[]
  artifactRef?: string
  createdAt: string
  notes?: string
}
```

Adapt to current database conventions.

---

## 8.3 Lifecycle

Use a defined lifecycle:

```text
IDEA
  ↓
DEVELOPMENT
  ↓
SHADOW
  ↓
CANDIDATE
  ↓
APPROVED
  ↓
PRODUCTION
  ↓
RETIRED
```

`FAILED` is a valid terminal outcome for an experiment/version.

A failed version must not be promoted without explicitly creating a new version or superseding run.

---

## 8.4 Production uniqueness

For a given analytic and applicable scope, only one version may be production at a time.

Promotion must be transactional or equivalently safe.

Never allow:

```text
D-NAV v1 = PRODUCTION
D-NAV v2 = PRODUCTION
```

unless the model genuinely supports explicit segmented production scopes and those scopes are represented in the data model.

---

# 9. Phase 4 — Experiment runs and artifacts

## Goal

Make analytical research reproducible.

---

## 9.1 Experiment run record

Every meaningful Lab run should capture:

```text
Run ID
Analytic
Candidate version
Git SHA
Dataset/snapshot references
Configuration / parameters
Start time
End time
Status
Artifact reference
Validation reference
Notes
```

Where randomness exists, record seeds.

Where an external dataset is used, capture enough provenance to know exactly what was evaluated.

---

## 9.2 Dataset references

Cap & Crease already has season-oriented data and snapshots. Reuse that architecture where possible.

A run should be able to declare roles such as:

```text
TRAIN
VALIDATION
HOLDOUT
SHADOW
LIVE
```

Example:

```text
Training:
2023-24
2024-25

Holdout:
2025-26

Shadow:
2026-27
```

Do not mutate frozen historical datasets as part of an experiment.

---

## 9.3 Artifacts

An artifact is the output of a model/run, not the model code itself.

Examples:

- fitted coefficients;
- per-player values;
- calibration table;
- percentile map;
- Gravity profile artifact;
- simulation parameter artifact.

Each artifact should have:

```text
Artifact ID
Analytic/version
Run ID
Schema version
Dataset references
Generated timestamp
Hash/checksum where practical
Storage location
Validation status
```

Artifact integrity checks should fail closed when practical.

---

# 10. Phase 5 — Validation gates

## Goal

Separate "code works" from "analytic is valid."

Each candidate should have machine-readable validation output where practical.

---

## 10.1 Gate categories

Not every analytic needs identical metrics, but the framework should support categories such as:

### Software

- schema valid;
- artifact loadable;
- deterministic where expected;
- no NaN/Infinity;
- required IDs resolve;
- fallback works;
- tests pass.

### Data

- required coverage;
- no accidental season mismatch;
- sample-size thresholds;
- missing-data rate;
- duplicate detection;
- provenance present.

### Statistical

Examples only:

- MAE;
- bias;
- calibration slope/intercept;
- correlation;
- rank stability;
- bootstrap interval;
- year-over-year stability;
- holdout improvement;
- sensitivity.

### Hockey sanity / adversarial checks

Critical for this project.

Examples:

- elite/middle/depth ordering;
- no inverted deployment relationship;
- no threshold cliff;
- no pathological cap pile-up;
- no discontinuity at minimum-GP boundary;
- plausible positional distribution;
- individual-level checks in addition to aggregate checks.

Do not rely solely on aggregate team metrics.

---

## 10.2 Gate specification

A candidate's gates should be frozen **before** the final holdout is evaluated whenever the research protocol requires it.

Store:

```text
Gate name
Metric
Direction
Threshold
Observed value
PASS / FAIL / WARN
Required or diagnostic
```

A diagnostic should not silently become a release gate after results are known.

---

## 10.3 Verdict

Produce one explicit verdict:

```text
PASS
PARTIAL
FAIL
```

Or an equivalent existing repository convention.

Promotion rules must distinguish:

- required failed gate;
- diagnostic warning;
- known limitation.

---

# 11. Phase 6 — Production comparison

## Goal

Make it difficult to promote something that is statistically improved but behaviourally broken.

For every candidate, provide comparison against the current production model.

---

## 11.1 Required comparison classes

Where appropriate:

### Distribution

- mean;
- median;
- standard deviation;
- percentiles;
- min/max;
- positional distribution.

### Delta

- number of entities changed;
- median absolute delta;
- largest positive deltas;
- largest negative deltas;
- players/teams crossing material thresholds.

### Ranking

- top movers;
- largest rank changes;
- elite cohort;
- middle cohort;
- depth cohort;
- rookies/low sample where applicable.

### Validation

Side-by-side production versus candidate metrics.

---

## 11.2 UI concept

Example:

```text
D-NAV

Production
v1.4.0

Candidate
v1.5.0-shadow

Holdout MAE
Production: 0.483
Candidate:  0.449

Bias
Production: ...
Candidate:  ...

Largest rank changes
...

Release gates
✓ ...
✓ ...
✕ ...

VERDICT: FAIL

[View Run]
[View Artifact]
[View Player Deltas]
[Reject Candidate]
```

Do not allow a nice headline metric to hide failed gates.

---

# 12. Phase 7 — Promotion and rollback

## Goal

Allow approved analytical artifacts to reach public production without editing public pages or manually changing scattered flags.

---

## 12.1 What the Admin UI publishes

The Admin UI does **not** publish executable analytical code.

It may promote:

- a registered analytic version;
- a versioned artifact;
- an approved configuration.

Implementation code remains repository-controlled.

---

## 12.2 Promotion requirements

A normal promotion should require:

- candidate is registered;
- artifact exists where required;
- required validations have passed;
- dataset provenance is present;
- code/version identity is known;
- production comparison exists;
- user explicitly confirms promotion.

For exceptional overrides, if supported at all:

- require a typed reason;
- clearly mark the promotion as an override;
- record actor/time/reason;
- never silently bypass release gates.

For a single-user system, do not overbuild enterprise RBAC. Still keep mutations server-authorized and audited.

---

## 12.3 Promotion action

Conceptually:

```text
Current:
gravity v3.4.1

Candidate:
gravity v4.0.0

PROMOTE
```

After promotion:

```text
Current:
gravity v4.0.0

Previous:
gravity v3.4.1
```

Public consumers read the current production registry.

---

## 12.4 Rollback

Rollback must be a first-class action.

It should:

1. restore the previous production version/artifact;
2. preserve the failed/reverted version in history;
3. record reason/time;
4. avoid deleting evidence.

Rollback should not require a new deployment if the architecture supports artifact/configuration selection safely.

Do not force this if current infrastructure cannot support it without creating a dangerous second runtime. Use the simplest safe mechanism compatible with the repo.

---

# 13. Phase 8 — Migrate NAV into Labs

## Goal

Use NAV as the first real proving case.

Do not refit NAV yet.

---

## 13.1 Register production NAV

Register the actual current versions/implementations of:

```text
F-NAV
D-NAV
G-NAV
X-NAV / aggregate use
```

Record:

- implementation;
- docs/model card;
- current datasets;
- tests;
- dependencies;
- version identity;
- public consumers.

---

## 13.2 Import current NAV research history

Where source evidence exists, represent completed/recent work as historical runs.

Do not fabricate old metadata that was never recorded.

At minimum capture known results from the repository's current reports/docs/commits.

Examples of useful historical categories:

- D-NAV individual-level correction;
- G-NAV threshold/cap correction;
- goalie candidate tests that were rejected;
- NAV shadow calibration attempt;
- any frozen holdout result;
- known limitations.

Historical imports may be labelled:

```text
IMPORTED
```

or similar if the schema needs to distinguish legacy records from native Lab runs.

---

## 13.3 Current shadow-calibration work

The current F/D/G-NAV calibration work should enter the Lab as a **failed or partial candidate**, according to its actual recorded result.

Do not modify the thresholds to make the existing run pass.

Preserve:

- preregistered/frozen gates;
- output metrics;
- position-specific outcomes;
- overall outcome;
- commit SHAs;
- artifact/report references.

---

# 14. Phase 9 — Resume NAV research inside Labs

Only after Labs can:

- register NAV;
- record a run;
- reference datasets;
- store/read an artifact;
- evaluate gates;
- compare to production;
- render a verdict;
- preserve failed results;

should NAV research resume.

---

## 14.1 New workflow

Instead of:

```text
change NAV
↓
run tests
↓
inspect report
↓
decide whether to ship
```

use:

```text
create experiment
↓
freeze hypothesis + gates
↓
run candidate
↓
generate immutable artifact
↓
validate
↓
compare to production
↓
shadow
↓
approve or fail
↓
promote only if justified
```

---

## 14.2 Suggested NAV Lab screen

```text
NAV SYSTEM

Production
├── F-NAV [version]
├── D-NAV [version]
├── G-NAV [version]
└── Aggregate / X-NAV [version]

Candidates
├── [run/version] SHADOW
└── ...

History
├── NAV calibration attempt — FAILED
├── D-NAV model correction — SUPERSEDED / PRODUCTION HISTORY
├── G-NAV threshold correction — PRODUCTION HISTORY
└── goalie candidate test — REJECTED
```

A user should be able to click a candidate and see:

- description;
- hypothesis;
- code SHA;
- dataset;
- parameters;
- metrics;
- gates;
- player deltas;
- artifact;
- notes;
- verdict.

---

# 15. Public site contract

The public application should not need to understand research lifecycle.

Its contract should be simple:

```text
give me the production version of analytic X
```

or, where the analytic is embedded in application code:

```text
give me the approved production artifact/config for analytic X
```

The public site should never accidentally select:

- newest;
- latest run;
- candidate;
- shadow;
- development.

**Newest is not production.**

Only explicit promotion changes production selection.

---

# 16. Shadow mode

The architecture should support evaluating candidate analytics against incoming data without exposing them publicly.

Example:

```text
Production:
D-NAV v1

Shadow:
D-NAV v2
```

Both may run against 2026-27 data.

Public pages return v1.

Admin Labs compares:

```text
Production vs Shadow
```

This does not require every analytic to run live on every request.

Prefer scheduled/materialized evaluation when that is safer or cheaper.

---

# 17. Security and safety requirements

Admin analytics actions are privileged operations.

Requirements:

- reuse existing admin authentication;
- authorization must be checked server-side on mutation endpoints;
- never rely only on hidden buttons;
- no credentials in source;
- no arbitrary shell command execution from the Admin UI;
- no arbitrary user-supplied Python/JS execution;
- validate IDs and lifecycle transitions server-side;
- validate artifact schema before promotion;
- fail closed if the selected production artifact is corrupt or missing;
- preserve the current safe production fallback where applicable.

Promotion and rollback events should be auditable.

---

# 18. Persistence guidance

Use the existing database and migration conventions.

Do not introduce a new database solely for Labs.

A reasonable conceptual schema may include:

```text
analytics
analytic_versions
analytic_runs
analytic_artifacts
analytic_validation_results
analytic_promotions
```

Potentially dataset references can reuse existing season/snapshot tables rather than creating another competing dataset registry.

Exact tables are not mandated.

Prefer fewer well-defined tables over premature normalization.

---

# 19. Observability

Labs should make failures visible.

At minimum support detection/display of:

- failed run;
- missing artifact;
- invalid artifact;
- failed required gate;
- stale dataset reference;
- production version with unavailable artifact;
- mismatch between declared model version and artifact metadata.

Do not build a full monitoring platform in this ticket.

---

# 20. Documentation contract

Update or create documentation so there is one clear source for:

## Architecture

```text
docs/analytics/ANALYTICS_LABS_ARCHITECTURE.md
```

## Migration baseline

```text
docs/analytics/LABS_MIGRATION_BASELINE.md
```

## Lifecycle / promotion policy

```text
docs/analytics/ANALYTICS_RELEASE_LIFECYCLE.md
```

If equivalent existing documents already exist, extend them instead of duplicating documentation.

Update `ANALYTICS.md` so it describes the new production/Labs split accurately.

Do not leave stale methodology claims after the migration.

---

# 21. Testing requirements

## Unit

Test:

- lifecycle transitions;
- production uniqueness;
- artifact validation;
- gate verdict calculation;
- promotion;
- rollback;
- failed-candidate rejection;
- authorization helper where appropriate.

## Integration

Test:

- registering candidate;
- attaching run/artifact;
- validation;
- comparison;
- promotion;
- production selector;
- rollback.

## Regression

The baseline production fixture from Phase 0 must remain unchanged unless a documented migration-specific representation change requires snapshot updates with **no mathematical value change**.

## End-to-end/admin

At minimum verify:

- Analytics navigation;
- Production screen;
- Lab candidate screen;
- validation display;
- promotion confirmation;
- rollback;
- unauthorized mutation denial.

---

# 22. UI requirements

The Lab is an engineering/research surface.

Prioritize:

- information density;
- scanability;
- state clarity;
- provenance;
- comparison;
- failure visibility.

Avoid excessive visual decoration.

Use badges/statuses consistently:

```text
DEVELOPMENT
SHADOW
CANDIDATE
APPROVED
PRODUCTION
FAILED
RETIRED
```

Use explicit PASS / WARN / FAIL.

Never use colour as the only carrier of state.

---

# 23. Minimum viable Labs v1

Do not block completion on future-platform ideas.

Labs v1 is complete when it can do these six things:

1. **Analytics Registry**  
   Show what analytical systems exist and what is production.

2. **Experiment Runs**  
   Record what was tested, on what data, with what code/config.

3. **Artifacts**  
   Associate versioned analytical output with a run.

4. **Validation Gates**  
   Show pass/fail/warn against predefined criteria.

5. **Production Comparison**  
   Compare candidate behaviour to current production.

6. **Promotion / Rollback**  
   Safely select an approved production version and revert it.

Everything else can follow later.

---

# 24. Explicit non-goals for Labs v1

Do not build:

- notebook editor;
- visual formula builder;
- generalized DAG engine;
- arbitrary job scheduler;
- arbitrary code execution;
- model training GUI;
- AI scientist agent;
- cross-repository deployment platform;
- enterprise approval workflow;
- generalized analytics marketplace.

If implementation starts drifting toward these, stop and return to the six MVP capabilities.

---

# 25. Acceptance criteria for the entire migration

The migration is successful only if all of the following are true.

### Production stability

- existing public Cap & Crease surfaces still work;
- public analytical values match the frozen baseline;
- no experimental analytic silently affects public output.

### Architecture

- production selection is explicit;
- Labs and production are separate;
- analytical run/artifact/version identity is explicit;
- failed work can be preserved.

### Admin

- existing useful admin functionality remains accessible;
- Analytics → Production and Analytics → Labs exist;
- candidate details expose provenance and validation;
- production state is visible.

### Research

- NAV is registered;
- current NAV production versions are represented;
- at least one historical/recent NAV experiment is represented;
- a failed/partial run can be retained without being promoted;
- a candidate can be compared against production.

### Promotion

- only approved/eligible candidate state can normally promote;
- promotion updates the production selector;
- public consumers resolve the promoted version/artifact;
- rollback works;
- audit history remains.

### Quality

- full test suite passes;
- TypeScript passes;
- lint passes;
- production build passes;
- no undocumented analytics changes.

---

# 26. Stop conditions

Codex must stop the current phase and report rather than blindly continue if:

- baseline production outputs cannot be reproduced;
- migration changes public NAV values unexpectedly;
- current database architecture cannot guarantee unique/safe production selection;
- an admin route can promote without server-side authorization;
- artifact selection creates a fail-open state;
- required historical model identity cannot be determined;
- migration requires refitting an analytic to continue;
- tests reveal a pre-existing analytical defect unrelated to migration.

For a newly discovered analytical defect:

1. document it;
2. add a focused issue/backlog item if appropriate;
3. do not silently fix it inside the infrastructure migration unless it prevents safe migration.

---

# 27. Deliverables

At completion provide:

## Code

- admin Labs/Production surfaces;
- analytics registry;
- run/artifact/validation model;
- production selector;
- promotion;
- rollback;
- migrated NAV representation;
- tests.

## Documentation

- baseline;
- architecture;
- release lifecycle;
- updated analytics documentation;
- migration notes.

## Final report

Summarize:

```text
What changed
What stayed unchanged
Current production analytics
Registered Lab analytics
Imported historical experiments
Known limitations
Tests
Build
Migration/schema changes
Next recommended research task
```

---

# 28. Recommended first research task after migration

Do **not** immediately start multiple new analytical programs.

Use the Lab to resume the paused NAV work as the proving experiment.

The first native post-migration Lab experiment should:

1. start from the frozen current production NAV;
2. state one narrow hypothesis;
3. freeze its validation gates;
4. use explicit historical dataset roles;
5. generate a versioned candidate artifact;
6. compare player-level and aggregate behaviour against production;
7. fail honestly if required gates are not met;
8. remain shadow-only until the evidence supports promotion.

Once that lifecycle works end-to-end for NAV, reuse it for Gravity and subsequent analytics.

---

# 29. Architecture principle to preserve

The core rule for Cap & Crease going forward is:

> **Code creates candidates. Evidence approves candidates. The registry defines production. The public site consumes production.**

Do not collapse those four responsibilities back together.

That separation is the purpose of this migration.

---

# 30. Codex final instruction

Start with **Phase 0 only**.

Do not begin the full refactor immediately.

For the first implementation pass:

1. pull latest `main`;
2. inventory actual current analytics/admin architecture;
3. create the migration baseline;
4. add/confirm production regression fixtures;
5. propose any necessary changes to later phases based on the real repo;
6. run verification;
7. commit Phase 0 separately;
8. report findings before moving into Phase 1.

If Phase 0 reveals that this document assumes something incorrect about the current repository, update the migration plan explicitly rather than quietly working around it.

The objective is not speed at the expense of evidence.

The objective is to create a research architecture that lets Cap & Crease move **faster later without losing analytical integrity**.
