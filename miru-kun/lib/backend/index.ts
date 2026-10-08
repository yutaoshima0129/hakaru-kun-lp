// モードに応じたデータ層を返す。環境変数はビルド時に埋め込まれる
import { createCloudAdminBackend, createCloudAuth, createCloudPlayerBackend } from "./cloud";
import { createLocalAdminBackend, createLocalPlayerBackend } from "./local";
import type { AdminBackend, AuthClient, Mode, PlayerBackend } from "./types";

export * from "./types";

export const mode: Mode =
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "cloud" : "local";

let admin: AdminBackend | null = null;
let player: PlayerBackend | null = null;
let auth: AuthClient | null = null;

export function getAdminBackend(): AdminBackend {
  admin ??= mode === "cloud" ? createCloudAdminBackend() : createLocalAdminBackend();
  return admin;
}

export function getPlayerBackend(): PlayerBackend {
  player ??= mode === "cloud" ? createCloudPlayerBackend() : createLocalPlayerBackend();
  return player;
}

/** cloud モードのみ。local では null */
export function getAuth(): AuthClient | null {
  if (mode !== "cloud") return null;
  auth ??= createCloudAuth();
  return auth;
}
