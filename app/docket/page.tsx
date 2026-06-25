import Header from "@/app/components/Header";
import Footer from "@/app/components/Footer";
import DocketClient from "@/app/docket/DocketClient";
import { attachTodayDocketGrades } from "@/app/lib/docket-today";
import { buildDocketEntries } from "@/app/lib/docket-view";
import { listPublishedTrades } from "@/app/lib/trades";

export const dynamic = "force-dynamic";

async function loadDocketEntries() {
  try {
    return attachTodayDocketGrades(buildDocketEntries(await listPublishedTrades()));
  } catch (error) {
    console.warn("[Docket] published trade load failed:", error instanceof Error ? error.message : error);
    return [];
  }
}

export default async function DocketPage() {
  const entries = await loadDocketEntries();

  return (
    <main className="ledger-setdown" style={{
      minHeight: "100vh",
      background: "var(--paper)",
      color: "var(--ledger-ink)",
      fontFamily: "'Courier Prime', monospace",
    }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "24px 18px 36px" }}>
        <Header activeTab="docket" />

        <div style={{ borderBottom: "1px solid var(--rule)", padding: "24px 0 18px", marginBottom: 18 }}>
          <div style={{ fontSize: 9, letterSpacing: "0.35em", color: "var(--ledger-ink-faint)", marginBottom: 6 }}>
            PUBLIC RECORD · THE DOCKET
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 900, letterSpacing: "0.08em", margin: 0 }}>
            TRADE RULINGS
          </h1>
          <div style={{ fontSize: 11, color: "var(--ledger-ink-faint)", marginTop: 8, lineHeight: 1.6 }}>
            Published graded trades only. Draft entries stay in admin review.
          </div>
        </div>

        <DocketClient entries={entries} />
      </div>
      <Footer />
    </main>
  );
}
