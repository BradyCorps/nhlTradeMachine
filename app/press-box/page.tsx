"use client";

import React, { Suspense, useState, useCallback, useMemo, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Header from "@/app/components/Header";
import Footer from "@/app/components/Footer";
import PressBoxCalendar from "./Calendar";
import {
  dayNumberFromDate,
  dealDailyHand,
  scoreHand,
  overlapWithOptimal,
  starRating,
  buildShareText,
  PEG_BOARD_LENGTH,
  MAX_ATTEMPTS,
  CARDS_DEALT,
  type PressBoxPlayer,
  type ScoringBreakdown,
} from "@/app/lib/press-box-engine";
import { PRESS_BOX_POOL } from "@/app/data/press-box-pool";
import { candidateAt, headshotCandidates } from "@/app/lib/league-imagery";

type GamePhase = "DRAFTING" | "REVEAL" | "SCORED";

interface AttemptRecord {
  picks: string[];
  score: number;
}

const FLAG_EMOJI: Record<string, string> = {
  CAN: "🇨🇦", USA: "🇺🇸", SWE: "🇸🇪", FIN: "🇫🇮", RUS: "🇷🇺",
  CZE: "🇨🇿", CHE: "🇨🇭", DEU: "🇩🇪", SVK: "🇸🇰", SVN: "🇸🇮",
  AUS: "🇦🇺", BLR: "🇧🇾", LVA: "🇱🇻", DNK: "🇩🇰", NOR: "🇳🇴",
  AUT: "🇦🇹", GBR: "🇬🇧",
};

const POS_LABEL: Record<string, string> = {
  C: "CENTER", W: "WING", D: "DEFENSE", G: "GOALIE",
};

function storageKey(dayNum: number) {
  return `press-box-state-${dayNum}`;
}

// v3 — the deal went from six cards to eight and is now curated, so a v2 save
// holds picks referring to cards that are no longer on the table. Bumping the
// version discards those cleanly instead of restoring a board that cannot be
// rendered; the alternative is an in-progress game silently showing the wrong
// four players. Streaks live under a separate key and are unaffected.
const STATE_VERSION = 3;

interface SavedState {
  dayNumber: number;
  version?: number;
  // v2+ multi-attempt format
  attempts?: AttemptRecord[];
  currentPicks?: string[];
  gameOver?: boolean;
  // v1 legacy format
  picks?: string[];
  phase?: GamePhase;
  score?: number;
}

function loadSavedState(dayNum: number): SavedState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey(dayNum));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveState(dayNum: number, attempts: AttemptRecord[], currentPicks: string[], gameOver: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    storageKey(dayNum),
    JSON.stringify({ dayNumber: dayNum, version: STATE_VERSION, attempts, currentPicks, gameOver })
  );
}

interface StreakData { current: number; best: number; lastDay: number; perfectHands: number }

function loadStreak(): StreakData {
  if (typeof window === "undefined") return { current: 0, best: 0, lastDay: 0, perfectHands: 0 };
  try {
    const raw = localStorage.getItem("press-box-streak");
    const data = raw ? JSON.parse(raw) : {};
    return { current: data.current ?? 0, best: data.best ?? 0, lastDay: data.lastDay ?? 0, perfectHands: data.perfectHands ?? 0 };
  } catch {
    return { current: 0, best: 0, lastDay: 0, perfectHands: 0 };
  }
}

function updateStreak(dayNum: number, isPerfect: boolean) {
  const streak = loadStreak();
  if (streak.lastDay === dayNum) return streak;
  const isConsecutive = streak.lastDay === dayNum - 1;
  const newCurrent = isConsecutive ? streak.current + 1 : 1;
  const newBest = Math.max(streak.best, newCurrent);
  const perfectHands = streak.perfectHands + (isPerfect ? 1 : 0);
  const updated: StreakData = { current: newCurrent, best: newBest, lastDay: dayNum, perfectHands };
  localStorage.setItem("press-box-streak", JSON.stringify(updated));
  return updated;
}

// The seven categories, in the order the breakdown prints them. Listed once so
// the player's breakdown and the revealed answer cannot show different rows.
const SCORING_ROWS = [
  { key: "teammates",     icon: "🏒", label: "Teammates" },
  { key: "draftClass",    icon: "📋", label: "Draft Class" },
  { key: "pipeline",      icon: "📈", label: "Pipeline" },
  { key: "divisionFlush", icon: "🗺", label: "Division Flush" },
  { key: "countryClub",   icon: "🌍", label: "Country Club" },
  { key: "positionGroup", icon: "🎯", label: "Position Group" },
  { key: "callUpBonus",   icon: "⭐", label: "Call-Up Bonus" },
] as const satisfies readonly { key: keyof Omit<ScoringBreakdown, "total">; icon: string; label: string }[];

// ── How to Score ──────────────────────────────────────────────
//
// One copy. This text existed verbatim in two places, which is how it drifted
// out of step with the engine in the first place.
//
// It also described a different game from the one being scored. The call-up is
// not a bonus card sitting beside your four — `scoreHand` builds a FIVE-card
// hand and most categories count all five, which is why a breakdown can read
// "2x OTT = 2" when only one of your picks is an Ottawa Senator. And Pipeline
// paid per distinct YEAR in the run, never per card. Both are stated plainly
// now, and each rule says how many cards it counts.
function HowToScore() {
  return (
    <div className="px-4 pb-3 space-y-1 text-[11px] font-mono" style={{ color: "var(--ledger-ink-body)" }}>
      <p><strong>You have {MAX_ATTEMPTS} attempts</strong> to find the perfect hand.</p>
      <p>The call-up is hidden on your first attempt, then revealed.</p>
      <p>The peg board shows how close your best hand is to the target hole.</p>
      <p className="mt-2" style={{ color: "var(--ink)" }}>
        <strong>The call-up is the fifth card in your hand.</strong> Every rule below
        counts all five unless it says otherwise — so a pair can be one of your
        picks and the call-up.
      </p>
      <p className="mt-2"><strong>Teammates</strong> — 2 pts per pair on the same NHL team</p>
      <p><strong>Draft Class</strong> — 2 pts per pair drafted in the same year</p>
      <p><strong>Pipeline</strong> — 1 pt per year in a run of 3+ consecutive draft years</p>
      <p><strong>Division Flush</strong> — 4 pts if <em>your 4 picks</em> share a division (5 if the call-up matches too)</p>
      <p><strong>Country Club</strong> — 3 pts if 3 or more share a country (flat — 4 or 5 scores the same)</p>
      <p><strong>Position Group</strong> — 3 pts if 3 or more share a position type, F/D/G (flat)</p>
      <p><strong>Call-Up Bonus</strong> — 1 pt per pick on the call-up&apos;s team, <em>on top of</em> the Teammates pair it already made</p>
    </div>
  );
}

// ── Attempt history ───────────────────────────────────────────
//
// Which four, and how many of them belonged. This lived inside the SCORED
// panel, so it vanished the moment the player pressed Try Again — gone exactly
// when it was needed, while the drafting instructions told them to "use the
// scoring breakdown" that had gone with it. It renders in both phases now.
//
// Not a new hint: the overlap was already printed for the latest attempt. What
// it removes is having to remember five sets of four, which is bookkeeping
// rather than deduction. Every guessing game worth playing keeps its guesses
// on screen.
function AttemptHistory({
  attempts, dealt, optimal, optimalCombos, minAttempts = 1, title = "Attempt History",
}: {
  attempts: AttemptRecord[];
  dealt: PressBoxPlayer[];
  optimal: number;
  optimalCombos: string[][];
  minAttempts?: number;
  title?: string;
}) {
  if (attempts.length < minAttempts || attempts.length === 0) return null;
  const bestScore = Math.max(...attempts.map(a => a.score));

  return (
    <div
      className="border p-4"
      style={{ borderColor: "var(--rule)", background: "var(--paper-inset)", borderRadius: 2 }}
    >
      <div
        className="text-[10px] font-black uppercase tracking-[0.3em] font-mono pb-2 border-b mb-2"
        style={{ color: "var(--ink)", borderColor: "var(--rule)" }}
      >
        {title}
      </div>
      {attempts.map((attempt, i) => {
        const isBest = attempt.score === bestScore;
        const isPerfect = attempt.score === optimal;
        const names = attempt.picks.map(id => dealt.find(p => p.id === id)?.name ?? "—");
        const overlap = optimalCombos.length > 0
          ? overlapWithOptimal(attempt.picks, optimalCombos)
          : null;
        return (
          <div key={i} className="py-1.5 border-b" style={{ borderColor: "var(--rule-light)" }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className="w-2 h-2"
                  style={{
                    background: isPerfect
                      ? "var(--ledger-green)"
                      : attempt.score >= optimal * 0.7 ? "var(--ledger-amber)" : "var(--ledger-red)",
                    borderRadius: "50%",
                  }}
                />
                <span className="text-[11px] font-mono" style={{ color: "var(--ledger-ink-faint)" }}>
                  Attempt {i + 1}
                </span>
                {overlap !== null && !isPerfect && (
                  <span className="text-[10px] font-mono" style={{ color: "var(--ledger-ink-faint)" }}>
                    · {overlap}/4 belonged
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="text-[13px] font-black font-mono tabular-nums"
                  style={{ color: isPerfect ? "var(--ledger-green)" : "var(--ink)" }}
                >
                  {attempt.score}/{optimal}
                </span>
                {isBest && !isPerfect && (
                  <span
                    className="text-[10px] font-black font-mono uppercase px-1 py-px"
                    style={{ background: "var(--ledger-amber)", color: "#fff", borderRadius: 1 }}
                  >
                    Best
                  </span>
                )}
                {isPerfect && (
                  <span
                    className="text-[10px] font-black font-mono uppercase px-1 py-px"
                    style={{ background: "var(--ledger-green)", color: "#fff", borderRadius: 1 }}
                  >
                    Perfect
                  </span>
                )}
              </div>
            </div>
            <div
              className="text-[10px] font-mono mt-1 pl-4"
              style={{ color: "var(--ledger-ink-faint)", overflowWrap: "anywhere" }}
            >
              {names.join(" · ")}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Rubber stamp overlay ──────────────────────────────────────
function CardStamp({ text, color }: { text: string; color: string }) {
  return (
    <span
      className="absolute z-10 font-mono font-black uppercase pointer-events-none"
      style={{
        top: 10,
        left: "50%",
        transform: "translateX(-50%) rotate(-6deg)",
        border: `2px solid ${color}`,
        color,
        padding: "1px 5px",
        fontSize: 9,
        letterSpacing: "0.12em",
        borderRadius: 2,
        background: "var(--paper)",
        opacity: 0.92,
      }}
    >
      {text}
    </span>
  );
}

// ── Mugshot — sepia newspaper headshot, flag fallback ─────────
// The pool API overlays the roster feed's own photo URL where it can reach the
// feed; when it can't, the mug is derived from the player's id and tricode, so
// the cards keep their faces even on a cold pool. The nation flag is the last
// resort, not the first — it is also the fallback the exported card uses, which
// carries no league imagery at all.
function Mug({ player, flag }: { player: PressBoxPlayer; flag: string }) {
  const candidates = useMemo(
    () => headshotCandidates({ id: player.id, teamId: player.team, headshot: player.headshot }),
    [player.id, player.team, player.headshot],
  );
  const key = candidates.join("|");
  const [failed, setFailed] = useState<{ key: string; count: number }>({ key, count: 0 });
  const src = candidateAt(candidates, failed.key === key ? failed.count : 0);

  if (!src) {
    return <div className="text-[17px] leading-none" aria-hidden>{flag}</div>;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={player.name}
      loading="lazy"
      onError={() => setFailed(prev => (
        prev.key === key ? { key, count: prev.count + 1 } : { key, count: 1 }
      ))}
      className="rounded-full shrink-0"
      style={{
        width: 44,
        height: 44,
        objectFit: "cover",
        border: "1.5px solid var(--rule)",
        background: "var(--paper)",
        filter: "sepia(0.25) contrast(1.05)",
      }}
    />
  );
}

// ── Player Card — newspaper-style playing card ────────────────
function PlayerCard({
  player,
  selected,
  disabled,
  onClick,
  isCallUp,
  matchHighlights,
}: {
  player: PressBoxPlayer;
  selected: boolean;
  disabled: boolean;
  onClick?: () => void;
  isCallUp?: boolean;
  matchHighlights?: { team: boolean; draft: boolean; nation: boolean; division: boolean; position: boolean };
}) {
  const flag = FLAG_EMOJI[player.nationality] ?? "🏳️";
  const posLabel = POS_LABEL[player.position] ?? player.position;
  const accent = isCallUp
    ? "var(--ledger-red)"
    : selected
      ? "var(--ledger-green)"
      : "var(--ink)";

  const cornerIndex = (
    <>
      <div className="font-black font-serif text-[15px] leading-none" style={{ color: accent }}>
        {player.jerseyNumber}
      </div>
      <div className="font-mono text-[10px] font-black mt-0.5 leading-none" style={{ color: "var(--ledger-ink-faint)" }}>
        {player.position}
      </div>
    </>
  );

  return (
    <button
      onClick={onClick}
      disabled={disabled && !selected}
      className={[
        "relative w-full text-left transition-all duration-200 border select-none",
        selected && !isCallUp ? "-translate-y-1" : "",
        !disabled && !selected && onClick ? "cursor-pointer hover:-translate-y-1" : "",
        disabled && !selected && !isCallUp && onClick ? "opacity-60" : "",
      ].join(" ")}
      style={{
        aspectRatio: "5 / 7",
        background: "var(--paper-inset)",
        borderColor: accent,
        borderRadius: 8,
        boxShadow: selected || isCallUp
          ? "0 4px 12px rgba(0,0,0,0.18)"
          : "0 1px 3px rgba(0,0,0,0.12)",
      }}
    >
      {/* inner frame — classic double-rule card border */}
      <div
        className="absolute pointer-events-none border"
        style={{ inset: 4, borderColor: "var(--rule)", borderRadius: 5 }}
      />

      {/* corner indices, mirrored like rank pips */}
      <div className="absolute top-2 left-2.5 text-center">{cornerIndex}</div>
      <div className="absolute bottom-2 right-2.5 text-center rotate-180">{cornerIndex}</div>

      {/* stamps */}
      {selected && !isCallUp && <CardStamp text="In Lineup" color="var(--ledger-green)" />}
      {isCallUp && <CardStamp text="Call-Up" color="var(--ledger-red)" />}

      {/* card face */}
      <div className="absolute inset-0 flex flex-col items-center justify-center px-3 text-center">
        <Mug player={player} flag={flag} />
        <div
          className="font-black font-serif text-[13px] leading-tight mt-1.5"
          style={{ color: "var(--ink)" }}
        >
          {player.name}
        </div>
        <div className="mt-1.5 flex items-center justify-center gap-1.5">
          <span
            className="text-[9px] font-black font-mono uppercase tracking-wider px-1 py-px"
            style={
              matchHighlights?.team
                ? { background: "var(--ledger-green)", color: "#fff", borderRadius: 1 }
                : { color: "var(--ledger-ink-faint)", background: "var(--paper)", borderRadius: 1, border: "1px solid var(--rule-light)" }
            }
          >
            {player.team}
          </span>
          <span
            className={["text-[9px] font-mono", matchHighlights?.position ? "font-black text-[var(--ledger-green)]" : ""].join(" ")}
            style={!matchHighlights?.position ? { color: "var(--ledger-ink-faint)" } : {}}
          >
            {posLabel}
          </span>
        </div>

        <div className="w-8 border-t my-2" style={{ borderColor: "var(--rule)" }} />

        {/* agate lines — box-score fine print */}
        <div className="space-y-0.5 text-[9px] font-mono leading-tight" style={{ color: "var(--ledger-ink-faint)" }}>
          <div className={matchHighlights?.nation ? "font-black text-[var(--ledger-green)]" : ""}>
            {flag} {player.nationality} · AGE {player.age}
          </div>
          <div className={matchHighlights?.draft ? "font-black text-[var(--ledger-green)]" : ""}>
            DRAFT &apos;{String(player.draftYear).slice(2)}
          </div>
          <div className={matchHighlights?.division ? "font-black text-[var(--ledger-green)]" : ""}>
            {player.division}
          </div>
        </div>
      </div>
    </button>
  );
}

// ── Peg Board — crib-style progress track ─────────────────────
// Shows how far your pegs are from the target hole without printing
// a point gap. Front peg (green) = best score, back peg (amber) =
// latest attempt, red ring = target (the optimal lineup's score).
function PegBoard({ attempts, optimal }: { attempts: AttemptRecord[]; optimal: number }) {
  const best = attempts.length > 0 ? Math.max(...attempts.map((a) => a.score)) : null;
  const latest = attempts.length > 0 ? attempts[attempts.length - 1].score : null;

  return (
    <div
      className="border px-3 py-2.5"
      style={{ borderColor: "var(--rule)", background: "var(--paper-inset)", borderRadius: 2 }}
    >
      <div
        className="text-[9px] font-black uppercase tracking-[0.3em] font-mono mb-2 text-center"
        style={{ color: "var(--ledger-ink-faint)" }}
      >
        Peg Board
      </div>
      <div className="flex items-end justify-center">
        {Array.from({ length: PEG_BOARD_LENGTH + 1 }, (_, i) => {
          const isTarget = i === optimal;
          const isBest = best !== null && i === best;
          const isLatest = latest !== null && i === latest && !isBest;
          let fill = "transparent";
          if (isBest) fill = "var(--ledger-green)";
          else if (isLatest) fill = "var(--ledger-amber)";
          return (
            <div
              key={i}
              className="flex flex-col items-center"
              // crib boards group holes in fives — breathe after 5 and 10
              style={{ marginLeft: i === 0 ? 0 : i % 5 === 1 ? 7 : 2 }}
            >
              <div
                className="rounded-full transition-all duration-300"
                style={{
                  // Trimmed from 11px/3px: the board runs to the curated
                  // ceiling now, and 19 pegs at the old sizing overflowed a
                  // 320px screen.
                  width: 10,
                  height: 10,
                  background: fill,
                  border: isTarget
                    ? "2px solid var(--ledger-red)"
                    : `1.5px solid ${fill === "transparent" ? "var(--rule)" : fill}`,
                }}
              />
              <div
                className="text-[9px] font-mono mt-0.5 leading-none"
                style={{ color: "var(--ledger-ink-faint)", visibility: i % 5 === 0 ? "visible" : "hidden" }}
              >
                {i}
              </div>
            </div>
          );
        })}
      </div>
      <div
        className="flex items-center justify-center gap-3 mt-1.5 text-[10px] font-mono uppercase tracking-wider"
        style={{ color: "var(--ledger-ink-faint)" }}
      >
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: "var(--ledger-green)" }} /> Best
        </span>
        {latest !== null && latest !== best && (
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: "var(--ledger-amber)" }} /> Last
          </span>
        )}
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full" style={{ border: "2px solid var(--ledger-red)" }} /> Target
        </span>
      </div>
    </div>
  );
}

// ── Scoring Row ───────────────────────────────────────────────
function ScoreRow({
  label,
  icon,
  points,
  detail,
}: {
  label: string;
  icon: string;
  points: number;
  detail: string;
}) {
  return (
    <div
      className="flex items-center justify-between gap-2 py-1.5 border-b"
      style={{ borderColor: "var(--rule-light)" }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-[14px] shrink-0">{icon}</span>
        <span className="text-[11px] font-black font-mono uppercase tracking-wider" style={{ color: "var(--ink)" }}>
          {label}
        </span>
        <span className="text-[10px] font-mono truncate" style={{ color: "var(--ledger-ink-faint)" }}>
          {detail}
        </span>
      </div>
      <span
        className="text-[14px] font-black font-mono shrink-0 tabular-nums"
        style={{ color: points > 0 ? "var(--ledger-green)" : "var(--ledger-ink-faint)" }}
      >
        {points > 0 ? `+${points}` : "0"}
      </span>
    </div>
  );
}

// ── Attempt Progress Dots ─────────────────────────────────────
function AttemptDots({ attempts, maxAttempts, optimal }: { attempts: AttemptRecord[]; maxAttempts: number; optimal: number }) {
  return (
    <div className="flex items-center justify-center gap-1.5">
      {Array.from({ length: maxAttempts }, (_, i) => {
        const attempt = attempts[i];
        let bg = "var(--rule-light)";
        if (attempt) {
          bg = attempt.score === optimal
            ? "var(--ledger-green)"
            : attempt.score >= optimal * 0.7
              ? "var(--ledger-amber)"
              : "var(--ledger-red)";
        }
        return (
          <div
            key={i}
            className="w-2.5 h-2.5 transition-all duration-300"
            style={{ background: bg, borderRadius: "50%" }}
          />
        );
      })}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────
export default function PressBoxPage() {
  return (
    <Suspense>
      <PressBoxGame />
    </Suspense>
  );
}

function PressBoxGame() {
  const searchParams = useSearchParams();
  const todayNum = useMemo(() => dayNumberFromDate(), []);

  const dayParam = searchParams.get("day");
  const dayNum = dayParam ? parseInt(dayParam, 10) : todayNum;
  const isToday = dayNum === todayNum;
  const isArchive = !isToday;

  // The pool comes from the server, where curated identity is overlaid with
  // live team/age/draft facts from the players table. The bundled pool is
  // only the fallback so the game still deals if the API is unreachable.
  const [pool, setPool] = useState<PressBoxPlayer[] | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/press-box/pool")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!alive) return;
        const players = Array.isArray(data?.players) ? (data.players as PressBoxPlayer[]) : [];
        // Eight on the table plus the call-up. This guard still said 7 after
        // the deal grew, so a thin API pool would have been accepted and then
        // dealt from with nothing left to be the call-up.
        setPool(players.length > CARDS_DEALT ? players : PRESS_BOX_POOL);
      })
      .catch(() => {
        if (alive) setPool(PRESS_BOX_POOL);
      });
    return () => { alive = false; };
  }, []);

  const hand = useMemo(() => (pool ? dealDailyHand(pool, dayNum) : null), [pool, dayNum]);
  // The deal already solved itself while curating; recomputing would be a
  // second answer that could disagree with the one the curator accepted.
  const optimalResult = hand?.optimal ?? null;
  const optimal = optimalResult?.score ?? 0;

  // The answer, for the reveal when a player runs out of attempts.
  const perfectHand = useMemo(() => {
    if (!hand || !optimalResult || optimalResult.combos.length === 0) return null;
    const byId = new Map(hand.dealt.map(p => [p.id, p]));
    const cards = optimalResult.combos[0].map(id => byId.get(id)).filter((p): p is PressBoxPlayer => !!p);
    return cards.length === optimalResult.combos[0].length ? cards : null;
  }, [hand, optimalResult]);

  const perfectBreakdown = useMemo(
    () => (hand && perfectHand ? scoreHand(perfectHand, hand.callUp) : null),
    [hand, perfectHand],
  );

  const [picks, setPicks] = useState<string[]>([]);
  const [phase, setPhase] = useState<GamePhase>("DRAFTING");
  const [breakdown, setBreakdown] = useState<ScoringBreakdown | null>(null);
  const [copied, setCopied] = useState(false);
  const [streak, setStreak] = useState<StreakData>({ current: 0, best: 0, lastDay: 0, perfectHands: 0 });
  const [resetTaps, setResetTaps] = useState(0);
  const [attempts, setAttempts] = useState<AttemptRecord[]>([]);
  const [gameOver, setGameOver] = useState(false);

  const callUpRevealed = attempts.length > 0;
  const attemptNumber = attempts.length + 1;
  const bestScore = attempts.length > 0 ? Math.max(...attempts.map((a) => a.score)) : 0;
  const foundOptimal = attempts.some((a) => a.score === optimal);
  const attemptsRemaining = MAX_ATTEMPTS - attempts.length;

  // Vague closeness feedback: how many of the last attempt's cards belong
  // to a perfect lineup (never the exact point gap).
  const lastOverlap = useMemo(() => {
    if (!optimalResult || attempts.length === 0) return null;
    return overlapWithOptimal(attempts[attempts.length - 1].picks, optimalResult.combos);
  }, [attempts, optimalResult]);

  // Restore saved state
  useEffect(() => {
    if (!hand) return;
    const saved = loadSavedState(dayNum);
    if (saved) {
      if (saved.version === STATE_VERSION && saved.attempts) {
        setAttempts(saved.attempts);
        setGameOver(saved.gameOver ?? false);
        if (saved.gameOver) {
          const lastAttempt = saved.attempts[saved.attempts.length - 1];
          if (lastAttempt) {
            const pickedPlayers = hand.dealt.filter((p) => lastAttempt.picks.includes(p.id));
            setBreakdown(scoreHand(pickedPlayers, hand.callUp));
            setPicks(lastAttempt.picks);
          }
          setPhase("SCORED");
        } else {
          setPicks(saved.currentPicks ?? []);
          setPhase("DRAFTING");
          setBreakdown(null);
        }
      } else {
        // Legacy v1 format — treat as completed single-attempt game
        const legacyPicks = saved.picks ?? [];
        const legacyScore = saved.score ?? 0;
        if (saved.phase === "SCORED" && legacyPicks.length > 0) {
          const legacyAttempts = [{ picks: legacyPicks, score: legacyScore }];
          setAttempts(legacyAttempts);
          setGameOver(true);
          setPicks(legacyPicks);
          const pickedPlayers = hand.dealt.filter((p) => legacyPicks.includes(p.id));
          setBreakdown(scoreHand(pickedPlayers, hand.callUp));
          setPhase("SCORED");
        } else {
          setPicks([]);
          setPhase("DRAFTING");
          setBreakdown(null);
          setAttempts([]);
          setGameOver(false);
        }
      }
    } else {
      setPicks([]);
      setPhase("DRAFTING");
      setBreakdown(null);
      setAttempts([]);
      setGameOver(false);
    }
    setStreak(loadStreak());
  }, [dayNum, hand]);

  // Hidden dev reset: tap day number 5 times
  const handleDayTap = useCallback(() => {
    setResetTaps((prev) => {
      const next = prev + 1;
      if (next >= 5) {
        localStorage.removeItem(storageKey(dayNum));
        setPicks([]);
        setPhase("DRAFTING");
        setBreakdown(null);
        setAttempts([]);
        setGameOver(false);
        return 0;
      }
      return next;
    });
  }, [dayNum]);

  useEffect(() => {
    if (resetTaps === 0) return;
    const timer = setTimeout(() => setResetTaps(0), 2000);
    return () => clearTimeout(timer);
  }, [resetTaps]);

  const togglePick = useCallback(
    (id: string) => {
      if (phase !== "DRAFTING") return;
      setPicks((prev) => {
        if (prev.includes(id)) return prev.filter((p) => p !== id);
        if (prev.length >= 4) return prev;
        return [...prev, id];
      });
    },
    [phase]
  );

  const handleSubmit = useCallback(() => {
    if (picks.length !== 4 || !hand) return;
    setPhase("REVEAL");
    const revealDelay = attempts.length === 0 ? 1500 : 800;
    setTimeout(() => {
      const pickedPlayers = hand.dealt.filter((p) => picks.includes(p.id));
      const result = scoreHand(pickedPlayers, hand.callUp);
      setBreakdown(result);

      const newAttempt: AttemptRecord = { picks: [...picks], score: result.total };
      const newAttempts = [...attempts, newAttempt];
      setAttempts(newAttempts);

      const isOptimal = result.total === optimal;
      const isMaxAttempts = newAttempts.length >= MAX_ATTEMPTS;
      const over = isOptimal || isMaxAttempts;
      setGameOver(over);
      setPhase("SCORED");
      saveState(dayNum, newAttempts, [], over);

      if (isToday && over) {
        const best = Math.max(...newAttempts.map((a) => a.score));
        setStreak(updateStreak(dayNum, best === optimal));
      }
    }, revealDelay);
  }, [picks, hand, dayNum, isToday, optimal, attempts]);

  const handleTryAgain = useCallback(() => {
    setPicks([]);
    setBreakdown(null);
    setPhase("DRAFTING");
    saveState(dayNum, attempts, [], false);
  }, [dayNum, attempts]);

  const handleShare = useCallback(async () => {
    if (attempts.length === 0) return;
    const best = Math.max(...attempts.map((a) => a.score));
    const text = buildShareText(dayNum, best, optimal, attempts.map((a) => a.score));
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  }, [attempts, dayNum, optimal]);

  const rating = breakdown ? starRating(breakdown.total, optimal) : null;

  const lastHandDay = todayNum - 1;
  const lastHandPlayed = typeof window !== "undefined" && !!loadSavedState(lastHandDay);
  const todayPlayed = typeof window !== "undefined" && !!loadSavedState(todayNum);

  const pickedPlayers = hand ? hand.dealt.filter((p) => picks.includes(p.id)) : [];
  const waivedPlayers = hand ? hand.dealt.filter((p) => !picks.includes(p.id)) : [];

  // Compute match highlights for scored state
  const matchHighlights = useMemo(() => {
    if (phase !== "SCORED" || !breakdown || !hand) return new Map<string, { team: boolean; draft: boolean; nation: boolean; division: boolean; position: boolean }>();
    const fullHand = [...pickedPlayers, hand.callUp];
    const highlights = new Map<string, { team: boolean; draft: boolean; nation: boolean; division: boolean; position: boolean }>();

    const teamCounts = new Map<string, number>();
    const draftCounts = new Map<number, number>();
    const natCounts = new Map<string, number>();
    const divSet = new Set(pickedPlayers.map((p) => p.division));
    const posCounts = new Map<string, number>();

    for (const p of fullHand) {
      teamCounts.set(p.team, (teamCounts.get(p.team) ?? 0) + 1);
      if (p.draftYear > 0) draftCounts.set(p.draftYear, (draftCounts.get(p.draftYear) ?? 0) + 1);
      natCounts.set(p.nationality, (natCounts.get(p.nationality) ?? 0) + 1);
      const pt = p.position === "C" || p.position === "W" ? "F" : p.position;
      posCounts.set(pt, (posCounts.get(pt) ?? 0) + 1);
    }

    for (const p of fullHand) {
      const pt = p.position === "C" || p.position === "W" ? "F" : p.position;
      highlights.set(p.id, {
        team: (teamCounts.get(p.team) ?? 0) >= 2,
        draft: (draftCounts.get(p.draftYear) ?? 0) >= 2,
        nation: (natCounts.get(p.nationality) ?? 0) >= 3,
        division: divSet.size === 1,
        position: (posCounts.get(pt) ?? 0) >= 3,
      });
    }
    return highlights;
  }, [phase, breakdown, pickedPlayers, hand]);

  return (
    <main
      className="min-h-screen font-serif antialiased"
      style={{ background: "var(--paper)", color: "var(--ink)" }}
    >
      <div className="max-w-2xl mx-auto px-4 py-6">
        <Header showLiveFeed={false} />

        {/* ── Title block ────────────────────────────────────── */}
        <div className="mt-6 mb-2 text-center">
          <div
            className="text-[10px] font-black uppercase tracking-[0.4em] font-mono mb-1"
            style={{ color: "var(--ledger-red)" }}
          >
            {isArchive ? "Archive" : "Daily Game"}
          </div>
          <h2
            className="font-black font-serif leading-none"
            style={{ fontSize: "clamp(1.6rem, 5vw, 2.4rem)", letterSpacing: "-0.02em" }}
          >
            Press Box
          </h2>
          <p
            className="text-[11px] font-mono mt-1 uppercase tracking-[0.15em] cursor-pointer select-none"
            style={{ color: "var(--ledger-ink-faint)" }}
            onClick={handleDayTap}
          >
            #{dayNum} &nbsp;·&nbsp; {hand?.dateLabel ?? " "}
          </p>
        </div>

        {!hand && (
          <div
            className="text-center py-24 text-[12px] font-mono uppercase tracking-[0.3em] animate-pulse"
            style={{ color: "var(--ledger-ink-faint)" }}
          >
            Shuffling the deck…
          </div>
        )}

        {hand && (
          <>
        {/* ── Archive banner ────────────────────────────────── */}
        {isArchive && (
          <div
            className="text-center mb-4 py-2 px-4 border text-[11px] font-mono"
            style={{ borderColor: "var(--ledger-amber)", background: "var(--paper-inset)", borderRadius: 2, color: "var(--ledger-ink-body)" }}
          >
            You&apos;re playing hand #{dayNum}.{" "}
            <a
              href="/press-box"
              className="font-black underline"
              style={{ color: "var(--ledger-red)" }}
            >
              Back to today&apos;s hand
            </a>
          </div>
        )}

        {/* ── Streak bar ─────────────────────────────────────── */}
        <div
          className="flex items-center justify-center gap-4 py-2 mb-4 border-y text-[10px] font-mono uppercase tracking-wider"
          style={{ borderColor: "var(--rule-light)", color: "var(--ledger-ink-faint)" }}
        >
          <span>
            Streak: <strong style={{ color: "var(--ink)" }}>{streak.current}</strong>
          </span>
          <span style={{ color: "var(--rule)" }}>|</span>
          <span>
            Best: <strong style={{ color: "var(--ink)" }}>{streak.best}</strong>
          </span>
          <span style={{ color: "var(--rule)" }}>|</span>
          <span>
            Perfect Hands: <strong style={{ color: streak.perfectHands > 0 ? "var(--ledger-green)" : "var(--ink)" }}>{streak.perfectHands}</strong>
          </span>
        </div>

        {/* ── Attempt progress ──────────────────────────────── */}
        {(attempts.length > 0 || phase === "SCORED") && (
          <div className="flex items-center justify-center gap-3 mb-4">
            <span
              className="text-[10px] font-black uppercase tracking-[0.2em] font-mono"
              style={{ color: "var(--ledger-ink-faint)" }}
            >
              {gameOver
                ? foundOptimal
                  ? `Found in ${attempts.length}/${MAX_ATTEMPTS}`
                  : `${attempts.length}/${MAX_ATTEMPTS} attempts`
                : `Attempt ${attemptNumber}/${MAX_ATTEMPTS}`
              }
            </span>
            <AttemptDots attempts={attempts} maxAttempts={MAX_ATTEMPTS} optimal={optimal} />
          </div>
        )}

        {/* ── Call-up preview (visible during drafting after first attempt) ── */}
        {phase === "DRAFTING" && callUpRevealed && (
          <div className="mb-4">
            <div
              className="text-[10px] font-black uppercase tracking-[0.3em] font-mono pb-1 border-b mb-2"
              style={{ color: "var(--ledger-red)", borderColor: "var(--rule)" }}
            >
              Call-Up (revealed)
            </div>
            <div className="max-w-[180px] mx-auto">
              <PlayerCard
                player={hand.callUp}
                selected={false}
                disabled
                isCallUp
              />
            </div>
            <div className="mt-3">
              <PegBoard attempts={attempts} optimal={optimal} />
            </div>
            {lastOverlap !== null && !foundOptimal && (
              <div
                className="text-center mt-2 text-[11px] font-mono uppercase tracking-wider"
                style={{ color: "var(--ledger-ink-body)" }}
              >
                Last attempt: <strong style={{ color: lastOverlap >= 3 ? "var(--ledger-green)" : "var(--ink)" }}>{lastOverlap}/4</strong> cards in the perfect lineup
              </div>
            )}
          </div>
        )}

        {/* ── Instructions ───────────────────────────────────── */}
        {phase === "DRAFTING" && (
          <div
            className="text-center mb-5 py-3 px-4 border"
            style={{ borderColor: "var(--rule)", background: "var(--paper-inset)", borderRadius: 2 }}
          >
            <p className="text-[12px] leading-relaxed" style={{ color: "var(--ledger-ink-body)" }}>
              {callUpRevealed ? (
                <>
                  <strong>Pick 4 cards</strong> to move your peg to the target hole.
                  <br />
                  Your earlier hands are below — work out what was carrying them.
                </>
              ) : (
                <>
                  {/* Was "Waive the other 2" — left over from the six-card deal. */}
                  <strong>Draft 4 players</strong> into your lineup. Waive the other {CARDS_DEALT - 4}.
                  <br />
                  A mystery <strong>call-up</strong> will be revealed — score your hand.
                  <br />
                  <span className="text-[10px]" style={{ color: "var(--ledger-ink-faint)" }}>
                    You have {MAX_ATTEMPTS} attempts to find the perfect hand.
                  </span>
                </>
              )}
            </p>
            <p
              className="text-[10px] font-mono mt-2 uppercase tracking-wider"
              style={{ color: "var(--ledger-ink-faint)" }}
            >
              {picks.length}/4 selected
            </p>
          </div>
        )}

        {/* What has been tried, sitting directly above the table it refers to,
            so the player reads their own history and then looks at the cards. */}
        {phase === "DRAFTING" && (
          <div className="mb-5">
            <AttemptHistory
              attempts={attempts}
              dealt={hand.dealt}
              optimal={optimal}
              optimalCombos={optimalResult?.combos ?? []}
              title="Hands You Have Tried"
            />
          </div>
        )}

        {/* ── Dealt cards ────────────────────────────────────── */}
        {phase === "DRAFTING" && (
          <div className="space-y-2 mb-5">
            <div
              className="text-[10px] font-black uppercase tracking-[0.3em] font-mono pb-1 border-b"
              style={{ color: "var(--ledger-ink-faint)", borderColor: "var(--rule)" }}
            >
              {isToday ? "Today's" : `Hand #${dayNum}`} Cards
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              {hand.dealt.map((player) => (
                <PlayerCard
                  key={player.id}
                  player={player}
                  selected={picks.includes(player.id)}
                  disabled={picks.length >= 4}
                  onClick={() => togglePick(player.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Submit button ──────────────────────────────────── */}
        {phase === "DRAFTING" && (
          <button
            onClick={handleSubmit}
            disabled={picks.length !== 4}
            className="w-full py-3 font-black text-[13px] uppercase tracking-[0.2em] font-mono transition-all border"
            style={{
              background: picks.length === 4 ? "var(--ledger-red)" : "var(--paper-inset)",
              color: picks.length === 4 ? "#fff" : "var(--ledger-ink-faint)",
              borderColor: picks.length === 4 ? "var(--ledger-red)" : "var(--rule)",
              borderRadius: 2,
              cursor: picks.length === 4 ? "pointer" : "default",
            }}
          >
            {picks.length === 4
              ? callUpRevealed
                ? `Lock Lineup (Attempt ${attemptNumber})`
                : "Lock Lineup & Reveal Call-Up"
              : `Select ${4 - picks.length} more`}
          </button>
        )}

        {/* ── Reveal animation ───────────────────────────────── */}
        {phase === "REVEAL" && (
          <div className="text-center py-16">
            <div
              className="text-[14px] font-black uppercase tracking-[0.3em] font-mono animate-pulse"
              style={{ color: "var(--ledger-red)" }}
            >
              {callUpRevealed ? "Scoring hand..." : "Revealing call-up..."}
            </div>
          </div>
        )}

        {/* ── Scored / Feedback state ────────────────────────── */}
        {phase === "SCORED" && breakdown && rating && (
          <div className="space-y-5">
            {/* Score headline */}
            <div
              className="text-center py-5 border"
              style={{ borderColor: "var(--ink)", background: "var(--paper-inset)", borderRadius: 2 }}
            >
              {gameOver && foundOptimal && (
                <div
                  className="text-[10px] font-black uppercase tracking-[0.4em] font-mono mb-2"
                  style={{ color: "var(--ledger-green)" }}
                >
                  Perfect Hand Found!
                </div>
              )}
              {gameOver && !foundOptimal && (
                <div
                  className="text-[10px] font-black uppercase tracking-[0.4em] font-mono mb-2"
                  style={{ color: "var(--ledger-amber)" }}
                >
                  No Attempts Remaining
                </div>
              )}
              {!gameOver && (
                <div
                  className="text-[10px] font-black uppercase tracking-[0.4em] font-mono mb-2"
                  style={{ color: "var(--ledger-ink-faint)" }}
                >
                  Attempt {attempts.length} of {MAX_ATTEMPTS}
                </div>
              )}
              <div
                className="text-[10px] font-black uppercase tracking-[0.4em] font-mono mb-1"
                style={{ color: rating.color }}
              >
                {rating.label}
              </div>
              <div className="font-black font-serif" style={{ fontSize: "clamp(2rem, 8vw, 3.5rem)", lineHeight: 1 }}>
                {breakdown.total}<span className="text-[0.5em] font-mono" style={{ color: "var(--ledger-ink-faint)" }}>/{optimal}</span>
              </div>
              <div
                className="text-[11px] font-mono uppercase tracking-wider mt-1"
                style={{ color: "var(--ledger-ink-faint)" }}
              >
                Points
              </div>
              <div className="mt-2 text-[20px] tracking-[0.15em]" style={{ color: "var(--ledger-amber)" }}>
                {Array.from({ length: 5 }, (_, i) => (
                  <span key={i} style={{ color: i < rating.stars ? "var(--ledger-amber)" : "var(--rule-light)" }}>
                    {i < rating.stars ? "★" : "☆"}
                  </span>
                ))}
              </div>
              {/* Vague closeness feedback — no point gap */}
              {!foundOptimal && lastOverlap !== null && (
                <div className="mt-3 text-[11px] font-mono" style={{ color: "var(--ledger-ink-body)" }}>
                  <strong style={{ color: lastOverlap >= 3 ? "var(--ledger-green)" : "var(--ink)" }}>{lastOverlap}/4</strong> cards in the perfect lineup
                </div>
              )}
            </div>

            {/* Peg board */}
            <PegBoard attempts={attempts} optimal={optimal} />

            {/* Your lineup */}
            <div>
              <div
                className="text-[10px] font-black uppercase tracking-[0.3em] font-mono pb-1 border-b mb-2"
                style={{ color: "var(--ledger-ink-faint)", borderColor: "var(--rule)" }}
              >
                Your Lineup
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                {pickedPlayers.map((player) => (
                  <PlayerCard
                    key={player.id}
                    player={player}
                    selected
                    disabled
                    matchHighlights={matchHighlights.get(player.id)}
                  />
                ))}
              </div>
            </div>

            {/* Call-up reveal */}
            <div>
              <div
                className="text-[10px] font-black uppercase tracking-[0.3em] font-mono pb-1 border-b mb-2"
                style={{ color: "var(--ledger-red)", borderColor: "var(--rule)" }}
              >
                Call-Up{attempts.length === 1 ? " Revealed" : ""}
              </div>
              <div className="max-w-[180px] mx-auto pt-2">
                <PlayerCard
                  player={hand.callUp}
                  selected={false}
                  disabled
                  isCallUp
                  matchHighlights={matchHighlights.get(hand.callUp.id)}
                />
              </div>
            </div>

            {/* Waived */}
            <div>
              <div
                className="text-[10px] font-black uppercase tracking-[0.3em] font-mono pb-1 border-b mb-2"
                style={{ color: "var(--ledger-ink-faint)", borderColor: "var(--rule-light)" }}
              >
                Waived
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 opacity-50">
                {waivedPlayers.map((player) => (
                  <PlayerCard key={player.id} player={player} selected={false} disabled />
                ))}
              </div>
            </div>

            {/* Scoring breakdown */}
            <div
              className="border p-4"
              style={{ borderColor: "var(--ink)", background: "var(--paper-inset)", borderRadius: 2 }}
            >
              <div
                className="text-[10px] font-black uppercase tracking-[0.3em] font-mono pb-2 border-b mb-2"
                style={{ color: "var(--ink)", borderColor: "var(--rule)" }}
              >
                Scoring Breakdown
              </div>
              <ScoreRow label="Teammates" icon="🏒" points={breakdown.teammates.points} detail={breakdown.teammates.detail} />
              <ScoreRow label="Draft Class" icon="📋" points={breakdown.draftClass.points} detail={breakdown.draftClass.detail} />
              <ScoreRow label="Pipeline" icon="📈" points={breakdown.pipeline.points} detail={breakdown.pipeline.detail} />
              <ScoreRow label="Division Flush" icon="🗺" points={breakdown.divisionFlush.points} detail={breakdown.divisionFlush.detail} />
              <ScoreRow label="Country Club" icon="🌍" points={breakdown.countryClub.points} detail={breakdown.countryClub.detail} />
              <ScoreRow label="Position Group" icon="🎯" points={breakdown.positionGroup.points} detail={breakdown.positionGroup.detail} />
              <ScoreRow label="Call-Up Bonus" icon="⭐" points={breakdown.callUpBonus.points} detail={breakdown.callUpBonus.detail} />
              <div className="flex items-center justify-between pt-2 mt-1">
                <span className="text-[12px] font-black font-mono uppercase" style={{ color: "var(--ink)" }}>
                  Total
                </span>
                <span className="text-[18px] font-black font-mono tabular-nums" style={{ color: "var(--ledger-green)" }}>
                  {breakdown.total}<span className="text-[12px]" style={{ color: "var(--ledger-ink-faint)" }}>/{optimal}</span>
                </span>
              </div>
            </div>

            <AttemptHistory
              attempts={attempts}
              dealt={hand.dealt}
              optimal={optimal}
              optimalCombos={optimalResult?.combos ?? []}
              minAttempts={2}
            />

            {/* The answer, once the game is over and it was not found.
                A daily puzzle that never tells you the answer teaches nothing:
                five attempts end and the player leaves without knowing what
                they missed, so tomorrow they are no better at it. */}
            {gameOver && !foundOptimal && perfectHand && (
              <div
                className="border p-4"
                style={{ borderColor: "var(--ledger-green)", background: "var(--paper-inset)", borderRadius: 2 }}
              >
                <div
                  className="text-[10px] font-black uppercase tracking-[0.3em] font-mono pb-2 border-b mb-3"
                  style={{ color: "var(--ledger-green)", borderColor: "var(--rule)" }}
                >
                  The Perfect Hand — {optimal} pts
                  {optimalResult && optimalResult.combos.length > 1 && (
                    <span style={{ color: "var(--ledger-ink-faint)" }}>
                      {" "}(one of {optimalResult.combos.length})
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {perfectHand.map((player) => (
                    <PlayerCard
                      key={player.id}
                      player={player}
                      selected
                      disabled
                      isCallUp={false}
                    />
                  ))}
                </div>
                {perfectBreakdown && (
                  <div className="mt-3 space-y-1">
                    {SCORING_ROWS.map(({ key, icon, label }) => {
                      const row = perfectBreakdown[key];
                      if (row.points === 0) return null;
                      return (
                        <div key={key} className="flex items-center justify-between text-[11px] font-mono">
                          <span style={{ color: "var(--ledger-ink-body)" }}>
                            {icon} {label} — {row.detail}
                          </span>
                          <span className="font-black" style={{ color: "var(--ledger-green)" }}>
                            +{row.points}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Try Again or Share button */}
            {!gameOver ? (
              <button
                onClick={handleTryAgain}
                className="w-full py-3 font-black text-[13px] uppercase tracking-[0.2em] font-mono transition-all border"
                style={{
                  background: "var(--ledger-red)",
                  color: "#fff",
                  borderColor: "var(--ledger-red)",
                  borderRadius: 2,
                  cursor: "pointer",
                }}
              >
                Try Again ({attemptsRemaining} attempt{attemptsRemaining !== 1 ? "s" : ""} left)
              </button>
            ) : (
              <button
                onClick={handleShare}
                className="w-full py-3 font-black text-[13px] uppercase tracking-[0.2em] font-mono transition-all border"
                style={{
                  background: copied ? "var(--ledger-green)" : "var(--ledger-red)",
                  color: "#fff",
                  borderColor: copied ? "var(--ledger-green)" : "var(--ledger-red)",
                  borderRadius: 2,
                  cursor: "pointer",
                }}
              >
                {copied ? "Copied to Clipboard!" : "Share Your Score"}
              </button>
            )}

            {/* Best score summary (when game is over and more than 1 attempt) */}
            {gameOver && attempts.length > 1 && (
              <div
                className="text-center py-3 border"
                style={{ borderColor: "var(--rule)", borderRadius: 2 }}
              >
                <div className="text-[10px] font-black uppercase tracking-[0.3em] font-mono mb-1" style={{ color: "var(--ledger-ink-faint)" }}>
                  Final Result
                </div>
                <div className="text-[11px] font-mono" style={{ color: "var(--ledger-ink-body)" }}>
                  Best Score: <strong style={{ color: "var(--ledger-green)" }}>{bestScore}/{optimal}</strong>
                  {" in "}
                  <strong>{attempts.length}</strong> attempt{attempts.length !== 1 ? "s" : ""}
                  {foundOptimal && " — Perfect!"}
                </div>
              </div>
            )}

            {/* How to play (collapsed) */}
            <details className="border" style={{ borderColor: "var(--rule)", borderRadius: 2 }}>
              <summary
                className="px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] font-mono cursor-pointer"
                style={{ color: "var(--ledger-ink-faint)" }}
              >
                ? How to Score
              </summary>
              <HowToScore />
            </details>

            {/* Navigation to other hands */}
            <div
              className="flex items-center justify-center gap-4 py-3 border-y text-[11px] font-mono uppercase tracking-wider"
              style={{ borderColor: "var(--rule-light)", color: "var(--ledger-ink-faint)" }}
            >
              {isToday && lastHandDay >= 1 && !lastHandPlayed && (
                <a
                  href={`/press-box?day=${lastHandDay}`}
                  className="font-black no-underline transition-colors hover:text-[var(--ink)]"
                  style={{ color: "var(--ledger-red)" }}
                >
                  Play the Last Hand
                </a>
              )}
              {isToday && lastHandDay >= 1 && lastHandPlayed && (
                <a
                  href={`/press-box?day=${lastHandDay}`}
                  className="font-black no-underline transition-colors hover:text-[var(--ink)]"
                  style={{ color: "var(--ledger-ink-faint)" }}
                >
                  View Last Hand
                </a>
              )}
              {isArchive && (
                <a
                  href="/press-box"
                  className="font-black no-underline transition-colors hover:text-[var(--ink)]"
                  style={{ color: todayPlayed ? "var(--ledger-ink-faint)" : "var(--ledger-red)" }}
                >
                  {todayPlayed ? "View Today's Result" : "Play Today's Hand"}
                </a>
              )}
            </div>
          </div>
        )}

        {/* ── How to play (drafting phase) ───────────────────── */}
        {phase === "DRAFTING" && (
          <details className="mt-5 border" style={{ borderColor: "var(--rule)", borderRadius: 2 }}>
            <summary
              className="px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] font-mono cursor-pointer"
              style={{ color: "var(--ledger-ink-faint)" }}
            >
              ? How to Score
            </summary>
            <HowToScore />
          </details>
        )}
        {/* ── Back Issues calendar ───────────────────────────── */}
        {pool && (
          <PressBoxCalendar
            pool={pool}
            todayNum={todayNum}
            refreshKey={`${dayNum}:${attempts.length}:${gameOver}`}
          />
        )}
          </>
        )}

        <div className="mt-8">
          <Footer />
        </div>
      </div>
    </main>
  );
}
