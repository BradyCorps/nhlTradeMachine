"use client";
// ── Header — The Hockey Ledger masthead ─────────────────────
// Shared across Trade Machine and Player Analytics pages.
// activeTab: "trade" | "players" — highlights the current nav item.

interface HeaderProps {
  activeTab?: "trade" | "players";
  showLiveFeed?: boolean;
}

export default function Header({ activeTab, showLiveFeed = true }: HeaderProps) {
  return (
    <header className="flex flex-col pb-5 border-b border-ledger-rule">
      <div className="w-full">
        {/* Live data indicator */}
        {showLiveFeed && (
          <div className="flex items-center justify-center gap-2 mb-1">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-ledger-red opacity-50" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-ledger-red" />
            </span>
            <span className="text-2xs font-bold uppercase tracking-[0.4em] text-ledger-ink-faint font-mono">
              Live Data Feed Active
            </span>
          </div>
        )}

        {/* Masthead */}
        <div className="border-y-[3px] border-double border-ledger-ink py-2 mb-1">
          <div className="text-center">
            <p className="text-2xs uppercase tracking-[0.4em] mb-1 font-mono text-ledger-ink-faint">
              Est. 2025 &nbsp;—&nbsp; Vol. I &nbsp;—&nbsp; Trade Edition
            </p>
            <a href="/" className="no-underline">
              <h1
                className="font-black leading-none transition-opacity hover:opacity-70 text-ledger-ink font-serif cursor-pointer"
                style={{ fontSize: 'clamp(1.8rem, 5vw, 3rem)', letterSpacing: '-0.02em', lineHeight: 1 }}
              >
                The Hockey Ledger
              </h1>
            </a>
            <p className="text-[11px] uppercase tracking-[0.3em] mt-1.5 hidden sm:block font-mono text-ledger-ink-faint">
              X-NAV Analytics &nbsp;·&nbsp; xG Suppression &nbsp;·&nbsp; GM Logic Engine &nbsp;·&nbsp; Live Statistics
            </p>

            {/* Nav tabs */}
            <nav className="mt-2 flex items-center justify-center gap-4">
              <a
                href="/players"
                className={[
                  "text-[12px] font-black uppercase tracking-[0.2em] font-mono no-underline transition-colors",
                  activeTab === "players"
                    ? "text-ledger-ink"
                    : "text-ledger-ink-faint hover:text-ledger-ink",
                ].join(" ")}
              >
                {activeTab === "players" ? "◆" : "◇"} Player Analytics
              </a>
              <span className="text-ledger-rule-light">|</span>
              <a
                href="/trade"
                className={[
                  "text-[12px] font-black uppercase tracking-[0.2em] font-mono no-underline transition-colors",
                  activeTab === "trade"
                    ? "text-ledger-ink"
                    : "text-ledger-ink-faint hover:text-ledger-ink",
                ].join(" ")}
              >
                {activeTab === "trade" ? "◆" : "◇"} Trade Machine
              </a>
            </nav>
          </div>
        </div>
      </div>
    </header>
  );
}