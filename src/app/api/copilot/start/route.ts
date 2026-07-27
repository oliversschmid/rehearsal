import { NextRequest, NextResponse } from "next/server";
import { getAudienceGroup, saveCampaign } from "@/lib/store";
import { DEFAULT_SCHEDULE } from "@/lib/types";
import { copilotChat, generateCampaignMeta } from "@/lib/copilot";
import type { Campaign, CampaignTag, CopilotContext, CopilotMessage, Flow } from "@/lib/types";

export const runtime = "nodejs";

/** Starts a copilot session — creates a Draft campaign with copilotMode=true and seeds the chat. */
export async function POST(req: NextRequest) {
  const body = (await req.json()) as { prompt: string; context: CopilotContext };
  const now = new Date().toISOString();
  const id = `co-${Date.now()}`;
  const audience = body.context.audienceGroupId ? await getAudienceGroup(body.context.audienceGroupId) : null;
  const audienceLabel = audience ? `enters audience: ${audience.name}` : "enters audience";

  const flow: Flow = {
    rootId: "n1",
    nodes: {
      n1: { id: "n1", type: "trigger", audienceLabel },
    },
  };

  const { name, description } = await generateCampaignMeta(body.prompt, body.context);

  // Build the campaign with EMPTY history so copilotChat sees a clean slate.
  // If we pre-populated history with the user prompt, copilotChat would also
  // append body.prompt as the latest turn — sending the message twice to Claude
  // and confusing it into a generic reply.
  const campaign: Campaign = {
    id,
    name,
    goal: description,
    audienceGroupId: body.context.audienceGroupId ?? "",
    tags: inferTags(body.prompt, audience?.name),
    status: "draft",
    schedule: { ...DEFAULT_SCHEDULE },
    flow,
    createdAt: now,
    updatedAt: now,
    copilotMode: true,
    copilotState: "gathering",
    copilotContext: body.context,
    copilotHistory: [],
  };
  await saveCampaign(campaign);

  // Generate copilot's first response. forceChat guarantees the first turn is
  // conversational (never an immediate "drafting…" acknowledgement) even when
  // the prompt contains trigger phrases like "start" or "generate".
  const { reply } = await copilotChat(campaign, body.prompt, { forceChat: true });

  // Now write both turns to history in a single save.
  const userMsg: CopilotMessage = { id: msgId(), role: "user", content: body.prompt, createdAt: now };
  const assistantMsg: CopilotMessage = {
    id: msgId(),
    role: "assistant",
    content: reply,
    createdAt: new Date().toISOString(),
  };
  campaign.copilotHistory = [userMsg, assistantMsg];
  await saveCampaign(campaign);

  return NextResponse.json({ id });
}

function inferTags(prompt: string, audienceName?: string): CampaignTag[] {
  const s = `${prompt} ${audienceName ?? ""}`.toLowerCase();
  const tags: CampaignTag[] = [];
  if (/reactivat|winback|win back|lapsed|come back|return/.test(s)) tags.push("winback");
  if (/launch|new product|drop|introduc|debut/.test(s)) tags.push("launch");
  if (/discount|off|% off|promo|sale|save/.test(s)) tags.push("promo");
  if (!tags.length) tags.push("newsletter");
  return tags;
}

function msgId(): string {
  return `m-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}
