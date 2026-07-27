import { NextRequest, NextResponse } from "next/server";
import { getCampaigns, saveCampaign } from "@/lib/store";
import type { Campaign, Flow } from "@/lib/types";
import { DEFAULT_SCHEDULE } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(getCampaigns());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const id = body.id ?? `c-${Date.now()}`;
  const now = new Date().toISOString();
  const flow: Flow = {
    rootId: "n1",
    nodes: {
      n1: { id: "n1", type: "trigger", audienceLabel: `enters audience: ${body.audienceLabel ?? "audience"}` },
    },
  };
  const campaign: Campaign = {
    id,
    name: body.name ?? "Untitled campaign",
    goal: body.goal ?? "",
    audienceGroupId: body.audienceGroupId,
    tags: body.tags ?? [],
    status: "draft",
    schedule: { ...DEFAULT_SCHEDULE },
    flow,
    createdAt: now,
    updatedAt: now,
  };
  await saveCampaign(campaign);
  return NextResponse.json(campaign);
}
