import type { AggregateMetrics } from "./audienceMetrics";
import type { Customer } from "./types";

export type TwinBioStat = { label: string; value: string };

export type TwinBioSnapshot = {
  persona: string;
  traits: string[];
  stats: TwinBioStat[];
  details: { label: string; value: string }[];
};

/**
 * Build an "average twin" bio for a segment — a persona sentence, top traits,
 * three headline averages, and a details list (tenure, recency, preferred
 * channel, sentiment, favorite product) so the rail reads like a customer
 * profile rather than a stats dashboard.
 */
export function buildTwinBio(
  segmentName: string,
  segmentDescription: string,
  customers: Customer[],
  agg: AggregateMetrics,
): TwinBioSnapshot {
  const n = Math.max(1, customers.length);

  const traitTally = new Map<string, number>();
  for (const c of customers) {
    for (const t of c.traits) traitTally.set(t.label, (traitTally.get(t.label) ?? 0) + 1);
  }
  const traits = [...traitTally.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([label]) => label);
  const topTrait = traits[0] ?? segmentName.toLowerCase();

  const opensPhrase = agg.avgOpensLast90d >= 8
    ? "opens most sends"
    : agg.avgOpensLast90d >= 3
      ? "opens occasionally"
      : "rarely opens";
  const orderPhrase = agg.avgOrdersPerTwin >= 3
    ? "a repeat buyer"
    : agg.avgOrdersPerTwin >= 1.2
      ? "a returning buyer"
      : "a one-time buyer";
  const smsPhrase = agg.smsOptInRate >= 0.5 ? "opted in to SMS" : "email-only";
  const descriptor = (segmentDescription?.trim() || `in the ${segmentName} cohort`)
    .replace(/\.$/, "")
    .toLowerCase();

  const persona = `Typically ${orderPhrase} ${descriptor} — ${opensPhrase}, ${smsPhrase}, often flagged as ${topTrait}.`;

  const stats: TwinBioStat[] = [
    { label: "Avg orders", value: agg.avgOrdersPerTwin.toFixed(1) },
    { label: "Avg opens 90d", value: agg.avgOpensLast90d.toFixed(1) },
    { label: "Tickets/twin", value: (agg.ticketCount / n).toFixed(1) },
  ];

  const now = Date.now();
  const tenureDays =
    customers.reduce((sum, c) => sum + (now - new Date(c.createdAt).getTime()) / 86400_000, 0) / n;
  const tenureLabel =
    tenureDays >= 730 ? `${(tenureDays / 365).toFixed(1)} yrs` : `${Math.round(tenureDays / 30)} mo`;

  const recencyDays = customers.reduce((sum, c) => sum + c.engagement.lastOpenDaysAgo, 0) / n;
  const recencyLabel = recencyDays >= 45
    ? `${Math.round(recencyDays)}d ago (cold)`
    : recencyDays >= 14
      ? `${Math.round(recencyDays)}d ago`
      : `${Math.round(recencyDays)}d ago (warm)`;

  const preferredChannel = agg.smsOptInRate >= 0.5 ? "Email + SMS" : "Email only";

  const highRisk = agg.unsubRisk.high;
  const sentiment = highRisk / n > 0.15
    ? "Unsub-prone"
    : agg.ticketResolutionRate >= 0.8
      ? "Well supported"
      : agg.ticketCount / n > 0.4
        ? "Support-heavy"
        : "Neutral";

  const productTally = new Map<string, number>();
  for (const c of customers) {
    for (const o of c.orders) {
      for (const item of o.items) productTally.set(item.name, (productTally.get(item.name) ?? 0) + 1);
    }
  }
  const favProduct = [...productTally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  const avgSpend = n > 0 && agg.orderCount > 0
    ? Math.round(agg.totalRevenue / agg.orderCount)
    : 0;

  const details: TwinBioSnapshot["details"] = [
    { label: "Tenure", value: tenureLabel },
    { label: "Last open", value: recencyLabel },
    { label: "Preferred channel", value: preferredChannel },
    { label: "Avg order value", value: avgSpend > 0 ? `$${avgSpend}` : "—" },
    { label: "Sentiment", value: sentiment },
    ...(favProduct ? [{ label: "Favors", value: favProduct }] : []),
  ];

  return { persona, traits, stats, details };
}
