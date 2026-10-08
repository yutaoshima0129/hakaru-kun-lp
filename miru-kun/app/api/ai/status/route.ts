import { aiEnabled } from "@/lib/ai/server";

/** 管理画面が AI ボタンを出すかどうかの判定に使う */
export async function GET() {
  return Response.json({ enabled: aiEnabled() });
}
