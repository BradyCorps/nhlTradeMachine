import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TEAMS_DB } from "@/app/lib/db";
import { BRAND } from "@/app/lib/brand";
import StructuredData from "@/app/components/StructuredData";
import { publicRouteMetadata, teamDetailSeo } from "@/app/lib/public-seo";
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
  return publicRouteMetadata(teamDetailSeo(team));
}

export default async function TeamDetailPage(
  { params }: { params: Promise<{ team: string }> },
) {
  const { team: rawTeamId } = await params;
  const team = findTeam(rawTeamId);
  if (!team) notFound();

  const url = `${BRAND.url}/teams/${team.id.toLowerCase()}`;
  return (
    <>
      <StructuredData id={`team-${team.id.toLowerCase()}-schema`} data={{
        "@context": "https://schema.org",
        "@type": "SportsTeam",
        name: team.name,
        sport: "Ice Hockey",
        url,
        memberOf: { "@type": "SportsOrganization", name: "National Hockey League" },
      }} />
      <TeamsPage />
    </>
  );
}
