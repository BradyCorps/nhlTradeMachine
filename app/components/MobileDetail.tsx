"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useDialog } from "@/app/lib/use-dialog";

/** Mounted only while a detail is open; the desktop detail stays inline. */
export function MobileDetail({ title, onClose, children, enabled = true }: { title: string; onClose: () => void; children: ReactNode; enabled?: boolean }) {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 1039px)");
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return mobile && enabled ? <DetailSheet title={title} onClose={onClose}>{children}</DetailSheet> : <>{children}</>;
}

function DetailSheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const id = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const historyOpen = useRef(false);
  const [sections, setSections] = useState<{ id: string; label: string }[]>([]);
  const close = () => {
    if (historyOpen.current) window.history.back();
    else closeRef.current();
  };
  const dialog = useDialog({ open: true, onClose: close, labelledBy: `${id}-title` });

  useEffect(() => {
    const siblings = Array.from(document.body.children).filter((element): element is HTMLElement => element instanceof HTMLElement && element !== dialog.ref.current);
    const previous = siblings.map(element => element.inert);
    const opener = document.activeElement;
    siblings.forEach(element => { element.inert = true; });
    return () => {
      siblings.forEach((element, index) => { element.inert = previous[index]; });
      // useDialog restores first; repeat after removing inert so the opener
      // can actually accept focus again.
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, [dialog.ref]);

  useEffect(() => {
    // Preserve Next's router state. The extra same-route entry consumes Back
    // before it can leave the trade, draft, or simulation workflow.
    // Defer the entry until the effect survives React's development replay.
    const openedAt = window.location.pathname;
    const pending = window.setTimeout(() => {
      window.history.pushState({ ...window.history.state, mobileDetail: id }, "", window.location.href);
      historyOpen.current = true;
    }, 0);
    const back = () => {
      historyOpen.current = false;
      closeRef.current();
    };
    window.addEventListener("popstate", back);
    return () => {
      window.clearTimeout(pending);
      window.removeEventListener("popstate", back);
      if (historyOpen.current && window.history.state?.mobileDetail === id && window.location.pathname === openedAt) {
        historyOpen.current = false;
        window.history.back();
      }
    };
  }, [id]);

  useEffect(() => {
    const headings = Array.from(dialog.ref.current?.querySelectorAll<HTMLElement>(".mobile-detail-content h2, .mobile-detail-content h3, .mobile-detail-content [role=tablist]") ?? []);
    setSections(headings.map((heading, index) => {
      heading.id ||= `${id}-section-${index}`;
      return { id: heading.id, label: heading.getAttribute("aria-label") ?? (heading.getAttribute("role") === "tablist" ? "Section tabs" : heading.textContent?.trim().slice(0, 55)) ?? "Details" };
    }));
  }, [id, dialog.ref]);

  return createPortal(<div {...dialog} className="mobile-detail-sheet">
    <header className="mobile-detail-heading">
      <h2 id={`${id}-title`}>{title}</h2>
      <button type="button" className="tap-target filter-btn" onClick={close}>Close details</button>
      <nav aria-label={`${title} sections`}>
        <button type="button" className="tap-target filter-btn" onClick={() => document.getElementById(`${id}-overview`)?.scrollIntoView({ block: "start" })}>Overview</button>
        {sections.filter(section => section.id !== `${id}-title`).map(section => <button type="button" className="tap-target filter-btn" key={section.id} onClick={() => document.getElementById(section.id)?.scrollIntoView({ block: "start" })}>{section.label}</button>)}
      </nav>
    </header>
    <div id={`${id}-overview`} className="mobile-detail-content">{children}</div>
  </div>, document.body);
}
