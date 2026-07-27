import { NextResponse } from "next/server";
import { currentCopilotEngine } from "@/lib/copilot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(currentCopilotEngine());
}
