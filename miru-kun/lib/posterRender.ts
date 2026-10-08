// ポスター画像（1920×1080）を Canvas に描く。AI・テンプレートどちらのデザインも同じ描画を通す。

import type { PosterBrief, PosterDesign, PosterMood } from "./ai/types";

export const POSTER_W = 1920;
export const POSTER_H = 1080;
const FONT = `'Hiragino Kaku Gothic ProN','Hiragino Sans','Noto Sans JP','Yu Gothic',Meiryo,sans-serif`;
const MIN_SIZE = 28;

type Block = { lines: string[]; size: number; weight: number; color: string; gapAfter: number; alpha?: number };

const setFont = (ctx: CanvasRenderingContext2D, size: number, weight: number) => {
  ctx.font = `${weight} ${size}px ${FONT}`;
};

/** 1行に収まるまで文字サイズを小さくする */
function fitSize(ctx: CanvasRenderingContext2D, text: string, weight: number, max: number, width: number) {
  let size = max;
  setFont(ctx, size, weight);
  const w = ctx.measureText(text).width;
  if (w > width) size = Math.max(MIN_SIZE, Math.floor((max * width) / w));
  return size;
}

/** 文字単位で最大2行に折り返す（収まらなければ文字サイズを縮める） */
function fitTitle(ctx: CanvasRenderingContext2D, text: string, weight: number, max: number, width: number) {
  const chars = [...text];
  for (let size = max; size >= MIN_SIZE; size -= 4) {
    setFont(ctx, size, weight);
    if (ctx.measureText(text).width <= width) return { size, lines: [text] };
    // 2行に分ける位置のうち、長い方の行が最も短くなるもの
    let best: string[] | null = null;
    let bestW = Infinity;
    for (let i = 1; i < chars.length; i++) {
      const a = chars.slice(0, i).join("");
      const b = chars.slice(i).join("");
      const w = Math.max(ctx.measureText(a).width, ctx.measureText(b).width);
      if (w < bestW) {
        bestW = w;
        best = [a, b];
      }
    }
    if (best && bestW <= width) return { size, lines: best };
  }
  return { size: MIN_SIZE, lines: [text] };
}

/** cover で矩形いっぱいに画像を敷く */
function drawCover(ctx: CanvasRenderingContext2D, img: ImageBitmap, x: number, y: number, w: number, h: number) {
  const s = Math.max(w / img.width, h / img.height);
  const sw = w / s;
  const sh = h / s;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
  ctx.restore();
}

export function renderPoster(
  design: PosterDesign,
  photo: ImageBitmap | null,
  canvas: HTMLCanvasElement = document.createElement("canvas"),
): HTMLCanvasElement {
  canvas.width = POSTER_W;
  canvas.height = POSTER_H;
  const ctx = canvas.getContext("2d")!;
  const layout = design.layout === "split" && !photo ? "left" : design.layout;

  const g = ctx.createLinearGradient(0, 0, POSTER_W, POSTER_H);
  g.addColorStop(0, design.bg1);
  g.addColorStop(1, design.bg2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, POSTER_W, POSTER_H);

  // 文字を置く列
  let x: number;
  let width: number;
  let align: CanvasTextAlign;
  if (layout === "split") {
    drawCover(ctx, photo!, 0, 0, POSTER_W / 2, POSTER_H);
    x = POSTER_W / 2 + 90;
    width = POSTER_W / 2 - 90 - 90;
    align = "left";
  } else {
    if (photo) {
      drawCover(ctx, photo, 0, 0, POSTER_W, POSTER_H);
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, 0, POSTER_W, POSTER_H);
    }
    if (layout === "left") {
      if (!photo) {
        ctx.fillStyle = design.accent;
        ctx.globalAlpha = 0.18;
        ctx.beginPath();
        ctx.arc(1500, 540, 360, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.28;
        ctx.beginPath();
        ctx.arc(1500, 540, 250, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      x = 140;
      // 写真なしは右側の飾りの円（x=1140〜）にかからない幅にする
      width = photo ? 1240 : 980;
      align = "left";
    } else {
      x = POSTER_W / 2;
      width = 1640;
      align = "center";
    }
  }

  // 文字ブロック（空の項目は飛ばして間隔を詰める）
  const blocks: Block[] = [];
  if (design.eyebrow.trim()) {
    const t = design.eyebrow.trim();
    blocks.push({ lines: [t], size: fitSize(ctx, t, 700, 56, width), weight: 700, color: design.accent, gapAfter: 36 });
  }
  if (design.title.trim()) {
    const t = fitTitle(ctx, design.title.trim(), 900, 150, width);
    blocks.push({ lines: t.lines, size: t.size, weight: 900, color: design.text, gapAfter: 44 });
  }
  if (design.subtitle.trim()) {
    const t = design.subtitle.trim();
    blocks.push({ lines: [t], size: fitSize(ctx, t, 500, 56, width), weight: 500, color: design.text, gapAfter: 80, alpha: 0.9 });
  }
  if (design.priceText.trim()) {
    const t = design.priceText.trim();
    blocks.push({ lines: [t], size: fitSize(ctx, t, 900, 130, width), weight: 900, color: design.accent, gapAfter: 0 });
  }
  if (blocks.length > 0) blocks[blocks.length - 1].gapAfter = 0;

  const LH = 1.18;
  const total = blocks.reduce((s, b) => s + b.lines.length * b.size * LH + b.gapAfter, 0);
  let y = (POSTER_H - total) / 2;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  for (const b of blocks) {
    setFont(ctx, b.size, b.weight);
    ctx.fillStyle = b.color;
    ctx.globalAlpha = b.alpha ?? 1;
    for (const line of b.lines) {
      // ベースラインは行の高さ内でやや下寄せ
      ctx.fillText(line, x, y + b.size * 0.98);
      y += b.size * LH;
    }
    ctx.globalAlpha = 1;
    y += b.gapAfter;
  }
  return canvas;
}

export function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("画像を作れませんでした"))), "image/png"),
  );
}

// [bg1, bg2, accent, text]：どの組み合わせも文字色が両端の背景色の上で読める濃さにしている
const PALETTES: Record<PosterMood, [string, string, string, string][]> = {
  にぎやか: [
    ["#7c2d12", "#c2410c", "#fde047", "#ffffff"],
    ["#9f1239", "#e11d48", "#fef08a", "#ffffff"],
    ["#14532d", "#15803d", "#fde68a", "#ffffff"],
  ],
  高級感: [
    ["#0a0a0a", "#292524", "#e7c873", "#fafaf9"],
    ["#1c1917", "#44403c", "#d4af37", "#ffffff"],
    ["#1e1b4b", "#0f172a", "#e9d5a0", "#ffffff"],
  ],
  和風: [
    ["#1f2937", "#7f1d1d", "#fcd34d", "#fffbeb"],
    ["#14301f", "#365314", "#fde68a", "#fefce8"],
    ["#3b0f1a", "#6b1d2a", "#f5d0a9", "#fff7ed"],
  ],
  ナチュラル: [
    ["#365314", "#4d7c0f", "#fef3c7", "#ffffff"],
    ["#44403c", "#78716c", "#fde68a", "#ffffff"],
    ["#134e4a", "#0f766e", "#fef9c3", "#ffffff"],
  ],
  ポップ: [
    ["#be185d", "#7e22ce", "#fde047", "#ffffff"],
    ["#0369a1", "#6d28d9", "#fef08a", "#ffffff"],
    ["#c2410c", "#be123c", "#a5f3fc", "#ffffff"],
  ],
};

const trim = (s: string, n: number) => {
  const c = [...s.trim()];
  return c.length > n ? c.slice(0, n - 1).join("") + "…" : c.join("");
};

/** AI を使わずに入力からそのまま作る3案 */
export function templateDesigns(brief: PosterBrief, hasPhoto: boolean): PosterDesign[] {
  const palettes = PALETTES[brief.mood] ?? PALETTES["にぎやか"];
  const layouts: PosterDesign["layout"][] = ["left", "center", hasPhoto ? "split" : "left"];
  return palettes.map(([bg1, bg2, accent, text], i) => ({
    eyebrow: brief.condition.trim(),
    title: brief.item.trim(),
    subtitle: trim(brief.details, 24),
    priceText: brief.price.trim(),
    bg1,
    bg2,
    accent,
    text,
    layout: layouts[i],
  }));
}
