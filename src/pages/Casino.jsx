import React, { useState, useEffect } from "react";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import CasinoHeader from "@/components/casino/CasinoHeader";
import GameCard from "@/components/casino/GameCard";
import BottomNav from "@/components/BottomNav";

const INTRO_IMG = "https://eaugjhjhyeginnuayxik.supabase.co/storage/v1/object/public/sss/anhcamket.png";
const STORAGE_KEY = "vinclub_casino_intro_dismissed";

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
  // Show intro every time user navigates to Casino (only dismissed for current session)
  const [showIntro, setShowIntro] = useState(false);

  useEffect(() => {
    // Show intro every time the component mounts (new visit to Casino page)
    // unless already dismissed in THIS session
    const dismissed = sessionStorage.getItem(STORAGE_KEY);
    if (!dismissed) {
      setShowIntro(true);
    }
  }, []);

  const dismiss = () => {
    sessionStorage.setItem(STORAGE_KEY, "1");
    setShowIntro(false);
  };

  return (
    <main className="relative w-full min-h-screen bg-[#0c0905] overflow-x-hidden font-heading flex flex-col justify-between">
      {/* ── Casino Intro Overlay ── */}
      <AnimatePresence>
        {showIntro && (
          <motion.div
            key="casino-intro"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 p-5 backdrop-blur-sm"
            onClick={dismiss}
          >
            <motion.div
              initial={{ scale: 0.92, y: 24 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.92, y: 24 }}
              transition={{ type: "spring", stiffness: 300, damping: 28 }}
              onClick={(e) => e.stopPropagation()}
              className="relative max-w-sm w-full"
            >
              {/* Close button */}
              <button
                onClick={dismiss}
                aria-label="Đóng"
                className="absolute -top-3 -right-3 z-10 w-8 h-8 rounded-full bg-black/80 border border-white/20 text-white flex items-center justify-center hover:bg-black shadow-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>

              {/* Image */}
              <img
                src={INTRO_IMG}
                alt="Cam kết Casino VinClub"
                className="w-full rounded-2xl shadow-2xl"
                draggable={false}
              />

              {/* Tap to close hint */}
              <p className="text-center text-[10px] text-white/50 mt-3 font-medium">
                Nhấn vào ảnh hoặc nhấn ✕ để tiếp tục
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
    </main>
  );
}