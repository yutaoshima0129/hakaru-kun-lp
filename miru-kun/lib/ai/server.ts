// サーバー専用：Claude の呼び出しと利用者の確認（API ルートからのみ import する）

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const MODEL = "claude-opus-5-5";

const cloudConfigured = () => !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/** AI 機能が使える設定か（API キーがあり、クラウドモードか、デモモードで明示的に許可されている） */
export function aiEnabled(): boolean {
  return !!process.env.ANTHROPIC_API_KEY && (cloudConfigured() || process.env.MIRU_ALLOW_DEMO_AI === "1");
}

const errorJson = (status: number, error: string) => Response.json({ error }, { status });

/**
 * 呼び出し元を確認する。問題があればそのまま返すエラー応答、なければ null。
 * クラウドモードはログイン中のオーナーだけ（Supabase のアクセストークンを検証）。
 * デモモードは MIRU_ALLOW_DEMO_AI=1 のときだけ（公開サーバーで API キーを使われないように）。
 */
export async function checkAccess(request: Request): Promise<Response | null> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return errorJson(503, "AI機能が設定されていません（ANTHROPIC_API_KEY）");
  }
  if (cloudConfigured()) {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return errorJson(401, "ログインしてください");
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return errorJson(401, "ログインの有効期限が切れています。再度ログインしてください");
    return null;
  }
  if (process.env.MIRU_ALLOW_DEMO_AI !== "1") {
    return errorJson(403, "デモモードでAIを使うには MIRU_ALLOW_DEMO_AI=1 を設定してください");
  }
  return null;
}

let client: Anthropic | null = null;

/**
 * JSON スキーマで出力形式を固定して Claude を1回呼び出す。
 * 安全上の理由で断られた場合はサーバー側で別モデルに切り替える（fallbacks: "default"）。
 */
export async function generateJson(opts: {
  system: string;
  prompt: string;
  schema: Record<string, unknown>;
  effort: "low" | "medium" | "high";
}): Promise<unknown> {
  client ??= new Anthropic();
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: opts.effort, format: { type: "json_schema", schema: opts.schema } },
    system: opts.system,
    messages: [{ role: "user", content: opts.prompt }],
  });

  if (response.stop_reason === "refusal") {
    throw new AiError("この内容では作成できませんでした。表現を変えてお試しください");
  }
  if (response.stop_reason === "max_tokens") {
    throw new AiError("出力が長すぎて途中で止まりました。もう一度お試しください");
  }
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new AiError("AIから結果が返りませんでした");
  return JSON.parse(text.text);
}

/** 利用者にそのまま見せてよいエラー */
export class AiError extends Error {}

/** ルートの共通エラー処理：API のエラーは詳細を隠してログに残す */
export function handleAiError(e: unknown): Response {
  if (e instanceof AiError) return errorJson(422, e.message);
  if (e instanceof Anthropic.RateLimitError) return errorJson(429, "混み合っています。少し待ってからお試しください");
  if (e instanceof Anthropic.AuthenticationError) {
    console.error("Anthropic API キーが無効です");
    return errorJson(503, "AI機能の設定に問題があります");
  }
  if (e instanceof Anthropic.APIError) {
    console.error(`Anthropic API error ${e.status}:`, e.message);
    return errorJson(502, "AIの呼び出しに失敗しました。もう一度お試しください");
  }
  if (e instanceof SyntaxError) {
    console.error("AI の出力を JSON として読めませんでした", e);
    return errorJson(502, "AIの結果を読み取れませんでした。もう一度お試しください");
  }
  console.error(e);
  return errorJson(500, "予期しないエラーが発生しました");
}
