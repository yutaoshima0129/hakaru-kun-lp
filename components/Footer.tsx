export default function Footer() {
  return (
    <footer className="bg-[#0f3460] text-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <div className="flex flex-col md:flex-row justify-between items-start gap-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
                <span className="text-[#1b4f8a] text-sm font-black">測</span>
              </div>
              <span className="text-xl font-black">測る君</span>
            </div>
            <p className="text-sm text-blue-200 max-w-xs leading-relaxed">
              冷蔵・冷凍庫の温度管理を自動化する
              <br />
              HACCP対応クラウドサービス
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 text-sm">
            <div>
              <div className="font-bold mb-3 text-blue-100">サービス</div>
              <ul className="space-y-2 text-blue-300">
                <li><a href="#features" className="hover:text-white transition-colors">機能紹介</a></li>
                <li><a href="#haccp" className="hover:text-white transition-colors">HACCP対応</a></li>
                <li><a href="#industries" className="hover:text-white transition-colors">対象業種</a></li>
                <li><a href="#contact" className="hover:text-white transition-colors">料金・お問い合わせ</a></li>
              </ul>
            </div>
            <div>
              <div className="font-bold mb-3 text-blue-100">サポート</div>
              <ul className="space-y-2 text-blue-300">
                <li><a href="#contact" className="hover:text-white transition-colors">無料デモ申込み</a></li>
                <li><a href="#contact" className="hover:text-white transition-colors">資料請求</a></li>
                <li><a href="#contact" className="hover:text-white transition-colors">お問い合わせ</a></li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-white/10 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs text-blue-300">
          <div>© 2024 測る君. All rights reserved.</div>
          <div className="flex gap-6">
            <a href="#" className="hover:text-white transition-colors">プライバシーポリシー</a>
            <a href="#" className="hover:text-white transition-colors">利用規約</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
