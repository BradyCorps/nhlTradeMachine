"use client";

import React, { Suspense, useState, useCallback, useMemo, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Header from "@/app/components/Header";
import Footer from "@/app/components/Footer";
import {
  dayNumberFromDate,
  dealDailyHand,
  scoreHand,
  findOptimalScore,
  starRating,
  buildShareText,
  MAX_SCORE,
  MAX_ATTEMPTS,
  type PressBoxPlayer,
  type ScoringBreakdown,
} from "@/app/lib/press-box-engine";
import { PRESS_BOX_POOL } from "@/app/data/press-box-pool";

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

interface SavedState {
  dayNumber: number;
  version?: number;
  // v2 multi-attempt format
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
    JSON.stringify({ dayNumber: dayNum, version: 2, attempts, currentPicks, gameOver })
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

// ── Player Card ───────────────────────────────────────────────
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

  return (
    <button
      onClick={onClick}
      disabled={disabled && !selected}
      className={[
        "relative text-left transition-all duration-200 border",
        "px-3 py-2.5 sm:px-4 sm:py-3",
        isCallUp
          ? "border-ledger-red bg-[var(--red-dim)]"
          : selected
            ? "border-[var(--ledger-green)] bg-[var(--green-dim)] scale-[1.02]"
            : disabled
              ? "border-[var(--rule-light)] opacity-50"
              : "border-[var(--rule)] hover:border-[var(--ink)] hover:bg-[var(--paper-inset)] cursor-pointer",
      ].join(" ")}
      style={{ borderRadius: 2 }}
    >
      {selected && !isCallUp && (
        <span
          className="absolute -top-2 -right-2 w-5 h-5 flex items-center justify-center text-[10px] font-black font-mono"
          style={{ background: "var(--ledger-green)", color: "#fff", borderRadius: 2 }}
        >
          IN
        </span>
      )}
      {isCallUp && (
        <span
          className="absolute -top-2 -right-2 px-1.5 h-5 flex items-center justify-center text-[9px] font-black font-mono uppercase tracking-wider"
          style={{ background: "var(--ledger-red)", color: "#fff", borderRadius: 2 }}
        >
          Call-Up
        </span>
      )}

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-black text-[13px] sm:text-[14px] leading-tight truncate" style={{ color: "var(--ink)" }}>
            {player.name}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1">
            <span
              className={[
                "text-[10px] font-black font-mono uppercase tracking-wider px-1 py-px",
                matchHighlights?.team ? "bg-[var(--ledger-green)] text-[#fff]" : "",
              ].join(" ")}
              style={
                !matchHighlights?.team
                  ? { color: "var(--ledger-ink-faint)", background: "var(--paper-inset)", borderRadius: 1 }
                  : { borderRadius: 1 }
              }
            >
              {player.team}
            </span>
            <span
              className={[
                "text-[10px] font-mono",
                matchHighlights?.position ? "font-black text-[var(--ledger-green)]" : "",
              ].join(" ")}
              style={!matchHighlights?.position ? { color: "var(--ledger-ink-faint)" } : {}}
            >
              {posLabel}
            </span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[18px] font-black font-mono leading-none" style={{ color: "var(--ink)" }}>
            #{player.jerseyNumber}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-2 text-[10px] font-mono" style={{ color: "var(--ledger-ink-faint)" }}>
        <span className={matchHighlights?.nation ? "font-black text-[var(--ledger-green)]" : ""}>
          {flag} {player.nationality}
        </span>
        <span>AGE {player.age}</span>
        <span className={matchHighlights?.draft ? "font-black text-[var(--ledger-green)]" : ""}>
          DRAFT &apos;{String(player.draftYear).slice(2)}
        </span>
        <span className={matchHighlights?.division ? "font-black text-[var(--ledger-green)]" : ""}>
          {player.division}
        </span>
      </div>
    </button>
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

  const hand = useMemo(() => dealDailyHand(PRESS_BOX_POOL, dayNum), [dayNum]);
  const optimal = useMemo(() => findOptimalScore(hand.dealt, hand.callUp), [hand]);

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

  // Restore saved state
  useEffect(() => {
    const saved = loadSavedState(dayNum);
    if (saved) {
      if (saved.version === 2 && saved.attempts) {
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
    if (picks.length !== 4) return;
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

  const pickedPlayers = hand.dealt.filter((p) => picks.includes(p.id));
  const waivedPlayers = hand.dealt.filter((p) => !picks.includes(p.id));

  // Compute match highlights for scored state
  const matchHighlights = useMemo(() => {
    if (phase !== "SCORED" || !breakdown) return new Map<string, { team: boolean; draft: boolean; nation: boolean; division: boolean; position: boolean }>();
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
  }, [phase, breakdown, pickedPlayers, hand.callUp]);

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
            #{hand.dayNumber} &nbsp;·&nbsp; {hand.dateLabel}
          </p>
        </div>

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
            <PlayerCard
              player={hand.callUp}
              selected={false}
              disabled
              isCallUp
            />
            <div
              className="flex items-center justify-between mt-3 py-2 px-3 border"
              style={{ borderColor: "var(--rule)", background: "var(--paper-inset)", borderRadius: 2 }}
            >
              <span className="text-[10px] font-black font-mono uppercase tracking-wider" style={{ color: "var(--ledger-ink-faint)" }}>
                Target Score
              </span>
              <span className="text-[16px] font-black font-mono tabular-nums" style={{ color: "var(--ledger-green)" }}>
                {optimal}<span className="text-[11px]" style={{ color: "var(--ledger-ink-faint)" }}>/{MAX_SCORE}</span>
              </span>
            </div>
            {bestScore > 0 && (
              <div
                className="flex items-center justify-between mt-1 py-1.5 px-3 text-[10px] font-mono uppercase tracking-wider"
                style={{ color: "var(--ledger-ink-faint)" }}
              >
                <span>Your Best</span>
                <span className="font-black" style={{ color: bestScore === optimal ? "var(--ledger-green)" : "var(--ink)" }}>
                  {bestScore}/{MAX_SCORE}
                </span>
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
                  <strong>Pick 4 players</strong> to maximize your score.
                  <br />
                  Use the scoring breakdown to improve your hand.
                </>
              ) : (
                <>
                  <strong>Draft 4 players</strong> into your lineup. Waive the other 2.
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

        {/* ── Dealt cards ────────────────────────────────────── */}
        {phase === "DRAFTING" && (
          <div className="space-y-2 mb-5">
            <div
              className="text-[10px] font-black uppercase tracking-[0.3em] font-mono pb-1 border-b"
              style={{ color: "var(--ledger-ink-faint)", borderColor: "var(--rule)" }}
            >
              {isToday ? "Today's" : `Hand #${dayNum}`} Cards
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
                {breakdown.total}<span className="text-[0.5em] font-mono" style={{ color: "var(--ledger-ink-faint)" }}>/{MAX_SCORE}</span>
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
              {/* Target comparison */}
              {!foundOptimal && (
                <div className="mt-3 text-[11px] font-mono" style={{ color: "var(--ledger-ink-faint)" }}>
                  Target: <strong style={{ color: "var(--ledger-green)" }}>{optimal}/{MAX_SCORE}</strong>
                  {breakdown.total < optimal && (
                    <span> ({optimal - breakdown.total} pts away)</span>
                  )}
                </div>
              )}
            </div>

            {/* Your lineup */}
            <div>
              <div
                className="text-[10px] font-black uppercase tracking-[0.3em] font-mono pb-1 border-b mb-2"
                style={{ color: "var(--ledger-ink-faint)", borderColor: "var(--rule)" }}
              >
                Your Lineup
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
              <PlayerCard
                player={hand.callUp}
                selected={false}
                disabled
                isCallUp
                matchHighlights={matchHighlights.get(hand.callUp.id)}
              />
            </div>

            {/* Waived */}
            <div>
              <div
                className="text-[10px] font-black uppercase tracking-[0.3em] font-mono pb-1 border-b mb-2"
                style={{ color: "var(--ledger-ink-faint)", borderColor: "var(--rule-light)" }}
              >
                Waived
              </div>
              <div className="grid grid-cols-2 gap-2 opacity-50">
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
                  {breakdown.total}<span className="text-[12px]" style={{ color: "var(--ledger-ink-faint)" }}>/{MAX_SCORE}</span>
                </span>
              </div>
            </div>

            {/* Attempt history */}
            {attempts.length > 1 && (
              <div
                className="border p-4"
                style={{ borderColor: "var(--rule)", background: "var(--paper-inset)", borderRadius: 2 }}
              >
                <div
                  className="text-[10px] font-black uppercase tracking-[0.3em] font-mono pb-2 border-b mb-2"
                  style={{ color: "var(--ink)", borderColor: "var(--rule)" }}
                >
                  Attempt History
                </div>
                {attempts.map((attempt, i) => {
                  const isBest = attempt.score === bestScore;
                  const isPerfect = attempt.score === optimal;
                  return (
                    <div
                      key={i}
                      className="flex items-center justify-between py-1.5 border-b"
                      style={{ borderColor: "var(--rule-light)" }}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2 h-2"
                          style={{
                            background: isPerfect ? "var(--ledger-green)" : attempt.score >= optimal * 0.7 ? "var(--ledger-amber)" : "var(--ledger-red)",
                            borderRadius: "50%",
                          }}
                        />
                        <span className="text-[11px] font-mono" style={{ color: "var(--ledger-ink-faint)" }}>
                          Attempt {i + 1}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className="text-[13px] font-black font-mono tabular-nums"
                          style={{ color: isPerfect ? "var(--ledger-green)" : "var(--ink)" }}
                        >
                          {attempt.score}/{MAX_SCORE}
                        </span>
                        {isBest && !isPerfect && (
                          <span
                            className="text-[8px] font-black font-mono uppercase px-1 py-px"
                            style={{ background: "var(--ledger-amber)", color: "#fff", borderRadius: 1 }}
                          >
                            Best
                          </span>
                        )}
                        {isPerfect && (
                          <span
                            className="text-[8px] font-black font-mono uppercase px-1 py-px"
                            style={{ background: "var(--ledger-green)", color: "#fff", borderRadius: 1 }}
                          >
                            Perfect
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
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
                  Best Score: <strong style={{ color: "var(--ledger-green)" }}>{bestScore}/{MAX_SCORE}</strong>
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
              <div className="px-4 pb-3 space-y-1 text-[11px] font-mono" style={{ color: "var(--ledger-ink-body)" }}>
                <p><strong>You have {MAX_ATTEMPTS} attempts</strong> to find the perfect hand.</p>
                <p>The call-up is hidden on your first attempt, then revealed.</p>
                <p className="mt-2"><strong>Teammates</strong> — 2 pts per pair of players on the same NHL team</p>
                <p><strong>Draft Class</strong> — 2 pts per pair drafted in the same year</p>
                <p><strong>Pipeline</strong> — 1 pt per card in a run of 3+ consecutive draft years</p>
                <p><strong>Division Flush</strong> — 4 pts if all 4 picks share a division (5 if call-up matches)</p>
                <p><strong>Country Club</strong> — 3 pts for 3+ players from the same country</p>
                <p><strong>Position Group</strong> — 3 pts for 3+ players at the same position type (F/D/G)</p>
                <p><strong>Call-Up Bonus</strong> — 1 pt for each of your picks who share a team with the call-up</p>
              </div>
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
            <div className="px-4 pb-3 space-y-1 text-[11px] font-mono" style={{ color: "var(--ledger-ink-body)" }}>
              <p><strong>You have {MAX_ATTEMPTS} attempts</strong> to find the perfect hand.</p>
              <p>The call-up is hidden on your first attempt, then revealed.</p>
              <p className="mt-2"><strong>Teammates</strong> — 2 pts per pair of players on the same NHL team</p>
              <p><strong>Draft Class</strong> — 2 pts per pair drafted in the same year</p>
              <p><strong>Pipeline</strong> — 1 pt per card in a run of 3+ consecutive draft years</p>
              <p><strong>Division Flush</strong> — 4 pts if all 4 picks share a division (5 if call-up matches)</p>
              <p><strong>Country Club</strong> — 3 pts for 3+ players from the same country</p>
              <p><strong>Position Group</strong> — 3 pts for 3+ players at the same position type (F/D/G)</p>
              <p><strong>Call-Up Bonus</strong> — 1 pt for each of your picks who share a team with the call-up</p>
            </div>
          </details>
        )}

        <div className="mt-8">
          <Footer />
        </div>
      </div>
    </main>
  );
}
