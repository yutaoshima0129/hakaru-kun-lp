"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import {
  AttentionTracker,
  MetricAggregator,
  headPoseFromMatrix,
  isLooking,
  type FaceObservation,
} from "@/lib/attention";
import { DeviceNotPairedError, getPlayerBackend, mode, type DeviceSettings, type Manifest } from "@/lib/backend";

type CameraState = "starting" | "running" | "denied" | "error";

const DETECT_INTERVAL_MS = 100; // 約10fps
// 計測データの送信間隔（local は端末内保存なので短く、cloud は通信量を抑える）
const FLUSH_INTERVAL_MS = mode === "local" ? 10_000 : 60_000;
const MANIFEST_KEY = "miru-kun:manifest";
const CAMERA_KEY = "miru-kun:camera";

const readStorage = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

/** 最後に読み込めた内容（オフライン時の表示用） */
function readCachedManifest(): Manifest | null {
  try {
    return JSON.parse(readStorage(MANIFEST_KEY) ?? "null");
  } catch {
    return null;
  }
}

async function createLandmarker(): Promise<FaceLandmarker> {
  const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
  const fileset = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
  const options = (delegate: "GPU" | "CPU") => ({
    baseOptions: { modelAssetPath: "/models/face_landmarker.task", delegate },
    runningMode: "VIDEO" as const,
    numFaces: 5,
    outputFacialTransformationMatrixes: true,
  });
  try {
    return await FaceLandmarker.createFromOptions(fileset, options("GPU"));
  } catch {
    return FaceLandmarker.createFromOptions(fileset, options("CPU"));
  }
}

export default function Player() {
  const backend = getPlayerBackend();
  const [phase, setPhase] = useState<"loading" | "unpaired" | "ready">("loading");
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [index, setIndex] = useState(0);
  const [camera, setCamera] = useState<CameraState>("starting");
  const [cameraError, setCameraError] = useState("");
  const [cameraDeviceId, setCameraDeviceId] = useState<string | null>(null);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [debug, setDebug] = useState(false);
  const [live, setLive] = useState({ passers: 0, viewers: 0, faces: 0, fps: 0 });

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const settingsRef = useRef<DeviceSettings | null>(null);
  const currentPosterIdRef = useRef<string | null>(null);
  const lastFacesRef = useRef<FaceObservation[]>([]);
  const debugRef = useRef(false);

  const posters = manifest?.posters ?? [];
  const settings = manifest?.settings ?? null;

  // ---- ポスターと設定の読み込み（管理画面での変更を即時反映） ----
  const reload = useCallback(async () => {
    const apply = (m: Manifest) => {
      settingsRef.current = m.settings;
      setManifest(m);
      setPhase("ready");
    };
    try {
      const m = await backend.loadManifest();
      if (mode === "cloud") {
        try {
          localStorage.setItem(MANIFEST_KEY, JSON.stringify(m));
        } catch {}
      }
      apply(m);
    } catch (e) {
      if (e instanceof DeviceNotPairedError) {
        setPhase("unpaired");
        return;
      }
      // 通信できないときは最後に読み込めた内容で表示を続ける
      console.error("ポスターの読み込みに失敗", e);
      const cached = readCachedManifest();
      if (cached) apply(cached);
    }
  }, [backend]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage は描画後にしか読めない
    setCameraDeviceId(readStorage(CAMERA_KEY) ?? "");
    if (backend.isPaired()) reload();
    else setPhase("unpaired");
  }, [backend, reload]);

  // 起動時に通信できず表示内容が無い（loading のまま）場合も、定期確認で再試行する
  useEffect(() => {
    if (phase === "unpaired") return;
    return backend.subscribe(reload);
  }, [backend, phase, reload]);

  useEffect(() => {
    debugRef.current = debug;
  }, [debug]);

  // ---- ポスターのローテーション ----
  const current = posters.length > 0 ? posters[index % posters.length] : null;
  useEffect(() => {
    currentPosterIdRef.current = current?.id ?? null;
  }, [current]);

  useEffect(() => {
    if (!current || posters.length < 2) return;
    const timer = setTimeout(() => setIndex((i) => (i + 1) % posters.length), current.durationSec * 1000);
    return () => clearTimeout(timer);
  }, [current, posters.length]);

  // ---- キーボード操作 ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "d" || e.key === "D") setDebug((v) => !v);
      if (e.key === "f" || e.key === "F") {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen().catch(() => {});
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ---- カメラと注視計測 ----
  useEffect(() => {
    if (cameraDeviceId === null || phase !== "ready") return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    let landmarker: FaceLandmarker | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tracker = new AttentionTracker();
    const aggregator = new MetricAggregator();
    const counts = { passers: 0, viewers: 0 };
    const frameTimes: number[] = [];

    const flush = () => {
      backend.reportMetrics(aggregator.drain()).catch((e) => console.error("計測データの送信に失敗", e));
    };
    const flushTimer = setInterval(flush, FLUSH_INTERVAL_MS);
    window.addEventListener("pagehide", flush);

    const loop = () => {
      const video = videoRef.current;
      const s = settingsRef.current;
      if (cancelled || !video || !landmarker || !s) return;
      if (video.readyState >= 2) {
        const now = performance.now();
        const res = landmarker.detectForVideo(video, now);
        const faces: FaceObservation[] = res.faceLandmarks.map((lms, i) => {
          let minX = 1, maxX = 0, minY = 1, maxY = 0;
          for (const p of lms) {
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
          }
          const matrix = res.facialTransformationMatrixes?.[i]?.data;
          return {
            cx: (minX + maxX) / 2,
            cy: (minY + maxY) / 2,
            width: maxX - minX,
            pose: matrix ? headPoseFromMatrix(matrix) : { yaw: 90, pitch: 90, distanceCm: 0 },
          };
        });
        lastFacesRef.current = faces;

        const events = tracker.update(faces, now, s, currentPosterIdRef.current);
        for (const ev of events) {
          if (ev.type === "passer") counts.passers++;
          if (ev.type === "viewer") counts.viewers++;
          aggregator.add(ev, Date.now());
        }

        frameTimes.push(now);
        while (frameTimes.length > 0 && now - frameTimes[0] > 1000) frameTimes.shift();
        if (debugRef.current) {
          drawDebug(canvasRef.current, video, faces, s);
          setLive({ passers: counts.passers, viewers: counts.viewers, faces: faces.length, fps: frameTimes.length });
        }
      }
      timer = setTimeout(loop, DETECT_INTERVAL_MS);
    };

    (async () => {
      try {
        setCamera("starting");
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: cameraDeviceId ? { exact: cameraDeviceId } : undefined,
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        if (cancelled) return;
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();
        landmarker = await createLandmarker();
        if (cancelled) return;
        setCamera("running");
        loop();
      } catch (e) {
        if (cancelled) return;
        const err = e as DOMException;
        if (err?.name === "NotAllowedError") setCamera("denied");
        else {
          setCamera("error");
          setCameraError(err?.message ?? String(e));
        }
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearInterval(flushTimer);
      window.removeEventListener("pagehide", flush);
      flush();
      stream?.getTracks().forEach((t) => t.stop());
      landmarker?.close();
    };
  }, [backend, cameraDeviceId, phase]);

  // ---- カメラ一覧（計測状況パネル用。カメラ許可後でないと名前が取れない） ----
  useEffect(() => {
    if (!debug) return;
    navigator.mediaDevices
      ?.enumerateDevices()
      .then((all) => setCameras(all.filter((d) => d.kind === "videoinput")))
      .catch(() => {});
  }, [debug, camera]);

  const chooseCamera = (id: string) => {
    try {
      localStorage.setItem(CAMERA_KEY, id);
    } catch {}
    setCameraDeviceId(id);
  };

  /** いま映っている1人の向きを「画面を見ている状態」として登録する */
  const calibrate = async () => {
    const faces = lastFacesRef.current;
    const s = settingsRef.current;
    if (!s) return;
    if (faces.length !== 1) {
      alert("カメラに1人だけ映った状態で、画面の中央を見ながら押してください。");
      return;
    }
    try {
      await backend.saveCalibration(Math.round(faces[0].pose.yaw), Math.round(faces[0].pose.pitch));
      await reload();
    } catch (e) {
      alert(`補正を保存できませんでした：${(e as Error).message}`);
    }
  };

  const pair = async (code: string) => {
    await backend.pair(code);
    await reload();
  };

  if (phase === "unpaired") return <PairingScreen onPair={pair} />;
  if (phase === "loading")
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center text-white/40 text-sm">接続しています…</div>
    );

  return (
    <div className={`fixed inset-0 bg-black overflow-hidden ${debug ? "" : "cursor-none"}`}>
      {/* ポスター（クロスフェード） */}
      {posters.map((p) => (
        // eslint-disable-next-line @next/next/no-img-element -- data URL / Storage URL をそのまま表示する
        <img
          key={p.id}
          src={p.imageUrl}
          alt={p.name}
          className="absolute inset-0 w-full h-full object-contain transition-opacity duration-700"
          style={{ opacity: current?.id === p.id ? 1 : 0 }}
        />
      ))}

      {posters.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-white/70 text-center p-8">
          <div>
            <div className="text-2xl font-bold">表示するポスターがありません</div>
            <div className="mt-2">管理画面の「ポスター」から追加してください。</div>
          </div>
        </div>
      )}

      {/* カメラ利用の掲示（カメラ画像利活用ガイドブックに沿った通知） */}
      {settings?.showNotice && camera === "running" && (
        <div className="absolute bottom-3 right-3 bg-black/50 text-white/90 text-xs px-3 py-1.5 rounded-full">
          ● AIカメラで人数を計測しています（映像は保存しません）
        </div>
      )}

      {/* 解析用の映像（画面には出さない） */}
      <video ref={videoRef} className="hidden" playsInline muted />

      {/* 計測状況（D キーで切り替え） */}
      {debug && (
        <div className="absolute top-3 left-3 w-[360px] bg-black/80 text-white text-sm rounded-xl p-3 space-y-2 cursor-auto">
          <div className="flex items-center justify-between">
            <span className="font-bold">計測状況</span>
            <span className="text-xs text-white/60">D:閉じる / F:全画面</span>
          </div>
          <canvas ref={canvasRef} className="w-full rounded-lg bg-gray-900" width={320} height={180} />
          {mode === "cloud" && (
            <div className="flex items-center justify-between gap-2 text-xs text-white/70">
              <span className="truncate">
                {manifest?.storeName ?? "店舗未設定"} ／ {manifest?.deviceName ?? "端末"}
              </span>
              <button
                onClick={() => {
                  if (!confirm("この端末の登録を解除します。再び使うにはコードの入力が必要です。")) return;
                  backend.unpair();
                  setManifest(null);
                  setPhase("unpaired");
                }}
                className="shrink-0 underline text-white/80 hover:text-white"
              >
                登録を解除
              </button>
            </div>
          )}
          <select
            value={cameraDeviceId ?? ""}
            onChange={(e) => chooseCamera(e.target.value)}
            aria-label="カメラ"
            className="w-full bg-white/15 rounded-lg px-2 py-1.5 text-xs"
          >
            <option value="" className="text-black">既定のカメラ</option>
            {cameras.map((c, i) => (
              <option key={c.deviceId} value={c.deviceId} className="text-black">
                {c.label || `カメラ ${i + 1}`}
              </option>
            ))}
          </select>
          <div className="text-xs">
            カメラ：
            {camera === "running" && <span className="text-green-400">計測中（{live.fps}fps）</span>}
            {camera === "starting" && <span className="text-yellow-300">起動中…</span>}
            {camera === "denied" && <span className="text-red-400">カメラが許可されていません</span>}
            {camera === "error" && <span className="text-red-400">エラー：{cameraError}</span>}
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label="映っている人" value={live.faces} />
            <Stat label="通行（起動後）" value={live.passers} />
            <Stat label="注視（起動後）" value={live.viewers} />
          </div>
          <div className="text-xs text-white/70">
            表示中：{current?.name ?? "なし"} ／ 判定：左右±{settings?.yawThreshold}° 上下±{settings?.pitchThreshold}° を
            {settings?.minLookMs}ms以上 ／ 補正 {settings?.yawOffset}°, {settings?.pitchOffset}°
          </div>
          <button
            onClick={calibrate}
            className="w-full bg-white/15 hover:bg-white/25 rounded-lg py-1.5 text-xs font-bold"
          >
            いまの顔の向きを「画面を見ている」として補正
          </button>
          <p className="text-[11px] text-white/50 leading-snug">
            このプレビューは調整用です。映像はこのパソコンの中だけで処理され、保存・送信されません。
          </p>
        </div>
      )}
    </div>
  );
}

/** cloud モードで未登録の端末に出す、ペアリングコードの入力画面 */
function PairingScreen({ onPair }: { onPair: (code: string) => Promise<void> }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onPair(code.trim());
    } catch (err) {
      setError((err as Error).message || "登録できませんでした");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-900 flex items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-md text-center text-white space-y-5">
        <div className="text-2xl font-black">見る君 サイネージ</div>
        <p className="text-white/70 text-sm">この端末を登録します。管理画面の『端末と設定』に表示されるコードを入力してください。</p>
        <input
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="XXXX-XXXX"
          maxLength={9}
          className="w-full text-center text-4xl font-black tracking-widest bg-white/10 rounded-2xl px-4 py-4 outline-none focus:ring-2 focus:ring-white/50"
        />
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button
          disabled={busy || code.trim().length < 8}
          className="w-full py-3 rounded-2xl bg-primary text-white text-lg font-bold hover:opacity-90 disabled:opacity-40"
        >
          {busy ? "登録中…" : "登録"}
        </button>
      </form>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white/10 rounded-lg py-1.5">
      <div className="text-lg font-bold tabular-nums">{value}</div>
      <div className="text-[10px] text-white/60">{label}</div>
    </div>
  );
}

/** 調整用プレビュー：鏡像で描画し、顔ごとに向きと判定結果を表示 */
function drawDebug(canvas: HTMLCanvasElement | null, video: HTMLVideoElement, faces: FaceObservation[], s: DeviceSettings) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.save();
  ctx.translate(w, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, w, h);
  ctx.restore();

  ctx.font = "11px sans-serif";
  for (const f of faces) {
    const looking = isLooking(f.pose, s);
    const color = looking ? "#4ade80" : "#f87171";
    const bw = f.width * w;
    const x = (1 - f.cx) * w - bw / 2;
    const y = f.cy * h - bw / 2;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, bw, bw);
    const label = `${looking ? "見ている" : "見ていない"} 左右${Math.round(f.pose.yaw - s.yawOffset)}° 上下${Math.round(
      f.pose.pitch - s.pitchOffset,
    )}° 約${Math.round(f.pose.distanceCm / 10) / 10}m`;
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(x, Math.max(0, y - 16), tw + 8, 16);
    ctx.fillStyle = color;
    ctx.fillText(label, x + 4, Math.max(12, y - 4));
  }
}
