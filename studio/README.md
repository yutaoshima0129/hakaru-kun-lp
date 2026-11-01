# studio — AIショート動画制作(P0: 手動中心の市場検証用)

チャンネル「未来なのに、まだこれ」(近未来のあるあるSF/コメディ)。
このフォルダは、LP(Next.js)とは独立しています。

## 1本作る手順
1. `studio/projects/epXXX/script.json` を書く(`ep001` が見本)
2. 画像プロンプトを出力: `python3 studio/tools/studio.py prompts studio/projects/ep001`
3. `prompts.md` を ChatGPT に貼って画像を作り、`images/s1.png, s2.png …` で保存
4. (任意)`python3 studio/tools/studio.py narration studio/projects/ep001` で `narration.txt` を出力 → VOICEVOX に1行ずつ貼って書き出し → `audio/s1.wav …` で保存
5. `check` で素材を確認し、動画を組み立て: `python3 studio/tools/studio.py render studio/projects/ep001`
   - 画像が足りないときは `--placeholder`(仮画像)
6. `out/ep001.mp4` を目視確認 → YouTubeに手動投稿。説明欄は `out/ep001_description.txt`

必要: Python 3.9+, Pillow, ffmpeg。日本語フォントは自動検出(`STUDIO_FONT` で指定も可)。

## ルール(channel.json 参照)
- 1本完結の短編(続き物にしない)。主人公は男性(ミライさん)で固定
- アニメ調に固定(写実的な人物・実在の場所は描かない)
- 実在の企業・商品・人物名は出さない
- VOICEVOX 使用時は説明欄に「VOICEVOX:キャラ名」を入れる(使用キャラの個別規約を確認すること)
- 台本ごとに `unique_angle`(その回の独自のオチ)を必ず書く。同じ型の量産にしない
- BGMは原則なし(使う場合は商用可の素材のみ。出典を記録)

## 未実装(P0の結果を見てから)
自動QC、画像API連携、YouTube API連携、分析。
