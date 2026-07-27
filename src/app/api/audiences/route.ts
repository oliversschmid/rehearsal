import { NextRequest, NextResponse } from "next/server";
import { getAudienceGroups, getCustomers, saveAudienceGroup } from "@/lib/store";
import type { AudienceGroup } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  const groups = getAudienceGroups();
  const customers = getCustomers();
  const enriched = groups.map((g) => {
    const members = customers.filter((c) => g.memberIds.includes(c.id));
    const grounding = { rich: 0, medium: 0, thin: 0 };
    for (const m of members) grounding[m.groundingQuality]++;
    return { ...g, memberCount: members.length, grounding };
  });
  return NextResponse.json({
    groups: enriched,
    census: {
      customerCount: customers.length,
      orderCount: customers.reduce((s, c) => s + c.orders.length, 0),
      ticketCount: customers.reduce((s, c) => s + c.tickets.length, 0),
    },
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const id = body.id ?? `ag-${Date.now()}`;
  const group: AudienceGroup = {
    id,
    name: String(body.name ?? "Untitled audience"),
    description: String(body.description ?? ""),
    memberIds: [...new Set<string>(body.memberIds ?? [])],
    source: body.source ?? "support-signal",
  };
  await saveAudienceGroup(group);
  return NextResponse.json(group);
}
