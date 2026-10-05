import { z } from "zod";

export const ISSUE_STATUSES = ["New", "Investigating", "Resolved", "Dismissed"] as const;
export const SCREENSHOTS_UNAVAILABLE = "Screenshots are currently unavailable. Please describe what you saw in the report.";

// Keep only known, numeric public navigation context. No fragment, credentials,
// arbitrary query strings, browser storage, or session information is captured.
export function sanitizeReportUrl(value: string): string {
  if (!value.trim()) return "";
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Use an http or https page URL.");
  url.username = "";
  url.password = "";
  url.hash = "";
  const context = new URLSearchParams();
  for (const key of ["season", "gameType", "player"]) {
    const entry = url.searchParams.get(key);
    if (entry && /^\d{1,10}$/.test(entry)) context.set(key, entry);
  }
  url.search = context.toString();
  return url.toString();
}

const optionalText = (max: number) => z.string().trim().max(max).default("");
export const issueReportInput = z.object({
  id: z.string().uuid(),
  description: z.string().trim().min(10, "Please describe the problem in at least 10 characters.").max(4000),
  pageUrl: optionalText(2048).transform((value, ctx) => {
    try { return sanitizeReportUrl(value); } catch {
      ctx.addIssue({ code: "custom", message: "Use an http or https page URL." }); return z.NEVER;
    }
  }),
  steps: optionalText(4000),
  email: optionalText(254).refine(value => !value || z.string().email().safeParse(value).success, "Enter a valid email or leave it blank."),
  website: z.string().max(0, "Submission rejected.").default(""),
  viewport: z.object({ width: z.number().int().min(1).max(20000), height: z.number().int().min(1).max(20000) }).strict(),
}).strict();

export const issueReportUpdate = z.object({
  status: z.enum(ISSUE_STATUSES),
  internalNote: z.string().trim().max(4000),
}).strict();
export type IssueReportInput = z.infer<typeof issueReportInput>;
