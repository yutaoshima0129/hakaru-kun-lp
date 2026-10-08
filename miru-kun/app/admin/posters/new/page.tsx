"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useStore } from "@/components/AdminShell";
import ScheduleEditor from "@/components/ScheduleEditor";
import { aiAvailable, generatePosterDesigns } from "@/lib/ai/client";
import { POSTER_MOODS, type PosterBrief, type PosterDesign, type PosterLayout, type PosterMood } from "@/lib/ai/types";
import { getAdminBackend } from "@/lib/backend";
import { canvasToPng, renderPoster, templateDesigns } from "@/lib/posterRender";
import { ALWAYS, type PosterSchedule } from "@/lib/schedule";

const LAYOUT_LABELS: Record<PosterLayout, string> = { left: "左寄せ", center: "中央", split: "写真を左に" };
const COLOR_FIELDS = [
  ["bg1", "背景1"],
  ["bg2", "背景2"],
  ["accent", "強調色"],
  ["text", "文字色"],
] as const;

/** デザインを描画して表示する canvas（CSS で縮小） */
function PosterCanvas({ design, photo, className }: { design: PosterDesign; photo: ImageBitmap | null; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) renderPoster(design, photo, ref.current);
  }, [design, photo]);
  return <canvas ref={ref} className={`w-full aspect-video rounded-lg bg-black ${className ?? ""}`} />;
}

export default function NewPosterPage() {
  const { storeId } = useStore();
  const router = useRouter();
  const [item, setItem] = useState("");
  const [price, setPrice] = useState("");
  const [details, setDetails] = useState("");
  const [condition, setCondition] = useState("");
  const [mood, setMood] = useState<PosterMood>("にぎやか");
  const [photo, setPhoto] = useState<ImageBitmap | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  const [ai, setAi] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [error, setError] = useState("");
  const [designs, setDesigns] = useState<PosterDesign[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [nameEdited, setNameEdited] = useState(false);
  const [schedule, setSchedule] = useState<PosterSchedule>(ALWAYS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    aiAvailable().then(setAi, () => setAi(false));
  }, []);

  // サムネイル用 URL の後始末
  useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl); }, [photoUrl]);

  const brief: PosterBrief = { item: item.trim(), price: price.trim(), details: details.trim(), condition: condition.trim(), mood };

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    try {
      const bmp = await createImageBitmap(file);
      setPhoto(bmp);
      setPhotoUrl(URL.createObjectURL(file));
    } catch {
      alert("この画像は読み込めませんでした。別の画像を選んでください。");
    }
  };
  const removePhoto = () => {
    photo?.close();
    setPhoto(null);
    setPhotoUrl(null);
    if (photoRef.current) photoRef.current.value = "";
    // 写真なしでは split が使えない
    setDesigns((ds) => ds.map((d) => (d.layout === "split" ? { ...d, layout: "left" } : d)));
  };

  const show = (ds: PosterDesign[]) => {
    setDesigns(ds);
    setSelected(null);
  };
  const fromTemplate = () => {
    setError("");
    show(templateDesigns(brief, !!photo));
  };
  const fromAi = async () => {
    setError("");
    setAiBusy(true);
    try {
      show(await generatePosterDesigns(brief, !!photo));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAiBusy(false);
    }
  };

  const select = (i: number) => {
    setSelected(i);
    if (!nameEdited) setName(item.trim());
  };
  const patchDesign = (patch: Partial<PosterDesign>) =>
    setDesigns((ds) => ds.map((d, i) => (i === selected ? { ...d, ...patch } : d)));

  const add = async () => {
    if (selected === null) return;
    setSaving(true);
    try {
      const image = await canvasToPng(renderPoster(designs[selected], photo));
      await getAdminBackend().addPosters(storeId, [{ name: name.trim() || item.trim() || "ポスター", image, schedule }]);
      router.push("/admin/posters");
    } catch (e) {
      alert(`ポスターを追加できませんでした：${(e as Error).message}`);
      setSaving(false);
    }
  };

  const design = selected !== null ? designs[selected] : null;
  const input = "mt-1 w-full border border-gray-300 rounded-lg px-3 py-1.5";
  const label = "text-xs font-bold text-gray-500";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/posters" className="text-sm text-gray-500 hover:underline">
          ← ポスター一覧
        </Link>
        <h1 className="text-2xl font-black text-gray-800">ポスターを作る</h1>
        <p className="text-sm text-gray-500">メニューの情報を入れると、1920×1080 のポスターを3案つくります。色や文字は後から直せます。</p>
      </div>

      <section className="bg-white border border-gray-200 rounded-2xl p-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className={label}>メニュー名（必須）</span>
            <input value={item} onChange={(e) => setItem(e.target.value)} placeholder="例：和栗のパフェ" className={input} />
          </label>
          <label className="block">
            <span className={label}>価格</span>
            <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="例：1,280円" className={input} />
          </label>
          <label className="block">
            <span className={label}>提供時間・条件</span>
            <input value={condition} onChange={(e) => setCondition(e.target.value)} placeholder="例：11:00〜14:00 限定" className={input} />
          </label>
          <label className="block sm:col-span-2">
            <span className={label}>こだわり・補足</span>
            <input value={details} onChange={(e) => setDetails(e.target.value)} placeholder="例：国産和栗をたっぷり使用" className={input} />
          </label>
          <label className="block">
            <span className={label}>雰囲気</span>
            <select value={mood} onChange={(e) => setMood(e.target.value as PosterMood)} className={`${input} bg-white`}>
              {POSTER_MOODS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          <div>
            <span className={label}>写真（任意）</span>
            <div className="mt-1 flex items-center gap-3">
              {photoUrl ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoUrl} alt="選んだ写真" className="h-12 w-20 object-cover rounded-lg border border-gray-200" />
                  <button type="button" onClick={removePhoto} className="text-sm text-red-600 hover:underline">
                    削除
                  </button>
                </>
              ) : (
                <input ref={photoRef} type="file" accept="image/*" onChange={(e) => pickPhoto(e.target.files?.[0])} className="text-sm" />
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {ai && (
            <button
              onClick={fromAi}
              disabled={!item.trim() || aiBusy}
              className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-bold hover:opacity-90 disabled:opacity-50"
            >
              {aiBusy ? "AIが考えています…" : "AIで3案つくる"}
            </button>
          )}
          <button
            onClick={fromTemplate}
            disabled={!item.trim() || aiBusy}
            className={`px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-50 ${
              ai ? "border border-gray-300 bg-white hover:bg-gray-50" : "bg-primary text-white hover:opacity-90"
            }`}
          >
            テンプレートで3案つくる
          </button>
          {!ai && (
            <span className="text-xs text-gray-500">AIで作るには、環境変数 ANTHROPIC_API_KEY を設定してください（README 参照）。</span>
          )}
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </section>

      {designs.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-black text-gray-800">候補から選んでください</h2>
          <ul className="grid gap-3 sm:grid-cols-3">
            {designs.map((d, i) => (
              <li key={i}>
                <button
                  onClick={() => select(i)}
                  aria-label={`案${i + 1}を選ぶ`}
                  className={`block w-full rounded-xl p-1.5 bg-white border-2 ${
                    selected === i ? "border-primary" : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <PosterCanvas design={d} photo={photo} />
                  <span className="block mt-1 text-xs font-bold text-gray-600">案{i + 1}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {design && (
        <section className="bg-white border border-gray-200 rounded-2xl p-4 space-y-5">
          <h2 className="font-black text-gray-800">仕上げ</h2>
          <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
            <PosterCanvas design={design} photo={photo} />
            <div className="space-y-3">
              {(
                [
                  ["eyebrow", "小見出し"],
                  ["title", "見出し"],
                  ["subtitle", "補足"],
                  ["priceText", "価格"],
                ] as const
              ).map(([k, l]) => (
                <label key={k} className="block">
                  <span className={label}>{l}</span>
                  <input value={design[k]} onChange={(e) => patchDesign({ [k]: e.target.value })} className={input} />
                </label>
              ))}
              <div className="grid grid-cols-4 gap-2">
                {COLOR_FIELDS.map(([k, l]) => (
                  <label key={k} className="block text-center">
                    <span className={label}>{l}</span>
                    <input
                      type="color"
                      value={design[k]}
                      onChange={(e) => patchDesign({ [k]: e.target.value })}
                      className="mt-1 w-full h-9 rounded-lg border border-gray-300 bg-white p-0.5"
                    />
                  </label>
                ))}
              </div>
              <fieldset className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <legend className={label}>レイアウト</legend>
                {(Object.keys(LAYOUT_LABELS) as PosterLayout[]).map((l) => (
                  <label key={l} className={`flex items-center gap-1.5 ${l === "split" && !photo ? "opacity-40" : "cursor-pointer"}`}>
                    <input
                      type="radio"
                      name="layout"
                      checked={design.layout === l}
                      disabled={l === "split" && !photo}
                      onChange={() => patchDesign({ layout: l })}
                      className="accent-[var(--primary)]"
                    />
                    {LAYOUT_LABELS[l]}
                  </label>
                ))}
              </fieldset>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={label}>ポスターの名前</span>
              <input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameEdited(true);
                }}
                className={input}
              />
            </label>
            <div>
              <span className={label}>表示する曜日・時間帯</span>
              <div className="mt-1">
                <ScheduleEditor value={schedule} onChange={setSchedule} />
              </div>
            </div>
          </div>

          <button
            onClick={add}
            disabled={saving}
            className="px-5 py-2.5 rounded-lg bg-primary text-white font-bold hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "追加しています…" : "このポスターを追加"}
          </button>
        </section>
      )}
    </div>
  );
}
