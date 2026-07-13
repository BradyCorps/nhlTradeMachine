"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled error:", error);
  }, [error]);

  return (
    <main
      className="min-h-screen flex items-center justify-center font-mono"
      style={{ background: "var(--paper-bg)", color: "var(--ledger-ink)" }}
    >
      <div className="text-center max-w-md px-6">
        <div
          className="text-[11px] font-black uppercase tracking-[0.3em] mb-4"
          style={{ color: "var(--ledger-red)" }}
        >
          Press Stop
        </div>
        <h1 className="text-2xl font-black mb-3" style={{ color: "var(--ink)" }}>
          Something went wrong
        </h1>
        <p
          className="text-[12px] leading-relaxed mb-6"
          style={{ color: "var(--ledger-ink-body)" }}
        >
          The page hit an unexpected error. This has been logged. You can try
          again or head back to the front page.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="px-4 py-2 text-[11px] font-black uppercase tracking-[0.15em] border-2 cursor-pointer"
            style={{
              borderColor: "var(--ink)",
              color: "var(--ink)",
              background: "transparent",
            }}
          >
            Try Again
          </button>
          <a
            href="/"
            className="px-4 py-2 text-[11px] font-black uppercase tracking-[0.15em] no-underline"
            style={{
              background: "var(--ink)",
              color: "var(--paper-bg)",
            }}
          >
            Front Page
          </a>
        </div>
      </div>
    </main>
  );
}
