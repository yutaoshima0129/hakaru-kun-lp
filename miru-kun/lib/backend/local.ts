// デモモード（アカウント不要）の実装。第0段階の IndexedDB / localStorage をそのまま使う

import { demoMetrics } from "../samples";
import {
  addMetrics,
  clearMetrics,
  deletePoster as deleteLocalPoster,
  hasDemoMetrics,
  listMetrics as listLocalMetrics,
  listPosters as listLocalPosters,
  loadSettings,
  newId,
  putDemoMetrics,
  savePosters,
  saveSettings,
  subscribe as subscribeLocal,
  type Poster,
} from "../store";
import { ALWAYS } from "../schedule";
import {
  withDefaults,
  type AdminBackend,
  type DeviceRecord,
  type DeviceSettings,
  type PlayerBackend,
  type PosterRecord,
} from "./types";

export const LOCAL_STORE_ID = "local";
export const LOCAL_DEVICE_ID = "local";

const toRecord = (p: Poster): PosterRecord => ({
  id: p.id,
  name: p.name,
  imageUrl: p.image,
  durationSec: p.durationSec,
  enabled: p.enabled,
  order: p.order,
  createdAt: p.createdAt,
  schedule: p.schedule ?? ALWAYS,
});

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function currentSettings(): DeviceSettings {
  // cameraDeviceId は端末側の設定なので外す
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { cameraDeviceId, ...rest } = loadSettings();
  return withDefaults(rest);
}

const notSupported = (what: string) => Promise.reject(new Error(`デモモードでは${what}できません`));

export function createLocalAdminBackend(): AdminBackend {
  return {
    mode: "local",

    async listStores() {
      return [{ id: LOCAL_STORE_ID, name: "このパソコン" }];
    },
    createStore: () => notSupported("店舗を追加"),
    renameStore: () => notSupported("店舗名を変更"),

    async listPosters() {
      return (await listLocalPosters()).map(toRecord);
    },
    async addPosters(_storeId, items) {
      const existing = await listLocalPosters();
      const start = existing.length ? Math.max(...existing.map((p) => p.order)) + 1 : 0;
      const now = Date.now();
      const created: Poster[] = [];
      for (const [i, item] of items.entries()) {
        created.push({
          id: newId(),
          name: item.name,
          image: await blobToDataUrl(item.image),
          durationSec: 10,
          enabled: true,
          order: start + i,
          createdAt: now + i,
          schedule: item.schedule ?? ALWAYS,
        });
      }
      await savePosters(created);
    },
    async updatePosters(_storeId, patches) {
      const byId = new Map((await listLocalPosters()).map((p) => [p.id, p]));
      const updated: Poster[] = [];
      for (const { id, patch } of patches) {
        const p = byId.get(id);
        if (p) updated.push({ ...p, ...patch });
      }
      await savePosters(updated);
    },
    async deletePoster(_storeId, posterId) {
      await deleteLocalPoster(posterId);
    },

    async listMetrics(_storeId, fromMs, toMs) {
      return (await listLocalMetrics(fromMs, toMs)).map((m) => ({
        start: m.minute,
        posterId: m.posterId,
        passers: m.passers,
        viewers: m.viewers,
        dwellMs: m.dwellMs,
      }));
    },

    async listDevices(): Promise<DeviceRecord[]> {
      return [
        {
          id: LOCAL_DEVICE_ID,
          name: "このパソコン",
          pairedAt: 0,
          lastSeenAt: null,
          pairingCode: null,
          pairingExpiresAt: null,
          settings: currentSettings(),
        },
      ];
    },
    createDevice: () => notSupported("端末を追加"),
    resetDevicePairing: () => notSupported("ペアリングを変更"),
    async updateDevice(_deviceId, patch) {
      if (patch.settings) saveSettings({ ...loadSettings(), ...patch.settings });
    },
    deleteDevice: () => notSupported("端末を削除"),

    subscribe(_storeId, handler) {
      return subscribeLocal(() => handler());
    },
  };
}

export function createLocalPlayerBackend(): PlayerBackend {
  return {
    mode: "local",
    isPaired: () => true,
    pair: async () => {},
    unpair: () => {},

    async loadManifest() {
      const posters = (await listLocalPosters()).filter((p) => p.enabled);
      return {
        storeName: null,
        deviceName: null,
        settings: currentSettings(),
        posters: posters.map((p) => ({
          id: p.id,
          name: p.name,
          imageUrl: p.image,
          durationSec: p.durationSec,
          schedule: p.schedule ?? ALWAYS,
        })),
      };
    },
    async reportMetrics(buckets) {
      await addMetrics(buckets);
    },
    async saveCalibration(yawOffset, pitchOffset) {
      saveSettings({ ...loadSettings(), yawOffset, pitchOffset });
    },
    subscribe(handler) {
      return subscribeLocal((msg) => {
        if (msg.type !== "metrics-changed") handler();
      });
    },
  };
}

/** デモモード専用：見た目確認用の擬似データ */
export const localDemo = {
  hasDemoData: hasDemoMetrics,
  async addDemoData() {
    await putDemoMetrics(demoMetrics(await listLocalPosters(), 30));
  },
  clearDemoData: () => clearMetrics(true),
  clearAllMetrics: () => clearMetrics(false),
};
