import { afterEach, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import {
  ADMIN_SESSION_COOKIE,
  createAdminSessionValue,
  isAuthorized,
  requireAdmin,
} from "../app/lib/admin-auth";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

const originalEnv = {
  ADMIN_KEY: process.env.ADMIN_KEY,
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
  ADMIN_DISABLE_AUTH: process.env.ADMIN_DISABLE_AUTH,
};

function restoreEnv(name: keyof typeof originalEnv) {
  const value = originalEnv[name];
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

afterEach(() => {
  restoreEnv("ADMIN_KEY");
  restoreEnv("ADMIN_PASSWORD");
  restoreEnv("ADMIN_DISABLE_AUTH");
});

describe("admin auth", () => {
  it("fails closed when no admin secret is configured", async () => {
    delete process.env.ADMIN_KEY;
    delete process.env.ADMIN_PASSWORD;
    delete process.env.ADMIN_DISABLE_AUTH;

    const req = new Request("https://example.com/api/admin/settings");
    expect(await isAuthorized(req)).toBe(false);

    const res = await requireAdmin(req);
    expect(res?.status).toBe(401);
  });

  it("accepts the signed httpOnly session cookie created after login", async () => {
    process.env.ADMIN_KEY = "shared-admin-secret";
    delete process.env.ADMIN_PASSWORD;
    delete process.env.ADMIN_DISABLE_AUTH;

    const session = await createAdminSessionValue(Date.now());
    const req = new Request("https://example.com/api/admin/settings", {
      headers: { cookie: `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(session)}` },
    });

    expect(await isAuthorized(req)).toBe(true);
    expect(await requireAdmin(req)).toBeNull();
  });

  it("gates every admin API route through the shared helper", () => {
    const routes = [
      "app/api/admin/clear-cache/route.ts",
      "app/api/admin/contracts/route.ts",
      "app/api/admin/db-info/route.ts",
      "app/api/admin/development-profile/route.ts",
      "app/api/admin/import-draft-class/route.ts",
      "app/api/admin/patch-team-ids/route.ts",
      "app/api/admin/prune-stale/route.ts",
      "app/api/admin/reset/route.ts",
      "app/api/admin/settings/route.ts",
      "app/api/admin/teams/route.ts",
      "app/api/admin/trade-block/route.ts",
    ];

    for (const route of routes) {
      const src = read(route);
      const handlerCount = src.match(/export async function/g)?.length ?? 0;
      expect(handlerCount, route).toBeGreaterThan(0);
      expect(src, route).toContain('import { requireAdmin } from "@/app/lib/admin-auth"');
      expect(src.match(/await requireAdmin\(req\)/g)?.length ?? 0, route).toBe(handlerCount);
    }
  });
});
