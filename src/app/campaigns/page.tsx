import Link from "next/link";
import { getAudienceGroups, getCampaigns } from "@/lib/store";
import { StatusBadge } from "@/components/ScoreBadge";
import { ScoreBars } from "@/components/ScoreBars";
import { ColoredTag } from "@/components/ColoredTag";
import { NewCampaignActionCards } from "@/components/NewCampaignActionCards";
import type { Campaign, CampaignStatus } from "@/lib/types";
import { TAG_LABEL } from "@/lib/types";

export const dynamic = "force-dynamic";

const PRE_LAUNCH: CampaignStatus[] = ["draft", "rehearsed", "send-ready"];
const LIVE: CampaignStatus[] = ["active", "paused"];
const COMPLETED: CampaignStatus[] = ["sent", "completed"];

export default async function CampaignsPage() {
  const campaigns = getCampaigns();
  const audiences = getAudienceGroups();
  const audMap = new Map(audiences.map((a) => [a.id, a.name]));

  const preLaunch = campaigns.filter((c) => PRE_LAUNCH.includes(c.status));
  const live = campaigns.filter((c) => LIVE.includes(c.status));
  const completed = campaigns.filter((c) => COMPLETED.includes(c.status));
  const archived = campaigns.filter((c) => c.status === "archived");

  return (
    <div className="max-w-6xl mx-auto p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Campaigns</h1>

      <div className="mt-6">
        <NewCampaignActionCards audiences={audiences.map((a) => ({ id: a.id, name: a.name }))} />
      </div>

      <Section title="In progress" count={preLaunch.length}>
        {preLaunch.length === 0 ? (
          <EmptyRow copy="Nothing in progress." />
        ) : (
          <CampaignTable rows={preLaunch} audMap={audMap} />
        )}
      </Section>

      {live.length > 0 && (
        <Section title="Live" count={live.length}>
          <CampaignTable rows={live} audMap={audMap} />
        </Section>
      )}

      <Section title="Completed" count={completed.length}>
        {completed.length === 0 ? (
          <EmptyRow copy="No completed campaigns yet." />
        ) : (
          <CampaignTable rows={completed} audMap={audMap} />
        )}
      </Section>

      {archived.length > 0 && (
        <Section title="Archived" count={archived.length}>
          <CampaignTable rows={archived} audMap={audMap} />
        </Section>
      )}
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-[13px] font-semibold text-[var(--foreground)] mb-3">
        {title} <span className="text-[var(--muted)] font-normal">· {count}</span>
      </h2>
      {children}
    </section>
  );
}

function EmptyRow({ copy }: { copy: string }) {
  return <div className="px-2 py-8 text-center text-sm text-[var(--muted)]">{copy}</div>;
}

function CampaignTable({
  rows,
  audMap,
}: {
  rows: Campaign[];
  audMap: Map<string, string>;
}) {
  return (
    <table className="v2-table w-full text-sm" style={{ tableLayout: "fixed" }}>
      <colgroup>
        <col style={{ width: "30%" }} />
        <col style={{ width: "14%" }} />
        <col style={{ width: "14%" }} />
        <col style={{ width: "22%" }} />
        <col style={{ width: "20%" }} />
      </colgroup>
      <thead>
        <tr className="text-left">
          <th className="px-3 py-2">Name</th>
          <th className="px-3 py-2">Score</th>
          <th className="px-3 py-2">Status</th>
          <th className="px-3 py-2">Audience</th>
          <th className="px-3 py-2">Tags</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((c) => (
          <tr key={c.id}>
            <td className="px-3 py-2.5 truncate">
              <Link
                className="font-medium text-[var(--foreground)] hover:text-[var(--accent)]"
                href={`/campaigns/${c.id}`}
              >
                {c.name}
              </Link>
            </td>
            <td className="px-3 py-2.5">
              <ScoreBars value={c.lastScore} />
            </td>
            <td className="px-3 py-2.5"><StatusBadge status={c.status} /></td>
            <td className="px-3 py-2.5 text-[var(--muted)] text-[12.5px] truncate">{audMap.get(c.audienceGroupId) ?? "—"}</td>
            <td className="px-3 py-2.5">
              <div className="flex gap-1 flex-wrap">
                {c.tags.map((t) => (
                  <ColoredTag key={t} label={TAG_LABEL[t] ?? t} />
                ))}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
