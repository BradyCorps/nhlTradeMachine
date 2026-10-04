import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import Header from "@/app/components/Header";
import PlayersPage from "@/app/players/page";

vi.mock("next/navigation", () => ({ usePathname: () => "/players", useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("next/link", () => ({ default: (props: Record<string, unknown>) => createElement("a", props) }));

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("Players initial hydration markup", () => {
  it("keeps the initial header identical across build and browser dates", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-03T12:00:00Z"));
    const server = renderToString(createElement(Header, { activeTab: "players" }));
    vi.setSystemTime(new Date("2026-10-05T12:00:00Z"));
    expect(renderToString(createElement(Header, { activeTab: "players" }))).toBe(server);
    expect(server).toContain("Data Feed Active");
    expect(server).not.toContain("Oct 3");
  });

  it.each([
    "", "?q=mcdavid&season=20262027&gameType=2", "?player=8478402&season=20252026&gameType=2",
  ])("matches server markup before browser URL restoration: %s", search => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-03T12:00:00Z"));
    const server = renderToString(createElement(PlayersPage));
    vi.setSystemTime(new Date("2026-10-05T12:00:00Z"));
    vi.stubGlobal("window", { location: { search } });
    expect(renderToString(createElement(PlayersPage))).toBe(server);
  });
});
