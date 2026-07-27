import { NextRequest, NextResponse } from "next/server";
import { deleteCampaign, getCampaign, saveCampaign } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const c = await getCampaign(id);
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(c);
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const existing = await getCampaign(id);
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = await req.json();
  const merged = { ...existing, ...body, id };
  await saveCampaign(merged);
  return NextResponse.json(merged);
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await deleteCampaign(id);
  return NextResponse.json({ ok: true });
}
