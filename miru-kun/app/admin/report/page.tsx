"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import HourlyChart, { type HourRow } from "@/components/HourlyChart";
import ReportAiPanel from "@/components/ReportAiPanel";
import { useStore } from "@/components/AdminShell";
import { aiAvailable } from "@/lib/ai/client";
import type { ReportSummary } from "@/lib/ai/types";
import { getAdminBackend, mode, type MetricRow, type PosterRecord } from "@/lib/backend";
import { describeSchedule } from "@/lib/schedule";

const DAY = ["日", "月", "火", "水", "木", "金", "土"];
const MIN_PASSERS = 30;

type Totals = { passers: number; viewers: number; dwellMs: number };
const ZERO: Totals = { passers: 0, viewers: 0, dwellMs: 0 };

/** ローカル日付の 0:00。夏時間などでずれないよう Date の日付演算を使う */
const dayStart = (base: Date, offset: number) => new Date(base.getFullYear(), base.getMonth(), base.getDate() + offset);
const fmtDay = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}(${DAY[d.getDay()]})`;
const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function sum(rows: MetricRow[]): Totals {
  return rows.reduce(
    (a, r) => ({ passers: a.passers + r.passers, viewers: a.viewers + r.viewers, dwellMs: a.dwellMs + r.dwellMs }),
    { ...ZERO },
  );
}
const rateOf = (t: Totals) => (t.passers > 0 ? t.viewers / t.passers : null);
const avgDwellSec = (t: Totals) => (t.viewers > 0 ? t.dwellMs / t.viewers / 1000 : null);

const pct = (r: number | null) => (r === null ? "—" : `${(r * 100).toFixed(1)}%`);
const secText = (s: number | null) => (s === null ? "—" : `${s.toFixed(1)}秒`);

type Delta = { text: string; tone: "up" | "down" | "flat" | "none" };

/** 先週比（相対 %）。先週が 0 のときは比較しない */
function relDelta(cur: number | null, prev: number | null): Delta {
  if (cur === null || prev === null || prev <= 0) return { text: "先週データなし", tone: "none" };
  const p = ((cur - prev) / prev) * 100;
  const r = Math.round(Math.abs(p));
  if (r === 0) return { text: "先週比 ±0%（ほぼ変わらず）", tone: "flat" };
  return p > 0 ? { text: `先週比 ▲${r}%`, tone: "up" } : { text: `先週比 ▼${r}%`, tone: "down" };
}

/** 率の変化はポイント差 */
function ptDelta(cur: number | null, prev: number | null): Delta {
  if (cur === null || prev === null) return { text: "先週データなし", tone: "none" };
  const d = (cur - prev) * 100;
  const v = Math.abs(d).toFixed(1);
  if (v === "0.0") return { text: "先週比 ±0.0pt（ほぼ変わらず）", tone: "flat" };
  return d > 0 ? { text: `先週比 ▲${v}pt`, tone: "up" } : { text: `先週比 ▼${v}pt`, tone: "down" };
}

const TONE: Record<Delta["tone"], string> = {
  up: "text-emerald-700",
  down: "text-red-700",
  flat: "text-gray-600",
  none: "text-gray-500",
};

export default function ReportPage() {
  const { storeId, storeName } = useStore();
  const [thisRows, setThisRows] = useState<MetricRow[]>([]);
  const [lastRows, setLastRows] = useState<MetricRow[]>([]);
  const [posters, setPosters] = useState<PosterRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [ai, setAi] = useState(false);
  // 「昨日まで」の境界は読み込み時点の日付で決める
  const [today, setToday] = useState(() => dayStart(new Date(), 0));

  const thisFrom = dayStart(today, -7);
  const lastFrom = dayStart(today, -14);

  const load = useCallback(async () => {
    const backend = getAdminBackend();
    const t = dayStart(new Date(), 0);
    setToday((prev) => (prev.getTime() === t.getTime() ? prev : t));
    const from = dayStart(t, -14).getTime();
    const mid = dayStart(t, -7).getTime();
    try {
      const [m, p] = await Promise.all([backend.listMetrics(storeId, from, t.getTime()), backend.listPosters(storeId)]);
      setThisRows(m.filter((r) => r.start >= mid));
      setLastRows(m.filter((r) => r.start < mid));
      setPosters(p);
      setFailed(false);
    } catch (e) {
      console.error("週次レポートの読み込みに失敗", e);
      setFailed(true);
    }
    setLoaded(true);
  }, [storeId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- バックエンドからの読み込み
    load();
    return getAdminBackend().subscribe(storeId, load);
  }, [storeId, load]);

  useEffect(() => {
    let alive = true;
    aiAvailable().then((v) => alive && setAi(v));
    return () => {
      alive = false;
    };
  }, []);

  const thisT = useMemo(() => sum(thisRows), [thisRows]);
  const lastT = useMemo(() => sum(lastRows), [lastRows]);

  const hourly: HourRow[] = useMemo(() => {
    const out = Array.from({ length: 24 }, (_, hour) => ({ hour, passers: 0, viewers: 0, dwellMs: 0 }));
    for (const r of thisRows) {
      const h = out[new Date(r.start).getHours()];
      h.passers += r.passers;
      h.viewers += r.viewers;
      h.dwellMs += r.dwellMs;
    }
    return out;
  }, [thisRows]);

  const posterStats = useMemo(() => {
    const map = new Map<string, Totals>();
    for (const r of thisRows) {
      const cur = map.get(r.posterId) ?? { ...ZERO };
      cur.passers += r.passers;
      cur.viewers += r.viewers;
      cur.dwellMs += r.dwellMs;
      map.set(r.posterId, cur);
    }
    const list = [...map.entries()].map(([id, t]) => {
      const p = posters.find((x) => x.id === id);
      return {
        id,
        name: p?.name ?? "（削除済みのポスター）",
        schedule: p ? describeSchedule(p.schedule) : "—",
        ...t,
        rate: rateOf(t),
        dwell: avgDwellSec(t),
        reliable: t.passers >= MIN_PASSERS,
      };
    });
    const byRate = (a: (typeof list)[number], b: (typeof list)[number]) => (b.rate ?? -1) - (a.rate ?? -1);
    return [...list.filter((p) => p.reliable).sort(byRate), ...list.filter((p) => !p.reliable).sort(byRate)];
  }, [thisRows, posters]);

  const highlights = useMemo(() => {
    const out: string[] = [];
    const best = posterStats.find((p) => p.reliable && p.rate !== null);
    if (best) {
      out.push(
        `注視率がいちばん高かったポスターは「${best.name}」で、${pct(best.rate)}（通行${best.passers.toLocaleString()}人のうち${best.viewers.toLocaleString()}人が注視）でした。`,
      );
    } else if (posterStats.length > 0) {
      out.push(`通行人数が${MIN_PASSERS}人以上のポスターがないため、ポスター同士の比較はまだできません。`);
    }
    const peak = hourly.reduce((a, b) => (b.viewers > a.viewers ? b : a), hourly[0]);
    if (peak.viewers > 0) {
      out.push(`注視人数がいちばん多かった時間帯は${peak.hour}時台で、1週間の合計は${peak.viewers.toLocaleString()}人でした。`);
    }
    const metrics: { label: string; cur: number | null; prev: number | null; fmt: (v: number | null) => string }[] = [
      { label: "通行人数", cur: thisT.passers, prev: lastT.passers, fmt: (v) => `${(v ?? 0).toLocaleString()}人` },
      { label: "注視人数", cur: thisT.viewers, prev: lastT.viewers, fmt: (v) => `${(v ?? 0).toLocaleString()}人` },
      { label: "注視率", cur: rateOf(thisT), prev: rateOf(lastT), fmt: pct },
      { label: "平均注視時間", cur: avgDwellSec(thisT), prev: avgDwellSec(lastT), fmt: secText },
    ];
    let top: { label: string; p: number; from: string; to: string } | null = null;
    for (const m of metrics) {
      if (m.cur === null || m.prev === null || m.prev <= 0) continue;
      const p = ((m.cur - m.prev) / m.prev) * 100;
      if (!top || Math.abs(p) > Math.abs(top.p)) top = { label: m.label, p, from: m.fmt(m.prev), to: m.fmt(m.cur) };
    }
    if (lastT.passers === 0) {
      out.push("先週のデータがないため、先週との比較はできません。");
    } else if (top && Math.round(Math.abs(top.p)) >= 5) {
      out.push(
        `先週との差がいちばん大きかったのは${top.label}で、${top.from}から${top.to}へ${top.p > 0 ? "▲" : "▼"}${Math.round(Math.abs(top.p))}%の${top.p > 0 ? "増加" : "減少"}でした。`,
      );
    } else if (top) {
      out.push("先週と比べて、4つの指標とも大きな変化（5%以上）はありませんでした。");
    }
    return out;
  }, [posterStats, hourly, thisT, lastT]);

  const summary: ReportSummary = {
      storeName,
      period: { from: isoDay(thisFrom), to: isoDay(dayStart(today, -1)) },
      thisWeek: { passers: thisT.passers, viewers: thisT.viewers, dwellSec: Math.round(thisT.dwellMs / 1000) },
      lastWeek: { passers: lastT.passers, viewers: lastT.viewers, dwellSec: Math.round(lastT.dwellMs / 1000) },
      hourly: hourly.map((h) => ({ hour: h.hour, passers: h.passers, viewers: h.viewers })),
      posters: posterStats.map((p) => ({
        name: p.name,
        schedule: p.schedule,
        passers: p.passers,
        viewers: p.viewers,
        avgDwellSec: Math.round((p.dwell ?? 0) * 10) / 10,
      })),
  };

  const thisRange = `${fmtDay(thisFrom)}〜${fmtDay(dayStart(today, -1))}`;
  const lastRange = `${fmtDay(lastFrom)}〜${fmtDay(dayStart(today, -8))}`;
  const hasData = thisT.passers > 0 || thisT.viewers > 0;

  return (
    <div className="space-y-6">
      {/* 管理画面共通のヘッダー（ナビ）は印刷しない */}
      <style>{`@media print { header { display: none !important; } @page { size: A4; margin: 12mm; } }`}</style>

      <div className="flex flex-wrap items-start gap-3">
        <div className="mr-auto">
          <h1 className="text-2xl font-black text-gray-800">週次レポート</h1>
          <p className="text-sm text-gray-600 mt-1">{storeName}</p>
          <p className="text-sm text-gray-600">
            今週：<span className="font-bold">{thisRange}</span>
            <span className="text-gray-400 mx-2">/</span>
            先週：{lastRange}
          </p>
        </div>
        <button
          onClick={() => window.print()}
          className="print:hidden px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm font-bold hover:bg-gray-50"
        >
          印刷 / PDF保存
        </button>
      </div>

      {!loaded ? (
        <p className="text-sm text-gray-400 py-8 text-center">読み込み中…</p>
      ) : failed ? (
        <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          データの読み込みに失敗しました。しばらくしてからもう一度開いてください。
        </p>
      ) : !hasData ? (
        <section className="bg-white border border-gray-200 rounded-2xl p-8 text-center text-sm text-gray-600 space-y-3">
          <p className="font-bold text-gray-800">今週（{thisRange}）の計測データはまだありません。</p>
          <p>
            <Link href="/admin/posters" className="text-primary font-bold underline">
              ポスターを登録
            </Link>
            してサイネージ画面を開くと、計測が始まります。
          </p>
          {mode === "local" && (
            <p>
              見た目だけ確認したい場合は、<Link href="/admin" className="text-primary font-bold underline">ダッシュボード</Link>
              の「デモデータを入れて見た目を確認」ボタンをお使いください（デモモードのみ）。
            </p>
          )}
        </section>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Kpi label="通行人数" value={`${thisT.passers.toLocaleString()}人`} delta={relDelta(thisT.passers, lastT.passers)} />
            <Kpi label="注視人数" value={`${thisT.viewers.toLocaleString()}人`} delta={relDelta(thisT.viewers, lastT.passers > 0 ? lastT.viewers : null)} />
            <Kpi label="注視率" value={pct(rateOf(thisT))} delta={ptDelta(rateOf(thisT), rateOf(lastT))} />
            <Kpi label="平均注視時間" value={secText(avgDwellSec(thisT))} delta={relDelta(avgDwellSec(thisT), avgDwellSec(lastT))} />
          </div>

          <section className="bg-white border border-gray-200 rounded-2xl p-5 print:break-inside-avoid">
            <h2 className="font-bold text-gray-800">今週のポイント</h2>
            <p className="text-xs text-gray-500 mb-2">集計した数字から自動で作成しています（AIは使っていません）。</p>
            <ul className="list-disc pl-5 space-y-1.5 text-sm text-gray-800 leading-relaxed">
              {highlights.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          </section>

          <section className="bg-white border border-gray-200 rounded-2xl p-5 print:break-inside-avoid">
            <h2 className="font-bold text-gray-800">時間帯別の注視人数（今週）</h2>
            <p className="text-xs text-gray-500 mb-3">{thisRange} の合計。</p>
            <HourlyChart rows={hourly} />
          </section>

          <section className="bg-white border border-gray-200 rounded-2xl p-5 print:break-inside-avoid">
            <h2 className="font-bold text-gray-800">ポスター別ランキング</h2>
            <p className="text-xs text-gray-500 mb-4">
              今週の注視率の高い順。通行人数が{MIN_PASSERS}人未満のポスターは偶然の影響が大きいため、順位をつけず最後に並べています。
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                    <th className="py-2 pr-3 font-medium w-10">順位</th>
                    <th className="py-2 pr-3 font-medium">ポスター</th>
                    <th className="py-2 pr-3 font-medium text-right">通行</th>
                    <th className="py-2 pr-3 font-medium text-right">注視</th>
                    <th className="py-2 pr-3 font-medium text-right">注視率</th>
                    <th className="py-2 font-medium text-right">平均注視</th>
                  </tr>
                </thead>
                <tbody>
                  {posterStats.map((p, i) => (
                    <tr key={p.id} className="border-b border-gray-100 last:border-0 align-top">
                      <td className="py-2.5 pr-3 tabular-nums text-gray-600">{p.reliable ? i + 1 : "—"}</td>
                      <td className="py-2.5 pr-3">
                        <div className="font-bold text-gray-800">{p.name}</div>
                        <div className="text-xs text-gray-500">{p.schedule}</div>
                        {!p.reliable && <div className="text-xs text-amber-800 font-bold mt-0.5">参考値（人数が少ない）</div>}
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">{p.passers.toLocaleString()}</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">{p.viewers.toLocaleString()}</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums font-bold text-gray-800">{pct(p.rate)}</td>
                      <td className="py-2.5 text-right tabular-nums">{secText(p.dwell)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {ai && <ReportAiPanel summary={summary} />}
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, delta }: { label: string; value: string; delta: Delta }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4">
      <div className="text-xs font-bold text-gray-500">{label}</div>
      <div className="mt-1 text-2xl md:text-3xl font-black text-gray-800 tabular-nums">{value}</div>
      <div className={`mt-1 text-xs font-bold ${TONE[delta.tone]}`}>{delta.text}</div>
    </div>
  );
}
