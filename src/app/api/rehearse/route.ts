import { NextRequest } from "next/server";
import { getCampaign } from "@/lib/store";
import { streamRehearsal } from "@/lib/rehearse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { campaignId } = await req.json();
  const campaign = await getCampaign(campaignId);
  if (!campaign) return new Response("not found", { status: 404 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      try {
        for await (const ev of streamRehearsal(campaign)) {
          send(ev);
          if (ev.type === "final") break;
        }
        controller.close();
      } catch (e) {
        send({ type: "error", message: (e as Error).message });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
