# Gravity v4 Offline Pipeline Boundary

No fitting pipeline or fitted player artifact is included in the current execution scope.

Gravity v4 training requires an authorized shift-, event-, stint-, or possession-level source that can support:

- stable numeric NHL player IDs;
- explicit season, game, strength-state, and source identifiers;
- teammate-only OZ expected-goal targets that exclude the focal player's shots, individual xG, goals, and direct box-score production;
- event-valued transition states, or an explicitly labelled proxy/missing NZ result;
- opponent expected goals prevented for positive DZ output;
- context controls for teammates, opponents, team, game state, deployment, goaltender, and season;
- block bootstrap by game, player-cluster bootstrap, or a posterior interval;
- immutable/versioned inputs, deterministic exports, persisted settings, and rejected-row coverage reports.

The application runtime must consume exported JSON only; it must never fit a league model during a request.

When an authorized source becomes available, the offline implementation should follow the stages named in `docs/PLAYER_GRAVITY_V4_IMPLEMENTATION_SPEC.md`:

```text
build-stints
build-possession-states
fit-oz-model
fit-nz-model
fit-dz-model
bootstrap-estimates
validate-model
export-profiles
```

Until those stages exist and the validation gates pass:

- `GRAVITY_V4_ENABLED` remains false by default;
- `app/lib/gravity-v4/runtime-artifact.ts` remains `null`;
- the zero-value fixture is restricted to `/api/admin/gravity-v4`;
- Gravity v3 remains the clearly labelled fallback;
- X-NAV and the season simulator do not import Gravity v4.
