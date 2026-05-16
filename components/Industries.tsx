const industries = [
  {
    icon: "🍽️",
    name: "飲食店・レストラン",
    description: "食材の鮮度管理とHACCP対応を同時に実現。厨房の冷蔵・冷凍庫を一括管理。",
  },
  {
    icon: "🏭",
    name: "食品製造・加工業",
    description: "製造ラインの温度管理を自動化。複数の冷蔵・冷凍設備を1つの画面で監視。",
  },
  {
    icon: "🛒",
    name: "スーパー・小売業",
    description: "売場と バックヤードの冷蔵・冷凍ケースをまとめて監視。食品ロスを防ぎます。",
  },
  {
    icon: "🏨",
    name: "ホテル・旅館",
    description: "厨房からレストランまで施設全体の温度管理を一元化。衛生管理を強化します。",
  },
  {
    icon: "🍱",
    name: "給食施設・学校",
    description: "大量調理施設衛生管理マニュアルに対応。毎日の記録作業を大幅に削減。",
  },
  {
    icon: "🚚",
    name: "食品流通・物流",
    description: "倉庫・配送センターの温度管理をクラウドで一元化。温度履歴をすぐに提出。",
  },
];

export default function Industries() {
  return (
    <section id="industries" className="py-20 bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-14">
          <span className="text-sm font-bold text-[#1b4f8a] uppercase tracking-widest">
            Industries
          </span>
          <h2 className="mt-3 text-3xl md:text-4xl font-black text-gray-800">
            あらゆる食品事業者に
            <br />
            対応しています
          </h2>
          <p className="mt-4 text-gray-500 max-w-2xl mx-auto">
            業種・規模を問わず、食品を扱うすべての事業者に
            測る君の温度管理サービスをご利用いただけます。
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {industries.map((ind) => (
            <div
              key={ind.name}
              className="flex gap-4 p-6 rounded-2xl border border-gray-100 hover:border-[#1b4f8a]/30 hover:shadow-md transition-all"
            >
              <div className="text-4xl flex-shrink-0">{ind.icon}</div>
              <div>
                <h3 className="font-bold text-gray-800 mb-2">{ind.name}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{ind.description}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 bg-[#ebf5fb] rounded-2xl p-8 text-center">
          <p className="text-lg font-bold text-gray-800 mb-2">
            「うちの業種・業態でも使える？」
          </p>
          <p className="text-gray-500 mb-6">
            食品を扱う事業者であれば、基本的にどの業種でもご利用いただけます。
            まずはお気軽にご相談ください。
          </p>
          <a
            href="#contact"
            className="inline-flex items-center justify-center px-8 py-4 bg-[#1b4f8a] text-white font-bold rounded-xl hover:bg-[#0f3460] transition-colors"
          >
            導入の相談をする（無料）
          </a>
        </div>
      </div>
    </section>
  );
}
