"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import HourlyChart, { type HourRow } from "@/components/HourlyChart";
import { demoMetrics } from "@/lib/samples";
import {
  clearMetrics,
  hasDemoMetrics,
  listMetrics,
  listPosters,
  putDemoMetrics,
  subscribe,
  type Poster,
  type StoredMetric,
} from "@/lib/store";

const PERIODS = [
  { key: "today", label: "今日" },
  { key: "7d", label: "過去7日" },
  { key: "30d", label: "過去30日" },
] as const;
type PeriodKey = (typeof PERIODS)[number]["key"];

function periodRange(key: PeriodKey): [number, number] {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const end = now.getTime() + 60000;
  if (key === "today") return [startOfToday, end];
  const days = key === "7d" ? 7 : 30;
  return [startOfToday - (days - 1) * 86400000, end];
}

const pct = (n: number, d: number) => (d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "—");
const sec = (ms: number, viewers: number) => (viewers > 0 ? `${(ms / viewers / 1000).toFixed(1)}秒` : "—");

export default function Dashboard() {
  const [period, setPeriod] = useState<PeriodKey>("today");
  const [rows, setRows] = useState<StoredMetric[]>([]);
  const [posters, setPosters] = useState<Poster[]>([]);
  const [hasDemo, setHasDemo] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const [from, to] = periodRange(period);
    const [m, p, d] = await Promise.all([listMetrics(from, to), listPosters(), hasDemoMetrics()]);
    setRows(m);
    setPosters(p);
    setHasDemo(d);
    setLoaded(true);
  }, [period]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- IndexedDB からの読み込み
    load();
    return subscribe((msg) => {
      if (msg.type === "metrics-changed" || msg.type === "posters-changed") load();
    });
  }, [load]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (a, r) => ({ passers: a.passers + r.passers, viewers: a.viewers + r.viewers, dwellMs: a.dwellMs + r.dwellMs }),
        { passers: 0, viewers: 0, dwellMs: 0 },
      ),
    [rows],
  );

  const hourly: HourRow[] = useMemo(() => {
    const out = Array.from({ length: 24 }, (_, hour) => ({ hour, passers: 0, viewers: 0, dwellMs: 0 }));
    for (const r of rows) {
      const h = out[new Date(r.minute).getHours()];
      h.passers += r.passers;
      h.viewers += r.viewers;
      h.dwellMs += r.dwellMs;
    }
    return out;
  }, [rows]);

  const byPoster = useMemo(() => {
    const map = new Map<string, { passers: number; viewers: number; dwellMs: number }>();
    for (const r of rows) {
      const cur = map.get(r.posterId) ?? { passers: 0, viewers: 0, dwellMs: 0 };
      cur.passers += r.passers;
      cur.viewers += r.viewers;
      cur.dwellMs += r.dwellMs;
      map.set(r.posterId, cur);
    }
    const list = [...map.entries()].map(([id, v]) => {
      const p = posters.find((x) => x.id === id);
      return { id, name: p?.name ?? "（削除済みのポスター）", image: p?.image, ...v, rate: v.passers ? v.viewers / v.passers : 0 };
    });
    return list.sort((a, b) => b.rate - a.rate);
  }, [rows, posters]);
  const maxRate = Math.max(0.0001, ...byPoster.map((p) => p.rate));

  const addDemo = async () => {
    if (posters.filter((p) => p.enabled).length === 0) {
      alert("先にポスターを追加してください（デモデータはポスターごとに作られます）。");
      return;
    }
    await putDemoMetrics(demoMetrics(posters, 30));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-black text-gray-800 mr-auto">効果ダッシュボード</h1>
        <div className="inline-flex bg-white border border-gray-200 rounded-lg p-1" role="tablist">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              role="tab"
              aria-selected={period === p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 text-sm font-bold rounded-md ${
                period === p.key ? "bg-primary text-white" : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {hasDemo && (
        <div className="flex flex-wrap items-center gap-3 bg-amber-50 border border-amber-200 text-amber-900 text-sm rounded-xl px-4 py-3">
          <span className="font-bold">デモデータを表示中</span>
          <span>実測データと混ざっています。数値は架空です。</span>
          <button onClick={() => clearMetrics(true)} className="ml-auto underline font-bold">
            デモデータを削除
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="通行人数" value={`${totals.passers.toLocaleString()}人`} note="カメラの前を通った人" />
        <Kpi label="注視人数" value={`${totals.viewers.toLocaleString()}人`} note="画面を一定時間以上見た人" />
        <Kpi label="注視率" value={pct(totals.viewers, totals.passers)} note="注視人数 ÷ 通行人数" />
        <Kpi label="平均注視時間" value={sec(totals.dwellMs, totals.viewers)} note="注視した人1人あたり" />
      </div>

      <section className="bg-white border border-gray-200 rounded-2xl p-5">
        <h2 className="font-bold text-gray-800">時間帯別の注視人数</h2>
        <p className="text-xs text-gray-500 mb-3">期間内の合計。棒にカーソルを合わせると通行人数と注視率も表示します。</p>
        <HourlyChart rows={hourly} />
      </section>

      <section className="bg-white border border-gray-200 rounded-2xl p-5">
        <h2 className="font-bold text-gray-800">ポスター別の効果</h2>
        <p className="text-xs text-gray-500 mb-4">注視率の高い順。表示されていた時間に前を通った人のうち、何%が見たか。</p>
        {byPoster.length === 0 ? (
          <Empty loaded={loaded} onDemo={addDemo} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm whitespace-nowrap">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                  <th className="py-2 pr-3 font-medium">ポスター</th>
                  <th className="py-2 pr-3 font-medium w-[30%] min-w-[140px]">注視率</th>
                  <th className="py-2 pr-3 font-medium text-right">通行</th>
                  <th className="py-2 pr-3 font-medium text-right">注視</th>
                  <th className="py-2 font-medium text-right">平均注視</th>
                </tr>
              </thead>
              <tbody>
                {byPoster.map((p) => (
                  <tr key={p.id} className="border-b border-gray-100 last:border-0">
                    <td className="py-2.5 pr-3">
                      <div className="flex items-center gap-3">
                        {p.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.image} alt="" className="hidden sm:block w-16 h-9 object-cover rounded bg-gray-100" />
                        ) : (
                          <div className="hidden sm:block w-16 h-9 rounded bg-gray-100" />
                        )}
                        <span className="font-bold text-gray-800 whitespace-normal min-w-[6rem]">{p.name}</span>
                      </div>
                    </td>
                    <td className="py-2.5 pr-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${(p.rate / maxRate) * 100}%`, background: "var(--viz-series-1)" }}
                          />
                        </div>
                        <span className="w-14 text-right font-bold tabular-nums text-gray-800">
                          {pct(p.viewers, p.passers)}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{p.passers.toLocaleString()}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{p.viewers.toLocaleString()}</td>
                    <td className="py-2.5 text-right tabular-nums">{sec(p.dwellMs, p.viewers)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="flex flex-wrap gap-3 text-sm">
        {!hasDemo && (
          <button onClick={addDemo} className="px-4 py-2 rounded-lg border border-gray-300 bg-white font-bold hover:bg-gray-50">
            デモデータを入れて見た目を確認（過去30日）
          </button>
        )}
        <button
          onClick={() => confirm("すべての計測データを削除します。よろしいですか？") && clearMetrics(false)}
          className="px-4 py-2 rounded-lg text-red-600 hover:bg-red-50 font-bold"
        >
          計測データをすべて削除
        </button>
      </div>
    </div>
  );
}

function Kpi({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4">
      <div className="text-xs font-bold text-gray-500">{label}</div>
      <div className="mt-1 text-2xl md:text-3xl font-black text-gray-800 tabular-nums">{value}</div>
      <div className="mt-1 text-[11px] text-gray-400">{note}</div>
    </div>
  );
}

function Empty({ loaded, onDemo }: { loaded: boolean; onDemo: () => void }) {
  if (!loaded) return <div className="text-sm text-gray-400 py-8 text-center">読み込み中…</div>;
  return (
    <div className="text-sm text-gray-500 py-8 text-center space-y-3">
      <p>この期間の計測データはまだありません。</p>
      <p>
        <Link href="/admin/posters" className="text-primary font-bold underline">
          ポスターを登録
        </Link>
        してサイネージ画面を開くか、
        <button onClick={onDemo} className="text-primary font-bold underline">
          デモデータを入れて
        </button>
        確認してください。
      </p>
    </div>
  );
}
