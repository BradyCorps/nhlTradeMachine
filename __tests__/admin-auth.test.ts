import { afterEach, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { NextRequest } from "next/server";
import { proxy } from "../proxy";
import {
  ADMIN_SESSION_COOKIE,
  createAdminSessionValue,
  isAuthorized,
  requireAdmin,
} from "../app/lib/admin-auth";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

const listRouteFiles = (dir: string): string[] => {
  const abs = path.join(process.cwd(), dir);
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((entry) => {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) return listRouteFiles(rel);
    return entry.isFile() && entry.name === "route.ts" ? [rel] : [];
  });
};

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
    const routes = listRouteFiles("app/api/admin").sort();
    expect(routes.length).toBeGreaterThan(0);

    for (const route of routes) {
      const src = read(route);
      const handlerCount = src.match(/export async function/g)?.length ?? 0;
      expect(handlerCount, route).toBeGreaterThan(0);
      expect(src, route).toContain('import { requireAdmin } from "@/app/lib/admin-auth"');
      expect(src.match(/await requireAdmin\(req\)/g)?.length ?? 0, route).toBe(handlerCount);
    }
  });

  it("redirects an unauthenticated Analytics Labs page through the signed admin-session boundary", async () => {
    process.env.ADMIN_KEY = "shared-admin-secret";
    delete process.env.ADMIN_PASSWORD;
    delete process.env.ADMIN_DISABLE_AUTH;

    const response = await proxy(new NextRequest("https://example.com/admin/labs"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://example.com/admin/login?next=%2Fadmin%2Flabs");
  });

  it("allows Analytics Labs through the proxy only with a valid signed admin session", async () => {
    process.env.ADMIN_KEY = "shared-admin-secret";
    delete process.env.ADMIN_PASSWORD;
    delete process.env.ADMIN_DISABLE_AUTH;

    const session = await createAdminSessionValue(Date.now());
    const response = await proxy(new NextRequest("https://example.com/admin/labs", {
      headers: { cookie: `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(session)}` },
    }));
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
