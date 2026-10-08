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
import { addMetrics, listPosters, loadSettings, saveSettings, subscribe, type AppSettings, type Poster } from "@/lib/store";

type CameraState = "starting" | "running" | "denied" | "error";

const DETECT_INTERVAL_MS = 100; // 約10fps
const FLUSH_INTERVAL_MS = 10_000;

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
  const [posters, setPosters] = useState<Poster[]>([]);
  const [index, setIndex] = useState(0);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [camera, setCamera] = useState<CameraState>("starting");
  const [cameraError, setCameraError] = useState("");
  const [debug, setDebug] = useState(false);
  const [live, setLive] = useState({ passers: 0, viewers: 0, faces: 0, fps: 0 });

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const settingsRef = useRef<AppSettings | null>(null);
  const currentPosterIdRef = useRef<string | null>(null);
  const lastFacesRef = useRef<FaceObservation[]>([]);
  const debugRef = useRef(false);

  // ---- ポスターと設定の読み込み（管理画面での変更を即時反映） ----
  const reloadPosters = useCallback(async () => {
    const all = await listPosters();
    setPosters(all.filter((p) => p.enabled));
  }, []);

  useEffect(() => {
    const s = loadSettings();
    settingsRef.current = s;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage は描画後にしか読めない
    setSettings(s);
    reloadPosters();
    return subscribe((msg) => {
      if (msg.type === "posters-changed") reloadPosters();
      if (msg.type === "settings-changed") {
        const next = loadSettings();
        settingsRef.current = next;
        setSettings(next);
      }
    });
  }, [reloadPosters]);

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
  const cameraDeviceId = settings?.cameraDeviceId;
  useEffect(() => {
    if (cameraDeviceId === undefined) return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    let landmarker: FaceLandmarker | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tracker = new AttentionTracker();
    const aggregator = new MetricAggregator();
    const counts = { passers: 0, viewers: 0 };
    const frameTimes: number[] = [];

    const flush = () => {
      addMetrics(aggregator.drain()).catch((e) => console.error("計測データの保存に失敗", e));
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

        const events = tracker.update(faces, now, s);
        const posterId = currentPosterIdRef.current;
        for (const ev of events) {
          if (ev.type === "passer") counts.passers++;
          if (ev.type === "viewer") counts.viewers++;
          if (posterId) aggregator.add(ev, posterId, Date.now());
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
  }, [cameraDeviceId]);

  /** いま映っている1人の向きを「画面を見ている状態」として登録する */
  const calibrate = () => {
    const faces = lastFacesRef.current;
    const s = settingsRef.current;
    if (!s) return;
    if (faces.length !== 1) {
      alert("カメラに1人だけ映った状態で、画面の中央を見ながら押してください。");
      return;
    }
    saveSettings({ ...s, yawOffset: Math.round(faces[0].pose.yaw), pitchOffset: Math.round(faces[0].pose.pitch) });
  };

  return (
    <div className={`fixed inset-0 bg-black overflow-hidden ${debug ? "" : "cursor-none"}`}>
      {/* ポスター（クロスフェード） */}
      {posters.map((p) => (
        // eslint-disable-next-line @next/next/no-img-element -- data URL をそのまま表示する
        <img
          key={p.id}
          src={p.image}
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

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white/10 rounded-lg py-1.5">
      <div className="text-lg font-bold tabular-nums">{value}</div>
      <div className="text-[10px] text-white/60">{label}</div>
    </div>
  );
}

/** 調整用プレビュー：鏡像で描画し、顔ごとに向きと判定結果を表示 */
function drawDebug(canvas: HTMLCanvasElement | null, video: HTMLVideoElement, faces: FaceObservation[], s: AppSettings) {
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
