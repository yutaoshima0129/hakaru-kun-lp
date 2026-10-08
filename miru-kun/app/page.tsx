import Link from "next/link";

export default function Home() {
  return (
    <main className="flex-1 flex items-center justify-center p-6">
      <div className="max-w-2xl w-full">
        <span className="inline-block bg-primary/10 text-primary text-xs font-bold px-3 py-1 rounded-full">
          プロトタイプ（第0段階）
        </span>
        <h1 className="mt-4 text-3xl md:text-4xl font-black text-gray-800">見る君</h1>
        <p className="mt-3 text-gray-600 leading-relaxed">
          飲食店向けAIサイネージ。ポスターをすぐ差し替えられて、どれだけ見られたかを測れます。
          カメラ映像はこのパソコンの中だけで解析し、保存も送信もしません。
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <Link
            href="/player"
            target="_blank"
            className="block rounded-2xl bg-primary-dark text-white p-6 hover:opacity-90 transition"
          >
            <div className="text-sm opacity-80">店頭モニター用</div>
            <div className="mt-1 text-xl font-bold">サイネージ画面 ↗</div>
            <p className="mt-2 text-sm opacity-80">
              ポスターを表示し、カメラで注視を計測します。別ウィンドウで開いて全画面にしてください。
            </p>
          </Link>
          <Link href="/admin" className="block rounded-2xl bg-white border border-gray-200 p-6 hover:border-primary transition">
            <div className="text-sm text-gray-500">オーナー用</div>
            <div className="mt-1 text-xl font-bold text-gray-800">管理画面</div>
            <p className="mt-2 text-sm text-gray-500">
              効果ダッシュボード、ポスターの差し替え、計測の設定ができます。
            </p>
          </Link>
        </div>

        <ol className="mt-8 text-sm text-gray-600 space-y-1 list-decimal list-inside">
          <li>管理画面の「ポスター」でサンプルを追加するか、画像をアップロード</li>
          <li>サイネージ画面を開いてカメラを許可（D キーで計測状況を表示）</li>
          <li>カメラの前で画面を見る → ダッシュボードに数字が反映されます</li>
        </ol>
      </div>
    </main>
  );
}
