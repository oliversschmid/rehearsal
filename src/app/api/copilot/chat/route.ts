import { NextRequest, NextResponse } from "next/server";
import { getCampaign, saveCampaign } from "@/lib/store";
import { copilotChat } from "@/lib/copilot";
import type { CopilotMessage } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { campaignId, message } = await req.json();
  const campaign = await getCampaign(campaignId);
  if (!campaign) return NextResponse.json({ error: "not found" }, { status: 404 });

  const now = new Date().toISOString();
  const userMsg: CopilotMessage = { id: msgId(), role: "user", content: message, createdAt: now };
  campaign.copilotHistory = [...(campaign.copilotHistory ?? []), userMsg];
  await saveCampaign(campaign);

  const { reply, intent } = await copilotChat(campaign, message);
  const assistantMsg: CopilotMessage = { id: msgId(), role: "assistant", content: reply, createdAt: new Date().toISOString() };
  campaign.copilotHistory = [...(campaign.copilotHistory ?? []), assistantMsg];
  await saveCampaign(campaign);

  return NextResponse.json({ reply: assistantMsg, intent });
}

function msgId(): string {
  return `m-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}
