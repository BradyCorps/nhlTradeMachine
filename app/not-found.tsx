import Link from "next/link";

export default function NotFound() {
  return (
    <main
      className="min-h-screen flex items-center justify-center font-mono"
      style={{ background: "var(--paper-bg)", color: "var(--ledger-ink)" }}
    >
      <div className="text-center max-w-md px-6">
        <div
          className="text-[11px] font-black uppercase tracking-[0.3em] mb-4"
          style={{ color: "var(--ledger-ink-faint)" }}
        >
          404 &middot; Not Found
        </div>
        <h1 className="text-2xl font-black mb-3" style={{ color: "var(--ink)" }}>
          No ruling on file
        </h1>
        <p
          className="text-[12px] leading-relaxed mb-6"
          style={{ color: "var(--ledger-ink-body)" }}
        >
          The page you&rsquo;re looking for doesn&rsquo;t exist or has been
          moved. Check the URL or head back to the front page.
        </p>
        <Link
          href="/"
          className="inline-block px-5 py-2.5 text-[11px] font-black uppercase tracking-[0.15em] no-underline"
          style={{
            background: "var(--ink)",
            color: "var(--paper-bg)",
          }}
        >
          Back to the Front Page
        </Link>
      </div>
    </main>
  );
}
