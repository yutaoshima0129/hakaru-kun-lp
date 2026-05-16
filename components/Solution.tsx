const steps = [
  {
    num: "01",
    title: "センサーを設置",
    description: "冷蔵・冷凍庫にIoTセンサーを取り付けるだけ。工事不要で最短1日で導入できます。",
  },
  {
    num: "02",
    title: "自動で計測・記録",
    description: "24時間365日、センサーが温度を自動計測。クラウドにリアルタイムで記録されます。",
  },
  {
    num: "03",
    title: "異常時に即通知",
    description: "温度が設定範囲を超えたら、担当者のスマホ・メールへ即座にアラート通知。",
  },
  {
    num: "04",
    title: "帳票を自動出力",
    description: "HACCP対応の温度管理表を自動生成。ボタン一つでPDF出力・提出対応できます。",
  },
];

export default function Solution() {
  return (
    <section className="py-20 bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-14">
          <span className="text-sm font-bold text-[#1b4f8a] uppercase tracking-widest">
            How it works
          </span>
          <h2 className="mt-3 text-3xl md:text-4xl font-black text-gray-800">
            測る君の仕組み
          </h2>
          <p className="mt-4 text-gray-500 max-w-2xl mx-auto">
            センサーの設置からHACCP帳票の出力まで、温度管理のすべてをクラウドで一元化。
            担当者の手間をゼロにします。
          </p>
        </div>

        <div className="relative">
          <div className="hidden md:block absolute top-10 left-[12.5%] right-[12.5%] h-0.5 bg-[#1b4f8a]/20" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {steps.map((step) => (
              <div key={step.num} className="flex flex-col items-center text-center">
                <div className="w-20 h-20 bg-[#1b4f8a] text-white rounded-full flex items-center justify-center text-2xl font-black mb-4 z-10 relative shadow-lg">
                  {step.num}
                </div>
                <h3 className="text-lg font-bold text-gray-800 mb-3">{step.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
