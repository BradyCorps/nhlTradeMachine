he core idea. A player is modeled as a mass distribution laid across the rink, exactly like a mass on a spacetime sheet in general relativity. The rink lattice is league-average hockey; the player curves it. We compute three masses — where the warping happens — and the total force is just their weighted sum. The number and the picture come from the same object: the diagram isn't decorating the stat, it is the stat.

The three zone masses:

    OZ Well (weight 45%) — offensive warping. Inputs: on-ice lift (on-off xG share, blended 40% current season / 60% multi-season baseline), assist creation rate, individual xG threat, and PP production. Positive mass pulls the lattice toward the opponent's net — play "falls downhill" into their zone.
    NZ Well (weight 30%) — transition warping. The signature input is displacement: where play actually lives (NHL EDGE zone-time) minus where deployment says it should live (zone starts). A player who starts in his own end but lives in the offensive zone is measurably dragging the game through center ice — that's the Quinn Hughes signal, and it's why he tops your leaderboard. Top speed and 20+ mph burst rate round it out.
    DZ Dome (weight 25%) — defensive warping, and it's repulsive. xGA suppression, defensive point shares, and PK trust build a dome opponents can't dig a well into. It renders as a hollow ring node and an outward bulge in the lattice. A negative DZ mass is the nightmare case: a well in your own end, drawn in red.

Position normalization — the F/D fairness layer. Every input is converted to a z-score against that position's league distribution before anything else happens (a defenseman's 65-assist pace is measured against defensemen, where it's +4σ; a forward's identical pace is ~+2.8σ). Then all masses are squashed through tanh into a hard (−1, +1) bound. This is why your gravity top-10 skews defensemen: an offense-driving D sits further out on the D tail than most elite forwards sit on the F tail. That's deliberate — the rarity is the gravity — and force stays one comparable currency across positions.

Assembly is additive, not multiplicative. force = 0.45·OZ + 0.30·NZ + 0.25·DZ, bounded (−1, +1) by construction. This is what killed the Fox 4.87 bug: the old engine multiplied five factors, so five slightly-generous numbers compounded into absurdity. Now nothing compounds.

Trust machinery:

    Partner Independence (0–100) — is the on-ice lift the player's own, or borrowed from elite linemates? Measured by year-over-year on-off agreement, plus direct pair with/without evidence for D. It damps the lift input directly — Scheifele's "40 BORROWED?" in your screenshot means his lift is only being credited at 40% strength.
    Confidence (0–100) — sample size + season-over-season stability + data coverage. Players missing EDGE data get a reduced transition read and it says so.
    Missing data is skipped, never scored — a data gap doesn't count as bad play.

Tiers are fixed cutoffs on the bounded scale: SUPERMASSIVE ≥ 0.55, STAR ≥ 0.40, MAIN SEQUENCE ≥ 0.22, SATELLITE ≥ 0.08, ASTEROID down to −0.22 (wide on purpose — half the league is below zero on a position-relative scale), BLACK_HOLE below that, reserved for fields that genuinely cave.

The X-NAV handoff (no double counting). X-NAV already prices on-off lift, defense, DPS, and PK time in its OFF/DEF components. So GRAV in the NAV breakdown consumes only the residual — OZ creation shape plus the NZ transition signal — never the full force. That's why McDavid can be +0.76 force but only +27 GRAV: most of his gravity is already priced into his +350 OFF.

What to watch for in testing: shapes, not just numbers. McDavid should be a steep OZ pinch; Hughes a deep center-ice trench; Suzuki a rare balanced three-zone basin; shutdown D mostly dome. Flag anyone whose shape contradicts your eye test — with the engine now additive and skip-missing-data, shape errors point at calibration constants (the per-position means/σ in gravity.ts), which are estimates meant to be refit against a real league sample. That refit is the natural next phase.
