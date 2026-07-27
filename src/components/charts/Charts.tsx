"use client";
import { useState } from "react";

/* ============================================================
   Compact SVG charts — no external deps. Match the dashboard
   reference style: white card, title + subtitle header, chart
   body with faint gridlines and axis labels.
   ============================================================ */

export function ChartCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="text-[14px] font-semibold">{title}</div>
          {subtitle && <div className="text-[12px] text-[var(--muted)] mt-0.5">{subtitle}</div>}
        </div>
      </div>
      <div>{children}</div>
      {footer && <div className="mt-3">{footer}</div>}
    </div>
  );
}

/* ============================================================
   Hero tile — big number with subtitle. Reference: "Active
   Product Design Projects · 9".
   ============================================================ */
export function HeroTile({
  label,
  sublabel,
  value,
  delta,
}: {
  label: string;
  sublabel?: string;
  value: string | number;
  delta?: number;
}) {
  return (
    <div className="card p-5">
      <div className="text-[13px] font-semibold">{label}</div>
      {sublabel && <div className="text-[11.5px] text-[var(--muted)] mt-1 leading-relaxed">{sublabel}</div>}
      <div className="mt-4 flex items-baseline gap-2.5">
        <span className="text-[32px] font-semibold tabular-nums tracking-tight leading-none">{value}</span>
        {delta !== undefined && delta !== 0 && <MiniDelta value={delta} />}
      </div>
    </div>
  );
}

function MiniDelta({ value }: { value: number }) {
  const positive = value >= 0;
  const color = positive ? "text-[var(--success)]" : "text-[var(--danger)]";
  return (
    <span className={`inline-flex items-center gap-1 ${color} text-[12px] font-medium`}>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={positive ? "" : "rotate-180"}>
        <path d="M12 19V5M5 12l7-7 7 7" />
      </svg>
      {positive ? "+" : "−"}{Math.abs(value).toLocaleString()}
    </span>
  );
}

/* ============================================================
   Bar chart — vertical bars. Hover shows tooltip with value.
   ============================================================ */
export type BarDatum = { label: string; value: number };

export function BarChart({
  data,
  height = 200,
  xAxisLabel,
  yAxisLabel,
  barColor = "var(--muted-2)",
  hoverColor = "var(--foreground)",
  valueSuffix = "",
}: {
  data: BarDatum[];
  height?: number;
  xAxisLabel?: string;
  yAxisLabel?: string;
  barColor?: string;
  hoverColor?: string;
  valueSuffix?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const padding = { top: 14, right: 12, bottom: 44, left: 44 };
  const width = 640;
  const chartH = height - padding.top - padding.bottom;
  const chartW = width - padding.left - padding.right;
  const barGap = 12;
  const barW = data.length ? Math.max(4, (chartW - barGap * (data.length - 1)) / data.length) : 0;

  const ticks = [0, 0.5, 1].map((t) => Math.round(max * t));

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ display: "block" }}>
        {ticks.map((t, i) => {
          const y = padding.top + chartH - (chartH * (t / max));
          return (
            <g key={i}>
              <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="#eaeaea" strokeWidth="1" />
              <text x={padding.left - 8} y={y + 3} textAnchor="end" fontSize="10" fill="var(--muted)">{t.toLocaleString()}{valueSuffix}</text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const x = padding.left + i * (barW + barGap);
          const h = (d.value / max) * chartH;
          const y = padding.top + chartH - h;
          const isHover = hover === i;
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={Math.max(0, h)}
                rx={4}
                fill={isHover ? hoverColor : barColor}
                style={{ transition: "fill 120ms" }}
              />
              <text
                x={x + barW / 2}
                y={height - padding.bottom + 14}
                textAnchor="middle"
                fontSize="10"
                fill="var(--muted)"
              >{truncate(d.label, 14)}</text>
              {isHover && (
                <text x={x + barW / 2} y={y - 6} textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--foreground)">
                  {d.value.toLocaleString()}{valueSuffix}
                </text>
              )}
            </g>
          );
        })}
        {yAxisLabel && (
          <text x={-height / 2} y={14} transform="rotate(-90)" textAnchor="middle" fontSize="10" fill="var(--muted)">{yAxisLabel}</text>
        )}
        {xAxisLabel && (
          <text x={width / 2} y={height - 6} textAnchor="middle" fontSize="10" fill="var(--muted)">{xAxisLabel}</text>
        )}
      </svg>
    </div>
  );
}

/* ============================================================
   Line chart — single series with grid + area fill.
   ============================================================ */
export type LinePoint = { label: string; value: number };

export function LineChart({
  data,
  height = 200,
  xAxisLabel,
  yAxisLabel,
}: {
  data: LinePoint[];
  height?: number;
  xAxisLabel?: string;
  yAxisLabel?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  if (!data.length) return null;
  const values = data.map((d) => d.value);
  const rawMax = Math.max(...values);
  const rawMin = Math.min(...values);
  const range = Math.max(1, rawMax - rawMin);
  const yMin = Math.max(0, rawMin - range * 0.1);
  const yMax = rawMax + range * 0.15;
  const yRange = yMax - yMin;
  const padding = { top: 14, right: 12, bottom: 44, left: 48 };
  const width = 640;
  const chartH = height - padding.top - padding.bottom;
  const chartW = width - padding.left - padding.right;
  const stepX = data.length > 1 ? chartW / (data.length - 1) : 0;

  const points = data.map((d, i) => ({
    x: padding.left + i * stepX,
    y: padding.top + chartH - ((d.value - yMin) / yRange) * chartH,
    value: d.value,
    label: d.label,
  }));

  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaD = `${pathD} L ${points[points.length - 1].x} ${padding.top + chartH} L ${points[0].x} ${padding.top + chartH} Z`;

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(yMin + yRange * t));
  // Only show every Nth x-label to avoid overlap
  const xLabelEvery = Math.max(1, Math.ceil(data.length / 8));

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ display: "block" }}
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map((t, i) => {
          const y = padding.top + chartH - ((t - yMin) / yRange) * chartH;
          return (
            <g key={i}>
              <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="var(--border)" strokeWidth="1" />
              <text x={padding.left - 8} y={y + 3} textAnchor="end" fontSize="10" fill="var(--muted)">{t.toLocaleString()}</text>
            </g>
          );
        })}
        <path d={areaD} fill="var(--muted-2)" opacity="0.12" />
        <path d={pathD} fill="none" stroke="var(--foreground)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <g key={i}>
            {i % xLabelEvery === 0 && (
              <text x={p.x} y={height - padding.bottom + 14} textAnchor="middle" fontSize="10" fill="var(--muted)">
                {truncate(p.label, 8)}
              </text>
            )}
            <circle
              cx={p.x}
              cy={p.y}
              r={hover === i ? 4 : 2.5}
              fill={hover === i ? "var(--foreground)" : "var(--foreground)"}
              style={{ transition: "r 100ms" }}
            />
            {/* invisible hover target */}
            <rect
              x={p.x - (stepX || 12) / 2}
              y={padding.top}
              width={stepX || 24}
              height={chartH}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
            />
          </g>
        ))}
        {hover !== null && (() => {
          const p = points[hover];
          return (
            <g>
              <line x1={p.x} x2={p.x} y1={padding.top} y2={padding.top + chartH} stroke="var(--foreground)" strokeWidth="1" strokeDasharray="3 3" opacity="0.4" />
              <text x={p.x} y={p.y - 10} textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--foreground)">
                {p.value.toLocaleString()}
              </text>
            </g>
          );
        })()}
        {yAxisLabel && <text x={-height / 2} y={14} transform="rotate(-90)" textAnchor="middle" fontSize="10" fill="var(--muted)">{yAxisLabel}</text>}
        {xAxisLabel && <text x={width / 2} y={height - 6} textAnchor="middle" fontSize="10" fill="var(--muted)">{xAxisLabel}</text>}
      </svg>
    </div>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

/* ============================================================
   Two-line chart — compare two series sharing an x-axis and a
   single y-axis, with translucent area fills under each line.
   ============================================================ */
export type TwoSeries = { label: string; color: string; data: LinePoint[] };

export function TwoLineChart({
  series,
  height = 240,
}: {
  series: [TwoSeries, TwoSeries];
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [a, b] = series;
  if (!a.data.length || !b.data.length) return null;
  const n = Math.min(a.data.length, b.data.length);

  const padding = { top: 8, right: 16, bottom: 28, left: 44 };
  const width = 720;
  const chartH = height - padding.top - padding.bottom;
  const chartW = width - padding.left - padding.right;
  const stepX = n > 1 ? chartW / (n - 1) : 0;

  const allValues = [
    ...a.data.slice(0, n).map((d) => d.value),
    ...b.data.slice(0, n).map((d) => d.value),
  ];
  const rawMax = Math.max(...allValues);
  const yMax = rawMax * 1.1;
  const yMin = 0;
  const yRange = Math.max(1, yMax - yMin);

  const project = (s: TwoSeries) =>
    s.data.slice(0, n).map((d, i) => ({
      x: padding.left + i * stepX,
      y: padding.top + chartH - ((d.value - yMin) / yRange) * chartH,
      value: d.value,
      label: d.label,
    }));

  const ptsA = project(a);
  const ptsB = project(b);
  const pathOf = (pts: { x: number; y: number }[]) =>
    pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaOf = (pts: { x: number; y: number }[]) => {
    const base = padding.top + chartH;
    const line = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
    return `${line} L ${pts[pts.length - 1].x} ${base} L ${pts[0].x} ${base} Z`;
  };

  const yTicks = [0, 0.5, 1].map((t) => Math.round(yMin + yRange * t));
  const xLabelEvery = Math.max(1, Math.ceil(n / 6));

  return (
    <div className="relative">
      <div className="flex gap-4 mb-2 text-[12px]">
        {series.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: s.color }}
            />
            <span className="text-[var(--foreground)] font-medium">{s.label}</span>
          </span>
        ))}
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        style={{ display: "block" }}
        onMouseLeave={() => setHover(null)}
      >
        {yTicks.map((t, i) => {
          const y = padding.top + chartH - ((t - yMin) / yRange) * chartH;
          return (
            <g key={`grid-${i}`}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={y}
                y2={y}
                stroke="#eaeaea"
                strokeWidth="1"
              />
              <text
                x={padding.left - 8}
                y={y + 3}
                textAnchor="end"
                fontSize="10"
                fill="var(--muted)"
              >
                {abbrev(t)}
              </text>
            </g>
          );
        })}
        {/* Area fills first so lines paint on top */}
        <path d={areaOf(ptsA)} fill={a.color} opacity={0.12} />
        <path d={areaOf(ptsB)} fill={b.color} opacity={0.12} />
        <path
          d={pathOf(ptsB)}
          fill="none"
          stroke={b.color}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <path
          d={pathOf(ptsA)}
          fill="none"
          stroke={a.color}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {ptsA.map((p, i) => (
          <g key={`hover-${i}`}>
            {i % xLabelEvery === 0 && (
              <text x={p.x} y={height - padding.bottom + 14} textAnchor="middle" fontSize="10" fill="var(--muted)">
                {truncate(p.label, 8)}
              </text>
            )}
            <rect
              x={p.x - (stepX || 12) / 2}
              y={padding.top}
              width={stepX || 24}
              height={chartH}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
            />
          </g>
        ))}
        {hover !== null && (
          <g>
            <line
              x1={ptsA[hover].x}
              x2={ptsA[hover].x}
              y1={padding.top}
              y2={padding.top + chartH}
              stroke="var(--foreground)"
              strokeWidth="1"
              strokeDasharray="3 3"
              opacity="0.4"
            />
            <circle cx={ptsA[hover].x} cy={ptsA[hover].y} r="4" fill={a.color} />
            <circle cx={ptsB[hover].x} cy={ptsB[hover].y} r="4" fill={b.color} />
            <text x={ptsA[hover].x} y={ptsA[hover].y - 10} textAnchor="middle" fontSize="11" fontWeight="600" fill={a.color}>
              {ptsA[hover].value.toLocaleString()}
            </text>
            <text x={ptsB[hover].x} y={ptsB[hover].y - 10} textAnchor="middle" fontSize="11" fontWeight="600" fill={b.color}>
              {ptsB[hover].value.toLocaleString()}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

function abbrev(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return n.toLocaleString();
}
