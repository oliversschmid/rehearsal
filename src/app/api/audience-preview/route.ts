import { NextRequest, NextResponse } from "next/server";
import { getCustomers } from "@/lib/store";
import type { TicketTheme } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { themes } = (await req.json()) as { themes: TicketTheme[] };
  const set = new Set(themes ?? []);
  const customers = getCustomers();
  const matches = customers
    .map((c) => {
      const hitTickets = c.tickets.filter((t) => set.has(t.theme));
      if (!hitTickets.length) return null;
      return {
        id: c.id,
        name: `${c.firstName} ${c.lastInitial}.`,
        grounding: c.groundingQuality,
        orderCount: c.orders.length,
        matchingTickets: hitTickets.map((t) => ({
          id: t.id,
          theme: t.theme,
          date: t.date,
          excerpt: t.excerpt,
        })),
      };
    })
    .filter((x) => x !== null);
  return NextResponse.json({ matches });
}
