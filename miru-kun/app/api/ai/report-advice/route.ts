import { AiError, checkAccess, generateJson, handleAiError } from "@/lib/ai/server";
import { isReportAdvice, type ReportAdvice, type ReportSummary } from "@/lib/ai/types";

const SYSTEM = `あなたは飲食店のデジタルサイネージ運用のアドバイザーです。
店頭モニターの1週間分の計測データ（前を通った人数・画面を見た人数・見ていた秒数）を読み、店主に向けて日本語で助言します。

守ること:
- 数字から言えることだけを書く。データにない売上・客層・天候などを断定しない。推測するときは「〜かもしれません」と書く。
- 通行人数が少ないポスターや時間帯（目安: 30人未満）の注視率は誤差が大きいので、強い結論を出さない。
- actions はちょうど 3 件。店主が今週すぐ試せる具体的な行動にする（例: ポスターの差し替え、表示時間帯の変更、表示秒数の変更、文言の見直し）。
- summary は 2〜3 文。専門用語を避け、やさしい言葉で書く。`;

const SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    actions: {
      type: "array",
      items: {
        type: "object",
        properties: { title: { type: "string" }, detail: { type: "string" } },
        required: ["title", "detail"],
        additionalProperties: false,
      },
    },
  },
  required: ["summary", "actions"],
  additionalProperties: false,
};

export async function POST(request: Request) {
  const denied = await checkAccess(request);
  if (denied) return denied;

  let summary: ReportSummary;
  try {
    summary = (await request.json()) as ReportSummary;
    if (
      typeof summary?.storeName !== "string" ||
      !summary.thisWeek ||
      !summary.lastWeek ||
      !Array.isArray(summary.posters) ||
      !Array.isArray(summary.hourly)
    )
      throw new Error();
  } catch {
    return Response.json({ error: "集計データを読み取れませんでした" }, { status: 400 });
  }
  // 送られてくるのは集計値だけ。サイズの上限だけ確認する
  if (summary.posters.length > 200 || summary.hourly.length > 24) {
    return Response.json({ error: "集計データが大きすぎます" }, { status: 400 });
  }

  try {
    const result = await generateJson({
      system: SYSTEM,
      effort: "medium",
      schema: SCHEMA,
      prompt: `以下は店舗「${summary.storeName.slice(0, 100)}」の計測データ（JSON）です。\n\n${JSON.stringify({
        period: summary.period,
        thisWeek: summary.thisWeek,
        lastWeek: summary.lastWeek,
        hourly: summary.hourly,
        posters: summary.posters,
      })}`,
    });
    if (!isReportAdvice(result) || result.actions.length === 0) {
      throw new AiError("分析結果を作れませんでした。もう一度お試しください");
    }
    return Response.json({ ...result, actions: result.actions.slice(0, 3) } satisfies ReportAdvice);
  } catch (e) {
    return handleAiError(e);
  }
}
