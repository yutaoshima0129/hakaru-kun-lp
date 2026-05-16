"use client";

import { useState } from "react";

export default function Contact() {
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitted(true);
  }

  return (
    <section id="contact" className="py-20 bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-12">
          <span className="text-sm font-bold text-[#e67e22] uppercase tracking-widest">
            Contact
          </span>
          <h2 className="mt-3 text-3xl md:text-4xl font-black text-gray-800">
            無料デモ・お問い合わせ
          </h2>
          <p className="mt-4 text-gray-500">
            導入に関するご質問、デモのご依頼はお気軽にどうぞ。
            <br />
            担当者が1営業日以内にご連絡いたします。
          </p>
        </div>

        {submitted ? (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-12 text-center">
            <div className="text-5xl mb-4">✅</div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">お問い合わせを受け付けました</h3>
            <p className="text-gray-500">
              1営業日以内に担当者よりご連絡いたします。
              <br />
              しばらくお待ちください。
            </p>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 space-y-6"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  会社名 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="株式会社〇〇"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#1b4f8a] focus:ring-2 focus:ring-[#1b4f8a]/10 transition"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  お名前 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="山田 太郎"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#1b4f8a] focus:ring-2 focus:ring-[#1b4f8a]/10 transition"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  メールアドレス <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  placeholder="example@company.co.jp"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#1b4f8a] focus:ring-2 focus:ring-[#1b4f8a]/10 transition"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  電話番号
                </label>
                <input
                  type="tel"
                  placeholder="03-0000-0000"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#1b4f8a] focus:ring-2 focus:ring-[#1b4f8a]/10 transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                業種・店舗形態
              </label>
              <select className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#1b4f8a] focus:ring-2 focus:ring-[#1b4f8a]/10 transition text-gray-600">
                <option value="">選択してください</option>
                <option>飲食店・レストラン</option>
                <option>食品製造・加工業</option>
                <option>スーパー・小売業</option>
                <option>ホテル・旅館</option>
                <option>給食施設・学校</option>
                <option>食品流通・物流</option>
                <option>その他</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                お問い合わせ内容 <span className="text-red-500">*</span>
              </label>
              <textarea
                required
                rows={4}
                placeholder="デモのご依頼、ご質問など自由にご記入ください"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#1b4f8a] focus:ring-2 focus:ring-[#1b4f8a]/10 transition resize-none"
              />
            </div>

            <button
              type="submit"
              className="w-full py-4 bg-[#e67e22] text-white font-bold text-lg rounded-xl hover:bg-[#cf6d17] transition-colors shadow-md"
            >
              送信する（無料）
            </button>

            <p className="text-xs text-gray-400 text-center">
              送信いただいた情報は、お問い合わせへの回答のみに使用します。
              プライバシーポリシーに同意の上、送信してください。
            </p>
          </form>
        )}
      </div>
    </section>
  );
}
