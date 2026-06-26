import Header from "@/app/components/Header";
import Footer from "@/app/components/Footer";
import { OFFER_SHEET_TIERS } from "@/app/lib/free-agency";
import { SEASON } from "@/app/lib/season-config";

const money = (n: number) =>
  `$${n.toLocaleString("en-US")}`;

const roundLabel = (r: string) =>
  r === "1st" ? "1st-round pick" : r === "2nd" ? "2nd-round pick" : "3rd-round pick";

const pickYears = Array.from({ length: 5 }, (_, i) => SEASON.draftYear + i);

export default function OfferSheetsPage() {
  return (
    <main style={{
      minHeight: "100vh",
      background: "var(--paper)",
      color: "var(--ledger-ink)",
      fontFamily: "'Courier Prime', monospace",
    }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "24px 18px 36px" }}>
        <Header />

        {/* Page header */}
        <div style={{ borderBottom: "1px solid var(--rule)", padding: "24px 0 18px", marginBottom: 24 }}>
          <div style={{ fontSize: 9, letterSpacing: "0.35em", color: "var(--ledger-ink-faint)", marginBottom: 6 }}>
            CBA ARTICLE 10.3 · OFFSEASON REFERENCE
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 900, letterSpacing: "0.08em", margin: 0 }}>
            RFA OFFER SHEET COMPENSATION
          </h1>
          <div style={{ fontSize: 11, color: "var(--ledger-ink-faint)", marginTop: 8, lineHeight: 1.6 }}>
            When a team signs another team&rsquo;s restricted free agent to an offer sheet,
            the original team has seven days to match. If they decline, they receive
            draft-pick compensation based on the AAV of the offer.
            Thresholds for the {SEASON.label} season.
          </div>
        </div>

        {/* Compensation table */}
        <section style={{ marginBottom: 32 }}>
          <div style={{
            fontSize: 10,
            fontWeight: 900,
            letterSpacing: "0.3em",
            color: "var(--ledger-ink-faint)",
            marginBottom: 12,
            textTransform: "uppercase",
          }}>
            Compensation Tiers
          </div>

          <div style={{
            border: "1px solid var(--rule)",
            background: "var(--paper)",
            overflow: "hidden",
          }}>
            {/* Table header */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              borderBottom: "2px solid var(--ink)",
              background: "var(--paper-inset)",
            }}>
              <div style={{
                padding: "10px 16px",
                fontSize: 10,
                fontWeight: 900,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
              }}>
                Average Annual Value (AAV)
              </div>
              <div style={{
                padding: "10px 16px",
                fontSize: 10,
                fontWeight: 900,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                borderLeft: "1px solid var(--rule)",
              }}>
                Draft Pick Compensation
              </div>
            </div>

            {/* Rows */}
            {OFFER_SHEET_TIERS.map((tier, i) => {
              const isMax = tier.ceiling === Infinity;
              const compText = tier.compensation.length === 0
                ? "None"
                : tier.compensation.map(roundLabel).join(", ");

              const pickCount = tier.compensation.length;
              const firstCount = tier.compensation.filter(r => r === "1st").length;

              let severityColor = "var(--ledger-ink-body)";
              if (firstCount >= 4) severityColor = "var(--ledger-red)";
              else if (firstCount >= 2) severityColor = "var(--ledger-red-deep)";
              else if (firstCount >= 1) severityColor = "var(--ledger-amber)";
              else if (pickCount >= 1) severityColor = "var(--ledger-navy)";

              return (
                <div key={i} style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  borderBottom: i < OFFER_SHEET_TIERS.length - 1 ? "1px solid var(--rule-light)" : "none",
                  background: isMax ? "rgba(184, 48, 32, 0.04)" : "transparent",
                }}>
                  <div style={{
                    padding: "12px 16px",
                    fontSize: 13,
                    fontWeight: 900,
                    color: "var(--ledger-ink)",
                  }}>
                    {tier.label}
                  </div>
                  <div style={{
                    padding: "12px 16px",
                    fontSize: 12,
                    fontWeight: 700,
                    color: severityColor,
                    borderLeft: "1px solid var(--rule-light)",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}>
                    {pickCount === 0 ? (
                      <span style={{ color: "var(--ledger-green)", fontWeight: 900 }}>No compensation</span>
                    ) : (
                      <>
                        <span>{compText}</span>
                        {firstCount >= 4 && (
                          <span style={{
                            fontSize: 9,
                            fontWeight: 900,
                            letterSpacing: "0.15em",
                            padding: "2px 6px",
                            background: "var(--ledger-red)",
                            color: "#fff",
                            textTransform: "uppercase",
                          }}>
                            MAX
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* How it works */}
        <section style={{ marginBottom: 32 }}>
          <div style={{
            fontSize: 10,
            fontWeight: 900,
            letterSpacing: "0.3em",
            color: "var(--ledger-ink-faint)",
            marginBottom: 12,
            textTransform: "uppercase",
          }}>
            How Offer Sheets Work
          </div>

          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 16,
          }}>
            {[
              {
                step: "1",
                title: "Team Extends Offer Sheet",
                body: "Any team can sign another team's RFA to an offer sheet during the offseason window. The offer must be a standard player contract (SPC) with at least the league minimum AAV.",
              },
              {
                step: "2",
                title: "Original Team Has 7 Days",
                body: "The RFA's current team has seven days to match the offer sheet. If they match, the player stays on their roster at the offered terms. The signing team receives nothing.",
              },
              {
                step: "3",
                title: "Compensation If Not Matched",
                body: "If the original team declines to match, the player moves to the offering team, and the original team receives draft-pick compensation based on the AAV tier above.",
              },
            ].map(({ step, title, body }) => (
              <div key={step} style={{
                border: "1px solid var(--rule-light)",
                padding: "16px 18px",
                background: "var(--paper)",
              }}>
                <div style={{
                  fontSize: 9,
                  fontWeight: 900,
                  letterSpacing: "0.25em",
                  color: "var(--ledger-ink-faint)",
                  marginBottom: 6,
                  textTransform: "uppercase",
                }}>
                  Step {step}
                </div>
                <div style={{
                  fontSize: 14,
                  fontWeight: 900,
                  color: "var(--ledger-ink)",
                  marginBottom: 6,
                  lineHeight: 1.2,
                }}>
                  {title}
                </div>
                <p style={{
                  fontSize: 11,
                  lineHeight: 1.7,
                  color: "var(--ledger-ink-body)",
                  margin: 0,
                }}>
                  {body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Available draft pick years */}
        <section style={{ marginBottom: 32 }}>
          <div style={{
            fontSize: 10,
            fontWeight: 900,
            letterSpacing: "0.3em",
            color: "var(--ledger-ink-faint)",
            marginBottom: 12,
            textTransform: "uppercase",
          }}>
            Available Draft Picks · {pickYears[0]}–{pickYears[pickYears.length - 1]}
          </div>

          <div style={{
            border: "1px solid var(--rule)",
            padding: "16px 18px",
            background: "var(--paper)",
          }}>
            <p style={{
              fontSize: 11,
              lineHeight: 1.7,
              color: "var(--ledger-ink-body)",
              margin: "0 0 12px",
            }}>
              The NHL allows teams to trade draft picks up to five years into the future.
              Offer-sheet compensation draws from available picks in the signing team&rsquo;s
              inventory. Picks in the current system:
            </p>
            <div style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
            }}>
              {pickYears.map((year) => (
                <div key={year} style={{
                  padding: "8px 14px",
                  border: "1px solid var(--rule-light)",
                  background: year === SEASON.draftYear ? "var(--ledger-ink)" : "var(--paper-inset)",
                  color: year === SEASON.draftYear ? "var(--paper)" : "var(--ledger-ink)",
                  fontSize: 13,
                  fontWeight: 900,
                  letterSpacing: "0.05em",
                  textAlign: "center" as const,
                  minWidth: 72,
                }}>
                  <div>{year}</div>
                  <div style={{
                    fontSize: 8,
                    fontWeight: 700,
                    letterSpacing: "0.2em",
                    marginTop: 2,
                    color: year === SEASON.draftYear ? "var(--paper-inset)" : "var(--ledger-ink-faint)",
                    textTransform: "uppercase" as const,
                  }}>
                    {year === SEASON.draftYear ? "Current" : `+${year - SEASON.draftYear}`}
                  </div>
                </div>
              ))}
            </div>

            <div style={{
              marginTop: 12,
              fontSize: 10,
              color: "var(--ledger-ink-faint)",
              lineHeight: 1.6,
            }}>
              Rounds 1–5 are tracked per team. Pick values decay approximately 12% per year
              into the future to reflect increasing uncertainty.
            </div>
          </div>
        </section>

        {/* Key rules */}
        <section style={{
          borderTop: "1px solid var(--rule)",
          paddingTop: 20,
          marginBottom: 32,
        }}>
          <div style={{
            fontSize: 10,
            fontWeight: 900,
            letterSpacing: "0.3em",
            color: "var(--ledger-ink-faint)",
            marginBottom: 12,
            textTransform: "uppercase",
          }}>
            Key CBA Rules
          </div>

          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 12,
          }}>
            {[
              { rule: "Age Threshold", detail: "Players who are 25+ years old by June 15 or have 7+ accrued seasons become unrestricted free agents (UFA) and are not subject to offer-sheet compensation." },
              { rule: "Minimum Term", detail: "Offer sheets must be for at least one year at no less than the league minimum salary." },
              { rule: "Cap Compliance", detail: "The offering team must be cap-compliant after the offer sheet is signed. If not, the offer sheet is void." },
              { rule: "One Offer Per Team", detail: "A team may only extend one offer sheet to a given RFA per offseason. If the original team matches, the offering team cannot make another offer to that player." },
            ].map(({ rule, detail }) => (
              <div key={rule} style={{
                padding: "12px 14px",
                border: "1px solid var(--rule-light)",
                background: "var(--paper)",
              }}>
                <div style={{
                  fontSize: 11,
                  fontWeight: 900,
                  color: "var(--ledger-ink)",
                  marginBottom: 4,
                }}>
                  {rule}
                </div>
                <p style={{
                  fontSize: 10,
                  lineHeight: 1.65,
                  color: "var(--ledger-ink-body)",
                  margin: 0,
                }}>
                  {detail}
                </p>
              </div>
            ))}
          </div>
        </section>

        <Footer />
      </div>
    </main>
  );
}
