import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/app/db/client";
import { issueReports } from "@/app/db/schema";
import type { IssueReportInput } from "./issue-report-input";

export class IssueReportConflict extends Error {}
export function reportFingerprint(input: IssueReportInput): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

export async function findIssueReport(id: string) {
  return (await db.select().from(issueReports).where(eq(issueReports.id, id)).limit(1))[0];
}

export async function createIssueReport(input: IssueReportInput, browser: string) {
  const fingerprint = reportFingerprint(input);
  const now = new Date().toISOString();
  await db.insert(issueReports).values({
    id: input.id, requestFingerprint: fingerprint,
    description: input.description, pageUrl: input.pageUrl, steps: input.steps, email: input.email,
    browser: browser.slice(0, 512), viewportWidth: input.viewport.width, viewportHeight: input.viewport.height,
    createdAt: now, updatedAt: now,
  }).onConflictDoNothing();
  // Unique id arbitrates concurrent submissions; do not rewrite an earlier
  // report or its Admin status/note when the sender retries.
  const record = await findIssueReport(input.id);
  if (!record || record.requestFingerprint !== fingerprint) throw new IssueReportConflict("This submission ID was already used for a different report.");
  return record;
}
