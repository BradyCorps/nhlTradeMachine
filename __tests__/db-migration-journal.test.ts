import { describe, expect, it } from "vitest";
import { readJournal } from "@/scripts/db-migration-ops";

describe("PL-7 Phase 1A migration journal", () => {
  it("tracks exactly the additive Phase 1A migrations with stable source hashes", () => {
    const migrations = readJournal();

    expect(migrations.map(migration => migration.tag)).toEqual([
      "0006_add_season_snapshots",
      "0007_add_season_snapshot_batches",
      "0008_add_snapshot_batch_member_uniqueness",
    ]);
    expect(migrations.map(migration => migration.hash)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^[a-f0-9]{64}$/),
        expect.stringMatching(/^[a-f0-9]{64}$/),
        expect.stringMatching(/^[a-f0-9]{64}$/),
      ]),
    );
  });
});
