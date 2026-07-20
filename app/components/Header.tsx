"use client";
// ── Header — The Hockey Ledger masthead ─────────────────────
// Shared across product mode and analytics pages.

import { usePathname } from "next/navigation";

type NavTab = "trade" | "armchair-gm" | "players" | "teams" | "docket" | "press-box" | "fantasy";

interface HeaderProps {
  activeTab?: NavTab;
  showLiveFeed?: boolean;
}

export default function Header({ activeTab, showLiveFeed = true }: HeaderProps) {
  const pathname = usePathname();
  const resolvedActiveTab =
    pathname?.startsWith("/armchair-gm") ? "armchair-gm"
    : pathname?.startsWith("/teams") ? "teams"
    : pathname?.startsWith("/docket") ? "docket"
    : pathname?.startsWith("/press-box") ? "press-box"
    : pathname?.startsWith("/fantasy") ? "fantasy"
    : activeTab;
  const navClass = (tab: NavTab) => [
    "text-[11px] sm:text-[12px] uppercase tracking-[0.14em] sm:tracking-[0.2em] font-mono no-underline transition-colors border-b-2 pb-0.5",
    resolvedActiveTab === tab
      ? "text-ledger-red font-black border-ledger-red"
      : "text-ledger-ink-faint font-black border-transparent hover:text-ledger-ink hover:border-ledger-rule",
  ].join(" ");

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
            <a href="/" className="no-underline">
              <h1
                className="font-black leading-none transition-opacity hover:opacity-70 text-ledger-ink font-serif cursor-pointer"
                style={{ fontSize: 'clamp(1.8rem, 5vw, 3rem)', letterSpacing: '-0.02em', lineHeight: 1 }}
              >
                The Hockey Ledger
              </h1>
            </a>
            <p className="text-2xs uppercase tracking-[0.4em] mt-1.5 font-mono text-ledger-ink-faint">
              Est. 2026 &nbsp;—&nbsp; Vol. I &nbsp;—&nbsp;{" "}
              {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })} Data Online
            </p>

            {/* Nav tabs */}
            <nav className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 px-2">
              <a
                href="/players"
                className={navClass("players")}
              >
                {resolvedActiveTab === "players" ? "◆" : "◇"} Players
              </a>
              <span className="nav-divider text-ledger-rule-light">|</span>
              <a
                href="/teams"
                className={navClass("teams")}
              >
                {resolvedActiveTab === "teams" ? "◆" : "◇"} Teams
              </a>
              <span className="nav-divider text-ledger-rule-light">|</span>
              <a
                href="/docket"
                className={navClass("docket")}
              >
                {resolvedActiveTab === "docket" ? "◆" : "◇"} The Docket
              </a>
              <span className="nav-divider text-ledger-rule-light">|</span>
              <a
                href="/trade-machine"
                className={navClass("trade")}
              >
                {resolvedActiveTab === "trade" ? "◆" : "◇"} Trade Machine
              </a>
              <span className="nav-divider text-ledger-rule-light">|</span>
              <a
                href="/armchair-gm"
                className={navClass("armchair-gm")}
              >
                {resolvedActiveTab === "armchair-gm" ? "◆" : "◇"} Armchair GM
              </a>
              <span className="nav-divider text-ledger-rule-light">|</span>
              <a
                href="/fantasy"
                className={navClass("fantasy")}
              >
                {resolvedActiveTab === "fantasy" ? "◆" : "◇"} Fantasy
              </a>
              <span className="nav-divider text-ledger-rule-light">|</span>
              <a
                href="/press-box"
                className={navClass("press-box")}
              >
                {resolvedActiveTab === "press-box" ? "◆" : "◇"} Press Box
              </a>
            </nav>
          </div>
        </div>
      </div>
    </header>
  );
}
