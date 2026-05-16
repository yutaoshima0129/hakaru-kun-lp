const features = [
  {
    icon: "📡",
    title: "リアルタイム温度監視",
    description:
      "IoTセンサーが常時計測。スマートフォンやPCから、いつでもどこでも現在の温度を確認できます。",
  },
  {
    icon: "🔔",
    title: "異常アラート通知",
    description:
      "温度が設定値を超えた瞬間、LINE・メール・SMSで担当者に通知。休日・夜間も安心です。",
  },
  {
    icon: "📊",
    title: "HACCP帳票の自動出力",
    description:
      "温度記録を自動でHACCP管理表に変換。PDF出力でそのまま提出・保管できます。",
  },
  {
    icon: "🏢",
    title: "複数拠点・機器の一括管理",
    description:
      "複数店舗や拠点の冷蔵・冷凍庫を1つの画面で一元管理。本社からでも状況を把握できます。",
  },
  {
    icon: "📱",
    title: "スマートフォン対応",
    description:
      "専用アプリで外出先からも温度確認・アラート対応が可能。アプリのインストール不要です。",
  },
  {
    icon: "☁️",
    title: "クラウドデータ保管",
    description:
      "記録データはクラウドに自動保存。過去のデータをいつでも検索・ダウンロードできます。",
  },
];

export default function Features() {
  return (
    <section id="features" className="py-20 bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-14">
          <span className="text-sm font-bold text-[#e67e22] uppercase tracking-widest">
            Features
          </span>
          <h2 className="mt-3 text-3xl md:text-4xl font-black text-gray-800">
            測る君の主な機能
          </h2>
          <p className="mt-4 text-gray-500 max-w-2xl mx-auto">
            温度管理に必要なすべての機能をワンパッケージで提供。
            導入後すぐに使いはじめられます。
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f) => (
            <div
              key={f.title}
              className="bg-white rounded-2xl p-7 shadow-sm border border-gray-100 hover:shadow-md transition-shadow hover:border-[#1b4f8a]/30"
            >
              <div className="text-4xl mb-4">{f.icon}</div>
              <h3 className="text-lg font-bold text-gray-800 mb-3">{f.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{f.description}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 text-center">
          <a
            href="#contact"
            className="inline-flex items-center justify-center px-8 py-4 bg-[#1b4f8a] text-white font-bold text-lg rounded-xl hover:bg-[#0f3460] transition-colors shadow-lg"
          >
            すべての機能を詳しく見る
          </a>
        </div>
      </div>
    </section>
  );
}
