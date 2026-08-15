import React, { useState, useEffect } from "react";
import CasinoHeader from "@/components/casino/CasinoHeader";
import GameCard from "@/components/casino/GameCard";
import BottomNav from "@/components/BottomNav";
import { X } from "lucide-react";

const INTRO_KEY = "vinclub_casino_intro_seen";

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
  // Hiển thị intro mỗi lần người dùng vào trang Casino trong phiên làm việc
  const [showIntro, setShowIntro] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  useEffect(() => {
    // Chỉ hiện 1 lần / session (reload trang thì hiện lại)
    const seen = sessionStorage.getItem(INTRO_KEY);
    if (!seen) {
      setShowIntro(true);
    }
  }, []);

  const closeIntro = () => {
    sessionStorage.setItem(INTRO_KEY, "1");
    setShowIntro(false);
  };

  return (
    <main className="relative w-full min-h-screen bg-[#0c0905] overflow-x-hidden font-heading flex flex-col justify-between">
      <div className="w-full">
        <CasinoHeader />

        <div className="w-full max-w-5xl mx-auto px-4 py-6 pb-24">
          <h2 className="text-base sm:text-lg font-bold text-center text-[#e8c87a] tracking-wide mb-1.5 uppercase">
            HỆ THỐNG TRÒ CHƠI TẠI CASINO CORONA
          </h2>
          <div className="w-16 h-[2px] bg-[#caa45a] mx-auto mb-6 rounded-full" />

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
            {games.map((game, index) => (
              <GameCard key={game.name} game={game} index={index} />
            ))}
          </div>

          <p className="text-[11px] text-[#8a7550] text-center pt-8 leading-relaxed">
            Trò chơi mang tính giải trí. Vui chơi có trách nhiệm.
          </p>
        </div>
      </div>

      <BottomNav />

      {/* ── Casino Intro Overlay ── */}
      {showIntro && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.82)", backdropFilter: "blur(6px)" }}
          onClick={closeIntro}
        >
          {/* Card wrapper — click inside does NOT close */}
          <div
            className="relative w-full max-w-sm sm:max-w-md"
            style={{
              animation: "casinoIntroIn 0.35s cubic-bezier(0.22,1,0.36,1) both",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={closeIntro}
              aria-label="Đóng giới thiệu"
              className="absolute -top-3 -right-3 z-10 w-8 h-8 rounded-full bg-white text-black flex items-center justify-center shadow-lg hover:bg-gray-100 active:scale-95 transition-all cursor-pointer"
            >
              <X className="w-4 h-4" strokeWidth={2.5} />
            </button>

            {/* Image */}
            <div className="rounded-3xl overflow-hidden shadow-2xl border border-white/10">
              {!imgLoaded && (
                <div className="w-full aspect-[3/4] bg-[#1c160e] flex items-center justify-center">
                  <div className="w-8 h-8 border-2 border-[#e8c87a] border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              <img
                src="/casino-intro.png"
                alt="Casino on Phu Quoc — Giới thiệu"
                onLoad={() => setImgLoaded(true)}
                className={`w-full object-contain transition-opacity duration-300 ${imgLoaded ? "opacity-100" : "opacity-0 absolute inset-0"}`}
                draggable={false}
              />
            </div>

            {/* Tap to close hint */}
            <p className="text-center text-[10.5px] text-white/50 mt-3 font-medium tracking-wide">
              Nhấn ngoài ảnh hoặc dấu ✕ để đóng
            </p>
          </div>

          <style>{`
            @keyframes casinoIntroIn {
              from { opacity: 0; transform: scale(0.92) translateY(16px); }
              to   { opacity: 1; transform: scale(1) translateY(0); }
            }
          `}</style>
        </div>
      )}
    </main>
  );
}