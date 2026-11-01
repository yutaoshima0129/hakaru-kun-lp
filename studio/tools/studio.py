#!/usr/bin/env python3
"""台本JSONから、画像プロンプトの出力と動画の組み立てを行う。

使い方:
  python3 studio/tools/studio.py prompts studio/projects/ep001
  python3 studio/tools/studio.py narration studio/projects/ep001
  python3 studio/tools/studio.py check   studio/projects/ep001
  python3 studio/tools/studio.py render  studio/projects/ep001 [--placeholder]

必要なもの: Python 3.9+, Pillow, ffmpeg/ffprobe(libx264)。
素材の置き場所(プロジェクトフォルダ内):
  images/s1.png, s2.png ...   各シーンの画像(ChatGPT等で生成。縦長が望ましい)
  audio/s1.wav, s2.wav ...    各シーンのナレーション(VOICEVOX等。無ければ無音)
画像が無いシーンは --placeholder を付けると仮画像で組み立てる。
"""
import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H, FPS = 1080, 1920, 30
PAD_AFTER_VOICE = 0.4  # 音声の後ろの間(秒)
FONT_CANDIDATES = [
    os.environ.get("STUDIO_FONT", ""),
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
    "/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
    "/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc",
    "C:/Windows/Fonts/meiryob.ttc",
]


def find_font() -> str:
    for p in FONT_CANDIDATES:
        if p and Path(p).exists():
            return p
    sys.exit("日本語フォントが見つかりません。環境変数 STUDIO_FONT でフォントファイルを指定してください。")


def load(project: Path):
    script = json.loads((project / "script.json").read_text(encoding="utf-8"))
    channel_path = project.parent.parent / "channels" / script["channel"] / "channel.json"
    channel = json.loads(channel_path.read_text(encoding="utf-8"))
    return script, channel


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f"コマンド失敗: {' '.join(map(str, cmd[:3]))} ...\n{r.stderr[-1500:]}")
    return r.stdout


def audio_duration(path: Path) -> float:
    out = run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
               "-of", "default=nw=1:nk=1", str(path)])
    return float(out.strip())


# ---------------------------------------------------------------- prompts
def cmd_prompts(project: Path):
    script, channel = load(project)
    style = channel["visual_style"]["base_prompt"]
    chars = {c["id"]: c for c in channel["characters"]}
    lines = [f"# 画像プロンプト: {script['title']}", "",
             "ChatGPTに貼り付けて、1シーンずつ画像を生成してください。",
             "ファイル名は images/s1.png, s2.png ... で保存します。", "",
             "## キャラクター固定設定(毎回プロンプトの先頭に付ける)", ""]
    for c in chars.values():
        lines.append(f"- {c['name']}: {c['look']}")
    lines += ["", f"## 共通スタイル\n\n{style}", ""]
    for s in script["scenes"]:
        desc = s["image_prompt"]
        look = "; ".join(f"{c['name']}={c['look']}" for c in chars.values()
                         if c["name"].split("さん")[0] in desc or c["id"] in desc.lower()
                         or c["name"] in desc)
        lines += [f"## シーン{s['id']} → images/s{s['id']}.png", "",
                  "```", f"{desc}. Character reference: {look}. Style: {style}", "```", ""]
    out = project / "prompts.md"
    out.write_text("\n".join(lines), encoding="utf-8")
    print(f"書き出しました: {out}")


# ---------------------------------------------------------------- narration / check
def cmd_narration(project: Path):
    script, _ = load(project)
    lines = [f"# ナレーション: {script['title']}", "",
             "VOICEVOXに1行ずつ貼り付けて、各行を音声ファイルとして書き出します。",
             "書き出したら、ファイル名を s1.wav, s2.wav ... に直して audio/ に置いてください。", ""]
    for s in script["scenes"]:
        lines.append(f"s{s['id']}.wav: {s['narration']}")
    out = project / "narration.txt"
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"書き出しました: {out}")


def cmd_check(project: Path):
    script, _ = load(project)
    ok = True
    for s in script["scenes"]:
        sid = s["id"]
        img = project / "images" / f"s{sid}.png"
        wav = project / "audio" / f"s{sid}.wav"
        im = "OK" if img.exists() else "なし"
        if img.exists():
            w, h = Image.open(img).size
            im += f" ({w}x{h})"
        au = "なし"
        if wav.exists():
            au = f"OK ({audio_duration(wav):.1f}秒)"
        print(f"シーン{sid}: 画像 {im} / 音声 {au}")
        ok = ok and img.exists() and wav.exists()
    print("\n準備完了です。render を実行できます。" if ok else "\n足りない素材があります(画像なしは --placeholder、音声なしは無音で作れます)。")


# ---------------------------------------------------------------- render
def make_subtitle_png(lines, path: Path, font_path: str):
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    size = 88
    while size > 40:
        font = ImageFont.truetype(font_path, size)
        if max(d.textlength(t, font=font) for t in lines) <= W - 120:
            break
        size -= 4
    line_h = int(size * 1.35)
    block_h = line_h * len(lines)
    y = 1500 - block_h // 2 + 100
    for t in lines:
        w = d.textlength(t, font=font)
        d.text(((W - w) / 2, y), t, font=font, fill=(255, 255, 255, 255),
               stroke_width=max(6, size // 12), stroke_fill=(0, 0, 0, 255))
        y += line_h
    img.save(path)


def make_placeholder(idx: int, path: Path, font_path: str):
    colors = [(200, 80, 60), (50, 110, 170), (60, 140, 90), (150, 90, 170), (190, 140, 50)]
    c = colors[idx % len(colors)]
    img = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(img)
    for y in range(H):
        k = y / H
        d.line([(0, y), (W, y)], fill=tuple(int(v * (1 - 0.6 * k)) for v in c))
    f = ImageFont.truetype(font_path, 48)
    d.text((W / 2, 700), f"[仮画像 シーン{idx + 1}]", font=f, fill=(255, 255, 255), anchor="mm")
    img.save(path)


def camera_expr(kind: str, frames: int):
    n = max(frames - 1, 1)
    cx, cy = "iw/2-(iw/zoom/2)", "ih/2-(ih/zoom/2)"
    if kind == "zoom_out":
        return f"z='max(1.0,1.2-0.2*on/{n})':x='{cx}':y='{cy}'"
    if kind == "pan_left":
        return f"z=1.15:x='(iw-iw/zoom)*(1-on/{n})':y='{cy}'"
    if kind == "pan_right":
        return f"z=1.15:x='(iw-iw/zoom)*on/{n}':y='{cy}'"
    return f"z='1.0+0.2*on/{n}':x='{cx}':y='{cy}'"  # zoom_in(既定)


def cmd_render(project: Path, placeholder: bool):
    script, channel = load(project)
    font = find_font()
    work = project / "work"
    out_dir = project / "out"
    work.mkdir(exist_ok=True)
    out_dir.mkdir(exist_ok=True)
    clips, total, used_voice = [], 0.0, False
    warnings = []

    for i, s in enumerate(script["scenes"]):
        sid = s["id"]
        img = project / "images" / f"s{sid}.png"
        wav = project / "audio" / f"s{sid}.wav"
        if not img.exists():
            if not placeholder:
                sys.exit(f"画像がありません: {img}  (仮画像で試すなら --placeholder)")
            img = work / f"placeholder{sid}.png"
            make_placeholder(i, img, font)
            warnings.append(f"シーン{sid}: 仮画像")
        if wav.exists():
            dur = audio_duration(wav) + PAD_AFTER_VOICE
            used_voice = True
        else:
            dur = float(s["sec"])
            warnings.append(f"シーン{sid}: 音声なし(無音{dur:.1f}秒)")
        frames = int(round(dur * FPS))
        sub = work / f"sub{sid}.png"
        make_subtitle_png(s["subtitle"], sub, font)
        clip = work / f"clip{sid}.mp4"
        cam = camera_expr(s.get("camera", "zoom_in"), frames)
        vf = (f"[0:v]scale={W*2}:{H*2}:force_original_aspect_ratio=increase,crop={W*2}:{H*2},"
              f"zoompan={cam}:d={frames}:s={W}x{H}:fps={FPS}[bg];[bg][1:v]overlay=0:0[v]")
        cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", str(img), "-i", str(sub)]
        if wav.exists():
            cmd += ["-i", str(wav)]
        else:
            cmd += ["-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono"]
        cmd += ["-filter_complex", vf, "-map", "[v]", "-map", "2:a",
                "-af", "apad,aresample=44100,aformat=channel_layouts=mono",
                "-t", f"{dur:.3f}", "-r", str(FPS), "-pix_fmt", "yuv420p",
                "-c:v", "libx264", "-preset", "medium", "-crf", "20",
                "-c:a", "aac", "-b:a", "160k", "-ar", "44100", "-ac", "1", str(clip)]
        run(cmd)
        clips.append(clip)
        total += dur
        print(f"シーン{sid}: {dur:.1f}秒")

    listing = work / "concat.txt"
    listing.write_text("".join(f"file '{c.resolve()}'\n" for c in clips), encoding="utf-8")
    out = out_dir / f"{script['id']}.mp4"
    run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0",
         "-i", str(listing), "-c", "copy", "-movflags", "+faststart", str(out)])

    # 投稿用テキスト(説明欄にクレジットを入れる)
    desc = script.get("description_template", "")
    if used_voice:
        spk = channel["voice"]["speakers"].get("narrator", "")
        desc += "\n\n" + channel["voice"]["credit_template"].format(speaker=spk)
    (out_dir / f"{script['id']}_description.txt").write_text(
        f"{script['title']}\n\n{desc}\n", encoding="utf-8")

    print(f"\n完成: {out}  (合計 {total:.1f}秒)")
    if total > 60:
        print("警告: 60秒を超えています。Shortsは60秒以内にしてください")
    if total < 15:
        print("注意: 15秒未満です")
    for w in warnings:
        print(f"注意: {w}")
    if not used_voice:
        print("注意: ナレーション音声が1つもありません(無音動画)")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p1 = sub.add_parser("prompts", help="画像プロンプトを prompts.md に書き出す")
    p1.add_argument("project", type=Path)
    p3 = sub.add_parser("narration", help="VOICEVOX用のナレーション一覧を narration.txt に書き出す")
    p3.add_argument("project", type=Path)
    p4 = sub.add_parser("check", help="画像・音声の素材がそろっているか確認する")
    p4.add_argument("project", type=Path)
    p2 = sub.add_parser("render", help="動画を組み立てる")
    p2.add_argument("project", type=Path)
    p2.add_argument("--placeholder", action="store_true", help="画像が無いシーンは仮画像で作る")
    a = ap.parse_args()
    if a.cmd == "prompts":
        cmd_prompts(a.project)
    elif a.cmd == "narration":
        cmd_narration(a.project)
    elif a.cmd == "check":
        cmd_check(a.project)
    else:
        cmd_render(a.project, a.placeholder)


if __name__ == "__main__":
    main()
