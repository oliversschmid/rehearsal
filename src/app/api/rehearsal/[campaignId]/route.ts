import { NextRequest, NextResponse } from "next/server";
import { getLatestRehearsal } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await ctx.params;
  const latest = getLatestRehearsal(campaignId);
  if (!latest) return NextResponse.json({ error: "no rehearsal" }, { status: 404 });
  return NextResponse.json(latest);
}
