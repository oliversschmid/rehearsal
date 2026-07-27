"use client";
import { useEffect, useRef, useState } from "react";
import type { Campaign, ScheduleConfig } from "@/lib/types";
import { DEFAULT_SCHEDULE } from "@/lib/types";

/**
 * Schedule form fields rendered inside a floating popover. Auto-saves via
 * the existing PUT /api/campaigns/[id] endpoint. Used by both the
 * trigger-node gear icon (FlowView) and the rail's ScheduleSummaryRow
 * pencil.
 */

const TIMEZONES = [
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Toronto",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
];

const DAYS = [
  { idx: 1, label: "M" },
  { idx: 2, label: "T" },
  { idx: 3, label: "W" },
  { idx: 4, label: "T" },
  { idx: 5, label: "F" },
  { idx: 6, label: "S" },
  { idx: 0, label: "S" },
];

export function SchedulePopover({
  campaign,
  onClose,
  onSaved,
  anchor,
}: {
  campaign: Campaign;
  onClose: () => void;
  onSaved: (c: Campaign) => void;
  /** Rectangle of the trigger button, in viewport coords. Popover positions
   *  itself near it. If null, centers on screen. */
  anchor: DOMRect | null;
}) {
  const [schedule, setSchedule] = useState<ScheduleConfig>(
    campaign.schedule ?? DEFAULT_SCHEDULE,
  );
  const [savedTick, setSavedTick] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const savingRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  function update(next: ScheduleConfig) {
    setSchedule(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void persist(next), 350);
  }
  async function persist(next: ScheduleConfig) {
    if (savingRef.current) return;
    savingRef.current = true;
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schedule: next }),
      });
      const updated: Campaign = await res.json();
      onSaved(updated);
      setSavedTick(Date.now());
    } finally {
      savingRef.current = false;
    }
  }

  function toggleDay(idx: number) {
    const s = new Set(schedule.daysOfWeek);
    if (s.has(idx)) s.delete(idx);
    else s.add(idx);
    update({ ...schedule, daysOfWeek: [...s].sort() });
  }

  // Positioning — right-align to anchor, constrained to the viewport with
  // a scrollable body if content exceeds available space.
  const style: React.CSSProperties = (() => {
    const width = 360;
    const marginY = 16;
    if (typeof window === "undefined") {
      return { position: "fixed", top: 60, right: 20, width, zIndex: 60 };
    }
    const viewportH = window.innerHeight;
    const preferredTop = anchor ? anchor.bottom + 6 : 60;
    // Guarantee the popover has room to breathe: pull it up if opening below
    // the anchor would push more than half of the panel off-screen.
    const minPanelH = Math.min(360, viewportH - marginY * 2);
    const top = Math.max(marginY, Math.min(preferredTop, viewportH - minPanelH - marginY));
    const maxHeight = viewportH - top - marginY;
    const left = anchor
      ? Math.max(12, Math.min(anchor.right - width, window.innerWidth - width - 12))
      : window.innerWidth - width - 20;
    return { position: "fixed", top, left, width, maxHeight, zIndex: 60 };
  })();

  return (
    <>
      <div className="fixed inset-0 z-[55]" />
      <div
        ref={wrapRef}
        style={style}
        className="card bg-white shadow-2xl overflow-y-auto"
      >
        <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
          <div>
            <div className="eyebrow">Campaign schedule</div>
            <div className="text-[11px] text-[var(--muted)] mt-0.5">
              Auto-saves as you edit
            </div>
          </div>
          <div className="flex items-center gap-2">
            {savedTick && (
              <span className="text-[10.5px] text-[var(--muted-2)]">Saved</span>
            )}
            <button
              className="btn btn-ghost !p-1 text-[var(--muted-2)]"
              onClick={onClose}
              aria-label="Close"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6l-12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-4">
          <Field label="Start on" hint="Leave blank to send from launch time.">
            <input
              type="datetime-local"
              value={schedule.startAt ? schedule.startAt.slice(0, 16) : ""}
              onChange={(e) =>
                update({
                  ...schedule,
                  startAt: e.target.value ? new Date(e.target.value).toISOString() : undefined,
                })
              }
            />
          </Field>

          <Field label="Timezone">
            <select
              value={schedule.timezone}
              onChange={(e) => update({ ...schedule, timezone: e.target.value })}
            >
              {TIMEZONES.map((t) => (
                <option key={t} value={t}>
                  {t.replace("_", " ")}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Send window" hint="Recipient-local time.">
            <div className="flex items-center gap-2">
              <select
                value={schedule.sendWindow.startHour}
                onChange={(e) =>
                  update({
                    ...schedule,
                    sendWindow: { ...schedule.sendWindow, startHour: Number(e.target.value) },
                  })
                }
              >
                {Array.from({ length: 24 }).map((_, h) => (
                  <option key={h} value={h}>
                    {hourLabel(h)}
                  </option>
                ))}
              </select>
              <span className="text-[13px] text-[var(--muted)]">to</span>
              <select
                value={schedule.sendWindow.endHour}
                onChange={(e) =>
                  update({
                    ...schedule,
                    sendWindow: { ...schedule.sendWindow, endHour: Number(e.target.value) },
                  })
                }
              >
                {Array.from({ length: 24 }).map((_, h) => (
                  <option key={h} value={h}>
                    {hourLabel(h)}
                  </option>
                ))}
              </select>
            </div>
          </Field>

          <Field label="Days of week">
            <div className="flex gap-1">
              {DAYS.map((d) => {
                const on = schedule.daysOfWeek.includes(d.idx);
                return (
                  <button
                    key={d.idx}
                    type="button"
                    onClick={() => toggleDay(d.idx)}
                    className={`w-8 h-8 rounded-full text-[12px] font-medium transition-colors ${
                      on
                        ? "bg-[var(--foreground)] text-white"
                        : "bg-white text-[var(--muted)] border border-[var(--border)] hover:border-[var(--border-strong)]"
                    }`}
                    aria-pressed={on}
                    title={dayName(d.idx)}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label="Frequency cap" hint="Max messages per recipient across the campaign.">
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={30}
                value={schedule.frequencyCap.max}
                onChange={(e) =>
                  update({
                    ...schedule,
                    frequencyCap: {
                      ...schedule.frequencyCap,
                      max: Math.max(1, Number(e.target.value)),
                    },
                  })
                }
                className="!w-20"
              />
              <span className="text-[13px] text-[var(--muted)]">per</span>
              <select
                value={schedule.frequencyCap.per}
                onChange={(e) =>
                  update({
                    ...schedule,
                    frequencyCap: {
                      ...schedule.frequencyCap,
                      per: e.target.value as "day" | "week" | "month",
                    },
                  })
                }
                className="!w-28"
              >
                <option value="day">day</option>
                <option value="week">week</option>
                <option value="month">month</option>
              </select>
            </div>
          </Field>

          <ToggleField
            label="Respect SMS quiet hours"
            hint="Auto-hold SMS sends between 9pm–8am recipient time."
            value={schedule.respectSmsQuietHours}
            onChange={(v) => update({ ...schedule, respectSmsQuietHours: v })}
          />
          <ToggleField
            label="Send-time optimization"
            hint="Pick each recipient's most-active hour inside the send window."
            value={schedule.sendTimeOptimization}
            onChange={(v) => update({ ...schedule, sendTimeOptimization: v })}
          />

          <div className="mt-4 rounded-lg border border-[var(--border)] p-2.5 bg-[var(--background)]">
            <div className="eyebrow mb-1">Summary</div>
            <div className="text-[11.5px] text-[var(--foreground)] leading-relaxed">
              {describeSchedule(schedule)}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/** Short one-line description used by the ScheduleSummaryRow block. */
export function describeScheduleShort(s: ScheduleConfig): string {
  const days =
    s.daysOfWeek.length === 7
      ? "every day"
      : s.daysOfWeek.length === 5 && [1, 2, 3, 4, 5].every((d) => s.daysOfWeek.includes(d))
      ? "weekdays"
      : `${s.daysOfWeek.length}d/wk`;
  const win = `${hourLabel(s.sendWindow.startHour)}–${hourLabel(s.sendWindow.endHour)}`;
  return `Sends ${days}, ${win}, cap ${s.frequencyCap.max}/${s.frequencyCap.per}`;
}

function describeSchedule(s: ScheduleConfig): string {
  const days =
    s.daysOfWeek.length === 7
      ? "every day"
      : s.daysOfWeek.length === 5 && [1, 2, 3, 4, 5].every((d) => s.daysOfWeek.includes(d))
      ? "weekdays only"
      : `${s.daysOfWeek.length} day${s.daysOfWeek.length === 1 ? "" : "s"}/week`;
  return `Sends ${days} · ${hourLabel(s.sendWindow.startHour)}–${hourLabel(
    s.sendWindow.endHour,
  )} (${s.timezone.split("/").pop()?.replace("_", " ")}) · cap ${s.frequencyCap.max}/${s.frequencyCap.per}${
    s.respectSmsQuietHours ? " · quiet hours on" : ""
  }${s.sendTimeOptimization ? " · STO on" : ""}.`;
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-4 first:mt-0">
      <label className="!mb-1">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-[var(--muted-2)]">{hint}</p>}
    </div>
  );
}

function ToggleField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="mt-3 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-[12.5px] font-medium text-[var(--foreground)]">{label}</div>
        {hint && (
          <div className="text-[11px] text-[var(--muted-2)] mt-0.5 leading-relaxed">
            {hint}
          </div>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={`relative w-9 h-5 rounded-full transition-colors shrink-0 mt-0.5 ${
          value ? "bg-[var(--foreground)]" : "bg-gray-300"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
            value ? "translate-x-4" : ""
          }`}
        />
      </button>
    </div>
  );
}

function hourLabel(h: number): string {
  const suffix = h < 12 ? "AM" : "PM";
  const twelve = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${twelve}:00 ${suffix}`;
}
function dayName(idx: number): string {
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][idx];
}
