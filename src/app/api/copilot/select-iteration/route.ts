import { NextRequest, NextResponse } from "next/server";
import { getCampaign, overrideLatestRehearsal, saveCampaign } from "@/lib/store";

export const runtime = "nodejs";

/**
 * Commits one of the copilot's iteration snapshots as the campaign's active flow.
 * Updates lastScore + latest rehearsal record so Rehearsal / Report tabs reflect
 * the chosen iteration.
 */
export async function POST(req: NextRequest) {
  const { campaignId, iteration } = (await req.json()) as { campaignId: string; iteration: number };
  const campaign = await getCampaign(campaignId);
  if (!campaign) return NextResponse.json({ error: "not found" }, { status: 404 });

  const snap = campaign.copilotIterations?.find((s) => s.iteration === iteration);
  if (!snap) return NextResponse.json({ error: "iteration not found" }, { status: 404 });

  campaign.flow = JSON.parse(JSON.stringify(snap.flow));
  campaign.copilotSelectedIteration = snap.iteration;
  campaign.lastScore = snap.score;
  if (campaign.rehearsalHistory?.length) {
    campaign.rehearsalHistory[campaign.rehearsalHistory.length - 1].score = snap.score;
  }
  await overrideLatestRehearsal(campaign.id, {
    score: snap.score,
    band: bandFor(snap.score),
    recommendation: snap.score >= 70 ? "ship" : snap.score >= 30 ? "improve" : "dont_send",
    driver: snap.driver,
  });
  await saveCampaign(campaign);
  return NextResponse.json(campaign);
}

function bandFor(score: number): { band: "exceptional" | "strong" | "middle" | "weak" | "dont_send"; label: string } {
  if (score >= 85) return { band: "exceptional", label: "Exceptional — among your best" };
  if (score >= 70) return { band: "strong", label: "Strong — ship it" };
  if (score >= 50) return { band: "middle", label: "Middle of your range" };
  if (score >= 30) return { band: "weak", label: "Weak — rework" };
  return { band: "dont_send", label: "Don't send" };
}
