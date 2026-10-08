"use client";

import { useState } from "react";
import { getReportAdvice } from "@/lib/ai/client";
import type { ReportAdvice, ReportSummary } from "@/lib/ai/types";

/** 週次レポートの AI 分析。集計済みの数字だけを送る */
export default function ReportAiPanel({ summary }: { summary: ReportSummary }) {
  const [busy, setBusy] = useState(false);
  const [advice, setAdvice] = useState<ReportAdvice | null>(null);
  const [error, setError] = useState("");

  const run = async () => {
    setBusy(true);
    setError("");
    try {
      setAdvice(await getReportAdvice(summary));
    } catch (e) {
      setAdvice(null);
      setError((e as Error).message || "分析に失敗しました。時間をおいてもう一度お試しください。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="bg-white border border-gray-200 rounded-2xl p-5 print:break-inside-avoid">
      <h2 className="font-bold text-gray-800">AIによる分析</h2>
      <div className="print:hidden mt-3">
        <button
          onClick={run}
          disabled={busy}
          className="px-4 py-2 rounded-lg bg-primary text-white font-bold text-sm hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "分析中…" : advice ? "もう一度分析する" : "AIに分析してもらう"}
        </button>
        <p className="mt-2 text-xs text-gray-500">送信するのは集計した数字だけです（映像や個人の情報は含みません）</p>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
      {advice && (
        <div className="mt-4 space-y-4">
          <p className="text-sm text-gray-800 leading-relaxed">{advice.summary}</p>
          <div className="grid gap-3 md:grid-cols-3">
            {advice.actions.map((a, i) => (
              <div key={i} className="border border-gray-200 rounded-xl p-4 bg-gray-50">
                <div className="text-xs font-bold text-gray-500">提案 {i + 1}</div>
                <div className="mt-1 font-bold text-gray-800">{a.title}</div>
                <p className="mt-1 text-sm text-gray-700 leading-relaxed">{a.detail}</p>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-gray-400">AIの提案は集計値からの推測です。実際の状況に合わせて判断してください。</p>
        </div>
      )}
    </section>
  );
}
