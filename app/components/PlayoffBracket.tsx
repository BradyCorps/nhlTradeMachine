"use client";
// ── PlayoffBracket — visual bracket tree ─────────────────────────────────────
// Uses proportional flex height so R2 naturally centers between its two R1
// matchups, and CF centers between the two R2s. No magic numbers needed.

interface Series {
  home:     { teamId: string; teamName: string; pts: number };
  away:     { teamId: string; teamName: string; pts: number };
  winner:   { teamId: string; teamName: string };
  homeWins: number;
  awayWins: number;
}
interface ConferenceBracket {
  r1: Series[];
  r2: Series[];
  cf: Series;
  champion: { teamId: string; teamName: string };
}
interface BracketData {
  eastern: ConferenceBracket;
  western: ConferenceBracket;
  final:   Series;
  champion: { teamId: string; teamName: string };
}

const nick  = (name: string) => name.split(" ").slice(-1)[0];
const INK   = "var(--ledger-ink)";
const FAINT = "var(--ledger-ink-faint)";
const CREAM = "var(--ledger-cream)";
const MONO  = "'Courier Prime', monospace";

function MatchCard({ s, flip = false }: { s: Series; flip?: boolean }) {
  const hW = s.winner.teamId === s.home.teamId;
  const rows = flip
    ? [{ n: s.away.teamName, w: s.awayWins, won: !hW }, { n: s.home.teamName, w: s.homeWins, won: hW }]
    : [{ n: s.home.teamName, w: s.homeWins, won: hW  }, { n: s.away.teamName, w: s.awayWins, won: !hW }];
  return (
    <div style={{ background: CREAM, border: "1px solid #c8b890", padding: "2px 5px",
                  fontSize: 9, fontFamily: MONO, width: "100%", minWidth: 70 }}>
      {rows.map((r, i) => (
        <div key={i} style={{
          display: "flex", justifyContent: "space-between", gap: 6,
          fontWeight: r.won ? 900 : 400,
          color:      r.won ? INK  : FAINT,
          padding:    "1px 0",
          borderBottom: i === 0 ? "1px solid #e0d0b0" : undefined,
        }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {nick(r.n)}
          </span>
          <span style={{ flexShrink: 0 }}>{r.w}</span>
        </div>
      ))}
    </div>
  );
}

// Flex column where each series gets equal height — proportional alignment magic
function RoundCol({ items, flip }: { items: Series[]; flip?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
      {items.map((s, i) => (
        <div key={i} style={{ flex: 1, display: "flex", alignItems: "center", padding: "2px 2px" }}>
          <MatchCard s={s} flip={flip} />
        </div>
      ))}
    </div>
  );
}

export default function PlayoffBracket({ bracket }: { bracket: BracketData }) {
  const H = 300;
  return (
    <div style={{ marginTop: 12, borderTop: "1px solid #c8b890", paddingTop: 10 }}>
      <div style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase",
                    letterSpacing: "0.15em", color: "var(--ledger-red)",
                    marginBottom: 6, textAlign: "center", fontFamily: MONO }}>
        🏒 Playoff Bracket
      </div>

      {/* Round labels */}
      <div style={{ display: "flex", fontSize: 9, fontWeight: 900, textTransform: "uppercase",
                    letterSpacing: "0.08em", color: FAINT, marginBottom: 3, fontFamily: MONO }}>
        {["R1","R2","CF","","CF","R2","R1"].map((l, i) => (
          <div key={i} style={{ flex: i === 3 ? 1.4 : 1, textAlign: "center" }}>{l}</div>
        ))}
      </div>

      {/* Bracket columns */}
      <div style={{ display: "flex", height: H, alignItems: "stretch" }}>

        {/* western R1 — 4 series, each ¼ height */}
        <RoundCol items={bracket.western.r1} />

        {/* western R2 — 2 series, each ½ height → naturally centers on R1 pairs */}
        <RoundCol items={bracket.western.r2} />

        {/* western CF — 1 series, full height → naturally centered */}
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
          <div style={{ flex: 1, display: "flex", alignItems: "center", padding: "2px 2px" }}>
            <MatchCard s={bracket.western.cf} />
          </div>
        </div>

        {/* Stanley Cup Final — center column, slightly wider */}
        <div style={{ flex: 1.4, display: "flex", alignItems: "center",
                      justifyContent: "center", padding: "4px 5px" }}>
          <div style={{ textAlign: "center", width: "100%" }}>
            <div style={{ fontSize: 9, fontWeight: 900, color: "var(--ledger-red)",
                          textTransform: "uppercase", letterSpacing: "0.08em",
                          marginBottom: 4, fontFamily: MONO }}>
              🏆 Cup Final
            </div>
            <MatchCard s={bracket.final} />
            <div style={{ fontSize: 10, fontWeight: 900, color: "var(--ledger-green)",
                          marginTop: 5, fontFamily: MONO }}>
              {nick(bracket.champion.teamName)} 🏆
            </div>
          </div>
        </div>

        {/* eastern CF */}
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
          <div style={{ flex: 1, display: "flex", alignItems: "center", padding: "2px 2px" }}>
            <MatchCard s={bracket.eastern.cf} flip />
          </div>
        </div>

        {/* eastern R2 */}
        <RoundCol items={bracket.eastern.r2} flip />

        {/* eastern R1 */}
        <RoundCol items={bracket.eastern.r1} flip />
      </div>

      {/* Conference labels */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5,
                    fontSize: 9, fontWeight: 900, color: FAINT, textTransform: "uppercase",
                    letterSpacing: "0.08em", fontFamily: MONO }}>
        <span>◀ Western Conference</span>
        <span>Eastern Conference ▶</span>
      </div>
    </div>
  );
}