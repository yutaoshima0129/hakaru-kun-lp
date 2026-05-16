const points = [
  {
    title: "温度管理の記録義務に対応",
    description:
      "HACCPでは冷蔵・冷凍庫の温度を記録・保管することが義務付けられています。測る君は自動で記録・保管し、監査にも対応した帳票を出力します。",
  },
  {
    title: "監査・保健所の立入検査に対応",
    description:
      "保健所の立入検査や第三者監査で求められる温度管理記録をすぐに提出できます。クラウド保管なので過去のデータも瞬時に取り出せます。",
  },
  {
    title: "衛生管理計画の実施記録に活用",
    description:
      "HACCP義務化で必要な「衛生管理計画」の実施記録として、測る君の記録データをそのまま活用できます。",
  },
];

export default function Haccp() {
  return (
    <section id="haccp" className="py-20 bg-[#0f3460] text-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex flex-col md:flex-row items-start gap-12">
          <div className="md:w-2/5">
            <span className="text-sm font-bold text-[#f39c12] uppercase tracking-widest">
              HACCP対応
            </span>
            <h2 className="mt-3 text-3xl md:text-4xl font-black leading-tight">
              2021年6月より
              <br />
              全食品事業者に
              <br />
              <span className="text-[#f39c12]">HACCP義務化</span>
            </h2>
            <p className="mt-6 text-blue-200 leading-relaxed">
              食品衛生法の改正により、飲食店・食品製造業など
              すべての食品事業者にHACCPに沿った衛生管理が義務付けられました。
            </p>
            <p className="mt-4 text-blue-200 leading-relaxed">
              測る君は、HACCP義務化に必要な温度管理記録を
              <strong className="text-white">自動で対応</strong>。
              専門知識がなくても安心して使えます。
            </p>
            <div className="mt-8 bg-[#f39c12]/20 border border-[#f39c12]/40 rounded-xl p-5">
              <div className="text-[#f39c12] font-bold mb-2">対象となる主な事業者</div>
              <div className="text-sm text-blue-100 space-y-1">
                <div>✓ 飲食店・レストラン・カフェ</div>
                <div>✓ 食品製造・加工業</div>
                <div>✓ スーパー・コンビニ・小売業</div>
                <div>✓ ホテル・旅館・給食施設</div>
                <div>✓ 食品の製造・流通・販売に関わるすべての事業者</div>
              </div>
            </div>
          </div>

          <div className="md:w-3/5 space-y-5">
            {points.map((p, i) => (
              <div
                key={p.title}
                className="bg-white/10 rounded-2xl p-6 border border-white/20"
              >
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-[#f39c12] text-[#0f3460] rounded-full flex items-center justify-center font-black text-lg flex-shrink-0">
                    {i + 1}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold mb-2">{p.title}</h3>
                    <p className="text-sm text-blue-200 leading-relaxed">{p.description}</p>
                  </div>
                </div>
              </div>
            ))}

            <div className="mt-6">
              <a
                href="#contact"
                className="inline-flex items-center justify-center w-full px-8 py-4 bg-[#e67e22] text-white font-bold text-lg rounded-xl hover:bg-[#cf6d17] transition-colors shadow-lg"
              >
                HACCP対応について相談する
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
