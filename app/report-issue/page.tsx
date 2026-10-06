"use client";

import { useEffect, useRef, useState } from "react";
import { issueReportInput, sanitizeReportUrl, SCREENSHOTS_UNAVAILABLE } from "@/app/lib/issue-report-input";
import type { IssueReportInput } from "@/app/lib/issue-report-input";
import Header from "@/app/components/Header";
import Footer from "@/app/components/Footer";

const initial = { description: "", pageUrl: "", steps: "", email: "", website: "" };
const inputClass = "w-full min-w-0 border border-ledger-rule bg-ledger-cream p-3 text-base text-ledger-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2";

export default function ReportIssuePage() {
  const [fields, setFields] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState("");
  const lock = useRef(false);
  const attempt = useRef<{ fields: string; payload: IssueReportInput } | null>(null);
  const feedback = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const from = new URLSearchParams(window.location.search).get("from") || document.referrer;
    try {
      if (from && new URL(from).origin === window.location.origin) {
        setFields(previous => ({ ...previous, pageUrl: sanitizeReportUrl(from) }));
      }
    } catch { /* Leave editable URL blank when no safe origin is available. */ }
  }, []);
  useEffect(() => { if (message || receipt) feedback.current?.focus(); }, [message, receipt]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (lock.current || receipt) return;
    setErrors({}); setMessage("");
    const serialized = JSON.stringify(fields);
    const candidate = attempt.current?.fields === serialized ? attempt.current.payload : {
      ...fields, id: crypto.randomUUID(), viewport: { width: window.innerWidth, height: window.innerHeight },
    };
    const parsed = issueReportInput.safeParse(candidate);
    if (!parsed.success) {
      setErrors(parsed.error.flatten().fieldErrors);
      setMessage("Please check the highlighted fields."); return;
    }
    attempt.current = { fields: serialized, payload: parsed.data };
    lock.current = true; setBusy(true);
    try {
      const response = await fetch("/api/issue-reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data) });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        setErrors(data.fields ?? {});
        throw new Error(data.error || "Your report could not be saved. Please try again.");
      }
      setReceipt(data.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Your report could not be saved. Please try again.");
    } finally { lock.current = false; setBusy(false); }
  }

  function control(name: keyof typeof fields, label: string, multiline = false, required = false, maxLength = 4000) {
    const props = { id: name, name, value: fields[name], required, maxLength,
      "aria-invalid": !!errors[name], "aria-describedby": errors[name] ? `${name}-error` : undefined,
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setFields(previous => ({ ...previous, [name]: event.target.value }));
        setErrors(previous => ({ ...previous, [name]: undefined }));
        if (message === "Please check the highlighted fields.") setMessage("");
      },
      className: inputClass };
    return <div>
      <label className="block font-bold mb-2" htmlFor={name}>{label}</label>
      {multiline ? <textarea {...props} rows={name === "description" ? 5 : 4} /> : <input {...props} type={name === "email" ? "email" : "url"} />}
      {errors[name] && <p id={`${name}-error`} className="mt-1 text-sm" style={{ color: "var(--ledger-red)" }}>{errors[name]?.join(" ")}</p>}
    </div>;
  }

  return <><Header showLiveFeed={false} /><main className="mx-auto max-w-2xl px-4 py-8 text-ledger-ink">
    <h1 className="font-serif text-3xl font-black border-b-2 border-ledger-ink pb-3">Report an issue</h1>
    <p className="mt-4">Tell us what went wrong. Reports are private and reviewed by Cap &amp; Crease Admin.</p>
    <p className="mt-2 text-sm">Please don’t include passwords or private information. An email is optional and used only to reply about your report.</p>
    <div ref={feedback} tabIndex={-1} className="mt-4 focus-visible:outline focus-visible:outline-2" role={receipt ? "status" : "alert"}>
      {receipt ? <><p className="font-bold">Thank you — your report was received.</p><p className="text-sm break-all">Reference: {receipt}</p></> : message}
    </div>
    {receipt ? <button className="min-h-11 border border-ledger-ink px-4 py-2 text-sm font-bold font-mono focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 mt-4" onClick={() => { setReceipt(""); setMessage(""); setFields(initial); attempt.current = null; }}>Report another issue</button> :
      <form onSubmit={submit} noValidate className="mt-6 space-y-5" aria-busy={busy}>
        <fieldset disabled={busy} className="min-w-0 space-y-5">
          {control("description", "What went wrong? (required, 10–4,000 characters)", true, true)}
          {control("pageUrl", "Page URL (optional)", false, false, 2048)}
          {control("steps", "Steps to reproduce (optional, up to 4,000 characters)", true)}
          <div><h2 className="font-bold">Screenshots (optional)</h2><p className="text-sm mt-1">{SCREENSHOTS_UNAVAILABLE}</p></div>
          {control("email", "Email for a reply (optional)", false, false, 254)}
          <div aria-hidden="true" className="hidden"><label htmlFor="website">Leave this blank</label><input id="website" name="website" tabIndex={-1} autoComplete="off" value={fields.website} onChange={event => setFields(previous => ({ ...previous, website: event.target.value }))} /></div>
          <p className="text-sm">Submission time, basic browser information and viewport size are recorded. Sensitive URL query parameters are removed.</p>
          <button type="submit" disabled={busy} className="min-h-11 border border-ledger-ink px-4 py-2 text-sm font-bold font-mono focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 px-4">{busy ? "Submitting…" : "Submit report"}</button>
          {busy && <p role="status">Saving your report…</p>}
        </fieldset>
      </form>}
  </main><Footer /></>;
}
