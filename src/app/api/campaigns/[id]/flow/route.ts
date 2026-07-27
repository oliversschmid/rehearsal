import { NextRequest, NextResponse } from "next/server";
import { getCampaign, saveCampaign } from "@/lib/store";
import type { Flow } from "@/lib/types";

export const runtime = "nodejs";

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const campaign = getCampaign(id);
  if (!campaign) return NextResponse.json({ error: "not found" }, { status: 404 });
  const flow: Flow = await req.json();
  campaign.flow = flow;
  campaign.status = "draft"; // any flow change resets status
  await saveCampaign(campaign);
  return NextResponse.json(campaign);
}
