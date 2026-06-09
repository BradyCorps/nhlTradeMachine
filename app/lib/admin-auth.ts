// Checks x-admin-key header against ADMIN_KEY env var.
// If ADMIN_KEY is not set (local dev), all requests pass through.
export function isAuthorized(req: Request): boolean {
  const key = process.env.ADMIN_KEY;
  if (!key) return true;
  return req.headers.get("x-admin-key") === key;
}
