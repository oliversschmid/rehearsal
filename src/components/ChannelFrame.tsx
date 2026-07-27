"use client";
import type { MessageContent } from "@/lib/types";

export function ChannelFrame({ content }: { content: MessageContent }) {
  if (content.channel === "email") {
    const e = content.email;
    return (
      <div className="card overflow-hidden">
        <div className="bg-gray-50 border-b border-[var(--border)] px-4 py-3 text-[12px]">
          <div className="flex justify-between text-[var(--muted)]">
            <span><b className="text-[var(--foreground)]">Verve &amp; Vine</b> &lt;hi@verveandvine.example&gt;</span>
            <span>now</span>
          </div>
          <div className="mt-1 text-[13px] font-semibold text-[var(--foreground)]">{e.subject || "(empty subject)"}</div>
          <div className="text-[12px] text-[var(--muted)] truncate">{e.preheader || "(no preheader)"}</div>
        </div>
        <div className="p-5 whitespace-pre-wrap text-[13.5px] leading-relaxed text-[var(--foreground)]">
          {e.body || <span className="text-[var(--muted-2)]">Write your body copy in the composer to see it here.</span>}
        </div>
        {e.ctaText && (
          <div className="px-5 pb-6">
            <a className="inline-block px-4 py-2 rounded-md bg-[var(--accent)] text-white text-sm font-medium" href={e.ctaUrl || "#"}>{e.ctaText}</a>
          </div>
        )}
      </div>
    );
  }
  const m = content.sms.message;
  return (
    <div className="card overflow-hidden" style={{ background: "#f3f4f6" }}>
      <div className="p-5">
        <div className="text-center text-[11px] text-[var(--muted)] mb-3">SMS · +1 (555) 010-VERVE</div>
        <div className="max-w-[80%] rounded-2xl bg-white border border-[var(--border)] px-3 py-2 text-[13px] leading-relaxed">
          {m || <span className="text-[var(--muted-2)]">Type an SMS in the composer to see it here.</span>}
        </div>
      </div>
    </div>
  );
}
