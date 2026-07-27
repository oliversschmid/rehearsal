import { NextRequest, NextResponse } from "next/server";
import { getCampaign, getLatestRehearsal, overrideLatestRehearsal, saveCampaign } from "@/lib/store";
import { clampScore } from "@/lib/rehearse";
import type { Opportunity, FlowNode } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { opportunityId } = await req.json();
  const campaign = await getCampaign(id);
  if (!campaign) return NextResponse.json({ error: "not found" }, { status: 404 });
  const latest = await getLatestRehearsal(id);
  const opp = latest?.opportunities.find((o) => o.id === opportunityId);
  if (!opp) return NextResponse.json({ error: "opportunity not found" }, { status: 404 });

  applyOpportunityToCampaign(campaign, opp);

  // Reflect the applied opportunity in the score immediately. We nudge the
  // score up by the middle of the opportunity's predicted impact range so
  // the marketer sees the effect without waiting for a full re-rehearsal.
  const scoreBefore = campaign.lastScore ?? 0;
  const midpoint = Math.round((opp.impactRange[0] + opp.impactRange[1]) / 2);
  const projectedScore = clampScore(scoreBefore + midpoint);
  campaign.lastScore = projectedScore;

  // Keep the latest rehearsal record + trajectory in sync so the Rehearsal
  // and Report tabs both reflect the improvement.
  await overrideLatestRehearsal(campaign.id, {
    score: projectedScore,
    band: bandFor(projectedScore),
    recommendation: projectedScore >= 70 ? "ship" : projectedScore >= 30 ? "improve" : "dont_send",
  });
  if (campaign.rehearsalHistory?.length) {
    campaign.rehearsalHistory[campaign.rehearsalHistory.length - 1].score = projectedScore;
  }

  campaign.appliedOpportunities = [
    ...(campaign.appliedOpportunities ?? []),
    {
      opportunityId,
      appliedAt: new Date().toISOString(),
      scoreBefore,
      scoreAfter: projectedScore,
    },
  ];
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

function applyOpportunityToCampaign(campaign: import("@/lib/types").Campaign, opp: Opportunity) {
  if (!opp || !opp.target || typeof opp.target.nodeId !== "string") return;
  const node = campaign.flow.nodes[opp.target.nodeId];
  if (!node) return;

  if (opp.type === "exclusion") {
    // opp.change is a segment label — for the prototype we mark all matching-audience members
    // but we don't have segmentation here directly; the applyOpportunity flow prefers customerIds:
    if (opp.target.customerIds?.length) {
      campaign.exclusions = [...new Set([...(campaign.exclusions ?? []), ...opp.target.customerIds])];
    }
    return;
  }

  if (opp.type === "timing" && node.type === "delay" && opp.target.field === "delayAmount") {
    const n = Number(opp.change);
    if (!Number.isNaN(n)) node.amount = n;
    return;
  }

  if (node.type !== "message") return;
  if (node.content.channel === "email") {
    const e = node.content.email;
    if (opp.target.field === "subject") e.subject = opp.change;
    else if (opp.target.field === "preheader") e.preheader = opp.change;
    else if (opp.target.field === "body" || opp.type === "copy" || opp.type === "tone") e.body = opp.change;
    else if (opp.target.field === "ctaText") e.ctaText = opp.change;
  } else if (node.content.channel === "sms") {
    node.content.sms.message = opp.change;
  }
  campaign.flow.nodes[opp.target.nodeId] = node as FlowNode;
}
