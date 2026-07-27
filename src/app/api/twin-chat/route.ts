import { NextRequest, NextResponse } from "next/server";
import { getCustomer } from "@/lib/store";
import { twinChat } from "@/lib/llm";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { customerId, message, history } = await req.json();
  const twin = getCustomer(customerId);
  if (!twin) return NextResponse.json({ error: "not found" }, { status: 404 });
  const result = await twinChat(twin, history ?? [], message);
  return NextResponse.json(result);
}
