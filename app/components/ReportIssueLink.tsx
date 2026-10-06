"use client";

import type { ReactNode } from "react";
import { sanitizeReportUrl } from "@/app/lib/issue-report-input";

export function ReportIssueLink({ children = "Report an issue", className }: { children?: ReactNode; className?: string }) {
  return <a href="/report-issue" className={className} onClick={event => {
    // Resolve at activation, so a persistent footer captures the current page.
    event.currentTarget.href = `/report-issue?from=${encodeURIComponent(sanitizeReportUrl(window.location.href))}`;
  }}>{children}</a>;
}
