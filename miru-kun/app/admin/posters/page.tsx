"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fileToPosterImage, samplePosters } from "@/lib/samples";
import { deletePoster, listPosters, newId, savePosters, subscribe, type Poster } from "@/lib/store";

export default function PostersPage() {
  const [posters, setPosters] = useState<Poster[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => setPosters(await listPosters()), []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- IndexedDB からの読み込み
    load();
    return subscribe((msg) => msg.type === "posters-changed" && load());
  }, [load]);

  const nextOrder = () => (posters.length ? Math.max(...posters.map((p) => p.order)) + 1 : 0);

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      const start = nextOrder();
      const created: Poster[] = [];
      for (const [i, file] of [...files].entries()) {
        created.push({
          id: newId(),
          name: file.name.replace(/\.[^.]+$/, ""),
          image: await fileToPosterImage(file),
          durationSec: 10,
          enabled: true,
          order: start + i,
          createdAt: Date.now() + i,
        });
      }
      await savePosters(created);
    } catch (e) {
      alert(`画像を読み込めませんでした：${(e as Error).message}`);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const update = (p: Poster, patch: Partial<Poster>) => {
    // 保存完了を待たずに画面へ反映する
    setPosters((prev) => prev.map((x) => (x.id === p.id ? { ...x, ...patch } : x)));
    return savePosters([{ ...p, ...patch }]);
  };

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= posters.length) return;
    const a = posters[i];
    const b = posters[j];
    savePosters([
      { ...a, order: b.order },
      { ...b, order: a.order === b.order ? a.order + dir : a.order },
    ]);
  };

  const totalSec = posters.filter((p) => p.enabled).reduce((s, p) => s + p.durationSec, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h1 className="text-2xl font-black text-gray-800">ポスター</h1>
          <p className="text-sm text-gray-500">
            変更はサイネージ画面にすぐ反映されます。表示中 {posters.filter((p) => p.enabled).length} 枚、1周 {totalSec} 秒。
          </p>
        </div>
        <button
          onClick={() => savePosters(samplePosters(nextOrder()))}
          className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm font-bold hover:bg-gray-50"
        >
          サンプルを追加
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-bold hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "読み込み中…" : "画像をアップロード"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => upload(e.target.files)}
        />
      </div>

      <div className="text-xs text-gray-500 bg-white border border-dashed border-gray-300 rounded-xl px-4 py-3">
        AIでのポスター自動生成は第2段階で追加予定です。いまはお手持ちのAIツールで作った画像をアップロードしてください（推奨 1920×1080）。
      </div>

      {posters.length === 0 ? (
        <div className="text-center text-gray-500 py-16 bg-white rounded-2xl border border-gray-200">
          ポスターがまだありません。「サンプルを追加」か「画像をアップロード」から始めてください。
        </div>
      ) : (
        <ul className="space-y-3">
          {posters.map((p, i) => (
            <li
              key={p.id}
              className={`bg-white border border-gray-200 rounded-2xl p-3 flex flex-col sm:flex-row gap-4 ${
                p.enabled ? "" : "opacity-60"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.image} alt={p.name} className="w-full sm:w-56 aspect-video object-contain bg-black rounded-lg" />
              <div className="flex-1 grid gap-3 sm:grid-cols-[1fr_auto] items-start">
                <div className="space-y-3">
                  <label className="block">
                    <span className="text-xs font-bold text-gray-500">名前</span>
                    <input
                      defaultValue={p.name}
                      onBlur={(e) => e.target.value !== p.name && update(p, { name: e.target.value })}
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-1.5"
                    />
                  </label>
                  <div className="flex flex-wrap items-center gap-4">
                    <label className="flex items-center gap-2 text-sm">
                      <span className="text-xs font-bold text-gray-500">表示時間</span>
                      <input
                        type="number"
                        min={3}
                        max={300}
                        defaultValue={p.durationSec}
                        onBlur={(e) => {
                          const v = Math.min(300, Math.max(3, Number(e.target.value) || 10));
                          if (v !== p.durationSec) update(p, { durationSec: v });
                        }}
                        className="w-20 border border-gray-300 rounded-lg px-2 py-1 text-right"
                      />
                      秒
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={p.enabled}
                        onChange={(e) => update(p, { enabled: e.target.checked })}
                        className="w-4 h-4 accent-[var(--primary)]"
                      />
                      表示する
                    </label>
                  </div>
                </div>
                <div className="flex sm:flex-col gap-2">
                  <IconButton label="上へ" onClick={() => move(i, -1)} disabled={i === 0}>
                    ↑
                  </IconButton>
                  <IconButton label="下へ" onClick={() => move(i, 1)} disabled={i === posters.length - 1}>
                    ↓
                  </IconButton>
                  <IconButton
                    label="削除"
                    onClick={() => confirm(`「${p.name}」を削除しますか？`) && deletePoster(p.id)}
                    danger
                  >
                    ✕
                  </IconButton>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`w-9 h-9 rounded-lg border text-sm font-bold disabled:opacity-30 ${
        danger ? "border-red-200 text-red-600 hover:bg-red-50" : "border-gray-300 text-gray-600 hover:bg-gray-50"
      }`}
    >
      {children}
    </button>
  );
}
