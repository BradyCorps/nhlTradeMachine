import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";
it("passes offline archival coverage and object integrity checks", () => {
  expect(() => execFileSync("python3", ["scripts/nhl-archive/test_crawl.py"], { stdio: "pipe" })).not.toThrow();
});
