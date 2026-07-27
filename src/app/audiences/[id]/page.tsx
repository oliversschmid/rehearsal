import Link from "next/link";
import { notFound } from "next/navigation";
import { getAudienceGroup, getCustomers } from "@/lib/store";
import { GroundingChip } from "@/components/ScoreBadge";
import { ColoredTag } from "@/components/ColoredTag";
import { BarChart } from "@/components/charts/Charts";
import {
  aggregateMetrics,
  fourteenDayChange,
  simulatedTwinCountFor,
  sourcePoolFor,
  themeLabel,
  twinAmplificationFor,
  twinDeltaFor,
} from "@/lib/audienceMetrics";
import { buildTwinBio } from "@/lib/twinBio";
import type { TicketTheme } from "@/lib/types";
import { SegmentDetailRail } from "./SegmentDetailRail";

export const dynamic = "force-dynamic";

export default async function AudienceDetailPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await props.params;
  const search = await props.searchParams;
  const activeTheme = (search?.theme as string) as TicketTheme | undefined;
  const group = await getAudienceGroup(id);
  if (!group) return notFound();
  const allSampleCustomers = getCustomers().filter((c) => group.memberIds.includes(c.id));

  const sampleSize = allSampleCustomers.length;
  const pool = sourcePoolFor(group.id);
  const twinCount = simulatedTwinCountFor(group.id, pool);
  const amp = twinAmplificationFor(group.id);
  const realDelta = fourteenDayChange(group.id, pool);
  const twinDelta = twinDeltaFor(realDelta, twinCount, pool);
  const agg = aggregateMetrics(allSampleCustomers);
  const perCustomer = pool || 1;
  const scale = pool / (sampleSize || 1);
  const realRevenue = Math.round(agg.totalRevenue * scale);
  const realOrders = Math.round(agg.orderCount * scale);
  const realTickets = Math.round(agg.ticketCount * scale);
  const avgRevenuePerRealCustomer = Math.round(realRevenue / perCustomer);
  const topTheme = agg.topTicketThemes[0];

  const customers = activeTheme
    ? allSampleCustomers.filter((c) => c.tickets.some((t) => t.theme === activeTheme))
    : allSampleCustomers;

  const bio = buildTwinBio(group.name, group.description ?? "", allSampleCustomers, agg);
  const recency = engagementRecency(allSampleCustomers, twinCount);

  const realCustomersRail = {
    headline: fmt(pool),
    deltaLabel: deltaLabel(realDelta),
    rows: [
      { label: "Est. revenue", value: `$${fmt(realRevenue)}`, sub: "last 90 days" },
      {
        label: "Orders",
        value: fmt(realOrders),
        sub: avgRevenuePerRealCustomer > 0 ? `$${fmt(avgRevenuePerRealCustomer)} avg per customer` : undefined,
      },
      {
        label: "Support tickets",
        value: fmt(realTickets),
        sub: `${Math.round(agg.ticketResolutionRate * 100)}% resolved`,
      },
      {
        label: "Top complaint",
        value: topTheme ? themeLabel(topTheme.theme) : "None",
        sub: topTheme ? `${topTheme.count} in sample` : undefined,
      },
    ],
  };
  const simulatedTwinsRail = {
    headline: fmt(twinCount),
    deltaLabel: deltaLabel(twinDelta || 0, `${amp}× amp`),
    rows: [
      { label: "Avg opens (90d)", value: agg.avgOpensLast90d.toFixed(1), sub: `${agg.avgClicksLast90d.toFixed(1)} avg clicks` },
      { label: "Avg orders / twin", value: agg.avgOrdersPerTwin.toFixed(1), sub: `${fmt(agg.orderCount)} total in sample` },
      { label: "SMS opt-in", value: `${Math.round(agg.smsOptInRate * 100)}%`, sub: `${fmt(agg.smsOptedIn)} / ${fmt(twinCount)} opted in` },
      {
        label: "Unsub risk",
        value: `${Math.round(((agg.unsubRisk.med + agg.unsubRisk.high) / (twinCount || 1)) * 100)}%`,
        sub: `${agg.unsubRisk.high} high · ${agg.unsubRisk.med} med`,
      },
    ],
  };

  return (
    <div className="max-w-6xl mx-auto p-8">
      <SegmentDetailRail
        segmentName={group.name}
        bio={bio}
        topThemes={agg.topTicketThemes}
        activeTheme={activeTheme ?? null}
        stats={{ realCustomers: realCustomersRail, simulatedTwins: simulatedTwinsRail }}
      />

      <div className="text-[12px] text-[var(--muted)]">
        <Link href="/audiences" className="hover:underline">Audiences</Link>
      </div>
      <h1 className="text-2xl font-semibold tracking-tight mt-1">{group.name}</h1>
      <p className="text-sm text-[var(--muted)] mt-1">{group.description}</p>

      <div className="mt-6 card p-4">
        <div className="flex items-start justify-between mb-2 gap-4">
          <div className="min-w-0">
            <div className="text-[13.5px] font-semibold">Engagement recency</div>
            <div className="text-[11.5px] text-[var(--muted)] mt-0.5">
              Days since each twin last opened an email — how warm this audience is right now.
            </div>
          </div>
          <div className="flex gap-4 shrink-0 text-right">
            <MiniStat label="Avg" value={`${recency.avgDays}d`} />
            <MiniStat label="Warm" value={`${recency.warmPct}%`} sub="≤ 30d" />
            <MiniStat label="Cold" value={`${recency.coldPct}%`} sub="90+ d" />
          </div>
        </div>
        <BarChart data={recency.bins} height={150} />
        <div className="mt-2 text-[11px] text-[var(--muted-2)] text-center">{recency.summary}</div>
      </div>

      <h3 className="text-[11px] uppercase tracking-wider text-[var(--muted)] mt-8 mb-3">
        Rehearsal sample · {customers.length} representative twins
        {activeTheme && (
          <>
            <span className="mx-2">·</span>
            filtered by <span className="text-[var(--foreground)]">{themeLabel(activeTheme)}</span>{" "}
            <Link href={`/audiences/${id}`} className="text-[var(--accent)] hover:underline">
              clear
            </Link>
          </>
        )}
      </h3>
      <div className="card overflow-hidden">
        <table className="v2-table w-full text-sm">
          <thead>
            <tr className="text-left">
              <th className="px-5 py-3">Name</th>
              <th className="px-5 py-3" title="Rehearsal signal — how much real data backs this twin.">Signal</th>
              <th className="px-5 py-3">Orders</th>
              <th className="px-5 py-3">Tickets</th>
              <th className="px-5 py-3">Traits</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id}>
                <td className="px-5 py-3">
                  <Link className="font-medium hover:text-[var(--accent)]" href={`/audiences/customer/${c.id}`}>{c.firstName} {c.lastInitial}.</Link>
                </td>
                <td className="px-5 py-3">
                  <GroundingChip quality={c.groundingQuality} />
                </td>
                <td className="px-5 py-3">{c.orders.length}</td>
                <td className="px-5 py-3">{c.tickets.length}</td>
                <td className="px-5 py-3">
                  <div className="flex gap-1 flex-wrap">
                    {c.traits.slice(0, 3).map((t) => <ColoredTag key={t.label} label={t.label} />)}
                    {c.traits.length > 3 && <span className="text-[11px] text-[var(--muted)]">+{c.traits.length - 3}</span>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MiniStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] leading-none">{label}</div>
      <div className="text-[16px] font-semibold tabular-nums leading-none mt-1">{value}</div>
      {sub && <div className="text-[9.5px] text-[var(--muted-2)] mt-0.5 leading-none">{sub}</div>}
    </div>
  );
}

type Recency = {
  bins: { label: string; value: number }[];
  avgDays: number;
  warmPct: number;
  coldPct: number;
  summary: string;
};

function engagementRecency(
  customers: { engagement: { lastOpenDaysAgo: number } }[],
  twinCount: number,
): Recency {
  const buckets: { label: string; test: (d: number) => boolean }[] = [
    { label: "0–14d", test: (d) => d <= 14 },
    { label: "15–30d", test: (d) => d > 14 && d <= 30 },
    { label: "31–60d", test: (d) => d > 30 && d <= 60 },
    { label: "61–90d", test: (d) => d > 60 && d <= 90 },
    { label: "90+ d", test: (d) => d > 90 },
  ];
  const n = Math.max(1, customers.length);
  const scale = twinCount / n;
  const counts = buckets.map((b) => customers.filter((c) => b.test(c.engagement.lastOpenDaysAgo)).length);
  const bins = counts.map((raw, i) => ({ label: buckets[i].label, value: Math.round(raw * scale) }));
  const totalDays = customers.reduce((s, c) => s + c.engagement.lastOpenDaysAgo, 0);
  const avgDays = Math.round(totalDays / n);
  const warmRaw = counts[0] + counts[1];
  const coldRaw = counts[4];
  const warmPct = Math.round((warmRaw / n) * 100);
  const coldPct = Math.round((coldRaw / n) * 100);
  const summary = avgDays <= 30
    ? "Warm cohort — most twins opened recently."
    : avgDays <= 60
      ? "Mixed engagement — a re-warm-up campaign is a fair bet."
      : "Cold cohort — expect low open rates without a winback angle.";
  return { bins, avgDays, warmPct, coldPct, summary };
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

function deltaLabel(value: number, prefix?: string): string | undefined {
  if (!value && !prefix) return undefined;
  const parts: string[] = [];
  if (prefix) parts.push(prefix);
  if (value) {
    const sign = value > 0 ? "+" : "−";
    parts.push(`${sign}${fmt(Math.abs(value))} 14d`);
  }
  return parts.join(" · ");
}
