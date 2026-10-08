// Supabase 版の実装。オーナーは RLS、店頭端末は端末トークン + anon RPC で読み書きする

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MetricBucket } from "../attention";
import { getSupabase } from "../supabase";
import {
  DeviceNotPairedError,
  withDefaults,
  type AdminBackend,
  type AuthClient,
  type DeviceRecord,
  type Manifest,
  type PlayerBackend,
  type PosterPatch,
  type PosterRecord,
  type StoreRecord,
} from "./types";

const TOKEN_KEY = "miru-kun:device-token";
const CHANNEL_NAME = "miru-kun-cloud";
const POLL_MS = 30_000;
const OUTBOX_DB = "miru-kun-outbox";
const OUTBOX_STORE = "batches";
const OUTBOX_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** { data, error } を取り出す。エラーなら例外にする */
function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

function check(res: { error: { message: string } | null }): void {
  if (res.error) throw new Error(res.error.message);
}

const toMs = (v: string | null): number | null => (v ? Date.parse(v) : null);

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// ---------------------------------------------------------------
// オーナー（管理画面）
// ---------------------------------------------------------------

type PosterRow = {
  id: string;
  name: string;
  image_path: string;
  duration_sec: number;
  enabled: boolean;
  sort_order: number;
  created_at: string;
};

type DeviceRow = {
  id: string;
  name: string;
  paired_at: string | null;
  last_seen_at: string | null;
  pairing_code: string | null;
  pairing_expires_at: string | null;
  settings: Partial<import("./types").DeviceSettings> | null;
};

// token_hash は権限がないので * は使わない
const DEVICE_COLUMNS = "id,name,paired_at,last_seen_at,pairing_code,pairing_expires_at,settings";

export function createCloudAdminBackend(client: SupabaseClient = getSupabase()): AdminBackend {
  const publicUrl = (path: string) => client.storage.from("posters").getPublicUrl(path).data.publicUrl;

  const toPoster = (r: PosterRow): PosterRecord => ({
    id: r.id,
    name: r.name,
    imageUrl: publicUrl(r.image_path),
    durationSec: r.duration_sec,
    enabled: r.enabled,
    order: r.sort_order,
    createdAt: Date.parse(r.created_at),
  });

  const toDevice = (r: DeviceRow): DeviceRecord => ({
    id: r.id,
    name: r.name,
    pairedAt: toMs(r.paired_at),
    lastSeenAt: toMs(r.last_seen_at),
    pairingCode: r.pairing_code,
    pairingExpiresAt: toMs(r.pairing_expires_at),
    settings: withDefaults(r.settings),
  });

  async function fetchDevice(deviceId: string): Promise<DeviceRecord> {
    const row = unwrap<DeviceRow>(await client.from("devices").select(DEVICE_COLUMNS).eq("id", deviceId).single());
    return toDevice(row);
  }

  // 他のタブの管理画面にも変更を知らせる（BroadcastChannel）
  function notify(storeId: string) {
    if (typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel(CHANNEL_NAME);
    ch.postMessage({ storeId });
    ch.close();
  }

  return {
    mode: "cloud",

    async listStores() {
      return unwrap<StoreRecord[]>(await client.from("stores").select("id,name").order("created_at"));
    },
    async createStore(name) {
      return unwrap<StoreRecord>(await client.from("stores").insert({ name }).select("id,name").single());
    },
    async renameStore(storeId, name) {
      check(await client.from("stores").update({ name }).eq("id", storeId));
      notify(storeId);
    },

    async listPosters(storeId) {
      const rows = unwrap<PosterRow[]>(
        await client
          .from("posters")
          .select("id,name,image_path,duration_sec,enabled,sort_order,created_at")
          .eq("store_id", storeId)
          .order("sort_order")
          .order("created_at"),
      );
      return rows.map(toPoster);
    },
    async addPosters(storeId, items) {
      const last = unwrap<{ sort_order: number }[]>(
        await client
          .from("posters")
          .select("sort_order")
          .eq("store_id", storeId)
          .order("sort_order", { ascending: false })
          .limit(1),
      );
      const start = last.length ? last[0].sort_order + 1 : 0;

      try {
        for (const [i, item] of items.entries()) {
          const ext = EXT_BY_TYPE[item.image.type];
          if (!ext) throw new Error("JPEG・PNG・WebP 形式の画像のみ追加できます");
          const path = `${storeId}/${crypto.randomUUID()}.${ext}`;
          check(await client.storage.from("posters").upload(path, item.image, { contentType: item.image.type }));
          const ins = await client
            .from("posters")
            .insert({ store_id: storeId, name: item.name, image_path: path, sort_order: start + i });
          if (ins.error) {
            // 孤児ファイルを残さない
            const rm = await client.storage.from("posters").remove([path]);
            if (rm.error) console.warn("画像の後始末に失敗しました", rm.error.message);
            throw new Error(ins.error.message);
          }
        }
      } finally {
        // 途中まで追加できた分も反映させる
        notify(storeId);
      }
    },
    async updatePosters(storeId, patches) {
      const toColumns = (p: PosterPatch) => {
        const c: Record<string, unknown> = {};
        if (p.name !== undefined) c.name = p.name;
        if (p.durationSec !== undefined) c.duration_sec = p.durationSec;
        if (p.enabled !== undefined) c.enabled = p.enabled;
        if (p.order !== undefined) c.sort_order = p.order;
        return c;
      };
      const results = await Promise.all(
        patches
          .map(({ id, patch }) => ({ id, cols: toColumns(patch) }))
          .filter(({ cols }) => Object.keys(cols).length > 0)
          .map(({ id, cols }) => client.from("posters").update(cols).eq("id", id).eq("store_id", storeId)),
      );
      notify(storeId);
      for (const r of results) check(r);
    },
    async deletePoster(storeId, posterId) {
      const row = unwrap<{ image_path: string } | null>(
        await client.from("posters").select("image_path").eq("id", posterId).eq("store_id", storeId).maybeSingle(),
      );
      check(await client.from("posters").delete().eq("id", posterId).eq("store_id", storeId));
      notify(storeId);
      if (row) {
        const rm = await client.storage.from("posters").remove([row.image_path]);
        if (rm.error) console.warn("画像の削除に失敗しました", rm.error.message);
      }
    },

    async listMetrics(storeId, fromMs, toMs, deviceId) {
      const rows = unwrap<
        { hour: string; poster_id: string; passers: number | string; viewers: number | string; dwell_ms: number | string }[]
      >(
        await client.rpc("store_metrics_hourly", {
          p_store_id: storeId,
          p_from: new Date(fromMs).toISOString(),
          p_to: new Date(toMs).toISOString(),
          p_device_id: deviceId ?? null,
        }),
      );
      return rows.map((r) => ({
        start: Date.parse(r.hour),
        posterId: r.poster_id,
        passers: Number(r.passers),
        viewers: Number(r.viewers),
        dwellMs: Number(r.dwell_ms),
      }));
    },

    async listDevices(storeId) {
      const rows = unwrap<DeviceRow[]>(
        await client.from("devices").select(DEVICE_COLUMNS).eq("store_id", storeId).order("created_at"),
      );
      return rows.map(toDevice);
    },
    async createDevice(storeId, name) {
      const rows = unwrap<{ id: string }[]>(await client.rpc("create_device", { p_store_id: storeId, p_name: name }));
      const device = await fetchDevice(rows[0].id);
      notify(storeId);
      return device;
    },
    async resetDevicePairing(deviceId) {
      check(await client.rpc("reset_device_pairing", { p_device_id: deviceId }));
      const row = unwrap<{ store_id: string }>(
        await client.from("devices").select("store_id").eq("id", deviceId).single(),
      );
      const device = await fetchDevice(deviceId);
      notify(row.store_id);
      return device;
    },
    async updateDevice(deviceId, patch) {
      const cols: Record<string, unknown> = {};
      if (patch.name !== undefined) cols.name = patch.name;
      if (patch.settings !== undefined) cols.settings = patch.settings;
      if (Object.keys(cols).length === 0) return;
      const row = unwrap<{ store_id: string }>(
        await client.from("devices").update(cols).eq("id", deviceId).select("store_id").single(),
      );
      notify(row.store_id);
    },
    async deleteDevice(deviceId) {
      const row = unwrap<{ store_id: string }>(
        await client.from("devices").delete().eq("id", deviceId).select("store_id").single(),
      );
      notify(row.store_id);
    },

    subscribe(storeId, handler) {
      let channel: BroadcastChannel | null = null;
      if (typeof BroadcastChannel !== "undefined") {
        channel = new BroadcastChannel(CHANNEL_NAME);
        channel.onmessage = (e: MessageEvent<{ storeId?: string }>) => {
          if (e.data?.storeId === storeId) handler();
        };
      }
      const timer = setInterval(handler, POLL_MS);
      const onFocus = () => handler();
      window.addEventListener("focus", onFocus);
      return () => {
        channel?.close();
        clearInterval(timer);
        window.removeEventListener("focus", onFocus);
      };
    },
  };
}

// ---------------------------------------------------------------
// 店頭端末（サイネージ画面）
// ---------------------------------------------------------------

function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}
function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // 保存先が使えない環境では何もしない
  }
}

// --- 送信待ちキュー（IndexedDB。アプリ本体の miru-kun DB とは別） ---

type OutboxBatch = { batchId: string; rows: MetricBucket[]; createdAt: number };

function openOutbox(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(OUTBOX_DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(OUTBOX_STORE, { keyPath: "batchId" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function outboxAdd(batch: OutboxBatch): Promise<void> {
  const db = await openOutbox();
  try {
    const tx = db.transaction(OUTBOX_STORE, "readwrite");
    tx.objectStore(OUTBOX_STORE).put(batch);
    await txDone(tx);
  } finally {
    db.close();
  }
}

async function outboxList(): Promise<OutboxBatch[]> {
  const db = await openOutbox();
  try {
    const req = db.transaction(OUTBOX_STORE, "readonly").objectStore(OUTBOX_STORE).getAll();
    const all = await new Promise<OutboxBatch[]>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result as OutboxBatch[]);
      req.onerror = () => reject(req.error);
    });
    return all.sort((a, b) => a.createdAt - b.createdAt);
  } finally {
    db.close();
  }
}

async function outboxDelete(batchId: string): Promise<void> {
  const db = await openOutbox();
  try {
    const tx = db.transaction(OUTBOX_STORE, "readwrite");
    tx.objectStore(OUTBOX_STORE).delete(batchId);
    await txDone(tx);
  } finally {
    db.close();
  }
}

type ManifestJson = {
  device: { id: string; name: string | null; settings: Partial<import("./types").DeviceSettings> | null };
  store: { id: string; name: string | null } | null;
  posters: { id: string; name: string; image_path: string; duration_sec: number }[];
};

export function createCloudPlayerBackend(client: SupabaseClient = getSupabase()): PlayerBackend {
  let flushing = false;

  async function flush(): Promise<void> {
    if (flushing) return;
    const token = getToken();
    if (!token) return; // 未ペアリングの間はキューに溜めておく
    flushing = true;
    try {
      for (const batch of await outboxList()) {
        if (Date.now() - batch.createdAt > OUTBOX_MAX_AGE_MS) {
          await outboxDelete(batch.batchId); // サーバーも受け付けない古さ
          continue;
        }
        const { error } = await client.rpc("device_report", {
          p_token: token,
          p_batch_id: batch.batchId,
          p_rows: batch.rows.map((b) => ({
            minute: new Date(b.minute).toISOString(),
            poster_id: b.posterId,
            passers: b.passers,
            viewers: b.viewers,
            dwell_ms: b.dwellMs,
          })),
        });
        if (error) throw new Error(error.message);
        await outboxDelete(batch.batchId);
      }
    } finally {
      flushing = false;
    }
  }

  return {
    mode: "cloud",

    isPaired: () => getToken() !== null,

    async pair(code) {
      const { data, error } = await client.rpc("pair_device", { p_code: code });
      const row = Array.isArray(data) ? (data[0] as { device_token?: string } | undefined) : undefined;
      if (error || !row?.device_token) {
        throw new Error("コードが正しくないか、有効期限が切れています");
      }
      setToken(row.device_token);
    },
    unpair() {
      clearToken();
    },

    async loadManifest(): Promise<Manifest> {
      const token = getToken();
      if (!token) throw new DeviceNotPairedError();
      const { data, error } = await client.rpc("device_manifest", { p_token: token });
      if (error) {
        if (error.code === "28000") {
          clearToken();
          throw new DeviceNotPairedError();
        }
        throw new Error(error.message);
      }
      const m = data as ManifestJson;
      return {
        storeName: m.store?.name ?? null,
        deviceName: m.device.name ?? null,
        settings: withDefaults(m.device.settings),
        posters: m.posters.map((p) => ({
          id: p.id,
          name: p.name,
          imageUrl: client.storage.from("posters").getPublicUrl(p.image_path).data.publicUrl,
          durationSec: p.duration_sec,
        })),
      };
    },

    async reportMetrics(buckets) {
      try {
        if (buckets.length > 0) {
          await outboxAdd({ batchId: crypto.randomUUID(), rows: buckets, createdAt: Date.now() });
        }
        await flush();
      } catch (e) {
        console.warn("計測データの送信に失敗しました（次回再送します）", e);
      }
    },

    async saveCalibration(yawOffset, pitchOffset) {
      const token = getToken();
      if (!token) throw new DeviceNotPairedError();
      const { error } = await client.rpc("device_save_calibration", {
        p_token: token,
        p_yaw_offset: yawOffset,
        p_pitch_offset: pitchOffset,
      });
      if (error) {
        if (error.code === "28000") {
          clearToken();
          throw new DeviceNotPairedError();
        }
        throw new Error(error.message);
      }
    },

    subscribe(handler) {
      const timer = setInterval(handler, POLL_MS);
      const onOnline = () => handler();
      window.addEventListener("online", onOnline);
      return () => {
        clearInterval(timer);
        window.removeEventListener("online", onOnline);
      };
    },
  };
}

// ---------------------------------------------------------------
// オーナー認証
// ---------------------------------------------------------------

export function createCloudAuth(client: SupabaseClient = getSupabase()): AuthClient {
  return {
    async getUserEmail() {
      const { data, error } = await client.auth.getSession();
      if (error) throw new Error(error.message);
      return data.session?.user?.email ?? null;
    },
    async signIn(email, password) {
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message);
    },
    async signUp(email, password) {
      const { data, error } = await client.auth.signUp({ email, password });
      if (error) throw new Error(error.message);
      return { needsConfirmation: !data.session };
    },
    async signOut() {
      const { error } = await client.auth.signOut();
      if (error) throw new Error(error.message);
    },
    onChange(handler) {
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        handler(session?.user?.email ?? null);
      });
      return () => data.subscription.unsubscribe();
    },
  };
}
