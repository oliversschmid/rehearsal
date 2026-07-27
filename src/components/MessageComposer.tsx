"use client";
import { useMemo, useState } from "react";
import type { EmailContent, MessageContent, SmsContent } from "@/lib/types";
import { ChannelFrame } from "./ChannelFrame";

/** Inline composer used in the split panel — form on top, live preview below. */
export function MessageComposer({
  nodeId,
  initial,
  onSave,
  onClose,
  onDelete,
}: {
  nodeId: string;
  initial: MessageContent;
  onSave: (next: MessageContent) => void;
  onClose: () => void;
  onDelete: () => void;
}) {
  const [content, setContent] = useState<MessageContent>(initial);
  const [dirty, setDirty] = useState(false);

  // Reset when pointed at a different node, or when the saved content changes
  // underneath us. React's "adjust state during render" pattern rather than an
  // effect — an effect would paint the previous node's content for one frame.
  const [source, setSource] = useState({ nodeId, initial });
  if (source.nodeId !== nodeId || source.initial !== initial) {
    setSource({ nodeId, initial });
    setContent(initial);
    setDirty(false);
  }

  function update(next: MessageContent) {
    setContent(next);
    setDirty(JSON.stringify(next) !== JSON.stringify(initial));
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="grid gap-8 p-8 max-w-5xl mx-auto" style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)" }}>
          <div className="space-y-5">
            {content.channel === "email" ? (
              <EmailFields value={content.email} onChange={(email) => update({ channel: "email", email })} />
            ) : (
              <SmsFields value={content.sms} onChange={(sms) => update({ channel: "sms", sms })} />
            )}
            <button
              className="text-[12px] text-[var(--muted)] hover:text-[var(--danger)] inline-flex items-center gap-1"
              onClick={onDelete}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7h16M6 7v13a2 2 0 002 2h8a2 2 0 002-2V7M9 7V4h6v3" /></svg>
              Delete this step
            </button>
          </div>
          <div>
            <div className="eyebrow mb-2">Live preview</div>
            <ChannelFrame content={content} />
          </div>
        </div>
      </div>

      <div className="px-5 py-3 border-t border-[var(--border)] bg-white flex items-center justify-between shrink-0">
        <span className="text-[12px] text-[var(--muted)]">{dirty ? "Unsaved on this message" : "Up to date"}</span>
        <div className="flex gap-2">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
          <button className="btn btn-primary" onClick={() => onSave(content)} disabled={!dirty}>Apply to flow</button>
        </div>
      </div>
    </div>
  );
}

function EmailFields({ value, onChange }: { value: EmailContent; onChange: (v: EmailContent) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <label>Subject</label>
        <input value={value.subject} onChange={(e) => onChange({ ...value, subject: e.target.value })} />
      </div>
      <div>
        <label>Preheader</label>
        <input value={value.preheader} onChange={(e) => onChange({ ...value, preheader: e.target.value })} />
      </div>
      <div>
        <label>Body</label>
        <textarea rows={8} value={value.body} onChange={(e) => onChange({ ...value, body: e.target.value })} />
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div>
          <label>CTA text</label>
          <input value={value.ctaText} onChange={(e) => onChange({ ...value, ctaText: e.target.value })} />
        </div>
        <div>
          <label>CTA URL</label>
          <input value={value.ctaUrl} onChange={(e) => onChange({ ...value, ctaUrl: e.target.value })} />
        </div>
      </div>
    </div>
  );
}

function SmsFields({ value, onChange }: { value: SmsContent; onChange: (v: SmsContent) => void }) {
  const { chars, segments } = useMemo(() => {
    const chars = value.message.length;
    const segments = Math.max(1, Math.ceil(chars / 160));
    return { chars, segments };
  }, [value.message]);
  return (
    <div className="space-y-4">
      <div>
        <label>Message</label>
        <textarea rows={6} value={value.message} onChange={(e) => onChange({ ...value, message: e.target.value })} />
        <div className="mt-1 flex justify-between text-[11px] text-[var(--muted)]">
          <span>{chars} chars · {segments} segment{segments === 1 ? "" : "s"}</span>
          <span>Include &quot;Reply STOP to opt out&quot; on promotional sends.</span>
        </div>
      </div>
      <div>
        <label>Link (optional)</label>
        <input value={value.link ?? ""} onChange={(e) => onChange({ ...value, link: e.target.value })} />
      </div>
    </div>
  );
}
