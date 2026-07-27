import { NextRequest, NextResponse } from "next/server";
import { getRehearsals } from "@/lib/store";
import type { RehearsalResult, RehearsalDistribution } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Returns the full rehearsal history for a campaign, newest first.
 * Used by the `/campaigns/[id]?view=rehearsal` rail RunHistoryBlock.
 * We hydrate `distribution` and `diffSummary` on the fly for any older runs
 * persisted before those fields existed so the rail always has them.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const runs = (await getRehearsals())
    .filter((r) => r.campaignId === id)
    .sort((a, b) => b.ranAt.localeCompare(a.ranAt));
  const hydrated = runs.map((r, i) => hydrate(r, runs[i + 1] ?? null));
  return NextResponse.json(hydrated);
}

function hydrate(r: RehearsalResult, prior: RehearsalResult | null): RehearsalResult {
  const distribution = r.distribution ?? deriveDistribution(r);
  const diffSummary =
    r.diffSummary && r.diffSummary.length ? r.diffSummary : deriveDiffSummary(r, prior);
  return { ...r, distribution, diffSummary };
}

function deriveDistribution(r: RehearsalResult): RehearsalDistribution {
  const d: RehearsalDistribution = { open_click: 0, open_ignore: 0, ignore: 0, unsubscribe: 0, spam: 0 };
  for (const resp of r.responses) d[resp.action]++;
  return d;
}

function deriveDiffSummary(r: RehearsalResult, prior: RehearsalResult | null): string[] {
  if (!prior) return ["initial run"];
  const applied = r.opportunities.find((o) => o.applied);
  if (applied) return [`applied: ${applied.title}`];
  return ["re-ran with no changes"];
}
