// 管理画面・サイネージ画面が使うデータ層の共通インターフェース
//
//   local … アカウント不要のデモモード（ブラウザ内の IndexedDB。第0段階と同じ）
//   cloud … Supabase（NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY が設定されているとき）
//
// 画面側はこのファイルの型だけに依存し、どちらのモードかは `mode` で分岐する。

import type { AttentionSettings, MetricBucket } from "../attention";
import type { PosterSchedule } from "../schedule";

export type { PosterSchedule } from "../schedule";

export type Mode = "local" | "cloud";

/** 端末ごとの判定・表示設定（カメラの選択は端末のブラウザに保存するのでここには含めない） */
export type DeviceSettings = AttentionSettings & {
  /** サイネージ画面に「AIカメラで計測中」の表示を出す */
  showNotice: boolean;
};

export const DEFAULT_DEVICE_SETTINGS: DeviceSettings = {
  yawThreshold: 20,
  pitchThreshold: 15,
  minLookMs: 500,
  minPresenceMs: 300,
  yawOffset: 0,
  pitchOffset: 0,
  showNotice: true,
};

/** DB に保存された部分的な設定を既定値で埋める */
export function withDefaults(partial: Partial<DeviceSettings> | null | undefined): DeviceSettings {
  return { ...DEFAULT_DEVICE_SETTINGS, ...(partial ?? {}) };
}

export type StoreRecord = { id: string; name: string };

export type PosterRecord = {
  id: string;
  name: string;
  /** <img src> にそのまま使える URL（local: data URL / cloud: Storage の公開 URL） */
  imageUrl: string;
  durationSec: number;
  enabled: boolean;
  order: number;
  createdAt: number;
  /** 表示する曜日・時間帯 */
  schedule: PosterSchedule;
};

export type PosterPatch = Partial<Pick<PosterRecord, "name" | "durationSec" | "enabled" | "order" | "schedule">>;

export type NewPoster = { name: string; image: Blob; schedule?: PosterSchedule };

export type DeviceRecord = {
  id: string;
  name: string;
  /** ペアリング済みなら日時（epoch ms） */
  pairedAt: number | null;
  /** 端末が最後に通信した日時（epoch ms） */
  lastSeenAt: number | null;
  /** 未ペアリング時に端末へ入力するコード（XXXX-XXXX） */
  pairingCode: string | null;
  pairingExpiresAt: number | null;
  settings: DeviceSettings;
};

/**
 * ダッシュボード用の集計行。start は集計単位の開始時刻（epoch ms）。
 * local は1分単位、cloud は1時間単位で返す（ダッシュボードは時間帯でまとめるのでどちらでもよい）。
 */
export type MetricRow = {
  start: number;
  posterId: string;
  passers: number;
  viewers: number;
  dwellMs: number;
};

/** オーナー（管理画面）用 */
export interface AdminBackend {
  readonly mode: Mode;

  /** local は常に [{ id: "local", name: "このパソコン" }] */
  listStores(): Promise<StoreRecord[]>;
  /** cloud のみ。local では例外 */
  createStore(name: string): Promise<StoreRecord>;
  renameStore(storeId: string, name: string): Promise<void>;

  listPosters(storeId: string): Promise<PosterRecord[]>;
  /** 末尾に追加する。画像は呼び出し側で JPEG/PNG に変換済み */
  addPosters(storeId: string, items: NewPoster[]): Promise<void>;
  /** 並び替えのため複数件まとめて更新できる */
  updatePosters(storeId: string, patches: { id: string; patch: PosterPatch }[]): Promise<void>;
  /** cloud では Storage の画像も削除する */
  deletePoster(storeId: string, posterId: string): Promise<void>;

  /** [fromMs, toMs) の集計。deviceId を指定するとその端末だけ */
  listMetrics(storeId: string, fromMs: number, toMs: number, deviceId?: string): Promise<MetricRow[]>;

  /** local は1台（id: "local", 常にペアリング済み扱い） */
  listDevices(storeId: string): Promise<DeviceRecord[]>;
  /** cloud のみ。ペアリングコード付きで返す */
  createDevice(storeId: string, name: string): Promise<DeviceRecord>;
  /** cloud のみ。旧トークンを無効にして新しいペアリングコードを発行 */
  resetDevicePairing(deviceId: string): Promise<DeviceRecord>;
  updateDevice(deviceId: string, patch: { name?: string; settings?: DeviceSettings }): Promise<void>;
  /** cloud のみ */
  deleteDevice(deviceId: string): Promise<void>;

  /** ポスター・端末・計測データが変わったら handler を呼ぶ。戻り値で購読解除 */
  subscribe(storeId: string, handler: () => void): () => void;
}

export type Manifest = {
  storeName: string | null;
  deviceName: string | null;
  settings: DeviceSettings;
  /** 有効なポスター（スケジュールの判定は端末側で行う） */
  posters: Pick<PosterRecord, "id" | "name" | "imageUrl" | "durationSec" | "schedule">[];
};

/** 店頭端末（サイネージ画面）用 */
export interface PlayerBackend {
  readonly mode: Mode;
  /** cloud のみ意味を持つ：この端末がペアリング済みか（トークンを持っているか） */
  isPaired(): boolean;
  /** cloud: ペアリングコードを端末トークンに交換して保存。コードが無効なら例外 / local: 何もしない */
  pair(code: string): Promise<void>;
  /** cloud: 端末トークンを消す（別の店舗・端末として登録し直すとき） */
  unpair(): void;
  /** 表示に必要な情報。cloud で端末が未ペアリング／トークン無効なら DeviceNotPairedError */
  loadManifest(): Promise<Manifest>;
  /**
   * 計測データを送る。cloud では端末内の送信待ちキューに積んでから送信し、
   * 失敗しても例外を投げずに次回まとめて再送する（重複は batch_id で防ぐ）
   */
  reportMetrics(buckets: MetricBucket[]): Promise<void>;
  saveCalibration(yawOffset: number, pitchOffset: number): Promise<void>;
  /** 表示内容が変わった可能性があるとき handler を呼ぶ（local: 即時 / cloud: 定期確認） */
  subscribe(handler: () => void): () => void;
}

export class DeviceNotPairedError extends Error {
  constructor(message = "この端末はまだ登録されていません") {
    super(message);
    this.name = "DeviceNotPairedError";
  }
}

/** cloud モードのオーナー認証 */
export interface AuthClient {
  getUserEmail(): Promise<string | null>;
  signIn(email: string, password: string): Promise<void>;
  /** 確認メールが必要な設定なら needsConfirmation: true */
  signUp(email: string, password: string): Promise<{ needsConfirmation: boolean }>;
  signOut(): Promise<void>;
  onChange(handler: (email: string | null) => void): () => void;
}
