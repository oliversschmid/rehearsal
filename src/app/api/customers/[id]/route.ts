import { NextRequest, NextResponse } from "next/server";
import { getCustomer } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const c = getCustomer(id);
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(c);
}
