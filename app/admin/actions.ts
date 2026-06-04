"use server";

import { db } from "@/app/db/client";
import { teams as teamsTable } from "@/app/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function updateTeamPhase(teamId: string, phase: string | null) {
  try {
    await db
      .update(teamsTable)
      .set({ phaseOverride: phase })
      .where(eq(teamsTable.id, teamId));
    
    // Clear the cache so the frontend picks up the change immediately
    revalidatePath("/admin");
    revalidatePath("/trade");
    return { success: true };
  } catch (e: any) {
    console.error("Failed to update team phase:", e);
    return { success: false, error: e.message };
  }
}
