// デモ用：サンプルポスターと、過去7日分の擬似計測データ

import { bucketKey } from "./attention";
import type { NewPoster } from "./backend/types";
import type { Poster, StoredMetric } from "./store";

const FONT = `'Hiragino Kaku Gothic ProN','Hiragino Sans','Noto Sans JP','Yu Gothic',Meiryo,sans-serif`;

function poster(bg1: string, bg2: string, accent: string, eyebrow: string, title: string, sub: string, price: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/></linearGradient></defs>
  <rect width="1920" height="1080" fill="url(#g)"/>
  <circle cx="1500" cy="540" r="360" fill="${accent}" opacity="0.18"/>
  <circle cx="1500" cy="540" r="250" fill="${accent}" opacity="0.28"/>
  <g font-family="${FONT}" fill="#fff">
    <text x="140" y="300" font-size="56" font-weight="700" fill="${accent}">${eyebrow}</text>
    <text x="140" y="470" font-size="150" font-weight="900">${title}</text>
    <text x="140" y="590" font-size="56" font-weight="500" opacity="0.9">${sub}</text>
    <text x="140" y="820" font-size="130" font-weight="900" fill="${accent}">${price}</text>
  </g>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** SVG の data URL を 1920×1080 の PNG に変換する（Storage は jpeg/png/webp のみ受け付けるため） */
async function rasterize(svgUrl: string): Promise<Blob> {
  const img = new Image();
  img.src = svgUrl;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = 1920;
  canvas.height = 1080;
  canvas.getContext("2d")!.drawImage(img, 0, 0, 1920, 1080);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("画像を作れませんでした"))), "image/png"),
  );
}

export function samplePosters(): Promise<NewPoster[]> {
  const defs = [
    {
      name: "ランチ定食",
      image: poster("#7c2d12", "#c2410c", "#fde68a", "11:00〜14:00 限定", "日替わりランチ", "ご飯・味噌汁おかわり自由", "¥980"),
    },
    {
      name: "季節限定パフェ",
      image: poster("#3b0764", "#7e22ce", "#fbcfe8", "秋の季節限定", "和栗のパフェ", "国産和栗をたっぷり使用", "¥1,280"),
    },
    {
      name: "ハッピーアワー",
      image: poster("#0c4a6e", "#0369a1", "#fcd34d", "17:00〜19:00", "ハッピーアワー", "生ビール・ハイボール全品", "半額"),
    },
  ];
  return Promise.all(defs.map(async (d) => ({ name: d.name, image: await rasterize(d.image) })));
}

/** 飲食店らしい時間帯の通行量（ランチ・ディナーにピーク） */
function trafficPerMinute(hour: number) {
  const curve: Record<number, number> = {
    10: 0.6, 11: 2.2, 12: 3.4, 13: 2.4, 14: 1.0, 15: 0.6, 16: 0.7,
    17: 1.4, 18: 2.6, 19: 3.0, 20: 2.2, 21: 1.2, 22: 0.5,
  };
  return curve[hour] ?? 0;
}

function poisson(lambda: number) {
  const l = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= Math.random();
  } while (p > l);
  return k - 1;
}

/** ポスターごとに注視率の違いがある擬似データ（ポスターは表示時間で順番に切り替わる想定） */
export function demoMetrics(posters: Poster[], days = 7): StoredMetric[] {
  const active = posters.filter((p) => p.enabled);
  if (active.length === 0) return [];
  // ポスターごとの「注視されやすさ」（10〜30%）と平均注視秒数
  const profile = active.map((_, i) => ({
    rate: 0.1 + ((i * 7) % 5) * 0.05,
    dwellSec: 1.2 + ((i * 3) % 4) * 0.6,
  }));
  const rows: StoredMetric[] = [];
  const end = Math.floor(Date.now() / 60000) * 60000;
  const start = end - days * 24 * 60 * 60000;
  for (let minute = start; minute < end; minute += 60000) {
    const hour = new Date(minute).getHours();
    const lambda = trafficPerMinute(hour);
    if (lambda === 0) continue;
    // 1分の間に表示されていたポスター（ローテーション）
    const idx = Math.floor(minute / 60000) % active.length;
    const p = active[idx];
    const passers = poisson(lambda);
    if (passers === 0) continue;
    let viewers = 0;
    for (let i = 0; i < passers; i++) if (Math.random() < profile[idx].rate) viewers++;
    const dwellMs = Math.round(viewers * profile[idx].dwellSec * 1000 * (0.6 + Math.random() * 0.8));
    rows.push({ key: bucketKey(minute, p.id), minute, posterId: p.id, passers, viewers, dwellMs, demo: true });
  }
  return rows;
}

/** アップロード画像を最大 1920px の JPEG に縮小する */
export async function fileToPosterImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1920 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("画像を変換できませんでした"))), "image/jpeg", 0.9),
  );
}
