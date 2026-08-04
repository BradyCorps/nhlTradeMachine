// ── Outcomes-model validation gate ───────────────────────────────
//
//   node scripts/outcomes-gate/run.mjs
//
// WHY THIS EXISTS
//
// The pricing model is fitted on what clubs paid, so it can never say a club
// was wrong — its training set is clubs' decisions, mistakes included. The
// proposed answer was an OUTCOMES model: value a player by what he delivers
// and compare that to what he costs, which would be a genuinely independent
// read.
//
// Before building any of it, one question had to be settled: can a per-player
// value metric reconstruct team results at all? If it cannot, nothing
// downstream is worth writing. This is that gate, and it is deliberately
// hostile to the idea.
//
// TWO CIRCULARITIES IT AVOIDS
//
//   1. Point Shares are CONSTRUCTED so a team's shares sum to its points.
//      Testing them against team points would pass no matter what. So the
//      value metric here is built from raw MoneyPuck components instead.
//
//   2. On-ice metrics credit five skaters per event, so summing them
//      reproduces team totals by accounting identity — Test A below scores
//      r = 0.98 and means nothing. The real gate is PREDICTIVE: last season's
//      player values against this season's result, judged against the naive
//      baseline of "the team was good last year".
//
// WHAT IT FOUND — see devnotes.md for the full reading.
//
//   Summed player value never beats that baseline on its own. It does add
//   information on top of it, goalie value adds nothing at all, and pooling
//   three seasons brings the per-player dollar error below the price model's.
//   A narrow version is worth building; the arbiter we imagined is not.

import fs from 'fs';
import readline from 'readline';

// ── Load, streaming, situation=all only ─────────────────────────
async function load(file, keep) {
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  let head = null, ix = {}; const out = [];
  for await (const line of rl) {
    if (!head) { head = line.split(','); keep.forEach(k => ix[k] = head.indexOf(k)); continue; }
    const c = line.split(',');
    if (ix.situation >= 0 && c[ix.situation] !== 'all') continue;
    const o = {}; for (const k of keep) o[k] = c[ix[k]];
    out.push(o);
  }
  return out;
}

const SK = ['situation','playerId','name','season','team','position','icetime','games_played',
            'I_F_goals','I_F_xGoals','OnIce_F_xGoals','OnIce_A_xGoals','OnIce_F_goals','OnIce_A_goals'];
const GO = ['situation','playerId','name','season','team','icetime','games_played','xGoals','goals'];
const TM = ['situation','team','season','games_played','goalsFor','goalsAgainst','xGoalsFor','xGoalsAgainst'];

const skaters = [
  ...await load('OtherData/HistoricalData/skaters_2008_to_2024.csv', SK),
  ...await load('OtherData/2025_26Data/2025_26_skaters.csv', SK),
].map(r => ({ id:r.playerId, name:r.name, season:+r.season, team:r.team, pos:r.position,
  ice:+r.icetime, gp:+r.games_played, g:+r.I_F_goals, xg:+r.I_F_xGoals,
  oxf:+r.OnIce_F_xGoals, oxa:+r.OnIce_A_xGoals, ogf:+r.OnIce_F_goals, oga:+r.OnIce_A_goals }))
  .filter(r => r.ice > 0);

const goalies = [
  ...await load('OtherData/HistoricalData/goalies_2008_to_2024.csv', GO),
  ...await load('OtherData/2025_26Data/2025_26_goalies.csv', GO),
].map(r => ({ id:r.playerId, name:r.name, season:+r.season, team:r.team,
  ice:+r.icetime, gp:+r.games_played, xg:+r.xGoals, g:+r.goals }))
  .filter(r => r.ice > 0);

const teams = [
  ...await load('OtherData/HistoricalData/teams_2008_to_2024.csv', TM),
  ...await load('OtherData/2025_26Data/2025_26_teams.csv', TM),
].map(r => ({ team:r.team, season:+r.season, gp:+r.games_played,
  gf:+r.goalsFor, ga:+r.goalsAgainst, xgf:+r.xGoalsFor, xga:+r.xGoalsAgainst }))
  .filter(r => r.gp >= 40);

console.log(`skaters ${skaters.length}  goalies ${goalies.length}  team-seasons ${teams.length}`);
console.log(`seasons ${Math.min(...teams.map(t=>t.season))}-${Math.max(...teams.map(t=>t.season))}\n`);

// ── Player value in goals above average ─────────────────────────
// On-ice xG differential carries five skaters per event, so it is divided by
// five to give one player's share. Individual finishing is his alone. Both are
// taken against the league rate for that season so the era drops out.
const seasons = [...new Set(skaters.map(s => s.season))].sort((a,b)=>a-b);
const leagueRate = new Map();          // season -> on-ice xG diff per second, league mean
for (const s of seasons) {
  const g = skaters.filter(x => x.season === s);
  const ice = g.reduce((a,x)=>a+x.ice,0);
  leagueRate.set(s, g.reduce((a,x)=>a+(x.oxf-x.oxa),0) / ice);
}
const skaterValue = (r) => {
  const onIce = ((r.oxf - r.oxa) - leagueRate.get(r.season) * r.ice) / 5;
  const finishing = r.g - r.xg;
  return onIce + finishing;
};
const goalieValue = (r) => r.xg - r.g;      // GSAx

// ── Index ────────────────────────────────────────────────────────
const key = (id, season) => `${id}|${season}`;
const skValue = new Map(), goValue = new Map(), skIce = new Map(), goIce = new Map();
for (const r of skaters) { skValue.set(key(r.id,r.season), skaterValue(r)); skIce.set(key(r.id,r.season), r.ice); }
for (const r of goalies) { goValue.set(key(r.id,r.season), goalieValue(r)); goIce.set(key(r.id,r.season), r.ice); }
const teamOf = new Map();               // team|season -> [{id,ice,kind}]
for (const r of skaters) { const k=`${r.team}|${r.season}`; (teamOf.get(k) ?? teamOf.set(k,[]).get(k)).push({id:r.id,ice:r.ice,kind:'S'}); }
for (const r of goalies) { const k=`${r.team}|${r.season}`; (teamOf.get(k) ?? teamOf.set(k,[]).get(k)).push({id:r.id,ice:r.ice,kind:'G'}); }

const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
const pearson=(a,b)=>{const ma=mean(a),mb=mean(b);
  const n=a.reduce((s,x,i)=>s+(x-ma)*(b[i]-mb),0);
  const d=Math.sqrt(a.reduce((s,x)=>s+(x-ma)**2,0)*b.reduce((s,y)=>s+(y-mb)**2,0));return d===0?NaN:n/d;};
const rmse=(a,b)=>Math.sqrt(mean(a.map((x,i)=>(x-b[i])**2)));

// ── Test A: same season (expected to be near-tautological) ──────
const sameA=[], sameB=[];
for (const t of teams) {
  const roster = teamOf.get(`${t.team}|${t.season}`); if (!roster) continue;
  let v=0; for (const p of roster) v += (p.kind==='S'?skValue:goValue).get(key(p.id,t.season)) ?? 0;
  sameA.push(v); sameB.push(t.gf - t.ga);
}
console.log("TEST A — same-season reconstruction (the circular one, for reference)");
console.log(`  n=${sameA.length}  r = ${pearson(sameA,sameB).toFixed(3)}   R2 = ${(pearson(sameA,sameB)**2).toFixed(3)}`);

// ── Test B: PREDICTIVE. Last year's player values, this year's roster ──
const predV=[], predBase=[], actual=[], labels=[];
for (const t of teams) {
  const roster = teamOf.get(`${t.team}|${t.season}`); if (!roster) continue;
  const prev = teams.find(x => x.team===t.team && x.season===t.season-1);
  if (!prev) continue;
  let v=0, covered=0, total=0;
  for (const p of roster) {
    total += p.ice;
    const val = (p.kind==='S'?skValue:goValue).get(key(p.id, t.season-1));
    const priorIce = (p.kind==='S'?skIce:goIce).get(key(p.id, t.season-1)) ?? 0;
    if (val != null && priorIce > 0) {
      // Last season's value, scaled to the minutes he plays THIS season.
      v += val * (p.ice / priorIce);
      covered += p.ice;
    }
  }
  if (covered / total < 0.6) continue;      // too much of the roster is new to say anything
  predV.push(v); predBase.push(prev.gf - prev.ga); actual.push(t.gf - t.ga); labels.push(`${t.team} ${t.season}`);
}
console.log("\nTEST B — PREDICTIVE: last season's player values vs this season's result");
console.log(`  n = ${predV.length} team-seasons`);
console.log(`  summed player value      r = ${pearson(predV,actual).toFixed(3)}   R2 = ${(pearson(predV,actual)**2).toFixed(3)}`);
console.log(`  BASELINE: team's own prior differential  r = ${pearson(predBase,actual).toFixed(3)}   R2 = ${(pearson(predBase,actual)**2).toFixed(3)}`);

// Does player value add anything ON TOP of the baseline?
const z=a=>{const m=mean(a),s=Math.sqrt(mean(a.map(x=>(x-m)**2)));return a.map(x=>(x-m)/s);};
const [zv,zb,za]=[z(predV),z(predBase),z(actual)];
const rvb=pearson(zv,zb), rva=pearson(zv,za), rba=pearson(zb,za);
const partial=(rva-rba*rvb)/Math.sqrt((1-rba**2)*(1-rvb**2));
console.log(`  correlation between the two predictors: ${rvb.toFixed(3)}`);
console.log(`  PARTIAL r of player value, holding the baseline fixed: ${partial.toFixed(3)}`);

// ════════════════════════════════════════════════════════════════
// The fair version. Test B fed the model a single raw season with no
// regression, which is exactly the mistake the skater prior exists to fix.
// Rerun with a multi-season weighted value, and with the goalie component
// separated — GSAx repeats at r = 0.13, so raw goalie value may be actively
// harmful rather than merely weak.
// ════════════════════════════════════════════════════════════════
const W = [0.5, 0.3, 0.2];       // most recent season first

function priorValue(id, season, kind) {
  const V = kind === 'S' ? skValue : goValue;
  const I = kind === 'S' ? skIce : goIce;
  let num = 0, den = 0, ice = 0;
  for (let k = 0; k < W.length; k++) {
    const v = V.get(key(id, season - 1 - k)), i = I.get(key(id, season - 1 - k));
    if (v == null || !i) continue;
    num += (v / i) * W[k] * i;      // rate, weighted by season AND exposure
    den += W[k] * i;
    ice += i;
  }
  return den > 0 ? { rate: num / den, ice } : null;   // value per second of ice
}

function run(label, { seasonsBack, skatersOnly, goaliesOnly }) {
  const pv = [], pb = [], ac = [];
  for (const t of teams) {
    const roster = teamOf.get(`${t.team}|${t.season}`); if (!roster) continue;
    const prev = teams.find(x => x.team === t.team && x.season === t.season - 1);
    if (!prev) continue;
    let v = 0, covered = 0, total = 0;
    for (const p of roster) {
      if (skatersOnly && p.kind !== 'S') continue;
      if (goaliesOnly && p.kind !== 'G') continue;
      total += p.ice;
      if (seasonsBack === 1) {
        const val = (p.kind === 'S' ? skValue : goValue).get(key(p.id, t.season - 1));
        const pi = (p.kind === 'S' ? skIce : goIce).get(key(p.id, t.season - 1)) ?? 0;
        if (val != null && pi > 0) { v += val * (p.ice / pi); covered += p.ice; }
      } else {
        const pr = priorValue(p.id, t.season, p.kind);
        if (pr) { v += pr.rate * p.ice; covered += p.ice; }
      }
    }
    if (total === 0 || covered / total < 0.6) continue;
    pv.push(v); pb.push(prev.gf - prev.ga); ac.push(t.gf - t.ga);
  }
  const r = pearson(pv, ac), rb = pearson(pb, ac), rvb = pearson(pv, pb);
  const partial = (r - rb * rvb) / Math.sqrt((1 - rb ** 2) * (1 - rvb ** 2));
  console.log(`  ${label.padEnd(34)} n=${String(pv.length).padStart(3)}  r=${r.toFixed(3)}  R2=${(r*r).toFixed(3)}  partial vs baseline=${partial >= 0 ? '+' : ''}${partial.toFixed(3)}`);
  return { pv, pb, ac };
}

console.log("\n\n════ THE FAIR VERSION ════");
console.log(`  (baseline throughout: the team's own prior differential, r=0.537)\n`);
run("1 season, everyone",            { seasonsBack: 1 });
run("3 seasons weighted, everyone",  { seasonsBack: 3 });
run("3 seasons, skaters only",       { seasonsBack: 3, skatersOnly: true });
run("1 season, goalies only",        { seasonsBack: 1, goaliesOnly: true });
run("3 seasons, goalies only",       { seasonsBack: 3, goaliesOnly: true });

// ── Do the two together beat the baseline alone? ────────────────
const best = run("3 seasons weighted, everyone (again)", { seasonsBack: 3 });
const n = best.ac.length;
// Two-predictor least squares: actual ~ 1 + playerValue + priorDifferential
const X = best.pv.map((v, i) => [1, v, best.pb[i]]);
const y = best.ac;
const solve = (A, b) => { const k = b.length; const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < k; c++) { let p = c; for (let r = c + 1; r < k; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]]; const d = M[c][c] || 1e-12;
    for (let j = c; j <= k; j++) M[c][j] /= d;
    for (let r = 0; r < k; r++) { if (r === c) continue; const f = M[r][c]; for (let j = c; j <= k; j++) M[r][j] -= f * M[c][j]; } }
  return M.map(r => r[k]); };
const XtX = [0,1,2].map(a => [0,1,2].map(b => X.reduce((s, r) => s + r[a]*r[b], 0)));
const Xty = [0,1,2].map(a => X.reduce((s, r, i) => s + r[a]*y[i], 0));
const b = solve(XtX, Xty);
const fit = X.map(r => r.reduce((s, x, i) => s + x*b[i], 0));
const my = mean(y);
const r2both = 1 - y.reduce((s, v, i) => s + (v - fit[i])**2, 0) / y.reduce((s, v) => s + (v - my)**2, 0);
console.log(`\n  baseline alone                     R2 = ${(pearson(best.pb, best.ac)**2).toFixed(3)}`);
console.log(`  player value alone                 R2 = ${(pearson(best.pv, best.ac)**2).toFixed(3)}`);
console.log(`  BOTH together                      R2 = ${r2both.toFixed(3)}   (n=${n})`);

// ════════════════════════════════════════════════════════════════
// The decisive number: what error bar would an outcomes model carry?
// The point of building one is to be a BETTER arbiter than the price model,
// whose walk-forward error is $1.22M. If per-player value is noisier than
// that in dollars, the outcomes model is a worse judge, not a better one.
// ════════════════════════════════════════════════════════════════
console.log("\n\n════ WHAT WOULD IT COST IN PRECISION? ════\n");

// Year-over-year stability of the player value RATE, skaters with real ice.
const byPlayer = new Map();
for (const r of skaters) {
  if (r.ice < 300 * 60) continue;
  const m = byPlayer.get(r.id) ?? new Map(); m.set(r.season, r); byPlayer.set(r.id, m);
}
const a = [], b2 = [], totals = [];
for (const m of byPlayer.values()) for (const [s, r] of m) {
  const nx = m.get(s + 1); if (!nx) continue;
  a.push(skaterValue(r) / r.ice * 3600); b2.push(skaterValue(nx) / nx.ice * 3600);
  totals.push(skaterValue(r));
}
const rYoY = pearson(a, b2);
const sd = arr => { const m = mean(arr); return Math.sqrt(mean(arr.map(x => (x - m) ** 2))); };
console.log(`  player value per 60, year over year:  r = ${rYoY.toFixed(3)}  (n = ${a.length} pairs)`);
console.log(`  spread of season value, skaters:      SD = ${sd(totals).toFixed(1)} goals above average`);

// Signal vs noise: with year-over-year r, the share of observed spread that is
// real is r, so the noise SD is sd * sqrt(1 - r).
const noiseSd = sd(totals) * Math.sqrt(Math.max(0, 1 - rYoY));
console.log(`  implied noise in one season's value:  SD = ${noiseSd.toFixed(1)} goals`);

// Dollars per goal, from what the league actually spends. Total cap spend
// divided by total goals above replacement-ish. Replacement is taken as the
// 10th percentile of per-60 value, which is roughly a freely available player.
const recent = skaters.filter(s => s.season >= 2021 && s.ice > 0);
const rates = recent.map(s => skaterValue(s) / s.ice * 3600).sort((x, y) => x - y);
const replacementRate = rates[Math.floor(rates.length * 0.10)];
const seasonsRecent = [...new Set(recent.map(s => s.season))];
let gar = 0;
for (const s of recent) gar += (skaterValue(s) / s.ice * 3600 - replacementRate) * s.ice / 3600;
const garPerSeason = gar / seasonsRecent.length;
const leagueSpendPerSeason = 32 * 80;    // ~$80M of real payroll per club
const perGoal = leagueSpendPerSeason / garPerSeason;
console.log(`\n  goals above replacement, league-wide: ${garPerSeason.toFixed(0)} per season`);
console.log(`  implied price of a goal:              $${perGoal.toFixed(2)}M`);
console.log(`\n  ⇒ one season of value carries  ±$${(noiseSd * perGoal).toFixed(2)}M  of noise per player`);
console.log(`  ⇒ three seasons pooled carries ±$${(noiseSd / Math.sqrt(3) * perGoal).toFixed(2)}M`);
console.log(`\n  the contract model it would replace: ±$1.22M (forwards), ±$1.35M (defence)`);
