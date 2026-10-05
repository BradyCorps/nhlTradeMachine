"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ISSUE_STATUSES } from "@/app/lib/issue-report-input";
import { readAdminResponse } from "@/app/admin/admin-response";

type ReportSummary = { id: string; createdAt: string; pageUrl: string; description: string; status: string };
type Report = ReportSummary & { steps: string; email: string; browser: string; viewportWidth: number; viewportHeight: number; internalNote: string };
const controlClass = "w-full border border-ledger-rule bg-ledger-cream p-3 text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2";

export default function IssueReportsAdmin() {
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [report, setReport] = useState<Report | null>(null);
  const [status, setStatus] = useState("New");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const listHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (report?.id) detailHeading.current?.focus(); }, [report?.id]);
  const load = useCallback(async () => {
    const result = await readAdminResponse<{ reports: ReportSummary[]; hasMore: boolean }>(await fetch(`/api/admin/issue-reports?offset=${offset}`, { cache: "no-store" }), "Reports could not be loaded.");
    setReports(result.reports); setHasMore(result.hasMore);
  }, [offset]);
  useEffect(() => { setBusy(true); setError(""); load().catch(error => setError(error.message)).finally(() => setBusy(false)); }, [load]);

  async function open(id: string) {
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await readAdminResponse<{ report: Report }>(await fetch(`/api/admin/issue-reports/${id}`, { cache: "no-store" }), "Report could not be loaded.");
      setReport(result.report); setStatus(result.report.status); setNote(result.report.internalNote);
    } catch (error) { setError((error as Error).message); } finally { setBusy(false); }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!report || busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await readAdminResponse<{ report: Report }>(await fetch(`/api/admin/issue-reports/${report.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, internalNote: note }),
      }), "Changes could not be saved.");
      setReport(result.report); await load(); setMessage("Status and internal note saved.");
    } catch (error) { setError((error as Error).message); } finally { setBusy(false); }
  }
  async function remove() {
    if (!report || busy || !window.confirm("Permanently delete this report? This cannot be undone.")) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await readAdminResponse(await fetch(`/api/admin/issue-reports/${report.id}`, { method: "DELETE" }), "Report could not be deleted.");
      setReport(null); await load(); setMessage("Report deleted."); listHeading.current?.focus();
    } catch (error) { setError((error as Error).message); } finally { setBusy(false); }
  }

  return <main className="mx-auto max-w-4xl px-4 py-8 text-ledger-ink" aria-busy={busy}>
    <h1 ref={listHeading} tabIndex={-1} className="font-serif text-3xl font-black border-b-2 border-ledger-ink pb-3 focus-visible:outline focus-visible:outline-2">Issue reports</h1>
    <p role="alert" className="mt-4" style={{ color: "var(--ledger-red)" }}>{error}</p>
    <p role="status">{busy ? "Loading…" : message}</p>
    {report ? <section className="mt-5 space-y-4">
      <button className="min-h-11 border border-ledger-ink px-4 py-2 text-sm font-bold font-mono focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50" disabled={busy} onClick={() => { setReport(null); setMessage(""); listHeading.current?.focus(); }}>← Back to reports</button>
      <h2 ref={detailHeading} tabIndex={-1} className="text-xl font-bold focus-visible:outline focus-visible:outline-2">Report details</h2>
      <p className="text-sm break-all">{report.createdAt} · {report.id}</p>
      <dl className="space-y-4 break-words">
        {[ ["What went wrong", report.description], ["Page URL", report.pageUrl || "Not supplied"], ["Steps to reproduce", report.steps || "Not supplied"],
          ["Email", report.email || "Not supplied"], ["Browser", report.browser], ["Viewport", `${report.viewportWidth} × ${report.viewportHeight}`] ].map(([label, value]) =>
          <div key={label}><dt className="font-bold">{label}</dt><dd className="whitespace-pre-wrap [overflow-wrap:anywhere]">{value}</dd></div>)}
      </dl>
      <p className="text-sm">Screenshots were unavailable for this text-only submission.</p>
      <form className="space-y-4" onSubmit={save}>
        <label className="block font-bold" htmlFor="report-status">Status</label>
        <select id="report-status" className={controlClass} value={status} disabled={busy} onChange={event => setStatus(event.target.value)}>{ISSUE_STATUSES.map(value => <option key={value}>{value}</option>)}</select>
        <label className="block font-bold" htmlFor="internal-note">Internal note (private, up to 4,000 characters)</label>
        <textarea id="internal-note" className={controlClass} rows={4} maxLength={4000} value={note} disabled={busy} onChange={event => setNote(event.target.value)} />
        <button className="min-h-11 border border-ledger-ink px-4 py-2 text-sm font-bold font-mono focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50" disabled={busy}>Save review</button>
      </form>
      <button className="min-h-11 border border-ledger-ink px-4 py-2 text-sm font-bold font-mono focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50" disabled={busy} onClick={remove}>Delete report permanently</button>
    </section> : <>
      <p className="mt-4 text-sm">Newest first. Reports and internal notes are private.</p>
      <ul className="mt-4 space-y-3">{reports.map(row => <li key={row.id} className="border border-ledger-rule p-3">
        <button className="text-left w-full min-h-11 focus-visible:outline focus-visible:outline-2" disabled={busy} onClick={() => open(row.id)}>
          <span className="block font-bold">{row.status} · {row.createdAt}</span>
          <span className="block text-sm [overflow-wrap:anywhere]">{row.pageUrl || "Page not supplied"}</span>
          <span className="block mt-2 whitespace-pre-wrap [overflow-wrap:anywhere]">{row.description}</span>
        </button>
      </li>)}</ul>
      {!busy && !error && reports.length === 0 && <p className="mt-4">No issue reports.</p>}
      <div className="flex flex-wrap gap-3 mt-4"><button className="min-h-11 border border-ledger-ink px-4 py-2 text-sm font-bold font-mono focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50" disabled={busy || offset === 0} onClick={() => setOffset(previous => Math.max(0, previous - 50))}>Previous reports</button>
        <button className="min-h-11 border border-ledger-ink px-4 py-2 text-sm font-bold font-mono focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50" disabled={busy || !hasMore} onClick={() => setOffset(previous => previous + 50)}>Next reports</button>
        <button className="min-h-11 border border-ledger-ink px-4 py-2 text-sm font-bold font-mono focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50" disabled={busy} onClick={() => { setBusy(true); setError(""); load().catch(error => setError(error.message)).finally(() => setBusy(false)); }}>Refresh reports</button>
      </div>
    </>}
  </main>;
}
