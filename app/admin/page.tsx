import React from "react";
import { db } from "@/app/db/client";
import { teams as teamsTable } from "@/app/db/schema";
import { AdminTeamRow } from "./AdminTeamRow";
import Link from "next/link";

export default async function AdminDashboard() {
  const allTeams = await db.select().from(teamsTable).orderBy(teamsTable.name);

  return (
    <div className="min-h-screen bg-black text-zinc-100 p-8 font-sans">
      <div className="max-w-4xl mx-auto">
        
        <header className="flex items-center justify-between mb-8 pb-4 border-b border-zinc-800">
          <div>
            <h1 className="text-2xl font-black uppercase tracking-widest text-amber-500 mb-1">Database Admin</h1>
            <p className="text-zinc-500 text-sm">Manage Turso Overrides & Configuration</p>
          </div>
          <Link href="/trade" className="text-xs uppercase font-bold text-zinc-400 hover:text-white transition-colors">
            ← Back to App
          </Link>
        </header>

        <section className="mb-12">
          <div className="mb-4">
            <h2 className="text-lg font-bold uppercase tracking-wider text-zinc-100 mb-1">Team Phase Overrides</h2>
            <p className="text-zinc-500 text-xs leading-relaxed max-w-2xl">
              By default, a team's phase (Contender, Bubble, Rebuilding) is calculated automatically based on their live standings.
              Use this dashboard to manually lock a team into a specific phase (e.g. if a team is technically in a playoff spot but is a known seller).
            </p>
          </div>

          <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
            {allTeams.map((t) => (
              <AdminTeamRow key={t.id} team={t} />
            ))}
          </div>
        </section>

      </div>
    </div>
  );
}
