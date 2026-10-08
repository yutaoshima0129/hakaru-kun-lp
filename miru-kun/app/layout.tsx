import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "見る君 | 飲食店向けAIサイネージ（プロトタイプ）",
  description: "ポスターの差し替えと、どれだけ見られたかの効果測定ができるデジタルサイネージ。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
