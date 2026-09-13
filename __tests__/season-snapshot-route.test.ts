import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/lib/admin-auth", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/app/db/client", () => ({ db: {} }));
vi.mock("@/app/db/ensure-schema", () => ({ ensureSeasonSnapshotTables: vi.fn() }));
vi.mock("@/app/lib/cached-roster", () => ({ getCachedRoster: vi.fn() }));

import { POST } from "@/app/api/admin/season-snapshots/route";
import { requireAdmin } from "@/app/lib/admin-auth";
import { ensureSeasonSnapshotTables } from "@/app/db/ensure-schema";
import { getCachedRoster } from "@/app/lib/cached-roster";

describe("season snapshot capture authorization", () => {
  it("rejects an unauthorized capture before touching schema or roster data", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }) as any);

    const response = await POST(new Request("https://example.com/api/admin/season-snapshots", {
      method: "POST",
      body: JSON.stringify({ season: "completed" }),
    }));

    expect(response.status).toBe(401);
    expect(ensureSeasonSnapshotTables).not.toHaveBeenCalled();
    expect(getCachedRoster).not.toHaveBeenCalled();
  });
});
