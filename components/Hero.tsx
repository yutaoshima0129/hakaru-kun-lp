export default function Hero() {
  return (
    <section className="pt-16 bg-gradient-to-br from-[#0f3460] via-[#1b4f8a] to-[#2e86c1] text-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 md:py-28">
        <div className="flex flex-col md:flex-row items-center gap-12">
          <div className="flex-1 text-center md:text-left">
            <span className="inline-block bg-white/20 text-white text-xs font-bold px-3 py-1.5 rounded-full mb-6 tracking-wide">
              HACCP完全対応 / 温度自動記録クラウドサービス
            </span>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-black leading-tight mb-6">
              冷蔵・冷凍庫の
              <br />
              温度管理を、
              <br />
              <span className="text-[#f39c12]">もっとかんたんに。</span>
            </h1>
            <p className="text-lg text-blue-100 mb-8 leading-relaxed max-w-lg">
              IoTセンサーが24時間365日、温度を自動記録。
              <br />
              異常があればスマホへ即時通知。
              <br />
              HACCP義務化に対応した次世代の温度管理サービスです。
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center md:justify-start">
              <a
                href="#contact"
                className="inline-flex items-center justify-center px-8 py-4 bg-[#e67e22] text-white font-bold text-lg rounded-xl hover:bg-[#cf6d17] transition-colors shadow-lg"
              >
                無料デモを申し込む
              </a>
              <a
                href="#features"
                className="inline-flex items-center justify-center px-8 py-4 bg-white/10 border border-white/30 text-white font-bold text-lg rounded-xl hover:bg-white/20 transition-colors"
              >
                機能を見る
              </a>
            </div>
          </div>

          <div className="flex-1 w-full max-w-md md:max-w-none">
            <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-6 shadow-xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-3 h-3 bg-red-400 rounded-full" />
                <div className="w-3 h-3 bg-yellow-400 rounded-full" />
                <div className="w-3 h-3 bg-green-400 rounded-full" />
                <span className="text-xs text-blue-200 ml-2">測る君 ダッシュボード</span>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                {[
                  { name: "冷蔵庫A", temp: "-2.3°C", status: "正常", color: "bg-green-500" },
                  { name: "冷凍庫A", temp: "-18.7°C", status: "正常", color: "bg-green-500" },
                  { name: "冷蔵庫B", temp: "-1.8°C", status: "正常", color: "bg-green-500" },
                  { name: "冷凍庫B", temp: "-20.1°C", status: "正常", color: "bg-green-500" },
                ].map((item) => (
                  <div key={item.name} className="bg-white/10 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-blue-200">{item.name}</span>
                      <span className={`w-2 h-2 rounded-full ${item.color}`} />
                    </div>
                    <div className="text-2xl font-black text-white">{item.temp}</div>
                    <div className="text-xs text-green-300 mt-1">{item.status}</div>
                  </div>
                ))}
              </div>
              <div className="bg-white/10 rounded-xl p-3 flex items-center gap-3">
                <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                  <span className="text-white text-xs font-bold">✓</span>
                </div>
                <div>
                  <div className="text-xs text-blue-200">最終記録</div>
                  <div className="text-sm text-white font-bold">本日 14:30 — 全機器正常</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-16 pt-8 border-t border-white/20 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {[
            { num: "24h", label: "365日自動監視" },
            { num: "即時", label: "異常アラート通知" },
            { num: "自動", label: "HACCP帳票出力" },
            { num: "複数", label: "拠点一括管理" },
          ].map((item) => (
            <div key={item.label}>
              <div className="text-3xl font-black text-[#f39c12] mb-1">{item.num}</div>
              <div className="text-sm text-blue-200">{item.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
