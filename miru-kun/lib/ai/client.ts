// ブラウザから AI 機能（/api/ai/*）を呼ぶ
import { mode } from "../backend";
import { getSupabase } from "../supabase";
import type { PosterBrief, PosterDesign, ReportAdvice, ReportSummary } from "./types";

async function authHeaders(): Promise<Record<string, string>> {
  if (mode !== "cloud") return {};
  const { data } = await getSupabase().auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `AIの呼び出しに失敗しました（${res.status}）`);
  return json as T;
}

/** サーバーで AI 機能が有効か */
export async function aiAvailable(): Promise<boolean> {
  try {
    const res = await fetch("/api/ai/status");
    return res.ok && (await res.json()).enabled === true;
  } catch {
    return false;
  }
}

export async function generatePosterDesigns(brief: PosterBrief, hasPhoto: boolean): Promise<PosterDesign[]> {
  return (await post<{ designs: PosterDesign[] }>("/api/ai/poster-copy", { ...brief, hasPhoto })).designs;
}

export function getReportAdvice(summary: ReportSummary): Promise<ReportAdvice> {
  return post<ReportAdvice>("/api/ai/report-advice", summary);
}
