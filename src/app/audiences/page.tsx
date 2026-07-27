import Link from "next/link";
import { getAudienceGroups, getCustomers } from "@/lib/store";
import { NewAudienceGroupButton } from "@/components/NewAudienceGroupButton";
import { ColoredTag } from "@/components/ColoredTag";
import {
  aggregateMetrics,
  fourteenDayChange,
  simulatedTwinCountFor,
  sourcePoolFor,
  thirtyDayTrend,
  twinDeltaFor,
} from "@/lib/audienceMetrics";
import { TwoLineChart } from "@/components/charts/Charts";
import { AudiencesOverviewRail } from "./AudiencesOverviewRail";
import type { Customer } from "@/lib/types";

export const dynamic = "force-dynamic";

export default function AudiencesPage() {
  const groups = getAudienceGroups();
  const customers = getCustomers();
  const agg = aggregateMetrics(customers);

  const totalRealCustomers = groups.reduce((s, g) => s + sourcePoolFor(g.id), 0);
  const totalSimulatedTwins = groups.reduce((s, g) => s + simulatedTwinCountFor(g.id, sourcePoolFor(g.id)), 0);
  const totalNetChange14d = groups.reduce((s, g) => s + fourteenDayChange(g.id, sourcePoolFor(g.id)), 0);
  const twinNetChange14d = groups.reduce((s, g) => {
    const pool = sourcePoolFor(g.id);
    const twins = simulatedTwinCountFor(g.id, pool);
    return s + twinDeltaFor(fourteenDayChange(g.id, pool), twins, pool);
  }, 0);
  const scaleFactor = customers.length ? totalRealCustomers / customers.length : 1;
  const totalRevenue90d = Math.round(agg.totalRevenue * scaleFactor);

  const realTrend = thirtyDayTrend("all-audiences:real", totalRealCustomers);
  const twinTrend = thirtyDayTrend("all-audiences:twins", totalSimulatedTwins);

  const audienceBars = groups
    .map((g) => ({ label: g.name, value: sourcePoolFor(g.id) }))
    .sort((a, b) => b.value - a.value);
  const maxBar = audienceBars[0]?.value ?? 1;

  const amplification = totalRealCustomers ? totalSimulatedTwins / totalRealCustomers : 0;

  const rows = groups
    .map((g) => {
      const pool = sourcePoolFor(g.id);
      const twins = simulatedTwinCountFor(g.id, pool);
      const members = customers.filter((c) => g.memberIds.includes(c.id));
      const topTraits = topTraitsFor(members);
      return { g, pool, twins, topTraits };
    })
    .sort((a, b) => b.pool - a.pool);

  return (
    <div className="max-w-6xl mx-auto p-8">
      <AudiencesOverviewRail
        totals={{
          realCustomers: totalRealCustomers,
          simulatedTwins: totalSimulatedTwins,
          realDelta14d: totalNetChange14d,
          twinDelta14d: twinNetChange14d,
          amplification,
          revenue90d: totalRevenue90d,
        }}
        audienceBars={audienceBars.map((b) => ({ ...b, pct: (b.value / maxBar) * 100 }))}
      />

      <div className="flex items-start justify-between gap-6">
        <h1 className="text-2xl font-semibold tracking-tight">Audiences</h1>
        <NewAudienceGroupButton />
      </div>

      <div className="mt-6 card p-4">
        <div className="flex items-start justify-between mb-1 gap-4">
          <div className="min-w-0">
            <div className="text-[13.5px] font-semibold">Population growth · 30 days</div>
            <div className="text-[11.5px] text-[var(--muted)] mt-0.5">
              Real customers matched from Shopify + Gorgias vs. simulated twins amplified for rehearsal.
            </div>
          </div>
        </div>
        <TwoLineChart
          height={210}
          series={[
            { label: "Real customers", color: "#ff7a60", data: realTrend },
            { label: "Simulated twins", color: "#ffcabf", data: twinTrend },
          ]}
        />
      </div>

      <h3 className="mt-8 mb-3 text-[13px] font-semibold text-[var(--foreground)]">
        All audiences <span className="text-[var(--muted)] font-normal">· {groups.length}</span>
      </h3>
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}
      >
        {rows.map(({ g, pool, twins, topTraits }) => (
          <Link
            key={g.id}
            href={`/audiences/${g.id}`}
            className="card p-4 bg-white hover:border-[var(--border-strong)] transition-colors block"
          >
            <div className="text-[14px] font-semibold text-[var(--foreground)] truncate">
              {g.name}
            </div>
            <div className="text-[12px] text-[var(--muted)] mt-0.5 line-clamp-2 leading-relaxed">
              {g.description}
            </div>

            <div className="mt-3 flex items-baseline gap-4">
              <div>
                <div className="text-[10.5px] uppercase tracking-wider text-[var(--muted)] font-medium">
                  Real customers
                </div>
                <div className="text-[15px] font-semibold tabular-nums mt-0.5">
                  {pool.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-[10.5px] uppercase tracking-wider text-[var(--muted)] font-medium">
                  Simulated twins
                </div>
                <div className="text-[15px] font-semibold tabular-nums mt-0.5 text-[var(--muted)]">
                  {twins.toLocaleString()}
                </div>
              </div>
            </div>

            {topTraits.length > 0 && (
              <div className="mt-3 flex gap-1 flex-wrap">
                {topTraits.slice(0, 3).map((t) => (
                  <ColoredTag key={t} label={t} />
                ))}
              </div>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}

function topTraitsFor(members: Customer[]): string[] {
  const tally = new Map<string, number>();
  for (const c of members) {
    for (const t of c.traits) tally.set(t.label, (tally.get(t.label) ?? 0) + 1);
  }
  return [...tally.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([label]) => label);
}
