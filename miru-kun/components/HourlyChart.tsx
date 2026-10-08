"use client";

import { useEffect, useRef, useState } from "react";

export type HourRow = { hour: number; passers: number; viewers: number; dwellMs: number };

const H = 240;
const PAD = { top: 12, right: 8, bottom: 28, left: 36 };

/** 目盛り4本がすべて整数になる上限値 */
function niceMax(v: number) {
  if (v <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(v / 4));
  const step = [1, 2, 5, 10].find((s) => s * pow * 4 >= v)! * pow;
  return step * 4;
}

/** 時間帯別の注視人数（単系列の縦棒）。ホバーで通行人数・注視率も表示 */
export default function HourlyChart({ rows }: { rows: HourRow[] }) {
  const [hover, setHover] = useState<number | null>(null);
  // 文字サイズを保つため、viewBox を実際の表示幅に合わせる
  const wrapRef = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(720);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setW(Math.max(280, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const max = niceMax(Math.max(0, ...rows.map((r) => r.viewers)));
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = plotW / 24;
  const barW = Math.max(3, slot - (slot > 16 ? 6 : 2));
  const labelEvery = W < 480 ? 6 : 3;
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const ticks = [0, max / 4, max / 2, (max * 3) / 4, max];
  const hovered = hover === null ? null : rows[hover];

  return (
    <div ref={wrapRef} className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block w-full h-auto" role="img" aria-label="時間帯別の注視人数">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--viz-grid)" strokeWidth={1} />
            <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--viz-text-secondary)">
              {t.toLocaleString()}
            </text>
          </g>
        ))}
        {rows.map((r, i) => {
          const x = PAD.left + i * slot + (slot - barW) / 2;
          const top = y(r.viewers);
          const h = PAD.top + plotH - top;
          const radius = Math.min(4, h, barW / 2);
          return (
            <g key={r.hour}>
              {h > 0 && (
                <path
                  d={`M${x},${top + h} V${top + radius} Q${x},${top} ${x + radius},${top} H${x + barW - radius} Q${x + barW},${top} ${x + barW},${top + radius} V${top + h} Z`}
                  fill="var(--viz-series-1)"
                  opacity={hover === null || hover === i ? 1 : 0.45}
                />
              )}
              {r.hour % labelEvery === 0 && (
                <text x={x + barW / 2} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--viz-text-secondary)">
                  {r.hour}時
                </text>
              )}
              {/* ホバー判定は棒より広く取る */}
              <rect
                x={PAD.left + i * slot}
                y={PAD.top}
                width={slot}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            </g>
          );
        })}
      </svg>
      {hovered && hover !== null && (
        <div
          className="pointer-events-none absolute top-0 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg whitespace-nowrap"
          style={{
            left: `${((PAD.left + hover * slot + slot / 2) / W) * 100}%`,
            transform: `translateX(${hover > 18 ? "-100%" : hover < 4 ? "0" : "-50%"})`,
          }}
        >
          <div className="font-bold mb-1">
            {hovered.hour}:00〜{hovered.hour}:59
          </div>
          <div>注視人数 {hovered.viewers.toLocaleString()}人</div>
          <div>通行人数 {hovered.passers.toLocaleString()}人</div>
          <div>注視率 {hovered.passers ? ((hovered.viewers / hovered.passers) * 100).toFixed(1) : "0.0"}%</div>
        </div>
      )}
    </div>
  );
}
