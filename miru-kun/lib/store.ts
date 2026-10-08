// プロトタイプ用のデータ保存層（ブラウザ内の IndexedDB / localStorage）
// 本番では同じ関数のシグネチャのまま Supabase に置き換える想定。

import { bucketKey, type AttentionSettings, type MetricBucket } from "./attention";

export type Poster = {
  id: string;
  name: string;
  /** 画像（data URL） */
  image: string;
  durationSec: number;
  enabled: boolean;
  order: number;
  createdAt: number;
};

export type StoredMetric = MetricBucket & { key: string; demo?: boolean };

export type AppSettings = AttentionSettings & {
  /** サイネージ画面にカメラ計測中の表示を出す */
  showNotice: boolean;
  /** 使用するカメラ（空なら既定） */
  cameraDeviceId: string;
};

export const DEFAULT_SETTINGS: AppSettings = {
  yawThreshold: 20,
  pitchThreshold: 15,
  minLookMs: 500,
  minPresenceMs: 300,
  yawOffset: 0,
  pitchOffset: 0,
  showNotice: true,
  cameraDeviceId: "",
};

const DB_NAME = "miru-kun";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("posters")) {
          db.createObjectStore("posters", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("metrics")) {
          const s = db.createObjectStore("metrics", { keyPath: "key" });
          s.createIndex("minute", "minute");
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function result<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ---------- 画面間の通知（管理画面 ⇄ サイネージ画面） ----------

export type AppMessage = { type: "posters-changed" } | { type: "settings-changed" } | { type: "metrics-changed" };

const CHANNEL = "miru-kun";

export function notify(msg: AppMessage) {
  const ch = new BroadcastChannel(CHANNEL);
  ch.postMessage(msg);
  ch.close();
}

export function subscribe(handler: (msg: AppMessage) => void): () => void {
  const ch = new BroadcastChannel(CHANNEL);
  ch.onmessage = (e) => handler(e.data as AppMessage);
  return () => ch.close();
}

// ---------- ポスター ----------

export async function listPosters(): Promise<Poster[]> {
  const db = await openDb();
  const all = await result(db.transaction("posters").objectStore("posters").getAll() as IDBRequest<Poster[]>);
  return all.sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
}

export async function savePosters(posters: Poster[]) {
  const db = await openDb();
  const tx = db.transaction("posters", "readwrite");
  for (const p of posters) tx.objectStore("posters").put(p);
  await done(tx);
  notify({ type: "posters-changed" });
}

export async function deletePoster(id: string) {
  const db = await openDb();
  const tx = db.transaction("posters", "readwrite");
  tx.objectStore("posters").delete(id);
  await done(tx);
  notify({ type: "posters-changed" });
}

export function newId() {
  return crypto.randomUUID();
}

// ---------- 計測データ ----------

/** 1分単位のバケットを既存値に加算して保存 */
export async function addMetrics(buckets: MetricBucket[]) {
  if (buckets.length === 0) return;
  const db = await openDb();
  const tx = db.transaction("metrics", "readwrite");
  const store = tx.objectStore("metrics");
  for (const b of buckets) {
    const key = bucketKey(b.minute, b.posterId);
    const req = store.get(key) as IDBRequest<StoredMetric | undefined>;
    req.onsuccess = () => {
      const cur = req.result;
      store.put({
        key,
        minute: b.minute,
        posterId: b.posterId,
        passers: (cur?.passers ?? 0) + b.passers,
        viewers: (cur?.viewers ?? 0) + b.viewers,
        dwellMs: (cur?.dwellMs ?? 0) + b.dwellMs,
        demo: cur?.demo,
      } satisfies StoredMetric);
    };
  }
  await done(tx);
  notify({ type: "metrics-changed" });
}

export async function listMetrics(fromMs: number, toMs: number): Promise<StoredMetric[]> {
  const db = await openDb();
  const index = db.transaction("metrics").objectStore("metrics").index("minute");
  return result(index.getAll(IDBKeyRange.bound(fromMs, toMs, false, true)) as IDBRequest<StoredMetric[]>);
}

export async function putDemoMetrics(rows: StoredMetric[]) {
  const db = await openDb();
  const tx = db.transaction("metrics", "readwrite");
  const store = tx.objectStore("metrics");
  for (const r of rows) {
    // 実測データがある分は上書きしない
    const req = store.getKey(r.key);
    req.onsuccess = () => {
      if (req.result === undefined) store.put(r);
    };
  }
  await done(tx);
  notify({ type: "metrics-changed" });
}

export async function hasDemoMetrics(): Promise<boolean> {
  const db = await openDb();
  const all = await result(db.transaction("metrics").objectStore("metrics").getAll() as IDBRequest<StoredMetric[]>);
  return all.some((r) => r.demo);
}

export async function clearMetrics(onlyDemo: boolean) {
  const db = await openDb();
  const tx = db.transaction("metrics", "readwrite");
  const store = tx.objectStore("metrics");
  if (!onlyDemo) {
    store.clear();
  } else {
    const req = store.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return;
      if ((cursor.value as StoredMetric).demo) cursor.delete();
      cursor.continue();
    };
  }
  await done(tx);
  notify({ type: "metrics-changed" });
}

// ---------- 設定 ----------

const SETTINGS_KEY = "miru-kun:settings";

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: AppSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  notify({ type: "settings-changed" });
}
