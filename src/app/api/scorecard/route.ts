import { NextResponse } from "next/server";
import { getScorecard, scorecardWinRate } from "@/lib/store";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    entries: getScorecard(),
    winRate: scorecardWinRate(),
    biasNote:
      "Overestimated VIP opens by ~12% in early runs — corrected in the current calibration.",
  });
}
