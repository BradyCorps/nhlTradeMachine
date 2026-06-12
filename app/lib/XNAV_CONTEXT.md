# Project Context: X-NAV Scaling & Tiering Rules

This document defines the core mathematical rules for player valuation adjustments within the trade engine. All TypeScript modifications to the valuation pipeline must strictly adhere to these normalization layers and classification matrices.

## 1. Mathematical Adjustments

### Deployment Normalization Multiplier ($M_{dep}$)
Normalizes baseline skater production by evaluating the variance between a player's actual deployment and league-average baselines.
* **Formula:** $M_{dep} = 1 + (Z_{dz} - \mu_{dz}) \cdot W_{z} + \left( \frac{QoC - \mu_{QoC}}{100} \right) \cdot W_{QoC}$
* **Baselines:** $\mu_{dz} = 0.50$, $\mu_{QoC} = 50$
* **Weights:** $W_{z} = 0.60$, $W_{QoC} = 0.35$

### Archetype Strain Index ($ASI$)
An overextension tax applied exclusively to high-minute, top-line offensive producers carrying excessive defensive burdens.
* **Trigger Condition:** Points Pace $\ge 65$ AND $TOI \ge 19.0$
* **Formula:** $ASI = 1 + \left( \max(0, Z_{dz} - 0.50) \cdot 1.5 \right) + \left( \frac{\max(0, QoC - 60)}{100} \right)$
* **Fallback:** If conditions are not met, $ASI = 1.0$

## 1.5 Short-Handed Leverage Factor ($SLF$) & Deployment Decoupling

To prevent low-event, replacement-level penalty killers from artificially inflating into high-leverage tiers, the engine must decouple Even-Strength ($EV$) deployment from Short-Handed ($SH$) deployment. 

The core multiplier ($M_{dep}$) must exclusively use $5v5$ metrics ($EV\_Z_{dz}$ and $EV\_QoC$). Once the $5v5$ baseline is established, apply the Short-Handed Leverage Factor ($SLF$) as a secondary modifier.

* **Baseline Rule:** A player must play regular rotation minutes ($EV\_TOI \ge 11.5$) to qualify for the $SLF$ bonus. Pure PK specialists playing under 11 minutes at $5v5$ receive no structural premium.
* **SLF Formula:** $SLF = 1 + \left( \frac{\max(0, SH\_TOI - 1.5)}{15} \right)$
* **Final Application:** $Pts_{adj} = Pts_{raw} \cdot M_{dep} \cdot ASI \cdot SLF$

## 2.1 Refined Roster Classification: Elite Shutdown
Update the `ELITE_SHUTDOWN` criteria to explicitly demand Even-Strength matchup difficulty rather than just gross zone deployment.

* **ELITE_SHUTDOWN:** $EV\_QoC \ge 65$, $EV\_M_{dep} \ge 1.05$, $EV\_TOI \ge 12.5$, and $SH\_TOI \ge 1.5$. This isolates true matchup centers who suppress top lines at $5v5$ while anchoring the penalty kill.
* **PK_SPECIALIST (Sub-Tier):** $SH\_TOI \ge 2.0$ but $EV\_TOI < 12.0$. Valued strictly as a 4th-line defensive utility asset.

## 2. Roster Classification Rules

Map the final calculated metrics to one of these explicit categories downstream of the normalization pipeline.

* **ELITE_1ST_LINE:** $TOI \ge 19.5$ and Normalized Points $\ge 75$. Driven by elite multi-tool engines.
* **1ST_LINE_HIGH_2C:** $TOI \ge 18.5$ and Normalized Points $65 - 74$. Clear top-line contributors.
* **ELITE_SHUTDOWN:** $M_{dep} \ge 1.12$, $TOI \ge 14.5$, and Normalized Points $30 - 49$. *(The Lowry Exception)* High-duress defensive specialists.
* **FRINGE_1ST_LINE_2C:** $TOI \ge 17.0$ and Normalized Points $50 - 64$. Standard second-line assets or highly sheltered top-line compilers.
* **MIDDLE_SIX:** $TOI \ge 14.0$ and Normalized Points $35 - 49$. Efficient depth compilers.
* **BOTTOM_SIX:** Default fallback case for low-minute ($<14.0$) or low-production ($<35$) assets.

## 3. Implementation Requirements

1.  Calculate $M_{dep}$ and $ASI$ before processing the non-linear power-law curve.
2.  Multiply raw points pace by the final consolidated context multiplier: $Pts_{adj} = Pts_{raw} \cdot M_{dep} \cdot ASI$.
3.  Clamp final contextual multipliers between `0.80` and `1.25` to prevent runaway valuations.
4.  Expose the final resolved `RosterTier` enum string in the skater data payload.

### M_dep Refactoring: The Possession Driver Hedge
Update the `M_dep` calculation in `xnav-engine.ts` to prevent dominant two-way players from being penalized for high Offensive Zone starts when facing elite competition.

1. Calculate the raw Defensive Zone Start % ($Z_{dz}$).
2. **Override Rule:** If $QoC \ge 55$ AND $Z_{dz} < 0.50$, cap $Z_{dz}$ at `0.50` for the calculation. 
   *(Logic: If you are facing top lines, you are not being sheltered, you are driving possession. Neutralize the zone penalty).*

### Roster Classification Refactoring: Production Bypasses
Update the `classifyRosterTier` switch logic to allow elite point production to override strict Time on Ice ($TOI$) requirements. Use an `||` operator to catch high-producers in distributed-minute systems.

```typescript
export function classifyRosterTier(metrics: DeploymentMetrics): RosterTier {
  const { toi, rawPtsPace, mDep } = metrics;
  const adjustedPts = rawPtsPace * mDep;

  // 1. Elite 1st Line Anchors (Requires 80+ Pts OR High TOI + 75+ Pts)
  if (adjustedPts >= 80 || (toi >= 19.0 && adjustedPts >= 75)) {
    return 'ELITE_1ST_LINE';
  }

  // 2. Standard 1st Line / Premium 2C
  if (adjustedPts >= 68 || (toi >= 18.0 && adjustedPts >= 65)) {
    return '1ST_LINE_HIGH_2C';
  }

  // 3. Fringe 1st Line / Standard 2C
  if (adjustedPts >= 55 || (toi >= 17.0 && adjustedPts >= 50)) {
    return 'FRINGE_1ST_LINE_2C';
  }

  // 4. Elite Shutdown / The Lowry Exception
  if (mDep >= 1.08 && toi >= 13.5 && adjustedPts >= 30) {
    return 'ELITE_SHUTDOWN';
  }

  // 5. Middle Six Depth
  if (adjustedPts >= 35 || toi >= 14.0) {
    return 'MIDDLE_SIX';
  }

  // 6. Default Fallback
  return 'BOTTOM_SIX';
}