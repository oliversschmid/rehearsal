"use client";
import { useMemo, useState } from "react";
import type { MessageContent } from "@/lib/types";
import { SlideOver } from "./SlideOver";
import { ChannelFrame } from "./ChannelFrame";

export function ComposerSlideOver({
  nodeId: _nodeId,
  initial,
  onClose,
  onSave,
}: {
  nodeId: string;
  initial: MessageContent;
  onClose: () => void;
  onSave: (next: MessageContent) => void;
}) {
  const [content, setContent] = useState<MessageContent>(initial);

  return (
    <SlideOver title={content.channel === "email" ? "Compose email" : "Compose SMS"} onClose={onClose} widthClass="!w-[min(920px,100%)]">
      <div className="grid gap-6" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
        <div className="space-y-4">
          {content.channel === "email" ? (
            <EmailFields
              value={content.email}
              onChange={(email) => setContent({ channel: "email", email })}
            />
          ) : (
            <SmsFields
              value={content.sms}
              onChange={(sms) => setContent({ channel: "sms", sms })}
            />
          )}
          <div className="pt-4 flex justify-end gap-2">
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={() => onSave(content)}>Save</button>
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-[var(--muted)] mb-2">Preview</div>
          <ChannelFrame content={content} />
        </div>
      </div>
    </SlideOver>
  );
}

function EmailFields({
  value,
  onChange,
}: {
  value: import("@/lib/types").EmailContent;
  onChange: (v: import("@/lib/types").EmailContent) => void;
}) {
  return (
    <>
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
        <textarea rows={10} value={value.body} onChange={(e) => onChange({ ...value, body: e.target.value })} />
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
    </>
  );
}

function SmsFields({
  value,
  onChange,
}: {
  value: import("@/lib/types").SmsContent;
  onChange: (v: import("@/lib/types").SmsContent) => void;
}) {
  const { chars, segments } = useMemo(() => {
    const chars = value.message.length;
    const segments = Math.max(1, Math.ceil(chars / 160));
    return { chars, segments };
  }, [value.message]);
  return (
    <>
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
    </>
  );
}
