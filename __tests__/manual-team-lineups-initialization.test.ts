import { expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { emptyManualLineup } from "@/app/lib/manual-team-lineups";

const state = vi.hoisted(() => ({ authorized: false, dbImports: 0, rosterImports: 0 }));
vi.mock("@/app/db/client", () => { state.dbImports++; throw new Error("Database initialization unavailable"); });
vi.mock("@/app/lib/cached-roster", () => { state.rosterImports++; throw new Error("Roster initialization unavailable"); });
vi.mock("@/app/lib/admin-auth", () => ({ requireAdmin: async () => state.authorized ? null : NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }));

it("authorizes before initializing storage and labels initialization failures", async () => {
  const admin = await import("@/app/api/admin/team-lineups/route");
  const publicRoute = await import("@/app/api/team-lineups/route");
  expect(state.dbImports).toBe(0);
  expect(state.rosterImports).toBe(0);
  for (const handler of [admin.GET, admin.POST, admin.DELETE]) {
    expect((await handler(new Request("http://localhost/api/admin/team-lineups"))).status).toBe(401);
  }
  expect(state.dbImports).toBe(0);
  expect(state.rosterImports).toBe(0);
  const publicResponse = await publicRoute.GET(new Request("http://localhost/api/team-lineups?team=WPG"));
  expect(publicResponse.status).toBe(503);
  expect(publicResponse.headers.get("Cache-Control")).toBe("no-store");
  expect((await publicResponse.json()).error).toBe("Manual lineup is unavailable");
  state.authorized = true;
  expect((await admin.GET(new Request("http://localhost/api/admin/team-lineups?team=WPG"))).status).toBe(503);
  expect((await admin.POST(new Request("http://localhost/api/admin/team-lineups", { method: "POST", body: JSON.stringify({
    lineup: emptyManualLineup("WPG", { season: "20262027", gameType: 2 }, "2026-10-08"), expectedRevision: null,
  }) }))).status).toBe(503);
  expect((await admin.DELETE(new Request("http://localhost/api/admin/team-lineups", { method: "DELETE", body: JSON.stringify({
    teamId: "WPG", season: "20262027", gameType: 2, expectedRevision: "c455a334-70d4-4afa-87dc-7b96b3bd669c",
  }) }))).status).toBe(503);
});
