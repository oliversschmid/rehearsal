"use client";
import { ColoredTag } from "../../ColoredTag";

export type TwinBio = {
  persona: string;
  traits: string[];
  stats: { label: string; value: string }[];
  details: { label: string; value: string }[];
};

export function TwinBioCard({ bio, segmentName }: { bio: TwinBio; segmentName: string }) {
  return (
    <div className="card p-4">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-full bg-[var(--accent-soft)] text-[var(--foreground)] grid place-items-center shrink-0">
          <PersonIcon />
        </div>
        <div className="min-w-0">
          <div className="text-[10.5px] uppercase tracking-wider text-[var(--muted)] font-medium">
            Average twin
          </div>
          <div className="text-[13px] font-semibold leading-tight mt-0.5 truncate">{segmentName}</div>
        </div>
      </div>

      <p className="text-[12.5px] text-[var(--foreground)] mt-3 leading-relaxed">
        {bio.persona}
      </p>

      {bio.traits.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-3">
          {bio.traits.map((t) => (
            <ColoredTag key={t} label={t} />
          ))}
        </div>
      )}

      {bio.stats.length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {bio.stats.map((s) => (
            <div key={s.label} className="rounded-md bg-gray-50 px-2 py-1.5">
              <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-medium leading-none">
                {s.label}
              </div>
              <div className="text-[13px] font-semibold tabular-nums mt-1 leading-none">
                {s.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {bio.details.length > 0 && (
        <ul className="mt-3 pt-3 border-t border-[var(--border)] space-y-1.5 text-[12px]">
          {bio.details.map((d) => (
            <li key={d.label} className="flex justify-between items-baseline gap-3">
              <span className="text-[var(--muted)]">{d.label}</span>
              <span className="text-[var(--foreground)] font-medium text-right truncate">{d.value}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PersonIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
    </svg>
  );
}
