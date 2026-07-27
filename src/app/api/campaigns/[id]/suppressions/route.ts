import { NextRequest, NextResponse } from "next/server";
import { getCampaign, getLatestRehearsal, saveCampaign } from "@/lib/store";

export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json();
  const campaign = await getCampaign(id);
  if (!campaign) return NextResponse.json({ error: "not found" }, { status: 404 });
  const latest = await getLatestRehearsal(id);
  if (!latest) return NextResponse.json({ error: "no rehearsal" }, { status: 400 });

  const reasons: string[] = body.reasons ?? [];
  const acceptAll: boolean = !!body.acceptAll;

  const toAdd = latest.suppressions
    .filter((s) => acceptAll || reasons.includes(s.reason))
    .map((s) => s.customerId);
  campaign.exclusions = [...new Set([...(campaign.exclusions ?? []), ...toAdd])];
  await saveCampaign(campaign);
  return NextResponse.json(campaign);
}
