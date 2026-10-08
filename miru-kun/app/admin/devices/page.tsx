"use client";

import { useCallback, useEffect, useState } from "react";
import { useStore } from "@/components/AdminShell";
import { DEFAULT_DEVICE_SETTINGS, getAdminBackend, mode, type DeviceRecord, type DeviceSettings } from "@/lib/backend";

const ONLINE_MS = 3 * 60_000;

function relativeTime(ms: number, now: number) {
  const m = Math.floor((now - ms) / 60_000);
  if (m < 1) return "たった今";
  if (m < 60) return `${m}分前`;
  if (m < 60 * 24) return `${Math.floor(m / 60)}時間前`;
  return `${Math.floor(m / 60 / 24)}日前`;
}

const timeLabel = (ms: number) =>
  new Date(ms).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

export default function DevicesPage() {
  const { storeId } = useStore();
  const [devices, setDevices] = useState<DeviceRecord[] | null>(null);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const cloud = mode === "cloud";

  const load = useCallback(async () => {
    try {
      setDevices(await getAdminBackend().listDevices(storeId));
    } catch (e) {
      alert(`端末を読み込めませんでした：${(e as Error).message}`);
    }
  }, [storeId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- バックエンドからの読み込み
    load();
    // サイネージ画面での補正・ペアリング完了などを反映
    return getAdminBackend().subscribe(storeId, load);
  }, [storeId, load]);

  // 「オンライン」「◯分前」の表示を更新する
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      await getAdminBackend().createDevice(storeId, newName.trim());
      setNewName("");
    });
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-black text-gray-800">端末と設定</h1>

      {cloud && (
        <div className="text-sm text-gray-600 bg-white border border-dashed border-gray-300 rounded-xl px-4 py-3 space-y-1">
          <p className="font-bold text-gray-800">店頭のパソコンを登録する手順</p>
          <ol className="list-decimal list-inside space-y-0.5">
            <li>下の「端末を追加」で端末を作り、表示されたコード（XXXX-XXXX）を控える</li>
            <li>
              店頭のパソコンで <code className="bg-gray-100 px-1 rounded">/player</code> を開く
            </li>
            <li>コードを入力して「登録」を押す（コードの有効期限内に）</li>
          </ol>
        </div>
      )}

      {devices?.map((d) => (
        <DeviceCard
          key={d.id}
          device={d}
          now={now}
          busy={busy}
          onSave={(patch) => run(() => getAdminBackend().updateDevice(d.id, patch))}
          onReset={() =>
            confirm(
              `「${d.name}」のペアリングをやり直します。いま登録されている端末は表示できなくなります。よろしいですか？`,
            ) && run(() => getAdminBackend().resetDevicePairing(d.id))
          }
          onDelete={() =>
            confirm(`「${d.name}」を削除しますか？この端末のポスター表示と計測は止まります。`) &&
            run(() => getAdminBackend().deleteDevice(d.id))
          }
        />
      ))}
      {!devices && <p className="text-sm text-gray-400">読み込み中…</p>}

      {cloud && (
        <form onSubmit={add} className="bg-white border border-gray-200 rounded-2xl p-5 flex flex-wrap items-end gap-3">
          <label className="flex-1 min-w-[12rem]">
            <span className="text-xs font-bold text-gray-500">端末を追加</span>
            <input
              required
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="例：入口のモニター"
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
            />
          </label>
          <button
            disabled={busy || !newName.trim()}
            className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-bold hover:opacity-90 disabled:opacity-50"
          >
            端末を追加
          </button>
        </form>
      )}
    </div>
  );
}

function DeviceCard({
  device,
  now,
  busy,
  onSave,
  onReset,
  onDelete,
}: {
  device: DeviceRecord;
  now: number;
  busy: boolean;
  onSave: (patch: { name?: string; settings?: DeviceSettings }) => void;
  onReset: () => void;
  onDelete: () => void;
}) {
  const cloud = mode === "cloud";
  const [name, setName] = useState(device.name);
  const [s, setS] = useState(device.settings);
  const [saved, setSaved] = useState(false);

  // 外部（サイネージ画面での補正など）で設定が変わったら取り込む
  const settingsJson = JSON.stringify(device.settings);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 親から渡された最新値を反映
    setS(JSON.parse(settingsJson));
  }, [settingsJson]);

  const set = <K extends keyof DeviceSettings>(key: K, value: DeviceSettings[K]) => {
    setSaved(false);
    setS({ ...s, [key]: value });
  };
  const save = () => {
    onSave({ settings: s, ...(cloud && name.trim() && name !== device.name ? { name: name.trim() } : {}) });
    setSaved(true);
  };

  const unpaired = cloud && !device.pairedAt;
  const online = device.lastSeenAt !== null && now - device.lastSeenAt < ONLINE_MS;

  return (
    <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {cloud ? (
          <input
            aria-label="端末名"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 min-w-[10rem] font-bold text-gray-800 border border-gray-300 rounded-lg px-3 py-1.5"
          />
        ) : (
          <h2 className="font-bold text-gray-800 mr-auto">{device.name}</h2>
        )}
        {cloud && (
          <span
            className={`text-xs font-bold px-2.5 py-1 rounded-full ${online ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}
          >
            {unpaired
              ? "未登録"
              : online
                ? "オンライン"
                : device.lastSeenAt
                  ? `最終通信 ${relativeTime(device.lastSeenAt, now)}`
                  : "通信なし"}
          </span>
        )}
      </div>

      {unpaired && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
          {device.pairingCode ? (
            <>
              <div className="text-xs text-amber-900">店頭のパソコンの /player に入力してください</div>
              <div className="mt-1 text-4xl font-black tracking-widest text-amber-900 tabular-nums">
                {device.pairingCode}
              </div>
              {device.pairingExpiresAt && (
                <div className="mt-1 text-xs text-amber-800">
                  {device.pairingExpiresAt < now
                    ? "有効期限が切れました。「ペアリングをやり直す」で再発行してください"
                    : `${timeLabel(device.pairingExpiresAt)} まで有効`}
                </div>
              )}
            </>
          ) : (
            <div className="text-sm text-amber-900">コードを発行するには「ペアリングをやり直す」を押してください</div>
          )}
        </div>
      )}

      <h3 className="text-sm font-bold text-gray-800 pt-2">「見た」の判定</h3>
      <NumberField
        label="左右の許容角度"
        unit="度"
        value={s.yawThreshold}
        min={5}
        max={60}
        onChange={(v) => set("yawThreshold", v)}
        help="顔がこの角度以内で画面の方を向いていれば「見ている」"
      />
      <NumberField
        label="上下の許容角度"
        unit="度"
        value={s.pitchThreshold}
        min={5}
        max={60}
        onChange={(v) => set("pitchThreshold", v)}
      />
      <NumberField
        label="注視とみなす時間"
        unit="ミリ秒"
        value={s.minLookMs}
        min={100}
        max={5000}
        step={100}
        onChange={(v) => set("minLookMs", v)}
        help="この時間以上見続けた人を「注視人数」に数える"
      />
      <NumberField
        label="通行とみなす時間"
        unit="ミリ秒"
        value={s.minPresenceMs}
        min={0}
        max={3000}
        step={100}
        onChange={(v) => set("minPresenceMs", v)}
        help="一瞬の誤検出を除くため、この時間以上映った人だけ数える"
      />
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-gray-600">
          向きの補正：左右 {s.yawOffset}°／上下 {s.pitchOffset}°
        </span>
        <button
          onClick={() => {
            setSaved(false);
            setS({ ...s, yawOffset: 0, pitchOffset: 0 });
          }}
          className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-xs font-bold"
        >
          補正をリセット
        </button>
      </div>
      <p className="text-xs text-gray-500">
        補正はサイネージ画面で D キー →「いまの顔の向きを『画面を見ている』として補正」で設定できます。
      </p>

      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={s.showNotice}
          onChange={(e) => set("showNotice", e.target.checked)}
          className="w-4 h-4"
        />
        サイネージ画面に「AIカメラで人数を計測しています」と表示する
      </label>
      <p className="text-xs text-gray-500">
        店頭にも同じ内容の掲示を出すことをお勧めします。カメラの選択はサイネージ画面の D キーから行います。
      </p>

      <div className="flex flex-wrap items-center gap-3 pt-2">
        <button
          disabled={busy}
          onClick={save}
          className="px-5 py-2.5 rounded-lg bg-primary text-white font-bold hover:opacity-90 disabled:opacity-50"
        >
          保存
        </button>
        <button
          onClick={() => {
            setSaved(false);
            setS(DEFAULT_DEVICE_SETTINGS);
          }}
          className="px-4 py-2.5 rounded-lg text-gray-600 font-bold hover:bg-gray-100"
        >
          初期値に戻す
        </button>
        {saved && <span className="text-sm text-green-700 font-bold">保存しました</span>}
        {cloud && (
          <span className="ml-auto flex gap-2">
            <button
              disabled={busy}
              onClick={onReset}
              className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm font-bold hover:bg-gray-50"
            >
              ペアリングをやり直す
            </button>
            <button
              disabled={busy}
              onClick={onDelete}
              className="px-3 py-2 rounded-lg text-red-600 text-sm font-bold hover:bg-red-50"
            >
              削除
            </button>
          </span>
        )}
      </div>
    </section>
  );
}

function NumberField({
  label,
  unit,
  value,
  min,
  max,
  step = 1,
  help,
  onChange,
}: {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  help?: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <div className="flex items-center gap-3">
        <span className="text-sm font-bold text-gray-700 w-40">{label}</span>
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value) || min)))}
          className="w-28 border border-gray-300 rounded-lg px-2 py-1.5 text-right"
        />
        <span className="text-sm text-gray-500">{unit}</span>
      </div>
      {help && <p className="mt-1 text-xs text-gray-500 sm:ml-[10.75rem]">{help}</p>}
    </label>
  );
}
