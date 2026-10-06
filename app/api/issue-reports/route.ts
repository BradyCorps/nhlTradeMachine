import { issueReportInput } from "@/app/lib/issue-report-input";
import { issueResponse, readIssueJson, sameOrigin } from "@/app/lib/issue-report-http";
import { createIssueReport, findIssueReport, IssueReportConflict, reportFingerprint } from "@/app/lib/issue-reports.server";
import { checkPublicRateLimit, rateLimitResponse } from "@/app/lib/public-rate-limit";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return issueResponse({ error: "Submit from this site." }, 403);
  let body: unknown;
  try { body = await readIssueJson(req); } catch { return issueResponse({ error: "Invalid or oversized JSON report." }, 400); }
  const parsed = issueReportInput.safeParse(body);
  if (!parsed.success) return issueResponse({ error: "Please check the highlighted fields.", fields: parsed.error.flatten().fieldErrors }, 400);
  const input = parsed.data;
  try {
    const existing = await findIssueReport(input.id);
    if (existing) {
      if (existing.requestFingerprint !== reportFingerprint(input)) throw new IssueReportConflict();
      return issueResponse({ ok: true, id: input.id });
    }
    const limit = await checkPublicRateLimit(req, { name: "issue-reports", perIpPerMinute: 3, globalPerMinute: 20, globalPerDay: 200 });
    if (!limit.ok) return rateLimitResponse(limit);
    await createIssueReport(input, req.headers.get("user-agent") ?? "Unknown");
    return issueResponse({ ok: true, id: input.id }, 201);
  } catch (error) {
    if (error instanceof IssueReportConflict) return issueResponse({ error: "This submission ID was already used. Start a new report if you changed the details." }, 409);
    return issueResponse({ error: "Your report could not be saved. Your text is still here; please try again." }, 503);
  }
}
