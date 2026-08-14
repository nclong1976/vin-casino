import React from "react";
import CasinoHeader from "@/components/casino/CasinoHeader";
import GameCard from "@/components/casino/GameCard";
import BottomNav from "@/components/BottomNav";

const u = (id) => `https://images.unsplash.com/photo-${id}?w=400&q=80&auto=format&fit=crop`;

const games = [
  { name: "Bài Cào", image: u("1592398191627-25b41eeaa398"), to: "/casino/bai-cao" },
  { name: "Tiger Baccarat", image: u("1517232115160-ff93364542dd"), to: "/casino/tiger-baccarat" },
  { name: "Baccarat Long Hổ", image: u("1771860886852-3cf8aa59433c"), to: "/casino/baccarat-long-ho" },
  { name: "Xì Tố Texas Hold 'em", image: u("1655159428752-c700435e9983") },
  { name: "Xì Tố Ba Lá", image: u("1773335638484-297f95ef33a9"), to: "/casino/xi-to-ba-la" },
  { name: "Xì Tố Nga", image: u("1627831389670-d20f5a01c536") },
  { name: "Xì Dách", image: u("1509478861672-91e9a2f90c04") },
  { name: "Niu Niu Poker", image: u("1596838132731-3301c3fd4317") },
  { name: "Caribbean Stud Poker", image: u("1625888791210-40ea41c1d0f3") },
  { name: "Xúc Xắc", image: u("1626775238053-4315516eedc9") },
  { name: "Slots", image: u("1518895312237-a9e23508077d") },
  { name: "Cò Quay", image: u("1674168461868-c60c2589b501") },
];

export default function Casino() {
  return (
    <main className="relative w-full max-w-[480px] mx-auto min-h-screen bg-[#0c0905] overflow-clip font-heading">
      <CasinoHeader />

      <div className="px-3 py-4 pb-20">
        <h2 className="text-[14px] font-bold text-center text-[#e8c87a] tracking-wide mb-1">
          HỆ THỐNG TRÒ CHƠI TẠI CASINO CORONA
        </h2>
        <div className="w-12 h-[2px] bg-[#caa45a] mx-auto mb-4 rounded-full" />

        <div className="grid grid-cols-3 gap-2.5">
          {games.map((game, index) => (
            <GameCard key={game.name} game={game} index={index} />
          ))}
        </div>

        <p className="text-[9px] text-[#8a7550] text-center pt-4 leading-relaxed">
          Trò chơi mang tính giải trí. Vui chơi có trách nhiệm.
        </p>
      </div>

      <BottomNav />
    </main>
  );
}