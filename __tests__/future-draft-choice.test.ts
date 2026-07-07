import { describe, expect, it } from "vitest";
import { generateSyntheticDraftClass } from "../app/lib/synthetic-draft";
import {
  applyFutureDraftChoice,
  futureDraftPromptForUserPick,
} from "../app/lib/future-draft-choice";

describe("future draft user choice", () => {
  it("offers the top curated prospects remaining when the user pick comes up", () => {
    const drafted = generateSyntheticDraftClass(2027, 11, ["CAR", "VAN", "SJS", "CHI"]);
    const prompt = futureDraftPromptForUserPick(drafted, 2027, "VAN", 5);

    expect(prompt).not.toBeNull();
    expect(prompt?.overall).toBe(2);
    expect(prompt?.choices).toHaveLength(5);
    expect(prompt?.choices[0].name).toBe(drafted[1].name);
    expect(prompt?.choices.some((choice) => choice.name === drafted[0].name)).toBe(false);
  });

  it("swaps a later prospect into the user slot without duplicating names", () => {
    const drafted = generateSyntheticDraftClass(2027, 11, ["CAR", "VAN", "SJS", "CHI"]);
    const prompt = futureDraftPromptForUserPick(drafted, 2027, "VAN", 5)!;
    const originalUserPick = drafted.find((p) => p.id === prompt.pickId)!;
    const choice = prompt.choices[2];
    const laterPick = drafted.find((p) => p.name === choice.name)!;

    const result = applyFutureDraftChoice(drafted, prompt.pickId, choice);
    const userPick = result.players.find((p) => p.teamId === "VAN" && p.draftOverall === prompt.overall)!;
    const displacedSlot = result.players.find((p) => p.draftOverall === laterPick.draftOverall)!;
    const names = result.players.map((p) => p.name);

    expect(userPick.name).toBe(choice.name);
    expect(displacedSlot.name).toBe(originalUserPick.name);
    expect(names.filter((name) => name === choice.name)).toHaveLength(1);
    expect(result.changedPicks.map((p) => p.draftOverall).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([
      originalUserPick.draftOverall,
      laterPick.draftOverall,
    ]);
  });
});
