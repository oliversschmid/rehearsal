import { AgentRail } from "@/components/rail/AgentRail";

export default function CampaignDetailLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="grid min-h-screen"
      style={{ gridTemplateColumns: "minmax(0, 1fr) 360px" }}
    >
      <div className="min-w-0">{children}</div>
      <AgentRail />
    </div>
  );
}
