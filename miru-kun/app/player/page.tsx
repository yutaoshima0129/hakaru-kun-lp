import type { Metadata } from "next";
import Player from "@/components/Player";

export const metadata: Metadata = {
  title: "見る君 サイネージ",
};

export default function PlayerPage() {
  return <Player />;
}
