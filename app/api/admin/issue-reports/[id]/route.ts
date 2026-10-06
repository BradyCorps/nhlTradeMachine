import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/app/db/client";
import { issueReports } from "@/app/db/schema";
import { requireAdmin } from "@/app/lib/admin-auth";
import { issueReportUpdate } from "@/app/lib/issue-report-input";
import { issueResponse, readIssueJson, sameOrigin } from "@/app/lib/issue-report-http";
import { findIssueReport } from "@/app/lib/issue-reports.server";

type Context = { params: Promise<{ id: string }> };
async function identify(context: Context) {
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return { error: issueResponse({ error: "Invalid report ID." }, 400) };
  return { id };
}
export async function GET(req: Request, context: Context) {
  const denied = await requireAdmin(req); if (denied) return denied;
  const auth = await identify(context); if (auth.error) return auth.error;
  try {
    const report = await findIssueReport(auth.id!);
    return report ? issueResponse({ report }) : issueResponse({ error: "Report not found." }, 404);
  } catch { return issueResponse({ error: "Report could not be loaded." }, 503); }
}
export async function PATCH(req: Request, context: Context) {
  const denied = await requireAdmin(req); if (denied) return denied;
  if (!sameOrigin(req)) return issueResponse({ error: "Submit from this site." }, 403);
  const auth = await identify(context); if (auth.error) return auth.error;
  let body: unknown;
  try { body = await readIssueJson(req); } catch { return issueResponse({ error: "Invalid update." }, 400); }
  const parsed = issueReportUpdate.safeParse(body);
  if (!parsed.success) return issueResponse({ error: "Choose a valid status and a note of at most 4,000 characters." }, 400);
  try {
    const rows = await db.update(issueReports).set({ ...parsed.data, updatedAt: new Date().toISOString() })
      .where(eq(issueReports.id, auth.id!)).returning();
    return rows[0] ? issueResponse({ report: rows[0] }) : issueResponse({ error: "Report not found." }, 404);
  } catch { return issueResponse({ error: "Changes could not be saved." }, 503); }
}
export async function DELETE(req: Request, context: Context) {
  const denied = await requireAdmin(req); if (denied) return denied;
  if (!sameOrigin(req)) return issueResponse({ error: "Submit from this site." }, 403);
  const auth = await identify(context); if (auth.error) return auth.error;
  try {
    // Text-only release has no attachment objects to orphan.
    await db.delete(issueReports).where(eq(issueReports.id, auth.id!));
    return issueResponse({ ok: true });
  } catch { return issueResponse({ error: "Report could not be deleted; try again." }, 503); }
}
