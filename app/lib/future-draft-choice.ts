import { FUTURE_DRAFT_CLASSES, type FutureDraftProspect } from "@/app/data/future-draft-classes";
import type { Asset } from "@/app/lib/trade-types";

export interface FutureDraftChoice {
  rank: number;
  name: string;
  pos: "C" | "W" | "D" | "G";
  nhlePace: number | null;
}

export interface FutureDraftPrompt {
  pickId: string;
  overall: number;
  currentName: string;
  choices: FutureDraftChoice[];
  selectedName: string | null;
}

export interface FutureDraftChoiceResult {
  players: Asset[];
  changedPicks: Asset[];
}

const slugify = (name: string): string =>
  name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");

const talentOf = (prospect: FutureDraftProspect): number =>
  prospect.nhlePace ?? (prospect.pos === "G" ? 14 : 8);

const normalizePos = (pos: string | null | undefined): "C" | "W" | "D" | "G" => {
  const upper = String(pos ?? "").toUpperCase();
  if (upper.includes("G")) return "G";
  if (upper.includes("D")) return "D";
  if (upper.includes("C")) return "C";
  return "W";
};

export function futureDraftBoard(year: number): FutureDraftChoice[] {
  return [...(FUTURE_DRAFT_CLASSES[year] ?? [])]
    .sort((a, b) => talentOf(b) - talentOf(a))
    .map((prospect, index) => ({
      rank: index + 1,
      name: prospect.name,
      pos: prospect.pos,
      nhlePace: prospect.pos === "G" ? null : prospect.nhlePace ?? null,
    }));
}

export function futureDraftPromptForUserPick(
  draftedRookies: Asset[],
  year: number,
  userTeamId: string,
  limit = 5,
): FutureDraftPrompt | null {
  const drafted = draftedRookies
    .filter((p) => p.draftYear === year && p.draftOverall != null)
    .sort((a, b) => (a.draftOverall ?? 999) - (b.draftOverall ?? 999));
  const userPick = drafted.find((p) => p.teamId === userTeamId);
  if (!userPick || userPick.draftOverall == null) return null;

  const pickedBefore = new Set(
    drafted
      .filter((p) => (p.draftOverall ?? 999) < userPick.draftOverall!)
      .map((p) => p.name),
  );
  const choices = futureDraftBoard(year)
    .filter((p) => !pickedBefore.has(p.name))
    .slice(0, limit);
  if (choices.length === 0) return null;

  return {
    pickId: userPick.id,
    overall: userPick.draftOverall,
    currentName: userPick.name,
    choices,
    selectedName: null,
  };
}

function choiceToAsset(base: Asset, choice: Pick<FutureDraftChoice, "name" | "pos" | "nhlePace">): Asset {
  const draftYear = base.draftYear ?? new Date().getFullYear();
  const overall = base.draftOverall ?? 999;
  return {
    ...base,
    id: `draft-${draftYear}-${overall}-${slugify(choice.name)}`,
    name: choice.name,
    position: choice.pos,
    prospectPtsPace: choice.pos === "G" ? null : choice.nhlePace,
  };
}

export function applyFutureDraftChoice(
  players: Asset[],
  pickId: string,
  choice: FutureDraftChoice,
): FutureDraftChoiceResult {
  const target = players.find((p) => p.id === pickId);
  if (!target || target.draftYear == null || target.draftOverall == null) {
    return { players, changedPicks: [] };
  }

  const selected = choiceToAsset(target, choice);
  const displaced = players.find((p) =>
    p.id !== target.id &&
    p.draftYear === target.draftYear &&
    p.draftOverall != null &&
    p.name === choice.name
  );
  const replacement = displaced
    ? choiceToAsset(displaced, {
        name: target.name,
        pos: normalizePos(target.position),
        nhlePace: target.position === "G" ? null : target.prospectPtsPace ?? null,
      })
    : null;

  const nextPlayers = players.map((p) => {
    if (p.id === target.id) return selected;
    if (replacement && p.id === displaced?.id) return replacement;
    return p;
  });

  return {
    players: nextPlayers,
    changedPicks: replacement ? [selected, replacement] : [selected],
  };
}
