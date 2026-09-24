import { describe, expect, it } from "vitest";
import { readJournal } from "@/scripts/db-migration-ops";

describe("PL-7 migration journal", () => {
  it("tracks the additive Phase 1A, Phase 3, and Phase 4 migrations with stable source hashes", () => {
    const migrations = readJournal();

    expect(migrations.map(migration => migration.tag)).toEqual([
      "0006_add_season_snapshots",
      "0007_add_season_snapshot_batches",
      "0008_add_snapshot_batch_member_uniqueness",
      "0009_add_labs_candidate_foundation",
      "0010_add_labs_evaluation_evidence",
    ]);
    expect(migrations.map(migration => migration.hash)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^[a-f0-9]{64}$/),
        expect.stringMatching(/^[a-f0-9]{64}$/),
        expect.stringMatching(/^[a-f0-9]{64}$/),
        expect.stringMatching(/^[a-f0-9]{64}$/),
        expect.stringMatching(/^[a-f0-9]{64}$/),
      ]),
    );
  });
});
