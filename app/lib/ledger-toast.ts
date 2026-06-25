// Module-level toast dispatcher — fire from any client module.
// <LedgerToaster /> in layout.tsx listens and renders.
export type ToastKind = "success" | "error" | "info";

export interface ToastEvent {
  id: number;
  message: string;
  kind: ToastKind;
}

let _seq = 0;

export function toast(message: string, kind: ToastKind = "info") {
  if (typeof window === "undefined") return;
  const detail: ToastEvent = { id: ++_seq, message, kind };
  window.dispatchEvent(new CustomEvent("ledger-toast", { detail }));
}
