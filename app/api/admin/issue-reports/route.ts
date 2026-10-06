import { desc } from "drizzle-orm";
import { db } from "@/app/db/client";
import { issueReports } from "@/app/db/schema";
import { requireAdmin } from "@/app/lib/admin-auth";
import { issueResponse } from "@/app/lib/issue-report-http";

export async function GET(req: Request) {
  const denied = await requireAdmin(req); if (denied) return denied;
  const offset = Number(new URL(req.url).searchParams.get("offset") ?? 0);
  if (!Number.isSafeInteger(offset) || offset < 0) return issueResponse({ error: "Invalid page." }, 400);
  try {
    const rows = await db.select({ id: issueReports.id, createdAt: issueReports.createdAt, pageUrl: issueReports.pageUrl,
      description: issueReports.description, status: issueReports.status }).from(issueReports)
      .orderBy(desc(issueReports.createdAt), desc(issueReports.id)).limit(51).offset(offset);
    return issueResponse({ reports: rows.slice(0, 50).map(row => ({ ...row, description: row.description.slice(0, 160) })), hasMore: rows.length > 50 });
  } catch { return issueResponse({ error: "Issue reports are unavailable. Check that the migration is installed." }, 503); }
}
