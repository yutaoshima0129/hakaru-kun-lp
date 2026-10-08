// MediaPipe の WASM ランタイムを public/ にコピーする（33MBあるため git には含めない）
import { cpSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules/@mediapipe/tasks-vision/wasm");
const dest = join(root, "public/mediapipe/wasm");

if (existsSync(src)) {
  cpSync(src, dest, { recursive: true });
  console.log("[miru-kun] MediaPipe WASM を public/mediapipe/wasm にコピーしました");
}
