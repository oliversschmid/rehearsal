"use client";
import { useRail } from "./RailContext";
import { CopilotDock } from "./CopilotDock";

/**
 * Fixed shell for the right-hand rail. The header + scroll body are driven
 * by whatever the current page pushed into the RailContext via <RailSlot>.
 * The CopilotDock at the bottom is always present.
 */
export function AgentRail() {
  const { slot } = useRail();
  return (
    <aside
      className="border-l border-[var(--border)] bg-white flex flex-col min-h-0"
      style={{ height: "100vh", position: "sticky", top: 0, alignSelf: "start" }}
    >
      {!slot?.hideHeader && (
        <RailContextHeader
          label={slot?.headerLabel ?? "Agent"}
          title={slot?.headerTitle ?? ""}
          aside={slot?.headerAside}
        />
      )}
      {slot?.bodyFillHeight ? (
        <div className="flex-1 min-h-0 overflow-hidden">
          {slot?.body ?? <RailEmpty />}
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-3">
          {slot?.body ?? <RailEmpty />}
        </div>
      )}
      {!slot?.hideDock && (
        <CopilotDock placeholder={slot?.dockPlaceholder} campaignId={slot?.campaignId} />
      )}
    </aside>
  );
}

export function RailContextHeader({
  label,
  title,
  aside,
}: {
  label: string;
  title: string;
  aside?: React.ReactNode;
}) {
  return (
    <div className="shrink-0 px-4 py-3 border-b border-[var(--border)] bg-white">
      <div className="text-[10.5px] uppercase tracking-wider text-[var(--muted)] font-medium">
        {label}
      </div>
      <div className="mt-0.5 flex items-center gap-2">
        {title && (
          <div className="text-[13.5px] font-semibold text-[var(--foreground)] truncate min-w-0" title={title}>
            {title}
          </div>
        )}
        {aside && <div className="ml-auto shrink-0">{aside}</div>}
      </div>
    </div>
  );
}

function RailEmpty() {
  return (
    <div className="text-[12px] text-[var(--muted-2)] text-center py-6">
      Nothing to show here yet.
    </div>
  );
}
