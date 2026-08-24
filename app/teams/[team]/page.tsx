import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TEAMS_DB } from "@/app/lib/db";
import TeamsPage from "../page";

function findTeam(rawTeamId: string) {
  const teamId = rawTeamId.toUpperCase();
  return TEAMS_DB.find((team) => team.id === teamId) ?? null;
}

export async function generateMetadata(
  { params }: { params: Promise<{ team: string }> },
): Promise<Metadata> {
  const { team: rawTeamId } = await params;
  const team = findTeam(rawTeamId);
  if (!team) return { title: "Team not found — Cap & Crease" };

  return {
    title: `${team.name} Team Analytics — Cap & Crease`,
    description: `${team.name} contention window, roster NAV, cap situation, Team DNA, EDGE profile, and projected lines.`,
  };
}

export default async function TeamDetailPage(
  { params }: { params: Promise<{ team: string }> },
) {
  const { team: rawTeamId } = await params;
  if (!findTeam(rawTeamId)) notFound();

  return <TeamsPage />;
}
