"use client";

import { useEffect, useState } from "react";

export default function ContractSyncer() {
  const [status, setStatus] = useState<"idle"|"done"|"error">("idle");

  useEffect(() => {
    fetch("/api/contracts")
      .then(r => r.json())
      .then(() => setStatus("done"))
      .catch(() => setStatus("error"));
  }, []);

  if (status !== "error") return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-2.5 flex items-center gap-2.5 shadow-xl">
      <div className="w-2 h-2 rounded-full bg-amber-500" />
      <span className="text-[10px] font-black uppercase tracking-widest text-amber-500">
        Using cached contract data
      </span>
    </div>
  );
}
