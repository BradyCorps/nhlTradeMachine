import Header from "@/app/components/Header";
import Footer from "@/app/components/Footer";
import DocketClient from "@/app/docket/DocketClient";
import { getCachedDocketEntries } from "@/app/lib/cached-docket";
import StructuredData from "@/app/components/StructuredData";
import { BRAND } from "@/app/lib/brand";
import { PUBLIC_ROUTE_SEO, canonicalUrl, publicRouteMetadata } from "@/app/lib/public-seo";

export const dynamic = "force-dynamic";
const route = PUBLIC_ROUTE_SEO.docket;
export const metadata = publicRouteMetadata(route);

export default async function DocketPage() {
  const { value: entries } = await getCachedDocketEntries();

  return (
    <main style={{
      minHeight: "100vh",
      background: "var(--paper)",
      color: "var(--ledger-ink)",
      fontFamily: "'Courier Prime', monospace",
    }}>
      <StructuredData id="docket-collection-schema" data={{
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: route.title,
        description: route.description,
        url: canonicalUrl(route.path),
        isPartOf: { "@type": "WebSite", name: BRAND.name, url: BRAND.url },
      }} />
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
