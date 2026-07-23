// ── Trade-proposal audit gate ────────────────────────────────────
// A generated proposal may only surface if its full audit actually COMPLETED
// with an acceptable outcome. The old test — "anything but BLOCKED or DECLINED"
// — was fail-open: it passed transient/incomplete states (IDLE, PENDING) and a
// missing status (undefined/null), so a proposal could clear the audit without
// one ever succeeding. Whitelist the accepted terminal statuses instead.
export const ACCEPTED_AUDIT_STATUSES: ReadonlySet<string> = new Set(["FAIR", "WIN", "LOSS"]);

export const tradePassesFullAudit = (status?: string | null): boolean =>
  status != null && ACCEPTED_AUDIT_STATUSES.has(status);
