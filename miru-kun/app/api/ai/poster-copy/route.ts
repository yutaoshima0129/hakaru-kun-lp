import { AiError, checkAccess, generateJson, handleAiError } from "@/lib/ai/server";
import { POSTER_LAYOUTS, POSTER_MOODS, isPosterDesign, type PosterBrief, type PosterDesign } from "@/lib/ai/types";

const SYSTEM = `あなたは飲食店の店頭デジタルサイネージ用ポスターのコピーライター兼デザイナーです。
店主が入力したメニュー情報から、1920×1080 の横長ポスターに載せる文言と配色を 3 案作ります。

守ること:
- 2〜3m 離れた通行人が一瞬で読める短さにする。title は全角 10 文字程度まで、eyebrow は 14 文字程度まで、subtitle は 24 文字程度まで。
- 入力にない事実（産地・受賞歴・「日本一」「No.1」などの根拠のない最上級表現、割引率、期間）を作らない。景品表示法に触れる誇大表現は使わない。
- priceText は入力の価格表記をそのまま使う（"¥" や "円" の付け方程度の整形のみ）。価格が空なら空文字。
- 入力の提供時間・条件があれば eyebrow に活かす。
- 3 案は切り口（シズル感・限定感・親しみやすさ など）と配色をはっきり変える。
- 色は #RRGGBB。text は bg1・bg2 のどちらの上でもはっきり読めるコントラストにし、accent は価格と小見出しに使える目立つ色にする。
- layout は写真がある場合に 1 案以上 "split" にする。写真がない場合は "split" を使わない。`;

const designSchema = {
  type: "object",
  properties: {
    eyebrow: { type: "string" },
    title: { type: "string" },
    subtitle: { type: "string" },
    priceText: { type: "string" },
    bg1: { type: "string" },
    bg2: { type: "string" },
    accent: { type: "string" },
    text: { type: "string" },
    layout: { type: "string", enum: [...POSTER_LAYOUTS] },
  },
  required: ["eyebrow", "title", "subtitle", "priceText", "bg1", "bg2", "accent", "text", "layout"],
  additionalProperties: false,
};

const SCHEMA = {
  type: "object",
  properties: { designs: { type: "array", items: designSchema } },
  required: ["designs"],
  additionalProperties: false,
};

const clip = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function POST(request: Request) {
  const denied = await checkAccess(request);
  if (denied) return denied;

  let brief: PosterBrief & { hasPhoto: boolean };
  try {
    const body = await request.json();
    brief = {
      item: clip(body.item, 60),
      price: clip(body.price, 30),
      details: clip(body.details, 200),
      condition: clip(body.condition, 60),
      mood: POSTER_MOODS.includes(body.mood) ? body.mood : POSTER_MOODS[0],
      hasPhoto: body.hasPhoto === true,
    };
  } catch {
    return Response.json({ error: "入力を読み取れませんでした" }, { status: 400 });
  }
  if (!brief.item) return Response.json({ error: "メニュー名を入力してください" }, { status: 400 });

  try {
    const result = await generateJson({
      system: SYSTEM,
      effort: "low",
      schema: SCHEMA,
      prompt: [
        `メニュー名: ${brief.item}`,
        `価格: ${brief.price || "（なし）"}`,
        `こだわり・補足: ${brief.details || "（なし）"}`,
        `提供時間・条件: ${brief.condition || "（なし）"}`,
        `雰囲気: ${brief.mood}`,
        `写真: ${brief.hasPhoto ? "あり（split レイアウトで左半分に表示される）" : "なし"}`,
      ].join("\n"),
    });
    const designs = ((result as { designs?: unknown[] }).designs ?? [])
      .filter(isPosterDesign)
      .map((d) => (brief.hasPhoto || d.layout !== "split" ? d : { ...d, layout: "left" as const }))
      .slice(0, 3);
    if (designs.length === 0) throw new AiError("案を作れませんでした。もう一度お試しください");
    return Response.json({ designs } satisfies { designs: PosterDesign[] });
  } catch (e) {
    return handleAiError(e);
  }
}
