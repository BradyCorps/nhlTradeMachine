// Server-only: builds a content-addressed reference cohort. Kept apart from
// strand-evolution.ts so node:crypto never reaches the client bundle.
import { createHash } from "node:crypto";
import {
  EVOLUTION_DEFINITION_VERSION, TRAIT_KEYS, traitValues,
  type CheckpointInputs, type ReferenceCohort, type TraitKey,
} from "@/app/lib/strand-evolution";

const canonical = (v: unknown): string => JSON.stringify(v, (_k, x) =>
  x && typeof x === "object" && !Array.isArray(x)
    ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
    : x);
export const sha256 = (v: unknown): string => createHash("sha256").update(canonical(v)).digest("hex");

/** Build a cohort from every eligible player's inputs. The id is a hash of the
 *  content, so identical populations are one cohort and a changed one is another. */
export function buildReferenceCohort(args: {
  season: string; gameType: number; posGroup: "F" | "D"; minGp: number;
  players: readonly CheckpointInputs[]; capturedAt: number; source: string;
}): ReferenceCohort {
  const values: Record<TraitKey, number[]> = { pts_gp: [], sog_gp: [], hd_sog_gp: [], toi_gp: [], oz_time: [] };
  let n = 0, gpMin = Infinity, gpMax = -Infinity;
  for (const p of args.players) {
    if (!fin(p.gp) || p.gp < args.minGp) continue;
    n++;
    gpMin = Math.min(gpMin, p.gp); gpMax = Math.max(gpMax, p.gp);
    const t = traitValues(p);
    for (const k of TRAIT_KEYS) if (t[k].value != null) values[k].push(t[k].value!);
  }
  for (const k of TRAIT_KEYS) values[k].sort((a, b) => a - b);
  const content = { season: args.season, gameType: args.gameType, posGroup: args.posGroup,
    definitionVersion: EVOLUTION_DEFINITION_VERSION, minGp: args.minGp,
    gpMin: n ? gpMin : 0, gpMax: n ? gpMax : 0, n, values };
  return { id: sha256(content), ...content, capturedAt: args.capturedAt, source: args.source };
}


const fin = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
