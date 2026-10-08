import { test } from "node:test";
import assert from "node:assert/strict";
import { describeSchedule, isScheduledAt, type PosterSchedule } from "../lib/schedule.ts";

// 2026-10-05 は月曜日
const at = (day: number, hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(2026, 9, 4 + day, h, m);
};
const lunch: PosterSchedule = { days: [1, 2, 3, 4, 5], start: "11:00", end: "14:00" };
const night: PosterSchedule = { days: [5, 6], start: "22:00", end: "02:00" };

test("指定なしはいつでも表示", () => {
  assert.equal(isScheduledAt({ days: [], start: null, end: null }, at(0, "03:00")), true);
});

test("平日ランチ：時間内・時間外・終了時刻ちょうど・週末", () => {
  assert.equal(isScheduledAt(lunch, at(1, "11:00")), true);
  assert.equal(isScheduledAt(lunch, at(1, "13:59")), true);
  assert.equal(isScheduledAt(lunch, at(1, "14:00")), false);
  assert.equal(isScheduledAt(lunch, at(1, "10:59")), false);
  assert.equal(isScheduledAt(lunch, at(6, "12:00")), false);
});

test("日付またぎ：金曜22時〜翌2時は土曜1時も表示、金曜1時は木曜の枠なので非表示", () => {
  assert.equal(isScheduledAt(night, at(5, "23:30")), true);
  assert.equal(isScheduledAt(night, at(6, "01:30")), true); // 金曜夜の続き
  assert.equal(isScheduledAt(night, at(5, "01:30")), false); // 木曜夜の続き（木曜は対象外）
  assert.equal(isScheduledAt(night, at(0, "01:30")), true); // 土曜夜の続き
  assert.equal(isScheduledAt(night, at(6, "02:00")), false);
  assert.equal(isScheduledAt(night, at(6, "12:00")), false);
});

test("説明文", () => {
  assert.equal(describeSchedule({ days: [], start: null, end: null }), "いつでも");
  assert.equal(describeSchedule(lunch), "平日 11:00〜14:00");
  assert.equal(describeSchedule({ days: [0, 6], start: null, end: null }), "土日");
  assert.equal(describeSchedule(night), "金・土 22:00〜02:00");
});
