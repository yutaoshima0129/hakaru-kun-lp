"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import { headPoseFromMatrix } from "@/lib/attention";

type Level = "ok" | "warn" | "ng" | "pending";
type Result = { id: string; title: string; level: Level; detail: string };
type Face = { cx: number; cy: number; width: number; distanceCm: number };
type Reading = { distanceCm: number; widthPx: number };
type CamState = "idle" | "starting" | "ok" | "denied" | "none" | "error";

const DETECT_INTERVAL_MS = 100; // Player と同じ約10fps
const MEASURE_MS = 10_000;
const PREVIEW_W = 480;
const PREVIEW_H = 270;

const BADGE: Record<Level, { icon: string; text: string; cls: string }> = {
  ok: { icon: "✓", text: "合格", cls: "bg-green-50 text-green-800 border-green-300" },
  warn: { icon: "▲", text: "注意", cls: "bg-amber-50 text-amber-800 border-amber-300" },
  ng: { icon: "✕", text: "不合格", cls: "bg-red-50 text-red-800 border-red-300" },
  pending: { icon: "…", text: "未確認", cls: "bg-gray-50 text-gray-600 border-gray-300" },
};

async function createLandmarker(): Promise<{ lm: FaceLandmarker; delegate: "GPU" | "CPU" }> {
  const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
  const fileset = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
  const options = (delegate: "GPU" | "CPU") => ({
    baseOptions: { modelAssetPath: "/models/face_landmarker.task", delegate },
    runningMode: "VIDEO" as const,
    numFaces: 5,
    outputFacialTransformationMatrixes: true,
  });
  try {
    return { lm: await FaceLandmarker.createFromOptions(fileset, options("GPU")), delegate: "GPU" };
  } catch {
    return { lm: await FaceLandmarker.createFromOptions(fileset, options("CPU")), delegate: "CPU" };
  }
}

type NavExt = Navigator & {
  deviceMemory?: number;
  userAgentData?: { brands: { brand: string; version: string }[] };
};

function judgeBrowser(): Result {
  const nav = navigator as NavExt;
  const ua = navigator.userAgent;
  const brands = nav.userAgentData?.brands ?? [];
  const find = (name: string) => brands.find((b) => b.brand === name)?.version;
  let name = "";
  let ver = 0;
  if (/Edg\//.test(ua) || find("Microsoft Edge")) {
    name = "Edge";
    ver = Number(find("Microsoft Edge") ?? /Edg\/(\d+)/.exec(ua)?.[1]);
  } else if (/Chrome\//.test(ua) && !/OPR\//.test(ua) || find("Google Chrome")) {
    name = "Chrome";
    ver = Number(find("Google Chrome") ?? /Chrome\/(\d+)/.exec(ua)?.[1]);
  } else if (/Firefox\//.test(ua)) name = "Firefox";
  else if (/Safari\//.test(ua)) name = "Safari";
  else name = "不明なブラウザ";
  const id = "browser";
  const title = "ブラウザ";
  if (name === "Chrome" || name === "Edge") {
    return ver >= 120
      ? { id, title, level: "ok", detail: `${name} ${ver}（Chromium 120 以上）` }
      : { id, title, level: "ng", detail: `${name} ${ver || "?"} は古いため、最新版に更新してください。` };
  }
  return { id, title, level: "warn", detail: `${name} で開いています。Chrome を推奨します。` };
}

function judgeScreen(): Result & { text: string } {
  const dpr = window.devicePixelRatio || 1;
  const pw = Math.round(Math.max(screen.width, screen.height) * dpr);
  const ph = Math.round(Math.min(screen.width, screen.height) * dpr);
  const text = `${pw}×${ph}（画面 ${screen.width}×${screen.height} × 倍率 ${dpr}）`;
  const level: Level = pw >= 1920 && ph >= 1080 ? "ok" : pw >= 1280 && ph >= 720 ? "warn" : "ng";
  const detail =
    level === "ok" ? text : `${text} — フルHD(1920×1080)以上を推奨します。ポスターの文字が粗くなる可能性があります。`;
  return { id: "screen", title: "画面", level, detail, text };
}

function judgePerf(): Result & { text: string } {
  const cores = navigator.hardwareConcurrency || 0;
  const mem = (navigator as NavExt).deviceMemory;
  const text = `CPU ${cores || "不明"} コア／メモリ ${mem ? `${mem} GB 以上` : "取得不可"}`;
  let level: Level = cores >= 4 ? "ok" : cores >= 2 ? "warn" : "ng";
  if (mem !== undefined && mem < 4 && level === "ok") level = "warn";
  const detail = level === "ok" ? text : `${text} — 4コア・4GB以上を推奨します。顔検出が遅くなる可能性があります。`;
  return { id: "perf", title: "性能の目安", level, detail, text };
}

export default function CheckPanel() {
  const [mounted, setMounted] = useState(false);
  const [started, setStarted] = useState(false);
  const [runId, setRunId] = useState(0);
  const [deviceId, setDeviceId] = useState("");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [cam, setCam] = useState<{ state: CamState; w: number; h: number; fps: number; label: string; id: string; msg: string }>(
    { state: "idle", w: 0, h: 0, fps: 0, label: "", id: "", msg: "" },
  );
  const [speed, setSpeed] = useState<{ phase: "idle" | "loading" | "running" | "done" | "error"; delegate: string; fps: number; avgMs: number; elapsed: number; msg: string }>(
    { phase: "idle", delegate: "", fps: 0, avgMs: 0, elapsed: 0, msg: "" },
  );
  const [reading, setReading] = useState<Reading | null>(null);
  const [recorded, setRecorded] = useState<Reading | null>(null);
  const [copied, setCopied] = useState("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lmRef = useRef<Promise<{ lm: FaceLandmarker; delegate: "GPU" | "CPU" }> | null>(null);
  const readingRef = useRef<Reading | null>(null);

  useEffect(() => {
    setMounted(true);
    return () => {
      lmRef.current?.then((l) => l.lm.close()).catch(() => {});
      lmRef.current = null;
    };
  }, []);

  // ---- カメラ → 顔検出（10秒計測）→ プレビュー継続 ----
  useEffect(() => {
    if (!started) return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const fail = (e: unknown) => {
      if (cancelled) return;
      const err = e as DOMException;
      const state: CamState = err?.name === "NotAllowedError" || err?.name === "SecurityError" ? "denied" : err?.name === "NotFoundError" ? "none" : "error";
      setCam((c) => ({ ...c, state, msg: err?.message ?? String(e) }));
    };

    (async () => {
      setCam((c) => ({ ...c, state: "starting", msg: "" }));
      setSpeed({ phase: "idle", delegate: "", fps: 0, avgMs: 0, elapsed: 0, msg: "" });
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: deviceId ? { exact: deviceId } : undefined, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch (e) {
        fail(e);
        return;
      }
      if (cancelled) return;
      const track = stream.getVideoTracks()[0];
      const s = track.getSettings();
      // 許可後でないとカメラ名が取れないので、ここで一覧を取得する
      const all = await navigator.mediaDevices.enumerateDevices().catch(() => []);
      if (cancelled) return;
      setDevices(all.filter((d) => d.kind === "videoinput"));
      setCam({ state: "ok", w: s.width ?? 0, h: s.height ?? 0, fps: s.frameRate ?? 0, label: track.label, id: s.deviceId ?? "", msg: "" });

      const video = videoRef.current!;
      video.srcObject = stream;
      try {
        await video.play();
        setSpeed((p) => ({ ...p, phase: "loading" }));
        lmRef.current ??= createLandmarker();
        const { lm, delegate } = await lmRef.current;
        if (cancelled) return;
        const ms: number[] = [];
        const t0 = performance.now();
        let done = false;
        setSpeed((p) => ({ ...p, phase: "running", delegate }));

        const loop = () => {
          if (cancelled) return;
          if (video.readyState >= 2) {
            const t = performance.now();
            const res = lm.detectForVideo(video, t);
            const dt = performance.now() - t;
            const faces: Face[] = res.faceLandmarks.map((lms, i) => {
              let minX = 1, maxX = 0, minY = 1, maxY = 0;
              for (const p of lms) {
                if (p.x < minX) minX = p.x;
                if (p.x > maxX) maxX = p.x;
                if (p.y < minY) minY = p.y;
                if (p.y > maxY) maxY = p.y;
              }
              const m = res.facialTransformationMatrixes?.[i]?.data;
              return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, width: maxX - minX, distanceCm: m ? headPoseFromMatrix(m).distanceCm : 0 };
            });
            drawPreview(canvasRef.current, video, faces);
            const big = faces.reduce<Face | null>((a, f) => (!a || f.width > a.width ? f : a), null);
            const r = big ? { distanceCm: big.distanceCm, widthPx: big.width * video.videoWidth } : null;
            readingRef.current = r;
            setReading(r);
            if (!done) {
              ms.push(dt);
              const elapsed = t - t0;
              if (elapsed >= MEASURE_MS) {
                done = true;
                const avgMs = ms.reduce((a, b) => a + b, 0) / ms.length;
                setSpeed({ phase: "done", delegate, fps: ms.length / (elapsed / 1000), avgMs, elapsed: MEASURE_MS, msg: "" });
              } else setSpeed((p) => ({ ...p, elapsed }));
            }
          }
          timer = setTimeout(loop, DETECT_INTERVAL_MS);
        };
        loop();
      } catch (e) {
        if (!cancelled) setSpeed((p) => ({ ...p, phase: "error", msg: (e as Error)?.message ?? String(e) }));
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [started, deviceId, runId]);

  // ---- 判定 ----
  const results = useMemo<(Result & { text?: string })[]>(() => {
    if (!mounted) return [];
    const secure = window.isSecureContext;
    const screenR = judgeScreen();
    const perf = judgePerf();
    const pending = (id: string, title: string, detail: string): Result => ({ id, title, level: "pending", detail });
    const notStarted = "「チェックを開始」を押すと確認します。";

    let camR: Result;
    const res = `${cam.w}×${cam.h}・${Math.round(cam.fps)}fps`;
    if (cam.state === "ok") {
      camR = cam.w >= 1280 && cam.h >= 720
        ? { id: "camera", title: "カメラ", level: "ok", detail: `${cam.label || "カメラ"}：${res}` }
        : { id: "camera", title: "カメラ", level: "warn", detail: `${cam.label || "カメラ"}：${res} — 解像度が低めです。別のカメラの利用をおすすめします。` };
    } else if (cam.state === "denied") {
      camR = { id: "camera", title: "カメラ", level: "ng", detail: "カメラが許可されていません。アドレスバー左の鍵(設定)アイコン →「カメラ」→「許可」にして再読み込みしてください。" };
    } else if (cam.state === "none") {
      camR = { id: "camera", title: "カメラ", level: "ng", detail: "カメラが見つかりません。USBカメラの接続を確認してください。" };
    } else if (cam.state === "error") {
      camR = { id: "camera", title: "カメラ", level: "ng", detail: `カメラを開けません（${cam.msg}）。他のアプリが使用中でないか確認してください。` };
    } else camR = pending("camera", "カメラ", cam.state === "starting" ? "カメラを起動しています…" : notStarted);

    let speedR: Result;
    if (speed.phase === "done") {
      const level: Level = speed.fps >= 8 ? "ok" : speed.fps >= 5 ? "warn" : "ng";
      const v = `${speed.delegate}で ${speed.fps.toFixed(1)} fps／1回 ${speed.avgMs.toFixed(0)} ms`;
      speedR = { id: "speed", title: "顔検出の速さ", level, detail: level === "ok" ? v : level === "warn" ? `${v} — 計測精度が少し下がります。` : `${v} — 遅すぎて計測が成立しません。性能の高いパソコンをご検討ください。` };
    } else if (speed.phase === "error") {
      speedR = { id: "speed", title: "顔検出の速さ", level: "ng", detail: `顔検出を起動できません（${speed.msg}）。` };
    } else {
      speedR = pending("speed", "顔検出の速さ", speed.phase === "idle" ? (cam.state === "ok" ? "準備しています…" : notStarted) : speed.phase === "loading" ? "顔検出モデルを読み込んでいます…" : `${speed.delegate}で計測中… ${Math.min(10, Math.floor(speed.elapsed / 1000))}/10秒`);
    }

    let posR: Result;
    if (recorded) {
      const level: Level = recorded.widthPx >= 50 ? "ok" : recorded.widthPx >= 35 ? "warn" : "ng";
      const v = `顔の幅 ${Math.round(recorded.widthPx)}px／距離 約${(recorded.distanceCm / 100).toFixed(1)}m`;
      posR = { id: "position", title: "顔の映り方", level, detail: level === "ok" ? v : `${v} — カメラの画角が広すぎるか、解像度が低い可能性があります。` };
    } else posR = pending("position", "顔の映り方", "お客様が通る位置（1〜2m）に立ち、「この位置で判定」を押してください。");

    return [
      judgeBrowser(),
      secure
        ? { id: "secure", title: "安全な接続", level: "ok", detail: "https または localhost で開いています。" }
        : { id: "secure", title: "安全な接続", level: "ng", detail: "https でないためカメラを使えません。https のアドレスで開いてください。" },
      screenR,
      perf,
      camR,
      speedR,
      posR,
    ];
  }, [mounted, cam, speed, recorded]);

  const ngs = results.filter((r) => r.level === "ng");
  const pendings = results.filter((r) => r.level === "pending");
  const warns = results.filter((r) => r.level === "warn");
  const overall: { level: Level; head: string } = !mounted
    ? { level: "pending", head: "確認しています…" }
    : ngs.length
      ? { level: "ng", head: "修正が必要な項目があります" }
      : pendings.length
        ? { level: "pending", head: "確認中です（未完了の項目があります）" }
        : warns.length
          ? { level: "warn", head: "利用できますが、注意が必要な項目があります" }
          : { level: "ok", head: "このパソコンで利用できます" };

  const copyReport = async () => {
    const lines = [
      "【見る君 パソコン適合チェック結果】",
      `日時: ${new Date().toLocaleString("ja-JP")}`,
      `総合判定: ${overall.head}`,
      `UA: ${navigator.userAgent}`,
      "",
      ...results.map((r) => `[${BADGE[r.level].text}] ${r.title}: ${r.detail}`),
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied("コピーしました");
    } catch {
      setCopied("コピーできませんでした（https または localhost で開いてください）");
    }
  };

  const level = (id: string) => results.find((r) => r.id === id);
  const selected = deviceId || cam.id;
  const started2 = started && cam.state !== "denied" && cam.state !== "none" && cam.state !== "error";

  return (
    <main className="flex-1 p-4 sm:p-6">
      <div className="max-w-3xl w-full mx-auto space-y-4">
        <div>
          <Link href="/" className="text-sm text-primary hover:underline">← トップへ</Link>
          <h1 className="mt-2 text-2xl md:text-3xl font-black text-gray-800">パソコン適合チェック</h1>
          <p className="mt-1 text-sm text-gray-600">
            導入前に、お客様のパソコンで見る君が動くかを確認します。お店のパソコンのChromeで開いてください。
          </p>
          <p className="mt-2 text-xs text-gray-500">🔒 映像はこのパソコンの中だけで処理され、保存・送信されません。</p>
        </div>

        {/* 総合判定 */}
        <section className={`rounded-2xl border-2 p-5 ${BADGE[overall.level].cls}`} aria-live="polite">
          <div className="text-sm font-bold">総合判定</div>
          <div className="mt-1 text-xl font-black">
            <span aria-hidden>{BADGE[overall.level].icon} </span>
            {overall.head}
          </div>
          {ngs.length > 0 && (
            <ul className="mt-2 text-sm list-disc list-inside space-y-0.5">
              {ngs.map((r) => (
                <li key={r.id}>{r.title}：{r.detail}</li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {!started ? (
              <button onClick={() => setStarted(true)} className="px-5 py-2.5 rounded-2xl bg-primary text-white font-bold hover:opacity-90">
                チェックを開始（カメラを使います）
              </button>
            ) : (
              <button onClick={() => { setRecorded(null); setRunId((n) => n + 1); }} className="px-5 py-2.5 rounded-2xl bg-primary text-white font-bold hover:opacity-90">
                もう一度チェック
              </button>
            )}
            <button onClick={copyReport} disabled={!mounted} className="px-5 py-2.5 rounded-2xl bg-white border border-gray-300 text-gray-800 font-bold hover:border-primary disabled:opacity-40">
              結果をコピー
            </button>
            {copied && <span role="status" className="text-sm">{copied}</span>}
          </div>
        </section>

        {/* 1〜4 */}
        {["browser", "secure", "screen", "perf"].map((id, i) => {
          const r = level(id);
          return r ? <Card key={id} no={i + 1} r={r} /> : null;
        })}

        {/* 5 カメラ */}
        {level("camera") && (
          <Card no={5} r={level("camera")!}>
            {devices.length > 0 && (
              <label className="block mt-3 text-sm text-gray-700">
                使用するカメラ
                <select
                  value={selected}
                  onChange={(e) => setDeviceId(e.target.value)}
                  className="mt-1 block w-full rounded-xl border border-gray-300 bg-white px-3 py-2"
                >
                  {devices.map((d, i) => (
                    <option key={d.deviceId} value={d.deviceId}>{d.label || `カメラ ${i + 1}`}</option>
                  ))}
                </select>
              </label>
            )}
          </Card>
        )}

        {/* 6 */}
        {level("speed") && <Card no={6} r={level("speed")!} />}

        {/* 7 */}
        {level("position") && (
          <Card no={7} r={level("position")!}>
            <div className={`mt-3 ${started2 ? "" : "hidden"}`}>
              <canvas ref={canvasRef} width={PREVIEW_W} height={PREVIEW_H} className="w-full max-w-md rounded-xl bg-gray-900" aria-label="カメラのプレビュー（左右反転）" />
              <div className="mt-2 text-sm text-gray-700" aria-live="off">
                {reading
                  ? `いまの読み取り：顔の幅 ${Math.round(reading.widthPx)}px／距離 約${(reading.distanceCm / 100).toFixed(2)}m${reading.distanceCm < 80 || reading.distanceCm > 250 ? "（1〜2mの位置に立ってください）" : ""}`
                  : "顔が見つかりません。カメラの前に立ってください。"}
              </div>
              <button
                onClick={() => readingRef.current && setRecorded(readingRef.current)}
                disabled={!reading}
                className="mt-2 px-5 py-2.5 rounded-2xl bg-primary text-white font-bold hover:opacity-90 disabled:opacity-40"
              >
                この位置で判定
              </button>
            </div>
          </Card>
        )}

        <video ref={videoRef} className="hidden" playsInline muted />
      </div>
    </main>
  );
}

function Card({ no, r, children }: { no: number; r: Result; children?: React.ReactNode }) {
  const b = BADGE[r.level];
  return (
    <section className="rounded-2xl bg-white border border-gray-200 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-bold text-gray-800">{no}. {r.title}</h2>
        <span className={`shrink-0 inline-flex items-center gap-1 border rounded-full px-3 py-1 text-sm font-bold ${b.cls}`}>
          <span aria-hidden>{b.icon}</span>{b.text}
        </span>
      </div>
      <p className="mt-2 text-sm text-gray-600 leading-relaxed">{r.detail}</p>
      {children}
    </section>
  );
}

/** 鏡像のプレビューに顔の枠を描く */
function drawPreview(canvas: HTMLCanvasElement | null, video: HTMLVideoElement, faces: Face[]) {
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.save();
  ctx.translate(w, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, w, h);
  ctx.restore();
  ctx.strokeStyle = "#4ade80";
  ctx.lineWidth = 2;
  for (const f of faces) {
    const bw = f.width * w;
    ctx.strokeRect((1 - f.cx) * w - bw / 2, f.cy * h - bw / 2, bw, bw);
  }
}
