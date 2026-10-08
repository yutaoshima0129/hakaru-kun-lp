// ポスターの表示スケジュール判定（ブラウザ非依存）

export type PosterSchedule = {
  /** 表示する曜日（0=日〜6=土）。空なら毎日 */
  days: number[];
  /** "HH:MM"。start と end の両方が null なら終日。start > end は日付またぎ */
  start: string | null;
  end: string | null;
};

export const ALWAYS: PosterSchedule = { days: [], start: null, end: null };

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/** その時刻（端末の現地時刻）に表示すべきか */
export function isScheduledAt(s: PosterSchedule, at: Date): boolean {
  const now = at.getHours() * 60 + at.getMinutes();
  let day = at.getDay();
  if (s.start !== null && s.end !== null) {
    const start = toMinutes(s.start);
    const end = toMinutes(s.end);
    if (start === end) {
      // 開始＝終了は終日扱い
    } else if (start < end) {
      if (now < start || now >= end) return false;
    } else {
      // 日付またぎ：0時以降の部分は前日の枠として曜日を判定する
      if (now >= end && now < start) return false;
      if (now < end) day = (day + 6) % 7;
    }
  }
  return s.days.length === 0 || s.days.includes(day);
}

const DAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

/** 一覧表示用の短い説明（例: "平日 11:00〜14:00"） */
export function describeSchedule(s: PosterSchedule): string {
  const days = [...s.days].sort((a, b) => a - b);
  const key = days.join(",");
  const dayText =
    days.length === 0 || days.length === 7
      ? "毎日"
      : key === "1,2,3,4,5"
        ? "平日"
        : key === "0,6"
          ? "土日"
          : days.map((d) => DAY_LABELS[d]).join("・");
  const timeText = s.start && s.end && s.start !== s.end ? ` ${s.start}〜${s.end}` : "";
  return dayText === "毎日" && !timeText ? "いつでも" : dayText + timeText;
}
