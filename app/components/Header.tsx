"use client";
// ── Header — Cap & Crease masthead ─────────────────────
// Shared across product mode and analytics pages.

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { BRAND } from "@/app/lib/brand";

type NavTab = "trade" | "armchair-gm" | "players" | "teams" | "docket" | "press-box" | "fantasy";

const COMPACT_SCROLL_THRESHOLD = 96;

interface HeaderProps {
  activeTab?: NavTab;
  showLiveFeed?: boolean;
}

export default function Header({ activeTab, showLiveFeed = true }: HeaderProps) {
  const [isCompact, setIsCompact] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const moreMenuId = useId();
  const pathname = usePathname();
  const resolvedActiveTab =
    pathname?.startsWith("/armchair-gm") ? "armchair-gm"
    : pathname?.startsWith("/teams") ? "teams"
    : pathname?.startsWith("/docket") ? "docket"
    : pathname?.startsWith("/press-box") ? "press-box"
    : pathname?.startsWith("/fantasy") ? "fantasy"
    : activeTab;

  useEffect(() => {
    let compact = false;
    const onScroll = () => {
      const nextCompact = window.scrollY > COMPACT_SCROLL_THRESHOLD;
      if (nextCompact === compact) return;
      compact = nextCompact;
      setIsCompact(nextCompact);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!moreOpen) return;

    const closeFromOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !moreRef.current?.contains(event.target)) {
        setMoreOpen(false);
      }
    };
    const closeFromEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMoreOpen(false);
        moreButtonRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", closeFromOutside);
    document.addEventListener("keydown", closeFromEscape);
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside);
      document.removeEventListener("keydown", closeFromEscape);
    };
  }, [moreOpen]);

  const overflowActive = resolvedActiveTab === "docket"
    || resolvedActiveTab === "fantasy"
    || resolvedActiveTab === "press-box";
  const navClass = (active: boolean) => [
    // The five visible controls keep their 44px targets at every width. Mobile
    // abbreviations make the primary four + More fit without sideways scroll.
    "inline-flex items-center justify-center shrink-0 min-h-[44px] px-1 sm:px-2 whitespace-nowrap text-[11px] uppercase tracking-[0.1em] sm:tracking-[0.14em] font-mono no-underline transition-colors border-b-2",
    active
      ? "text-ledger-red font-black border-ledger-red"
      : "text-ledger-ink-faint font-black border-transparent hover:text-ledger-ink hover:border-ledger-rule",
  ].join(" ");

  return (
    <header
      data-compact={isCompact}
      className={[
        "sticky top-0 z-40 flex flex-col border-b border-ledger-rule bg-ledger-paper transition-[padding,box-shadow] duration-200",
        isCompact ? "pb-0 shadow-md" : "pb-5",
      ].join(" ")}
    >
      <div className="w-full">
        {/* Masthead */}
        <div className={[
          "border-y-[3px] border-double border-ledger-ink transition-[padding,margin] duration-200",
          isCompact ? "py-0 mb-0" : "py-2 mb-1",
        ].join(" ")}>
          <div className={isCompact ? "flex items-center" : "text-center"}>
            {/* The masthead is the kit's horizontal lockup, not typed text.
                The brand kit is explicit that the red ampersand is a custom
                vector — "do not recreate it with a typed &" — and the old
                markup did exactly that in whatever serif the browser had.
                The <h1> survives as visually-hidden text so the page still
                has a real heading for search and screen readers; the image
                is decorative because that text already names the site. */}
            <Link
              href="/"
              className={isCompact ? "no-underline inline-flex min-h-[44px] w-11 sm:w-20 shrink-0 items-center" : "no-underline block"}
            >
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
                style={{ maxWidth: isCompact ? 72 : 'clamp(260px, 62vw, 520px)' }}
              />
            </Link>
            {!isCompact && (
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
            )}

            {/* Four primary tools remain visible; the three secondary routes
                move into the keyboard/touch disclosure at every width. */}
            <nav
              aria-label="Primary"
              className={[
                "flex flex-nowrap items-stretch sm:items-center justify-center gap-x-0.5 sm:gap-x-1",
                isCompact ? "mt-0 flex-1" : "mt-2",
              ].join(" ")}
            >
              <Link
                href="/players"
                aria-current={resolvedActiveTab === "players" ? "page" : undefined}
                className={navClass(resolvedActiveTab === "players")}
              >
                <span aria-hidden="true" className="hidden sm:inline">
                  {resolvedActiveTab === "players" ? "◆" : "◇"}&nbsp;
                </span>
                Players
              </Link>
              <span className="nav-divider text-ledger-rule-light">|</span>
              <Link
                href="/teams"
                aria-current={resolvedActiveTab === "teams" ? "page" : undefined}
                className={navClass(resolvedActiveTab === "teams")}
              >
                <span aria-hidden="true" className="hidden sm:inline">
                  {resolvedActiveTab === "teams" ? "◆" : "◇"}&nbsp;
                </span>
                Teams
              </Link>
              <span className="nav-divider text-ledger-rule-light">|</span>
              <a
                href="/trade-machine"
                aria-label="Trade Machine"
                aria-current={resolvedActiveTab === "trade" ? "page" : undefined}
                className={navClass(resolvedActiveTab === "trade")}
              >
                <span aria-hidden="true" className="hidden sm:inline">
                  {resolvedActiveTab === "trade" ? "◆" : "◇"}&nbsp;
                </span>
                <span className="sm:hidden">Trade</span>
                <span className="hidden sm:inline">Trade Machine</span>
              </a>
              <span className="nav-divider text-ledger-rule-light">|</span>
              <a
                href="/armchair-gm"
                aria-label="Armchair GM"
                aria-current={resolvedActiveTab === "armchair-gm" ? "page" : undefined}
                className={navClass(resolvedActiveTab === "armchair-gm")}
              >
                <span aria-hidden="true" className="hidden sm:inline">
                  {resolvedActiveTab === "armchair-gm" ? "◆" : "◇"}&nbsp;
                </span>
                <span className="sm:hidden">GM</span>
                <span className="hidden sm:inline">Armchair GM</span>
              </a>
              <span className="nav-divider text-ledger-rule-light">|</span>
              <div
                ref={moreRef}
                className="relative flex shrink-0"
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                    setMoreOpen(false);
                  }
                }}
              >
                <button
                  ref={moreButtonRef}
                  type="button"
                  aria-label="More navigation"
                  aria-expanded={moreOpen}
                  aria-controls={moreMenuId}
                  className={`${navClass(overflowActive)} appearance-none bg-transparent cursor-pointer`}
                  onClick={() => setMoreOpen(open => !open)}
                >
                  <span aria-hidden="true" className="hidden sm:inline">
                    {overflowActive ? "◆" : "◇"}&nbsp;
                  </span>
                  More<span aria-hidden="true" className="hidden sm:inline">&nbsp;▾</span>
                </button>
                {moreOpen && (
                  <div
                    id={moreMenuId}
                    role="group"
                    aria-label="Secondary navigation"
                    className="absolute right-0 top-full z-50 mt-1 min-w-[180px] border border-ledger-rule bg-ledger-paper p-1 shadow-lg"
                  >
                    <a
                      href="/docket"
                      aria-current={resolvedActiveTab === "docket" ? "page" : undefined}
                      className={`${navClass(resolvedActiveTab === "docket")} w-full justify-start`}
                      onClick={() => setMoreOpen(false)}
                    >
                      {resolvedActiveTab === "docket" ? "◆" : "◇"} The Docket
                    </a>
                    <a
                      href="/fantasy"
                      aria-current={resolvedActiveTab === "fantasy" ? "page" : undefined}
                      className={`${navClass(resolvedActiveTab === "fantasy")} w-full justify-start`}
                      onClick={() => setMoreOpen(false)}
                    >
                      {resolvedActiveTab === "fantasy" ? "◆" : "◇"} Fantasy
                    </a>
                    <a
                      href="/press-box"
                      aria-current={resolvedActiveTab === "press-box" ? "page" : undefined}
                      className={`${navClass(resolvedActiveTab === "press-box")} w-full justify-start`}
                      onClick={() => setMoreOpen(false)}
                    >
                      {resolvedActiveTab === "press-box" ? "◆" : "◇"} Press Box
                    </a>
                  </div>
                )}
              </div>
            </nav>
          </div>
        </div>
      </div>
    </header>
  );
}
