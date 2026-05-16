const problems = [
  {
    icon: "📝",
    title: "手書き記録が面倒",
    description:
      "毎日の温度確認・記録は担当者の大きな負担。忙しい時間帯にも関わらず、1日に複数回の記録が必要です。",
  },
  {
    icon: "⚠️",
    title: "記録漏れのリスク",
    description:
      "人が記録するため、うっかり忘れや休日・深夜の記録漏れが発生。HACCP監査で指摘される原因になります。",
  },
  {
    icon: "🌡️",
    title: "異常に気づけない",
    description:
      "夜間や休日に冷蔵庫が故障しても誰も気づかない。翌朝には食材が全滅し、大きな損失になることも。",
  },
  {
    icon: "📋",
    title: "帳票管理が大変",
    description:
      "紙の記録帳の保管・整理・提出が煩雑。HACCP対応の書類を毎年作り直す手間もかかります。",
  },
];

export default function Problems() {
  return (
    <section id="problems" className="py-20 bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-14">
          <span className="text-sm font-bold text-[#e67e22] uppercase tracking-widest">
            こんな課題はありませんか？
          </span>
          <h2 className="mt-3 text-3xl md:text-4xl font-black text-gray-800">
            温度管理の現場が抱える
            <br />
            4つの課題
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {problems.map((p) => (
            <div
              key={p.title}
              className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow"
            >
              <div className="text-4xl mb-4">{p.icon}</div>
              <h3 className="text-lg font-bold text-gray-800 mb-3">{p.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{p.description}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 text-center">
          <div className="inline-flex items-center gap-3 bg-[#1b4f8a] text-white px-8 py-4 rounded-xl shadow-lg">
            <span className="text-2xl">👇</span>
            <span className="font-bold text-lg">測る君がすべて解決します</span>
          </div>
        </div>
      </div>
    </section>
  );
}
