import type { Metadata } from "next";
import CheckPanel from "@/components/CheckPanel";

export const metadata: Metadata = {
  title: "パソコン適合チェック | 見る君",
};

export default function CheckPage() {
  return <CheckPanel />;
}
