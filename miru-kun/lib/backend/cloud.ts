// Supabase 版の実装（実装担当が置き換える仮の雛形）
import type { AdminBackend, AuthClient, PlayerBackend } from "./types";

export function createCloudAdminBackend(): AdminBackend {
  throw new Error("cloud backend is not implemented yet");
}

export function createCloudPlayerBackend(): PlayerBackend {
  throw new Error("cloud backend is not implemented yet");
}

export function createCloudAuth(): AuthClient {
  throw new Error("cloud backend is not implemented yet");
}
