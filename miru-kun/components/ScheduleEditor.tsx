"use client";

import { describeSchedule, type PosterSchedule } from "@/lib/schedule";

const DAYS = ["日", "月", "火", "水", "木", "金", "土"];
const PRESETS: { label: string; days: number[] }[] = [
  { label: "毎日", days: [] },
  { label: "平日", days: [1, 2, 3, 4, 5] },
  { label: "土日", days: [0, 6] },
];

/** 表示する曜日と時間帯の編集（曜日を選ばなければ毎日） */
export default function ScheduleEditor({ value, onChange }: { value: PosterSchedule; onChange: (v: PosterSchedule) => void }) {
  const allDay = value.start === null || value.end === null;
  const sameDays = (a: number[]) => a.length === value.days.length && a.every((d) => value.days.includes(d));

  const toggle = (d: number) =>
    onChange({ ...value, days: value.days.includes(d) ? value.days.filter((x) => x !== d) : [...value.days, d].sort() });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {DAYS.map((label, d) => (
          <button
            key={d}
            type="button"
            aria-pressed={value.days.includes(d)}
            onClick={() => toggle(d)}
            className={`w-9 h-9 rounded-full text-sm font-bold border ${
              value.days.includes(d) ? "bg-primary text-white border-transparent" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
            }`}
          >
            {label}
          </button>
        ))}
        <span className="w-2" />
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => onChange({ ...value, days: p.days })}
            className={`px-3 h-9 rounded-lg text-xs font-bold border ${
              sameDays(p.days) ? "border-primary text-primary" : "border-gray-300 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={allDay}
            onChange={(e) => onChange({ ...value, start: e.target.checked ? null : "11:00", end: e.target.checked ? null : "14:00" })}
            className="w-4 h-4 accent-[var(--primary)]"
          />
          終日
        </label>
        {!allDay && (
          <span className="flex items-center gap-2">
            <input
              type="time"
              aria-label="開始時刻"
              value={value.start ?? ""}
              onChange={(e) => onChange({ ...value, start: e.target.value || "00:00" })}
              className="border border-gray-300 rounded-lg px-2 py-1"
            />
            〜
            <input
              type="time"
              aria-label="終了時刻"
              value={value.end ?? ""}
              onChange={(e) => onChange({ ...value, end: e.target.value || "00:00" })}
              className="border border-gray-300 rounded-lg px-2 py-1"
            />
          </span>
        )}
      </div>
      <p className="text-xs text-gray-500">
        表示：<span className="font-bold text-gray-700">{describeSchedule(value)}</span>
        {!allDay && "　開始が終了より後なら日付をまたぎます（例 22:00〜02:00）。"}
      </p>
    </div>
  );
}
