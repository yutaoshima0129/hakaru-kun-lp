import Link from "next/link";
import AdminNav from "@/components/AdminNav";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-1 flex flex-col">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
          <Link href="/" className="font-black text-lg text-primary-dark">
            見る君 <span className="text-xs font-bold text-gray-400">管理画面</span>
          </Link>
          <AdminNav />
          <a
            href="/player"
            target="_blank"
            className="ml-auto text-sm font-bold text-white bg-accent rounded-lg px-3 py-2 hover:opacity-90"
          >
            サイネージ画面を開く ↗
          </a>
        </div>
      </header>
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
