import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AttentionTracker,
  MetricAggregator,
  headPoseFromMatrix,
  type AttentionSettings,
  type FaceObservation,
} from "../lib/attention.ts";

const settings: AttentionSettings = {
  yawThreshold: 20,
  pitchThreshold: 15,
  minLookMs: 500,
  minPresenceMs: 300,
  yawOffset: 0,
  pitchOffset: 0,
};

/** 顔の位置 t（cm）と、Y軸まわりに yawDeg 回転した正面方向から列優先 4x4 行列を作る */
function matrix(t: [number, number, number], yawDeg: number) {
  const r = (yawDeg * Math.PI) / 180;
  // 第3列 = 顔の正面方向
  const f = [Math.sin(r), 0, Math.cos(r)];
  return [1, 0, 0, 0, 0, 1, 0, 0, f[0], f[1], f[2], 0, t[0], t[1], t[2], 1];
}

const face = (cx: number, yaw: number, pitch = 0): FaceObservation => ({
  cx,
  cy: 0.5,
  width: 0.1,
  pose: { yaw, pitch, distanceCm: 100 },
});

test("正面でカメラを向いた顔は yaw/pitch が 0", () => {
  const p = headPoseFromMatrix(matrix([0, 0, -100], 0));
  assert.ok(Math.abs(p.yaw) < 1e-9);
  assert.ok(Math.abs(p.pitch) < 1e-9);
  assert.equal(Math.round(p.distanceCm), 100);
});

test("カメラの横にいる人がカメラを向けば yaw は 0 に近い", () => {
  // 右に 100cm、奥に 100cm の位置から、カメラ方向（-45°）を向いている
  const p = headPoseFromMatrix(matrix([100, 0, -100], -45));
  assert.ok(Math.abs(p.yaw) < 1e-6, `yaw=${p.yaw}`);
});

test("横を向いた顔は yaw が大きい", () => {
  const p = headPoseFromMatrix(matrix([0, 0, -100], 40));
  assert.ok(Math.abs(p.yaw - 40) < 1e-6);
});

test("0.5秒以上見続けると注視1件・通行1件", () => {
  const tr = new AttentionTracker();
  const events = [];
  for (let t = 0; t <= 1000; t += 100) events.push(...tr.update([face(0.5, 0)], t, settings));
  assert.equal(events.filter((e) => e.type === "passer").length, 1);
  assert.equal(events.filter((e) => e.type === "viewer").length, 1);
  const dwell = events.filter((e) => e.type === "dwell").reduce((s, e) => s + (e.type === "dwell" ? e.ms : 0), 0);
  assert.equal(dwell, 1000);
});

test("通り過ぎるだけ（横向き）なら通行のみ", () => {
  const tr = new AttentionTracker();
  const events = [];
  for (let t = 0; t <= 1000; t += 100) events.push(...tr.update([face(0.2 + t / 5000, 60)], t, settings));
  assert.equal(events.filter((e) => e.type === "passer").length, 1);
  assert.equal(events.filter((e) => e.type === "viewer").length, 0);
});

test("ちらっと見ただけ（0.3秒）は注視に数えない", () => {
  const tr = new AttentionTracker();
  const events = [];
  for (let t = 0; t <= 1000; t += 100) {
    const yaw = t >= 300 && t < 600 ? 0 : 60;
    events.push(...tr.update([face(0.5, yaw)], t, settings));
  }
  assert.equal(events.filter((e) => e.type === "viewer").length, 0);
});

test("2人を別々に数える", () => {
  const tr = new AttentionTracker();
  const events = [];
  for (let t = 0; t <= 1000; t += 100) events.push(...tr.update([face(0.2, 0), face(0.8, 70)], t, settings));
  assert.equal(events.filter((e) => e.type === "passer").length, 2);
  assert.equal(events.filter((e) => e.type === "viewer").length, 1);
});

test("一瞬の検出漏れでは別人にならない", () => {
  const tr = new AttentionTracker();
  const events = [];
  for (let t = 0; t <= 2000; t += 100) {
    const faces = t === 800 || t === 900 ? [] : [face(0.5, 0)];
    events.push(...tr.update(faces, t, settings));
  }
  assert.equal(events.filter((e) => e.type === "passer").length, 1);
  assert.equal(events.filter((e) => e.type === "viewer").length, 1);
});

test("集計はポスター・分単位でまとまる", () => {
  const agg = new MetricAggregator();
  agg.add({ type: "passer", at: 0, posterId: "a" }, 60_000);
  agg.add({ type: "viewer", at: 0, posterId: "a" }, 60_500);
  agg.add({ type: "dwell", at: 0, ms: 300, posterId: "a" }, 61_000);
  agg.add({ type: "passer", at: 0, posterId: "b" }, 61_000);
  agg.add({ type: "passer", at: 0, posterId: "a" }, 125_000);
  agg.add({ type: "passer", at: 0, posterId: null }, 61_000); // ポスター未表示中は捨てる
  const out = agg.drain().sort((x, y) => x.minute - y.minute || x.posterId.localeCompare(y.posterId));
  assert.deepEqual(out, [
    { minute: 60_000, posterId: "a", passers: 1, viewers: 1, dwellMs: 300 },
    { minute: 60_000, posterId: "b", passers: 1, viewers: 0, dwellMs: 0 },
    { minute: 120_000, posterId: "a", passers: 1, viewers: 0, dwellMs: 0 },
  ]);
  assert.equal(agg.drain().length, 0);
});

test("見ている途中でポスターが切り替わっても、通行と注視は同じポスターに計上する", () => {
  const tr = new AttentionTracker();
  const events = [];
  // 0〜300ms は横向きで通行が確定（ポスターA表示中）→ 400ms からBに切り替わり、その後正面を見る
  for (let t = 0; t <= 1200; t += 100) {
    const poster = t < 400 ? "A" : "B";
    events.push(...tr.update([face(0.5, t < 400 ? 60 : 0)], t, settings, poster));
  }
  const passer = events.find((e) => e.type === "passer");
  const viewer = events.find((e) => e.type === "viewer");
  assert.equal(passer?.posterId, "A");
  assert.equal(viewer?.posterId, "A", "注視は通行と同じポスターに計上");
  // 注視時間は実際に表示されていたポスター（B）に計上
  assert.ok(events.filter((e) => e.type === "dwell").every((e) => e.posterId === "B"));
});
