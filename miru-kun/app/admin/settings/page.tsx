"use client";

import { useEffect, useState } from "react";
import { DEFAULT_SETTINGS, loadSettings, saveSettings, subscribe, type AppSettings } from "@/lib/store";

export default function SettingsPage() {
  const [s, setS] = useState<AppSettings | null>(null);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage は描画後にしか読めない
    setS(loadSettings());
    // サイネージ画面で補正した値などを反映
    return subscribe((msg) => msg.type === "settings-changed" && setS(loadSettings()));
  }, []);

  const listCameras = async () => {
    try {
      // 名前を取得するには一度カメラの許可が必要
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach((t) => t.stop());
      const devices = await navigator.mediaDevices.enumerateDevices();
      setCameras(devices.filter((d) => d.kind === "videoinput"));
    } catch (e) {
      alert(`カメラを取得できませんでした：${(e as Error).message}`);
    }
  };

  if (!s) return null;

  const set = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSaved(false);
    setS({ ...s, [key]: value });
  };
  const save = () => {
    saveSettings(s);
    setSaved(true);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-black text-gray-800">設定</h1>

      <Section title="カメラ">
        <div className="flex flex-wrap gap-2 items-center">
          <select
            value={s.cameraDeviceId}
            onChange={(e) => set("cameraDeviceId", e.target.value)}
            className="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2 bg-white"
          >
            <option value="">既定のカメラ</option>
            {cameras.map((c, i) => (
              <option key={c.deviceId} value={c.deviceId}>
                {c.label || `カメラ ${i + 1}`}
              </option>
            ))}
            {s.cameraDeviceId && !cameras.some((c) => c.deviceId === s.cameraDeviceId) && (
              <option value={s.cameraDeviceId}>選択中のカメラ</option>
            )}
          </select>
          <button onClick={listCameras} className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm font-bold">
            カメラ一覧を取得
          </button>
        </div>
        <p className="text-xs text-gray-500">USBカメラはモニター上部の中央に、少し下向きで取り付けるのがお勧めです。</p>
      </Section>

      <Section title="「見た」の判定">
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
            onClick={() => setS({ ...s, yawOffset: 0, pitchOffset: 0 })}
            className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-xs font-bold"
          >
            補正をリセット
          </button>
        </div>
        <p className="text-xs text-gray-500">
          補正はサイネージ画面で D キー →「いまの顔の向きを『画面を見ている』として補正」で設定できます。
        </p>
      </Section>

      <Section title="表示">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={s.showNotice}
            onChange={(e) => set("showNotice", e.target.checked)}
            className="w-4 h-4"
          />
          サイネージ画面に「AIカメラで人数を計測しています」と表示する
        </label>
        <p className="text-xs text-gray-500">店頭にも同じ内容の掲示を出すことをお勧めします。</p>
      </Section>

      <div className="flex items-center gap-3">
        <button onClick={save} className="px-5 py-2.5 rounded-lg bg-primary text-white font-bold hover:opacity-90">
          保存
        </button>
        <button
          onClick={() => setS({ ...DEFAULT_SETTINGS, cameraDeviceId: s.cameraDeviceId })}
          className="px-4 py-2.5 rounded-lg text-gray-600 font-bold hover:bg-gray-100"
        >
          初期値に戻す
        </button>
        {saved && <span className="text-sm text-green-700 font-bold">保存しました（サイネージ画面に反映済み）</span>}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
      <h2 className="font-bold text-gray-800">{title}</h2>
      {children}
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
