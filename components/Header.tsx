"use client";

import { useState } from "react";

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white shadow-sm">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[#1b4f8a] rounded-lg flex items-center justify-center">
            <span className="text-white text-sm font-black">測</span>
          </div>
          <span className="text-xl font-black text-[#1b4f8a]">測る君</span>
        </div>

        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-600">
          <a href="#problems" className="hover:text-[#1b4f8a] transition-colors">課題</a>
          <a href="#features" className="hover:text-[#1b4f8a] transition-colors">機能</a>
          <a href="#haccp" className="hover:text-[#1b4f8a] transition-colors">HACCP対応</a>
          <a href="#industries" className="hover:text-[#1b4f8a] transition-colors">対象業種</a>
        </nav>

        <a
          href="#contact"
          className="hidden md:inline-flex items-center px-5 py-2.5 bg-[#e67e22] text-white text-sm font-bold rounded-lg hover:bg-[#cf6d17] transition-colors"
        >
          無料デモを申し込む
        </a>

        <button
          className="md:hidden p-2 text-gray-600"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="メニュー"
        >
          <div className="w-5 h-0.5 bg-current mb-1" />
          <div className="w-5 h-0.5 bg-current mb-1" />
          <div className="w-5 h-0.5 bg-current" />
        </button>
      </div>

      {menuOpen && (
        <div className="md:hidden bg-white border-t px-4 py-4 flex flex-col gap-4 text-sm font-medium text-gray-700">
          <a href="#problems" onClick={() => setMenuOpen(false)}>課題</a>
          <a href="#features" onClick={() => setMenuOpen(false)}>機能</a>
          <a href="#haccp" onClick={() => setMenuOpen(false)}>HACCP対応</a>
          <a href="#industries" onClick={() => setMenuOpen(false)}>対象業種</a>
          <a
            href="#contact"
            onClick={() => setMenuOpen(false)}
            className="inline-flex items-center justify-center px-5 py-2.5 bg-[#e67e22] text-white rounded-lg font-bold"
          >
            無料デモを申し込む
          </a>
        </div>
      )}
    </header>
  );
}
