// AI 機能の入出力（ブラウザとサーバーで共有）

/** ポスター作成の入力 */
export type PosterBrief = {
  /** メニュー名・商品名（必須） */
  item: string;
  /** 価格表示（例 "980円" / "半額"）。空なら価格なし */
  price: string;
  /** こだわり・補足（例 "国産和栗を使用"） */
  details: string;
  /** 提供時間・条件（例 "11:00〜14:00限定"） */
  condition: string;
  mood: PosterMood;
};

export const POSTER_MOODS = ["にぎやか", "高級感", "和風", "ナチュラル", "ポップ"] as const;
export type PosterMood = (typeof POSTER_MOODS)[number];

export const POSTER_LAYOUTS = ["left", "center", "split"] as const;
export type PosterLayout = (typeof POSTER_LAYOUTS)[number];

/** テンプレートに流し込むデザイン（AI またはテンプレートが作る） */
export type PosterDesign = {
  /** 上の小見出し（時間帯・限定など）。空可 */
  eyebrow: string;
  /** 大見出し（メニュー名を魅力的に） */
  title: string;
  /** 補足の一文。空可 */
  subtitle: string;
  /** 価格表示。空可 */
  priceText: string;
  /** 背景グラデーション2色と強調色・文字色（#RRGGBB） */
  bg1: string;
  bg2: string;
  accent: string;
  text: string;
  /** left: 左寄せ / center: 中央 / split: 左に写真・右に文字（写真がある時向け） */
  layout: PosterLayout;
};

/** 週次レポートの AI 分析の入力（集計値のみ。個人を特定する情報は含まない） */
export type ReportSummary = {
  storeName: string;
  period: { from: string; to: string };
  thisWeek: { passers: number; viewers: number; dwellSec: number };
  lastWeek: { passers: number; viewers: number; dwellSec: number };
  /** 時間帯別（0〜23時）の今週の通行・注視 */
  hourly: { hour: number; passers: number; viewers: number }[];
  posters: { name: string; schedule: string; passers: number; viewers: number; avgDwellSec: number }[];
};

export type ReportAdvice = {
  /** 今週の総評（2〜3文） */
  summary: string;
  /** 具体的な改善提案（3件） */
  actions: { title: string; detail: string }[];
};

const HEX = /^#[0-9a-fA-F]{6}$/;

/** AI の出力を検証する（構造化出力でも最終確認はアプリ側で行う） */
export function isPosterDesign(v: unknown): v is PosterDesign {
  if (!v || typeof v !== "object") return false;
  const d = v as Record<string, unknown>;
  return (
    ["eyebrow", "title", "subtitle", "priceText"].every((k) => typeof d[k] === "string") &&
    (d.title as string).length > 0 &&
    ["bg1", "bg2", "accent", "text"].every((k) => typeof d[k] === "string" && HEX.test(d[k] as string)) &&
    POSTER_LAYOUTS.includes(d.layout as PosterLayout)
  );
}

export function isReportAdvice(v: unknown): v is ReportAdvice {
  if (!v || typeof v !== "object") return false;
  const a = v as Record<string, unknown>;
  return (
    typeof a.summary === "string" &&
    Array.isArray(a.actions) &&
    a.actions.every(
      (x) => x && typeof x === "object" && typeof (x as { title?: unknown }).title === "string" && typeof (x as { detail?: unknown }).detail === "string",
    )
  );
}
