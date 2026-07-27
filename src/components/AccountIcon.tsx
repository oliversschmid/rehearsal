"use client";

/**
 * Small rounded square icon with an initial letter. Background color is
 * derived deterministically from the name so the same record always paints
 * the same swatch across renders.
 */
const PALETTE = [
  "#e9f5ee", // green
  "#e6efff", // blue
  "#fef3d7", // yellow
  "#f5e8ff", // purple
  "#fde8f0", // pink
  "#e6f6f4", // teal
  "#fde5db", // orange
  "#e9e6df", // sand
];

function hash(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function AccountIcon({
  name,
  size = 28,
}: {
  name: string;
  size?: number;
}) {
  const letter = (name.trim()[0] ?? "?").toUpperCase();
  const bg = PALETTE[hash(name) % PALETTE.length];
  return (
    <span
      className="inline-grid place-items-center rounded-[6px] font-semibold text-[var(--foreground)]"
      style={{
        width: size,
        height: size,
        background: bg,
        fontSize: Math.round(size * 0.42),
      }}
      aria-hidden
    >
      {letter}
    </span>
  );
}
