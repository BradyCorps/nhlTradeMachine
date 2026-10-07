import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fetchJsonWithStatus } from "@/app/lib/nhl-player-feed";
import { GET } from "@/app/api/nhl/games/route";

vi.mock("@/app/lib/nhl-player-feed", () => ({ fetchJsonWithStatus: vi.fn() }));
const source = vi.mocked(fetchJsonWithStatus);
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-08T02:00:00Z")); source.mockReset(); });
afterEach(() => { vi.useRealTimers(); });

it("defaults to the NHL Eastern day and caches a verified empty slate briefly", async () => {
  source.mockResolvedValue({ status: 200, data: { currentDate: "2026-10-07", games: [] } });
  const response = await GET(new Request("http://localhost/api/nhl/games"));
  expect(source).toHaveBeenCalledWith("https://api-web.nhle.com/v1/score/2026-10-07");
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("public, s-maxage=30, stale-while-revalidate=30");
  expect(await response.json()).toMatchObject({ date: "2026-10-07", games: [], source: "https://api-web.nhle.com/v1/score/2026-10-07" });
});
it.each(["date=2026-02-30", "date=2026-10-07&date=2026-10-08", "date=../now"]) ("rejects ambiguous or invalid dates before upstream work: %s", async query => {
  expect((await GET(new Request(`http://localhost/api/nhl/games?${query}`))).status).toBe(400);
  expect(source).not.toHaveBeenCalled();
});
it.each([
  { status: 403, data: null }, { status: 0, data: null },
  { status: 200, data: { currentDate: "2026-10-08", games: [] } },
  { status: 200, data: { currentDate: "2026-10-07" } },
])("reports upstream or identity failures as unavailable rather than no games: %j", async result => {
  source.mockResolvedValue(result);
  const response = await GET(new Request("http://localhost/api/nhl/games"));
  expect(response.status).toBe(503);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.json()).not.toHaveProperty("games");
});
