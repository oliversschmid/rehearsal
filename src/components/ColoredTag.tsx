"use client";

/**
 * Small square-cornered tag whose background hue is a deterministic hash of
 * the label. Same label → same color across the app.
 */
const PALETTE: { bg: string; fg: string }[] = [
  { bg: "#eaf6ef", fg: "#116534" }, // green
  { bg: "#e7f0ff", fg: "#1e40af" }, // blue
  { bg: "#fef7e3", fg: "#8a5b00" }, // yellow
  { bg: "#fdecec", fg: "#9b1c1c" }, // red
  { bg: "#f3e8ff", fg: "#6b21a8" }, // purple
  { bg: "#ffe4ec", fg: "#9d174d" }, // pink
  { bg: "#d6f4ee", fg: "#115e59" }, // teal
  { bg: "#fce6d3", fg: "#9a3412" }, // orange
  { bg: "#e2e8f0", fg: "#334155" }, // slate
  { bg: "#eef2ff", fg: "#3730a3" }, // indigo
];

function hash(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function ColoredTag({ label }: { label: string }) {
  const { bg, fg } = PALETTE[hash(label) % PALETTE.length];
  return (
    <span
      className="inline-flex items-center rounded-[5px] font-medium"
      style={{
        background: bg,
        color: fg,
        padding: "3px 8px",
        fontSize: 11,
      }}
    >
      {label}
    </span>
  );
}
