import { NextResponse } from "next/server";

export const ADMIN_SESSION_COOKIE = "admin_session";
export const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

const encoder = new TextEncoder();

function getAdminSecret(): string | null {
  return process.env.ADMIN_KEY?.trim() || process.env.ADMIN_PASSWORD?.trim() || null;
}

function isAuthDisabledForDev(): boolean {
  return process.env.ADMIN_DISABLE_AUTH === "1" && process.env.NODE_ENV !== "production";
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function signAdminSessionPayload(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return bytesToBase64Url(new Uint8Array(signature));
}

export async function createAdminSessionValue(now = Date.now()): Promise<string> {
  const secret = getAdminSecret();
  if (!secret && !isAuthDisabledForDev()) throw new Error("Admin auth is not configured");

  const payload = String(now);
  const signature = await signAdminSessionPayload(payload, secret ?? "dev-auth-disabled");
  return `${payload}.${signature}`;
}

export async function validateAdminSessionValue(value: string | undefined | null): Promise<boolean> {
  if (isAuthDisabledForDev()) return true;

  const secret = getAdminSecret();
  if (!secret || !value) return false;

  const [payload, signature, ...extra] = value.split(".");
  if (!payload || !signature || extra.length > 0) return false;

  const createdAt = Number(payload);
  if (!Number.isFinite(createdAt)) return false;
  if (Date.now() - createdAt > ADMIN_SESSION_MAX_AGE_SECONDS * 1000) return false;

  const expected = await signAdminSessionPayload(payload, secret);
  return safeEqual(signature, expected);
}

export async function isAuthorized(req: Request): Promise<boolean> {
  if (isAuthDisabledForDev()) return true;

  const secret = getAdminSecret();
  if (!secret) return false;

  const headerKey = req.headers.get("x-admin-key");
  if (headerKey && safeEqual(headerKey, secret)) return true;

  const cookieHeader = req.headers.get("cookie") ?? "";
  const session = cookieHeader
    .split(";")
    .map(part => part.trim())
    .find(part => part.startsWith(`${ADMIN_SESSION_COOKIE}=`))
    ?.slice(ADMIN_SESSION_COOKIE.length + 1);

  if (!session) return false;
  try {
    return validateAdminSessionValue(decodeURIComponent(session));
  } catch {
    return false;
  }
}

export async function requireAdmin(req: Request): Promise<NextResponse | null> {
  if (await isAuthorized(req)) return null;
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
