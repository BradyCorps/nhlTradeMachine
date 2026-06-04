"use client";

import React, { useState, useTransition } from "react";
import { updateTeamPhase } from "./actions";

export function AdminTeamRow({ team }: { team: any }) {
  const [isPending, startTransition] = useTransition();
  const [phase, setPhase] = useState(team.phaseOverride || "");

  const handleSave = () => {
    startTransition(async () => {
      const val = phase === "" ? null : phase;
      await updateTeamPhase(team.id, val);
      alert(`Updated ${team.name} to ${val || 'Auto'}`);
    });
  };

  return (
    <div className="flex items-center justify-between p-3 border-b border-zinc-800 bg-zinc-900 mb-2 rounded">
      <div className="flex items-center gap-4">
        <span className="font-bold text-zinc-200 w-48">{team.name}</span>
        <span className="text-zinc-500 text-xs w-16">{team.id}</span>
      </div>
      <div className="flex items-center gap-2">
        <select
          value={phase}
          onChange={(e) => setPhase(e.target.value)}
          className="bg-zinc-800 text-sm border border-zinc-700 rounded p-1.5 w-40 outline-none text-zinc-300"
        >
          <option value="">-- Auto (Standings) --</option>
          <option value="Contender">Contender</option>
          <option value="Bubble">Bubble</option>
          <option value="Retooling">Retooling</option>
          <option value="Rebuilding">Rebuilding</option>
          <option value="Tanking">Tanking</option>
        </select>
        
        <button
          onClick={handleSave}
          disabled={isPending || phase === (team.phaseOverride || "")}
          className={`text-xs font-bold px-3 py-1.5 rounded uppercase tracking-wider transition-colors ${
            isPending ? "bg-zinc-700 text-zinc-500" :
            phase !== (team.phaseOverride || "") ? "bg-amber-600 text-white" : "bg-zinc-700 text-zinc-400"
          }`}
        >
          {isPending ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
