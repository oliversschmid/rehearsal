import type { Customer, TicketTheme } from "./types";

/** Deterministic FNV-1a hash used for stable, hash-derived metrics. */
export function hash(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Real-customer segment size in the connected source. Always ≥ 1,500 —
 * production audiences are large. The seeded twins we use for rehearsal
 * are a representative sub-sample of this pool.
 */
export function sourcePoolFor(groupId: string, _sampleTwinCount?: number): number {
  const seed = hash(groupId + "pool");
  // 1,500 to ~25,000 range; higher-hashing audiences get bigger pools
  const base = 1500 + (seed % 23500);
  return base;
}

/**
 * Simulated twin count for display — twins amplify real customers 3–6×.
 * Distinct from the small rehearsal sample used to actually run twin responses.
 */
export function simulatedTwinCountFor(groupId: string, pool: number): number {
  const factor = 3 + (hash(groupId + "amp") % 4); // 3, 4, 5, or 6
  return pool * factor;
}

/** Amplification factor used by this audience (3–6). */
export function twinAmplificationFor(groupId: string): number {
  return 3 + (hash(groupId + "amp") % 4);
}

/** Net change in matching real customers over the past 14 days. */
export function fourteenDayChange(groupId: string, poolSize: number): number {
  const r = hash(groupId + "14d");
  const sign = (r & 1) === 0 ? 1 : -1;
  // 0.5%–3% of pool for meaningful visible movement
  const pctBps = 50 + (r % 250); // 50–299 basis points
  const magnitude = Math.max(1, Math.round((poolSize * pctBps) / 10000));
  return sign * magnitude;
}

/** Twin delta = real delta × amplification factor. */
export function twinDeltaFor(realDelta: number, twinCountOrPool: number, pool: number): number {
  return Math.round(realDelta * (twinCountOrPool / pool));
}

export type AggregateMetrics = {
  twinCount: number;
  orderCount: number;
  ticketCount: number;
  totalRevenue: number;              // sum of order totals (last 90d assumption for demo)
  avgOrdersPerTwin: number;
  avgOpensLast90d: number;
  avgClicksLast90d: number;
  smsOptedIn: number;
  smsOptInRate: number;               // 0..1
  unsubRisk: { low: number; med: number; high: number };
  ticketsResolved: number;
  ticketResolutionRate: number;       // 0..1
  topTicketThemes: { theme: TicketTheme; count: number }[];
  grounding: { rich: number; medium: number; thin: number };
};

/** Compute aggregate marketing metrics for an arbitrary customer subset. */
export function aggregateMetrics(customers: Customer[]): AggregateMetrics {
  const n = customers.length || 1;
  let orderCount = 0;
  let ticketCount = 0;
  let totalRevenue = 0;
  let opensSum = 0;
  let clicksSum = 0;
  let smsOptedIn = 0;
  const unsubRisk = { low: 0, med: 0, high: 0 };
  let ticketsResolved = 0;
  const themeTally = new Map<TicketTheme, number>();
  const grounding = { rich: 0, medium: 0, thin: 0 };

  for (const c of customers) {
    orderCount += c.orders.length;
    ticketCount += c.tickets.length;
    for (const o of c.orders) totalRevenue += o.total;
    opensSum += c.engagement.opensLast90d;
    clicksSum += c.engagement.clicksLast90d;
    if (c.engagement.smsOptedIn) smsOptedIn++;
    unsubRisk[c.engagement.unsubRisk]++;
    for (const t of c.tickets) {
      themeTally.set(t.theme, (themeTally.get(t.theme) ?? 0) + 1);
      if (t.resolved) ticketsResolved++;
    }
    grounding[c.groundingQuality]++;
  }

  const topTicketThemes = [...themeTally.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([theme, count]) => ({ theme, count }));

  return {
    twinCount: customers.length,
    orderCount,
    ticketCount,
    totalRevenue: Math.round(totalRevenue),
    avgOrdersPerTwin: orderCount / n,
    avgOpensLast90d: opensSum / n,
    avgClicksLast90d: clicksSum / n,
    smsOptedIn,
    smsOptInRate: smsOptedIn / n,
    unsubRisk,
    ticketsResolved,
    ticketResolutionRate: ticketCount ? ticketsResolved / ticketCount : 0,
    topTicketThemes,
    grounding,
  };
}

/**
 * Deterministic 30-day trend series (per audience or global) — used for the
 * line chart. Each point is a day label + a value that drifts around a base.
 */
export function thirtyDayTrend(seed: string, base: number, options?: { startDate?: Date }): { label: string; value: number }[] {
  const start = options?.startDate ?? new Date();
  const out: { label: string; value: number }[] = [];
  let value = Math.max(1, Math.round(base * 0.85));
  const target = base;
  for (let i = 29; i >= 0; i--) {
    const d = new Date(start);
    d.setDate(d.getDate() - i);
    const h = hash(seed + ":" + i);
    // drift with random walk that trends toward `target`
    const noise = ((h % 2000) - 1000) / 10000; // -10%..+10%
    const pull = (target - value) * 0.08;
    value = Math.max(0, Math.round(value + pull + value * noise));
    out.push({
      label: `${d.getMonth() + 1}/${d.getDate()}`,
      value,
    });
  }
  // Ensure last point matches current base for continuity
  out[out.length - 1].value = base;
  return out;
}

const THEME_LABEL: Record<TicketTheme, string> = {
  "shipping-delay": "Shipping delays",
  "shade-mismatch": "Shade mismatches",
  "subscription-cancel": "Subscription cancels",
  "ingredient-question": "Ingredient questions",
  "damaged-item": "Damaged items",
  "discount-request": "Discount requests",
};
export function themeLabel(t: TicketTheme): string {
  return THEME_LABEL[t] ?? t;
}
