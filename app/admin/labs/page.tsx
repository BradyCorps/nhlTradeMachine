import { db } from "@/app/db/client";
import { listLabCandidates } from "@/app/lib/labs-candidates";
import { listEvaluationProtocols, listEvaluationRuns } from "@/app/lib/labs-evaluations";
import { ANALYTIC_CATALOG } from "@/app/lib/production-analytics";
import {
  requireCompleteSeasonSnapshotBatch,
  seasonSnapshotBatchInventory,
  seasonSnapshotInventory,
  type SeasonSnapshotBatch,
} from "@/app/lib/season-snapshot";
import LabsOverview, { type LabsOverviewData } from "./LabsOverview";

export const dynamic = "force-dynamic";

async function readVerifiedBatches(batches: readonly SeasonSnapshotBatch[]): Promise<{
  batches: SeasonSnapshotBatch[];
  state: LabsOverviewData["snapshotState"];
}> {
  const complete = batches.filter(batch => batch.status === "COMPLETE");
  const verified: SeasonSnapshotBatch[] = [];
  let state: LabsOverviewData["snapshotState"] = "available";

  for (const batch of complete) {
    try {
      verified.push(await requireCompleteSeasonSnapshotBatch(db, batch.id));
    } catch {
      // A row labelled COMPLETE is not enough for Labs eligibility. Preserve
      // that distinction in the overview without exposing raw membership.
      state = "attention";
    }
  }

  return { batches: verified, state };
}

async function readLabsOverview(): Promise<LabsOverviewData> {
  const [candidateInventory, evaluationInventory] = await Promise.all([
    readCandidateInventory(),
    readEvaluationInventory(),
  ]);
  try {
    const [batchInventory, legacyInventory] = await Promise.all([
      seasonSnapshotBatchInventory(db),
      seasonSnapshotInventory(db, { unbatchedOnly: true }),
    ]);
    const verified = await readVerifiedBatches(batchInventory);
    const legacy = legacyInventory.reduce((total, inventory) => ({
      players: total.players + inventory.players,
      teams: total.teams + inventory.teams,
    }), { players: 0, teams: 0 });

    return {
      analytics: ANALYTIC_CATALOG,
      verifiedBatches: verified.batches,
      legacyInventory: legacy,
      snapshotState: verified.state,
      ...candidateInventory,
      ...evaluationInventory,
    };
  } catch {
    return {
      analytics: ANALYTIC_CATALOG,
      verifiedBatches: [],
      legacyInventory: { players: 0, teams: 0 },
      snapshotState: "unavailable",
      ...candidateInventory,
      ...evaluationInventory,
    };
  }
}

async function readEvaluationInventory(): Promise<Pick<LabsOverviewData, "protocols" | "runs" | "evaluationState">> {
  try {
    const [protocols, runs] = await Promise.all([listEvaluationProtocols(db), listEvaluationRuns(db)]);
    return { protocols, runs, evaluationState: "available" };
  } catch {
    // A missing migration or corrupt evidence is operationally distinct from an
    // honest empty inventory and must never be rendered as one.
    return { protocols: [], runs: [], evaluationState: "unavailable" };
  }
}

async function readCandidateInventory(): Promise<Pick<LabsOverviewData, "candidates" | "candidateState">> {
  try {
    return { candidates: await listLabCandidates(db), candidateState: "available" };
  } catch {
    // Missing, incoherent, or non-COMPLETE provenance must never become a
    // selectable candidate. Preserve an explicit read-only unavailable state.
    return { candidates: [], candidateState: "unavailable" };
  }
}

export default async function AdminLabsPage() {
  return <LabsOverview {...await readLabsOverview()} />;
}
