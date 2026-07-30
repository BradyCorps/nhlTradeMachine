"use client";
// ── Header — Cap & Crease masthead ─────────────────────
// Shared across product mode and analytics pages.

import { usePathname } from "next/navigation";
import { BRAND } from "@/app/lib/brand";

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
    "text-[11px] uppercase tracking-[0.1em] sm:tracking-[0.14em] font-mono no-underline transition-colors border-b-2 pb-0.5",
    resolvedActiveTab === tab
      ? "text-ledger-red font-black border-ledger-red"
      : "text-ledger-ink-faint font-black border-transparent hover:text-ledger-ink hover:border-ledger-rule",
  ].join(" ");

  return (
    <header className="flex flex-col pb-5 border-b border-ledger-rule">
      <div className="w-full">
        {/* Masthead */}
        <div className="border-y-[3px] border-double border-ledger-ink py-2 mb-1">
          <div className="text-center">
            {/* The masthead is the kit's horizontal lockup, not typed text.
                The brand kit is explicit that the red ampersand is a custom
                vector — "do not recreate it with a typed &" — and the old
                markup did exactly that in whatever serif the browser had.
                The <h1> survives as visually-hidden text so the page still
                has a real heading for search and screen readers; the image
                is decorative because that text already names the site. */}
            <a href="/" className="no-underline block">
              <h1 className="sr-only">{BRAND.name}</h1>
              {/* The untextured cut. The kit's textured lockup is 246 KB, 218 KB
                  of it a base64 paper-grain JPEG that is invisible at header
                  size — nearly three times the whole shared JS bundle, on every
                  page. Same artwork, grain stripped (scripts/derive-brand-assets.mjs). */}
              <img
                src="/brand/svg/cap-and-crease-lockup-horizontal-clean.svg"
                alt=""
                aria-hidden="true"
                width={1560}
                height={320}
                className="mx-auto h-auto w-full transition-opacity hover:opacity-70 cursor-pointer"
                style={{ maxWidth: 'clamp(260px, 62vw, 520px)' }}
              />
            </a>
            <p className="flex items-center justify-center gap-2 text-2xs uppercase tracking-[0.3em] mt-1.5 font-mono text-ledger-ink-faint">
              <span>Est. 2026 &nbsp;—&nbsp; Vol. I &nbsp;—&nbsp;</span>
              {showLiveFeed && (
                <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-ledger-red opacity-50" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-ledger-red" />
                </span>
              )}
              <span>
                {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })} Data Feed Active
              </span>
            </p>

            {/* Nav tabs */}
            <nav className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 px-2">
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
