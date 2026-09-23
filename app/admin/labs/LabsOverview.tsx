import React from "react";
import type { LabCandidate } from "@/app/lib/labs-candidates";
import type { AnalyticDefinition } from "@/app/lib/production-analytics";
import type { SeasonSnapshotBatch } from "@/app/lib/season-snapshot";

export type LabsSnapshotState = "available" | "attention" | "unavailable";

export interface LabsOverviewData {
  analytics: readonly AnalyticDefinition[];
  verifiedBatches: readonly SeasonSnapshotBatch[];
  legacyInventory: { players: number; teams: number };
  snapshotState: LabsSnapshotState;
  candidates: readonly LabCandidate[];
  candidateState: "available" | "unavailable";
}

const lifecycleClass = (lifecycle: AnalyticDefinition["lifecycle"]) => {
  if (lifecycle === "PRODUCTION") return "admin-labs-badge-production";
  if (lifecycle === "DIAGNOSTIC") return "admin-labs-badge-diagnostic";
  return "admin-labs-badge-research";
};

const displayTimestamp = (timestamp: number | null) => timestamp === null
  ? "Not completed"
  : new Date(timestamp).toISOString().replace("T", " ").replace("Z", " UTC");

const shortHash = (hash: string) => `${hash.slice(0, 16)}…`;

const displayCount = (count: number) => new Intl.NumberFormat("en-US").format(count);

function AnalyticCard({ analytic }: { analytic: AnalyticDefinition }) {
  const flagLabels = analytic.featureFlags?.map(flag => flag.key ?? flag.source.exportName ?? "Referenced feature flag");

  return (
    <article className="admin-labs-card" aria-label={`${analytic.name}, ${analytic.lifecycle}`}>
      <h3 className="admin-labs-heading">{analytic.name}</h3>
      <p className="admin-labs-id"><code>{analytic.id}</code></p>
      <span className={`admin-labs-badge ${lifecycleClass(analytic.lifecycle)}`}>
        {analytic.lifecycle} · {analytic.exposure}
      </span>
      <dl className="admin-labs-meta">
        <div>
          <dt>Version</dt>
          <dd>{analytic.version.value} <span className="admin-labs-copy">({analytic.version.kind})</span></dd>
        </div>
        <div>
          <dt>Implementation</dt>
          <dd className="admin-labs-safe-text"><code>{analytic.implementation}</code> · {analytic.implementationModule}</dd>
        </div>
        <div>
          <dt>Execution boundary</dt>
          <dd>{analytic.executionBoundary}</dd>
        </div>
        {analytic.artifact && (
          <div>
            <dt>Artifact</dt>
            <dd className="admin-labs-safe-text"><code>{analytic.artifact.path}</code> · {analytic.artifact.manifestExport}</dd>
          </div>
        )}
        {flagLabels && flagLabels.length > 0 && (
          <div>
            <dt>Feature flags</dt>
            <dd className="admin-labs-safe-text">{flagLabels.join(" · ")} · fail closed</dd>
          </div>
        )}
      </dl>
    </article>
  );
}

function DatasetCard({ batch }: { batch: SeasonSnapshotBatch }) {
  return (
    <article className="admin-labs-card" aria-label={`Verified dataset ${batch.id}`}>
      <h3 className="admin-labs-heading">{batch.season} · {batch.snapshotKind}</h3>
      <p className="admin-labs-id"><code>{batch.id}</code></p>
      <span className="admin-labs-badge admin-labs-badge-complete">{batch.status} · verified</span>
      <dl className="admin-labs-meta">
        <div>
          <dt>Coverage</dt>
          <dd>{batch.coverage} · {batch.asOf}</dd>
        </div>
        <div>
          <dt>Membership</dt>
          <dd>{displayCount(batch.capturedPlayers)} / {displayCount(batch.expectedPlayers)} players · {displayCount(batch.capturedTeams)} / {displayCount(batch.expectedTeams)} teams</dd>
        </div>
        <div>
          <dt>Captured</dt>
          <dd>{displayTimestamp(batch.completedAt)}</dd>
        </div>
        <div>
          <dt>Integrity fingerprint</dt>
          <dd className="admin-labs-safe-text"><code aria-label={`Full SHA-256 integrity fingerprint ${batch.integrityHash}`} title={batch.integrityHash}>{shortHash(batch.integrityHash)}</code></dd>
        </div>
      </dl>
    </article>
  );
}

function CandidateCard({ candidate }: { candidate: LabCandidate }) {
  const latestEvent = candidate.lifecycleHistory[candidate.lifecycleHistory.length - 1];
  return (
    <article className="admin-labs-card" aria-label={`Labs candidate ${candidate.name}, ${candidate.lifecycleStatus}`}>
      <h3 className="admin-labs-heading">{candidate.name}</h3>
      <p className="admin-labs-id"><code>{candidate.id}</code> · revision <code>{candidate.revision}</code></p>
      <span className="admin-labs-badge admin-labs-badge-research">
        {candidate.lifecycleStatus} · {candidate.exposure}
      </span>
      <dl className="admin-labs-meta">
        <div>
          <dt>Target analytic</dt>
          <dd><code>{candidate.targetAnalytic.id}</code> · {candidate.targetAnalytic.name}</dd>
        </div>
        <div>
          <dt>Verified dataset</dt>
          <dd className="admin-labs-safe-text"><code>{candidate.dataset.id}</code></dd>
        </div>
        <div>
          <dt>Artifacts</dt>
          <dd>{candidate.artifacts.length === 0
            ? "No immutable artifact metadata registered"
            : candidate.artifacts.map(reference => <React.Fragment key={reference.artifact.id}><code>{reference.artifact.id}</code> · {shortHash(reference.artifact.contentDigest)}<br /></React.Fragment>)}</dd>
        </div>
        <div>
          <dt>Lifecycle history</dt>
          <dd>{candidate.lifecycleHistory.length} append-only event{candidate.lifecycleHistory.length === 1 ? "" : "s"} · latest {latestEvent.eventType}</dd>
        </div>
        <div>
          <dt>Created</dt>
          <dd>{displayTimestamp(candidate.createdAt)} · {candidate.createdSource}</dd>
        </div>
      </dl>
      {candidate.hypothesis && <p className="admin-labs-copy">Hypothesis: {candidate.hypothesis}</p>}
    </article>
  );
}

export default function LabsOverview({
  analytics,
  verifiedBatches,
  legacyInventory,
  snapshotState,
  candidates,
  candidateState,
}: LabsOverviewData) {
  const production = analytics.filter(analytic => analytic.lifecycle === "PRODUCTION");
  const diagnostic = analytics.filter(analytic => analytic.lifecycle === "DIAGNOSTIC");
  const research = analytics.filter(analytic => analytic.lifecycle === "RESEARCH");

  return (
    <main className="admin-page" style={{
      background: "var(--paper)",
      color: "var(--ledger-ink)",
      fontFamily: "'Courier Prime', monospace",
      minHeight: "calc(100vh - 44px)",
      padding: "36px 32px",
    }}>
      <div className="admin-labs-shell">
        <header style={{ borderBottom: "1px solid var(--rule)", paddingBottom: 20, marginBottom: 28 }}>
          <div className="admin-labs-kicker">ADMIN · READ-ONLY</div>
          <h1 style={{ fontSize: 22, fontWeight: 900, letterSpacing: "0.08em", margin: 0 }}>ANALYTICS LABS</h1>
          <p className="admin-labs-copy" style={{ maxWidth: 760 }}>
            Production analytic identity and verified snapshot provenance. This overview cannot run, promote, or modify an analytic.
          </p>
        </header>

        <section aria-labelledby="labs-system-status">
          <h2 id="labs-system-status" className="admin-labs-section-title">SYSTEM STATUS</h2>
          <p className="admin-labs-section-copy">The public valuation boundary remains committed production code; this catalog is descriptive metadata only.</p>
          <div className="admin-labs-status-grid">
            <article className="admin-labs-card admin-labs-status-card">
              <div className="admin-labs-kicker">Public NAV boundary</div>
              <div className="admin-labs-status-value"><code>calculateAssetNAV → calcNAV</code></div>
            </article>
            <article className="admin-labs-card admin-labs-status-card">
              <div className="admin-labs-kicker">Production registry</div>
              <div className="admin-labs-status-value">{production.length} production records</div>
              <p className="admin-labs-copy">{diagnostic.length} diagnostic · {research.length} research</p>
            </article>
            <article className="admin-labs-card admin-labs-status-card">
              <div className="admin-labs-kicker">Verified datasets</div>
              <div className="admin-labs-status-value">{verifiedBatches.length} COMPLETE batch{verifiedBatches.length === 1 ? "" : "es"}</div>
              <p className="admin-labs-copy">{snapshotState === "available" ? "Eligible provenance only" : snapshotState === "attention" ? "Inventory needs attention" : "Inventory unavailable"}</p>
            </article>
            <article className="admin-labs-card admin-labs-status-card">
              <div className="admin-labs-kicker">Legacy inventory</div>
              <div className="admin-labs-status-value">{displayCount(legacyInventory.players)} players · {displayCount(legacyInventory.teams)} teams</div>
              <p className="admin-labs-copy">Unverified and not Labs-eligible</p>
            </article>
          </div>
        </section>

        <section className="admin-labs-section" aria-labelledby="labs-production-analytics">
          <h2 id="labs-production-analytics" className="admin-labs-section-title">PRODUCTION ANALYTICS</h2>
          <p className="admin-labs-section-copy">Identity, lifecycle, and implementation metadata from the Phase 1B production catalog. Registration does not select a calculator.</p>
          <div className="admin-labs-analytics-grid">
            {production.map(analytic => <AnalyticCard key={analytic.id} analytic={analytic} />)}
          </div>
        </section>

        <section className="admin-labs-section" aria-labelledby="labs-verified-datasets">
          <h2 id="labs-verified-datasets" className="admin-labs-section-title">VERIFIED DATASETS</h2>
          <p className="admin-labs-section-copy">Only batches accepted by the existing COMPLETE-batch guard appear here. Player and team membership is intentionally not browsable from this overview.</p>
          {verifiedBatches.length > 0 ? (
            <div className="admin-labs-dataset-grid">
              {verifiedBatches.map(batch => <DatasetCard key={batch.id} batch={batch} />)}
            </div>
          ) : (
            <div className="admin-labs-card" role="status">No verified COMPLETE snapshot batch is currently available.</div>
          )}
        </section>

        <section className="admin-labs-section" aria-labelledby="labs-legacy-inventory">
          <h2 id="labs-legacy-inventory" className="admin-labs-section-title">UNVERIFIED LEGACY INVENTORY</h2>
          <div className="admin-labs-card" role="note">
            <span className="admin-labs-badge admin-labs-badge-warning">Not Labs-eligible</span>
            <p className="admin-labs-copy">{displayCount(legacyInventory.players)} player rows and {displayCount(legacyInventory.teams)} team rows are legacy records with no verified batch provenance. This page exposes aggregate inventory only and never adopts, rewrites, or presents these rows as a dataset.</p>
          </div>
        </section>

        <section className="admin-labs-section" aria-labelledby="labs-nonproduction-records">
          <h2 id="labs-nonproduction-records" className="admin-labs-section-title">DIAGNOSTIC AND RESEARCH RECORDS</h2>
          <p className="admin-labs-section-copy">These records are visible for operational context but cannot resolve as public production analytics.</p>
          <div className="admin-labs-analytics-grid">
            {[...diagnostic, ...research].map(analytic => <AnalyticCard key={analytic.id} analytic={analytic} />)}
          </div>
        </section>

        <section className="admin-labs-section" aria-labelledby="labs-candidates">
          <h2 id="labs-candidates" className="admin-labs-section-title">CANDIDATES</h2>
          <p className="admin-labs-section-copy">Candidate registration is internal provenance only. It is not validation, approval, promotion, runtime selection, or a calculation trigger.</p>
          {candidateState === "unavailable" ? (
            <div className="admin-labs-card" role="status">Candidate inventory unavailable. No candidate is treated as production-ready.</div>
          ) : candidates.length === 0 ? (
            <div className="admin-labs-card" role="status">No candidates are registered. Registration will not imply validation or promotion.</div>
          ) : (
            <div className="admin-labs-analytics-grid">
              {candidates.map(candidate => <CandidateCard key={candidate.id} candidate={candidate} />)}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
