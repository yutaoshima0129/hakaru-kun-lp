// 注視判定のコアロジック（ブラウザAPIに依存しない純粋な処理）
// - 顔の向き推定: MediaPipe の顔変換行列から「カメラ方向に対するずれ角」を求める
// - トラッキング: フレーム間で同じ顔を対応付け、通行・注視・注視時間を数える
// 顔画像や顔の特徴量は一切保持しない。保持するのは画面上の位置と時刻だけ。

export type AttentionSettings = {
  /** 左右の許容角度（度） */
  yawThreshold: number;
  /** 上下の許容角度（度） */
  pitchThreshold: number;
  /** この時間以上画面を向き続けたら「注視」とみなす（ms） */
  minLookMs: number;
  /** この時間以上映り続けたら「通行」とみなす（ノイズ除去, ms） */
  minPresenceMs: number;
  /** キャリブレーション補正（度） */
  yawOffset: number;
  pitchOffset: number;
};

export type HeadPose = {
  /** カメラ方向に対する左右のずれ（度, 補正前） */
  yaw: number;
  /** カメラ方向に対する上下のずれ（度, 補正前） */
  pitch: number;
  /** カメラからの推定距離（cm） */
  distanceCm: number;
};

export type FaceObservation = {
  /** 画面上の顔の中心（0〜1 正規化座標） */
  cx: number;
  cy: number;
  /** 顔の幅（0〜1 正規化） */
  width: number;
  pose: HeadPose;
};

const RAD2DEG = 180 / Math.PI;

function yawOf(x: number, z: number) {
  return Math.atan2(x, z) * RAD2DEG;
}
function pitchOf(x: number, y: number, z: number) {
  return Math.atan2(y, Math.hypot(x, z)) * RAD2DEG;
}
function wrap180(deg: number) {
  let d = deg % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

/**
 * MediaPipe の facialTransformationMatrixes（4x4, 列優先）から頭部姿勢を求める。
 * 顔の正面方向ベクトル（行列の第3列）と、顔→カメラ方向ベクトル（-平行移動）の角度差を取るので、
 * カメラの正面にいない人でも「カメラを見ているか」を判定できる。
 */
export function headPoseFromMatrix(m: ArrayLike<number>): HeadPose {
  // 顔の正面方向（顔のローカル +Z をカメラ座標系へ）
  const fx = m[8];
  const fy = m[9];
  const fz = m[10];
  // 顔の位置（カメラ座標系, cm）。顔→カメラ方向は位置ベクトルの逆向き
  const tx = m[12];
  const ty = m[13];
  const tz = m[14];
  const cx = -tx;
  const cy = -ty;
  const cz = -tz;

  return {
    yaw: wrap180(yawOf(fx, fz) - yawOf(cx, cz)),
    pitch: wrap180(pitchOf(fx, fy, fz) - pitchOf(cx, cy, cz)),
    distanceCm: Math.hypot(tx, ty, tz),
  };
}

export function isLooking(pose: HeadPose, s: AttentionSettings): boolean {
  return (
    Math.abs(pose.yaw - s.yawOffset) <= s.yawThreshold &&
    Math.abs(pose.pitch - s.pitchOffset) <= s.pitchThreshold
  );
}

export type Track = {
  id: number;
  cx: number;
  cy: number;
  firstSeen: number;
  lastSeen: number;
  /** 現在連続して画面を向き始めた時刻（向いていなければ null） */
  lookStart: number | null;
  looking: boolean;
  countedPasser: boolean;
  countedViewer: boolean;
  totalLookMs: number;
};

/** 計測イベント。呼び出し側がその時点で表示中のポスターに紐付けて集計する */
export type AttentionEvent =
  | { type: "passer"; at: number }
  | { type: "viewer"; at: number }
  | { type: "dwell"; at: number; ms: number };

export type TrackerOptions = {
  /** この時間見えなくなったらトラックを破棄（ms） */
  lostAfterMs: number;
  /** 同一人物とみなす中心間の最大距離（正規化座標） */
  maxMatchDistance: number;
  /** 1フレームで加算する注視時間の上限（処理落ち時の過大計上を防ぐ, ms） */
  maxFrameMs: number;
};

const DEFAULT_TRACKER_OPTIONS: TrackerOptions = {
  lostAfterMs: 1000,
  maxMatchDistance: 0.15,
  maxFrameMs: 250,
};

export class AttentionTracker {
  private tracks: Track[] = [];
  private nextId = 1;
  private lastUpdate: number | null = null;
  private opts: TrackerOptions;

  constructor(opts: Partial<TrackerOptions> = {}) {
    this.opts = { ...DEFAULT_TRACKER_OPTIONS, ...opts };
  }

  get activeTracks(): readonly Track[] {
    return this.tracks;
  }

  /** 1フレーム分の検出結果を渡し、発生したイベントを返す */
  update(faces: FaceObservation[], now: number, s: AttentionSettings): AttentionEvent[] {
    const events: AttentionEvent[] = [];
    const frameMs =
      this.lastUpdate === null ? 0 : Math.min(now - this.lastUpdate, this.opts.maxFrameMs);
    this.lastUpdate = now;

    // 近い順に貪欲マッチング
    const pairs: { t: number; f: number; d: number }[] = [];
    this.tracks.forEach((track, t) =>
      faces.forEach((face, f) => {
        const d = Math.hypot(track.cx - face.cx, track.cy - face.cy);
        if (d <= this.opts.maxMatchDistance) pairs.push({ t, f, d });
      }),
    );
    pairs.sort((a, b) => a.d - b.d);
    const usedTracks = new Set<number>();
    const assignment = new Map<number, Track>();
    for (const p of pairs) {
      if (usedTracks.has(p.t) || assignment.has(p.f)) continue;
      usedTracks.add(p.t);
      assignment.set(p.f, this.tracks[p.t]);
    }

    faces.forEach((face, f) => {
      let track = assignment.get(f);
      if (!track) {
        track = {
          id: this.nextId++,
          cx: face.cx,
          cy: face.cy,
          firstSeen: now,
          lastSeen: now,
          lookStart: null,
          looking: false,
          countedPasser: false,
          countedViewer: false,
          totalLookMs: 0,
        };
        this.tracks.push(track);
      } else if (track.looking) {
        // 前フレームから向いていた分を注視時間として加算
        track.totalLookMs += frameMs;
        events.push({ type: "dwell", at: now, ms: frameMs });
      }
      track.cx = face.cx;
      track.cy = face.cy;
      track.lastSeen = now;

      const looking = isLooking(face.pose, s);
      if (looking && track.lookStart === null) track.lookStart = now;
      if (!looking) track.lookStart = null;
      track.looking = looking;

      if (!track.countedPasser && now - track.firstSeen >= s.minPresenceMs) {
        track.countedPasser = true;
        events.push({ type: "passer", at: now });
      }
      if (
        !track.countedViewer &&
        track.lookStart !== null &&
        now - track.lookStart >= s.minLookMs
      ) {
        // 通行より先に注視が確定することはないように揃える
        if (!track.countedPasser) {
          track.countedPasser = true;
          events.push({ type: "passer", at: now });
        }
        track.countedViewer = true;
        events.push({ type: "viewer", at: now });
      }
    });

    // 見えなくなった顔は「向いていない」扱いにし、一定時間で破棄
    for (const track of this.tracks) {
      if (track.lastSeen !== now) {
        track.looking = false;
        track.lookStart = null;
      }
    }
    this.tracks = this.tracks.filter((t) => now - t.lastSeen <= this.opts.lostAfterMs);
    return events;
  }

  reset() {
    this.tracks = [];
    this.lastUpdate = null;
  }
}

/** 1分単位・ポスター単位の集計 */
export type MetricBucket = {
  /** 分の開始時刻（epoch ms） */
  minute: number;
  posterId: string;
  passers: number;
  viewers: number;
  dwellMs: number;
};

export function minuteOf(epochMs: number) {
  return Math.floor(epochMs / 60000) * 60000;
}

export function bucketKey(minute: number, posterId: string) {
  return `${minute}|${posterId}`;
}

/** イベントをメモリ上のバケットに積み上げる。保存は呼び出し側が定期的に行う */
export class MetricAggregator {
  private buckets = new Map<string, MetricBucket>();

  add(event: AttentionEvent, posterId: string, epochMs: number) {
    const minute = minuteOf(epochMs);
    const key = bucketKey(minute, posterId);
    let b = this.buckets.get(key);
    if (!b) {
      b = { minute, posterId, passers: 0, viewers: 0, dwellMs: 0 };
      this.buckets.set(key, b);
    }
    if (event.type === "passer") b.passers += 1;
    else if (event.type === "viewer") b.viewers += 1;
    else b.dwellMs += event.ms;
  }

  /** 溜まったバケットを取り出して空にする */
  drain(): MetricBucket[] {
    const out = [...this.buckets.values()];
    this.buckets.clear();
    return out;
  }
}
