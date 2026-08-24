import Header from "@/app/components/Header";

export default function DocketLoading() {
  return (
    <main
      aria-busy="true"
      aria-label="Loading The Docket"
      style={{
        minHeight: "100vh",
        background: "var(--paper)",
        color: "var(--ledger-ink)",
        fontFamily: "'Courier Prime', monospace",
      }}
    >
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "24px 18px 36px" }}>
        <Header activeTab="docket" />

        <div style={{ borderBottom: "1px solid var(--rule)", padding: "24px 0 18px", marginBottom: 18 }}>
          <div style={{ fontSize: 9, letterSpacing: "0.35em", color: "var(--ledger-ink-faint)", marginBottom: 6 }}>
            PUBLIC RECORD · THE DOCKET
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 900, letterSpacing: "0.08em", margin: 0 }}>
            TRADE RULINGS
          </h1>
          <div className="mt-2 h-3 w-full max-w-md animate-pulse" style={{ background: "var(--ledger-rule-light)" }} />
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="h-11 border animate-pulse" style={{ borderColor: "var(--ledger-rule)", background: "var(--paper-inset)" }} />
          ))}
        </div>

        <div className="space-y-3" role="status">
          <span className="sr-only">Loading published trade rulings and current grades</span>
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="h-28 border p-3" style={{ borderColor: "var(--ledger-rule)", background: "var(--paper-card)" }}>
              <div className="h-full animate-pulse" style={{ background: "var(--paper-inset)" }} />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
